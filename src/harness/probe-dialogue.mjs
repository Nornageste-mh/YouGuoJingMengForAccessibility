#!/usr/bin/env node
/**
 * probe-dialogue.mjs —— 剧情页「消息窗 / 打字机 / backlog」实测探针（只读观测，不保存、不退出）。
 *
 * 用途：为 patch-eng 提供 message DOM 结构与 typewriter 完成时机的事实依据：
 *   1) 逐句推进，记录 .message0_fore 的 DOM 结构（message_outer/message_inner/p/span.current_span/chara_name_area）；
 *   2) 每次推进后以 40ms 采样 is_adding_text，测出打字机从开始到结束的字符增长时间线；
 *   3) 同步记录 tf.system.backlog（HTML 字符串数组）长度与末条内容，验证 [r]/[p] 是否入 backlog；
 *   4) 记录 current_scenario/current_line/is_stop/is_strong_stop/is_click_text 便于定位。
 *
 * 用法：
 *   node src/harness/probe-dialogue.mjs --port 9340 --steps 24 --out out/evidence/22-dialogue-timeline.json
 * 前提：游戏实例已带 --remote-debugging-port 启动，且当前停在标题页或剧情页。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opt[a.slice(2)] = next; i++; }
    else opt[a.slice(2)] = true;
  }
}
const PORT = Number(opt.port || 9340);
const STEPS = Number(opt.steps || 24);
const OUT = opt.out || 'out/evidence/22-dialogue-timeline.json';
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端（WebSocket，Node>=21 原生实现；cdp.mjs 是 CLI，不导出，故此处内联） */
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
      }
    });
    ws.addEventListener('close', () => { for (const p of this.pending.values()) p.reject(new Error('ws closed')); this.pending.clear(); });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('ws timeout')), 8000);
      ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('ws error')); }, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function pickPage() {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('没有 page target：游戏是否带 --remote-debugging-port 启动？');
  return page;
}

/** 在页面求值，返回 JS 值 */
async function ev(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}

/** 推进一句：优先触发整屏点击层（走引擎真实 next 链路），失败则直接 nextOrder */
async function advance(cdp) {
  return ev(cdp, `(function(){
    var kag = TYRANO.kag;
    if (kag.stat.is_strong_stop === 1) { kag.ftag.nextOrder(); return 'nextOrder(strong)'; }
    var $ = window.jQuery;
    if ($ && $('.layer_event_click').length) { $('.layer_event_click').trigger('click'); return 'layer_event_click'; }
    kag.ftag.nextOrder(); return 'nextOrder';
  })()`);
}

/** 状态快照：DOM 结构 + 引擎状态 + backlog 末条 */
const SNAP_EXPR = `(function(){
  var kag = TYRANO.kag, st = kag.stat;
  var div = document.querySelector('.message0_fore');
  var inner = div ? div.querySelector('.message_inner') : null;
  var outer = div ? div.querySelector('.message_outer') : null;
  var ps = inner ? [].map.call(inner.querySelectorAll('p'), function(p, i){
    return {
      i: i,
      cls: p.className,
      html: p.innerHTML.slice(0, 400),
      text: p.innerText,
      spans: [].map.call(p.querySelectorAll('span'), function(s){ return {cls: s.className, text: s.innerText.slice(0,200), style: s.getAttribute('style')}; })
    };
  }) : [];
  var name = document.querySelector('.message0_fore .chara_name_area');
  var blow = kag.variable.tf.system.backlog || [];
  return {
    scen: st.current_scenario,
    line: st.current_line,
    order: st.current_order_index,
    stop: st.is_stop, strong: st.is_strong_stop, adding: st.is_adding_text,
    click: st.is_click_text, hide: st.is_hide_message,
    msgDisplay: div ? getComputedStyle(div).display : null,
    outer: outer ? {html: outer.innerHTML.slice(0,300), style: outer.getAttribute('style')} : null,
    innerStyle: inner ? inner.getAttribute('style') : null,
    charaName: name ? {text: name.innerText, html: name.innerHTML, style: name.getAttribute('style')} : null,
    msgText: inner ? inner.innerText : '',
    ps: ps,
    currMsgStr: st.current_message_str,
    chSpeed: st.ch_speed,
    backlogLen: blow.length,
    backlogTail: blow.slice(-2)
  };
})()`;

/** 采样打字机：返回 {samples:[{t,adding,textLen}], totalMs, peakLen} */
async function sampleTyping(cdp, maxMs = 4000, gap = 40) {
  const samples = [];
  const t0 = Date.now();
  let stable = 0, prev = -1;
  while (Date.now() - t0 < maxMs) {
    const s = await ev(cdp, `(function(){var st=TYRANO.kag.stat;var e=document.querySelector('.message0_fore .message_inner');return {adding:st.is_adding_text?1:0,textLen:e?e.innerText.length:0,stop:st.is_stop?1:0};})()`);
    samples.push({ t: Date.now() - t0, adding: s.adding, textLen: s.textLen, stop: s.stop });
    if (s.adding === 0 && prev === s.textLen) { stable++; if (stable >= 3 && samples.length > 3) break; } else stable = 0;
    prev = s.textLen;
    await sleep(gap);
  }
  const timed = samples.filter((s) => s.adding === 1);
  return {
    samples,
    typingMs: timed.length ? timed[timed.length - 1].t - timed[0].t : 0,
    totalMs: samples.length ? samples[samples.length - 1].t : 0,
    peakLen: Math.max(...samples.map((s) => s.textLen), 0)
  };
}

async function main() {
  const page = await pickPage();
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  const out = { meta: { port: PORT, startedAt: new Date().toISOString(), steps: STEPS, page: page.url }, timeline: [] };
  try {
    // 若在标题页，点「开始游戏」进入剧情（幂等：已在剧情则跳过）
    const scen0 = await ev(cdp, 'TYRANO.kag.stat.current_scenario');
    if (scen0 === 'title_screen.ks') {
      await ev(cdp, `document.querySelector('img.img_7').click()`);  // 开始游戏按钮
      await sleep(2500);
    }
    out.meta.afterStart = await ev(cdp, SNAP_EXPR);
    for (let step = 0; step < STEPS; step++) {
      const before = await ev(cdp, SNAP_EXPR);
      const typing = await sampleTyping(cdp);
      await advance(cdp);
      await sleep(350);
      const after = await ev(cdp, SNAP_EXPR);
      out.timeline.push({ step, before, typing, after });
      // 已进入选项/无消息层时停止
      if (after.scen !== 'scene1.ks') break;
      if (!after.msgDisplay || after.msgDisplay === 'none') break;
    }
  } finally {
    cdp.close();
  }
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 1), 'utf8');
  const tl = out.timeline;
  console.log(`ok: ${OUT}  steps=${tl.length}`);
  for (const s of tl.slice(0, 8)) {
    console.log(`  step${s.step} line=${s.after.line} adding=${s.before.adding} typingMs=${s.typing.typingMs} backlog=${s.after.backlogLen} text=${JSON.stringify((s.after.msgText || '').slice(0, 40))}`);
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
