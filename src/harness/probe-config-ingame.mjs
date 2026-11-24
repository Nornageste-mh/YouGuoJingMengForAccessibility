#!/usr/bin/env node
/**
 * probe-config-ingame.mjs —— 游戏内菜单 → 设置（theme config.ks）控件清单 + glink 选项屏 + tooltip 运行时取证。
 *
 * 目的：U5 要求「全界面控件可导航」，本探针补齐三块此前未拿全的运行时事实：
 *   1) 游戏内菜单 .menu_config 打开的是 data/others/plugin/theme_kopanda_23/config.ks（与标题页 config.ks 不是同一文件），
 *      逐个导出其中的 .event-setting-element 控件（DOM、坐标、data-event-pm、事件、键盘可达性）；
 *   2) scene1 *map_01 选项屏：等 .glink_button 真正渲染后抓 DOM/AX，并在选项屏上逐一按 Tab/Enter/Space/Esc/方向键；
 *   3) scene1 第 74 行「三越」tooltip：轮询 .message_inner .tooltip 出现，抓 DOM/AX/hover 后 .desc_top 状态。
 *
 * 用法：node src/harness/probe-config-ingame.mjs --port 9340 --out out/evidence/25-ingame-config-choices.json --shotdir out/evidence
 * 安全：只读观测；可能因引擎 label/iscript 自动写副本存档，不点退出确认、不执行保存。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opt[a.slice(2)] = next; i++; } else opt[a.slice(2)] = true;
  }
}
const PORT = Number(opt.port || 9340);
const OUT = opt.out || 'out/evidence/25-ingame-config-choices.json';
const SHOTDIR = opt.shotdir || 'out/evidence';
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = [];
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push({ type: 'exception', text: m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text });
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
  if (!page) throw new Error('没有 page target');
  return page;
}
async function ev(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
const KEYMAP = {
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
};
async function press(cdp, name) {
  const k = KEYMAP[name];
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
  await cdp.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function hover(cdp, selector) {
  const box = await ev(cdp, `(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;var r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!box) return null;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
  return box;
}
async function screenshot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const p = join(SHOTDIR, name);
  mkdirSync(dirname(resolve(p)), { recursive: true });
  writeFileSync(resolve(p), Buffer.from(r.data, 'base64'));
  return p;
}
async function axSummary(cdp) {
  await cdp.send('Accessibility.enable');
  const t = await cdp.send('Accessibility.getFullAXTree');
  const nodes = t.nodes.filter((n) => !n.ignored);
  const byRole = {}; let unnamedImg = 0; const named = [];
  for (const n of nodes) {
    const role = n.role?.value || ''; byRole[role] = (byRole[role] || 0) + 1;
    const name = n.name?.value || '';
    if (role === 'img' && !name) unnamedImg++;
    if (name) named.push({ role, name: name.slice(0, 100) });
  }
  return { total: nodes.length, byRole, unnamedImg, named: named.slice(0, 40) };
}
const STATE = `(function(){
  var st=TYRANO.kag.stat; var lm=document.querySelector('.layer_menu');
  return { scen: st.current_scenario, line: st.current_line, stop: st.is_stop, strong: st.is_strong_stop,
    adding: st.is_adding_text, enableKeyconfig: st.enable_keyconfig,
    menuDisplay: lm?getComputedStyle(lm).display:null, focus: document.activeElement ? document.activeElement.tagName : null };
})()`;

/** 等待条件表达式为真（轮询），超时返回 false */
async function waitFor(cdp, expr, timeoutMs = 6000, gap = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await ev(cdp, expr)) return true;
    await sleep(gap);
  }
  return false;
}

async function main() {
  const page = await pickPage();
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const out = { meta: { port: PORT, startedAt: new Date().toISOString(), url: page.url }, sections: {} };
  const save = () => { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(resolve(OUT), JSON.stringify(out, null, 1), 'utf8'); };
  try {
    out.sections.start = await ev(cdp, STATE);

    // ================= 1) 游戏内菜单 → 设置（theme config.ks） =================
    await ev(cdp, `(function(){var $=jQuery;var b=$('.button_menu');if(b.length && b.css('display')!='none'){b.trigger('click');return 1;}TYRANO.kag.menu.showMenu();return 2;})()`);
    await sleep(900);
    out.sections.menuOpen = await ev(cdp, STATE);
    out.sections.configOpen = await ev(cdp, `(function(){
      try{ window.myobj.config(); return 'myobj.config()'; }catch(e){ return 'ERR:'+e.message; }
    })()`);
    await sleep(1500);
    out.sections.configState = await ev(cdp, STATE);
    await waitFor(cdp, `document.querySelectorAll('.event-setting-element').length > 3`, 5000);
    await sleep(400);
    // 主题设置页控件全量
    out.sections.configControls = await ev(cdp, `(function(){
      var nodes=[].slice.call(document.querySelectorAll('.event-setting-element'));
      return { count: nodes.length,
        nodes: nodes.map(function(e){
          var r=e.getBoundingClientRect(), cs=getComputedStyle(e);
          var evs=window.jQuery?jQuery._data(e,'events'):null;
          var pm=e.getAttribute('data-event-pm');
          return { tag:e.tagName, cls:e.className, id:e.id, src:e.getAttribute('src'),
            text:(e.innerText||'').slice(0,40), display:cs.display,
            rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
            eventTag:e.getAttribute('data-event-tag'), events:evs?Object.keys(evs):null,
            pm: pm ? pm.slice(0,500) : null };
        }) };
    })()`);
    out.sections.configAx = await axSummary(cdp);
    out.sections.configShot = await screenshot(cdp, '25-ingame-config.png');
    // 设置页键盘矩阵
    const cfgKeys = [];
    for (const k of ['Tab', 'Enter', 'Space', 'Escape', 'ArrowDown', 'ArrowRight']) {
      const before = await ev(cdp, STATE);
      await press(cdp, k); await sleep(350);
      cfgKeys.push({ key: k, before: { scen: before.scen, line: before.line }, after: await ev(cdp, STATE) });
    }
    out.sections.configKeyTests = cfgKeys;
    // 设置页的关闭/返回按钮：找 data-event-pm 里 target 含 backtitle 的控件
    out.sections.configBackCandidates = await ev(cdp, `(function(){
      var nodes=[].slice.call(document.querySelectorAll('.event-setting-element'));
      return nodes.filter(function(e){ var p=e.getAttribute('data-event-pm')||''; return p.indexOf('backtitle')>=0 || p.indexOf('back')>=0; })
        .map(function(e){ return {cls:e.className, pm:e.getAttribute('data-event-pm')}; });
    })()`);
    save();

    // ================= 2) glink 选项屏（scene1 *map_01） =================
    await ev(cdp, `(function(){ TYRANO.kag.ftag.startTag('jump',{storage:'scene1.ks',target:'*map_01'}); })()`);
    const gotGlink = await waitFor(cdp, `(TYRANO.kag.stat.is_strong_stop==1) && jQuery('.glink_button').length>0`, 9000);
    await sleep(400);
    out.sections.glink = {
      waited: gotGlink,
      state: await ev(cdp, STATE),
      items: await ev(cdp, `(function(){
        return [].map.call(document.querySelectorAll('.glink_button'), function(e){
          var r=e.getBoundingClientRect(), cs=getComputedStyle(e), evs=jQuery._data(e,'events');
          return { cls:e.className, text:e.innerText, rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
            display:cs.display, cursor:cs.cursor, color:cs.color, fontSize:cs.fontSize, fontFamily:cs.fontFamily,
            tabindex:e.getAttribute('tabindex'), role:e.getAttribute('role'),
            eventTag:e.getAttribute('data-event-tag'), events:evs?Object.keys(evs):null,
            pm:e.getAttribute('data-event-pm') };
        });
      })()`),
      layerFree: await ev(cdp, `(function(){var lf=document.querySelector('#root_layer_system .layer_free');return lf?{display:getComputedStyle(lf).display, children:lf.children.length, htmlHead:lf.innerHTML.slice(0,400)}:null;})()`)
    };
    out.sections.glinkAx = await axSummary(cdp);
    out.sections.glinkShot = await screenshot(cdp, '25-glink.png');
    const glinkKeys = [];
    for (const k of ['Tab', 'Enter', 'Space', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']) {
      const before = await ev(cdp, STATE);
      await press(cdp, k); await sleep(450);
      glinkKeys.push({ key: k, before: { scen: before.scen, line: before.line, strong: before.strong }, after: await ev(cdp, STATE) });
    }
    out.sections.glinkKeyTests = glinkKeys;
    // 真实点击第一个选项，验证跳转链路
    out.sections.glinkClick = await ev(cdp, `(function(){var $=jQuery;var n=$('.glink_button').first();if(!n.length)return 'none';var t=n.text();n.trigger('click');return 'clicked:'+t;})()`);
    await sleep(1800);
    out.sections.afterGlinkClick = await ev(cdp, STATE);
    save();

    // ================= 3) tooltip（scene1 line74「三越」） =================
    await ev(cdp, `(function(){ TYRANO.kag.ftag.startTag('jump',{storage:'scene1.ks',target:''}); })()`);
    await sleep(1200);
    let tooltipFound = false;
    for (let i = 0; i < 60; i++) {
      const has = await ev(cdp, `document.querySelectorAll('.message_inner .tooltip').length`);
      if (has > 0) { tooltipFound = true; break; }
      // 正在打字→补完；否则推进
      await ev(cdp, `(function(){var $=jQuery;var st=TYRANO.kag.stat;if(st.is_adding_text){$('.layer_event_click').trigger('click');return 'finish';}if($('.layer_event_click').length){$('.layer_event_click').trigger('click');}else{TYRANO.kag.ftag.nextOrder();}return 'next';})()`);
      await sleep(380);
    }
    await sleep(500);
    out.sections.tooltip = {
      found: tooltipFound,
      state: await ev(cdp, STATE),
      dom: await ev(cdp, `(function(){
        var t=document.querySelector('.message_inner .tooltip');
        if(!t) return {found:false, msgHtml:(document.querySelector('.message_inner')||{}).innerHTML ? document.querySelector('.message_inner').innerHTML.slice(0,1500) : null};
        var r=t.getBoundingClientRect(), cs=getComputedStyle(t), d=t.querySelector('.desc_top');
        return { found:true, text:t.innerText.slice(0,80), html:t.outerHTML.slice(0,800),
          display:cs.display, position:cs.position, cursor:cs.cursor,
          rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
          attrs:[].map.call(t.attributes,function(a){return a.name;}),
          desc: d?{html:d.outerHTML.slice(0,600), display:getComputedStyle(d).display, rect:(function(rr){return [Math.round(rr.x),Math.round(rr.y),Math.round(rr.width),Math.round(rr.height)];})(d.getBoundingClientRect())}:null };
      })()`)
    };
    const hb = await hover(cdp, '.message_inner .tooltip');
    await sleep(450);
    out.sections.tooltipHover = {
      box: hb,
      dom: await ev(cdp, `(function(){var t=document.querySelector('.message_inner .tooltip');if(!t)return {found:false};var d=t.querySelector('.desc_top');return {found:true, descDisplay:d?getComputedStyle(d).display:null, descRect:(function(){if(!d)return null;var r=d.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(), descText:d?d.innerText.slice(0,160):null};})()`),
      ax: await axSummary(cdp)
    };
    out.sections.tooltipHover.shot = await screenshot(cdp, '25-tooltip.png');
    save();
  } finally {
    out.meta.finishedAt = new Date().toISOString();
    out.meta.consoleTail = cdp.logs.slice(-15);
    cdp.close();
  }
  save();
  console.log('ok:', OUT);
  console.log('  configControls:', out.sections.configControls?.count, ' state:', JSON.stringify(out.sections.configState));
  console.log('  glink items:', (out.sections.glink?.items || []).length, ' waited:', out.sections.glink?.waited);
  console.log('  glinkKeyTests:', (out.sections.glinkKeyTests || []).map((t) => `${t.key}->${t.after.scen}/${t.after.line}/strong=${t.after.strong}`).join(' | '));
  console.log('  glinkClick:', out.sections.glinkClick, ' after:', JSON.stringify(out.sections.afterGlinkClick));
  console.log('  tooltip found:', out.sections.tooltip?.found, ' hover:', JSON.stringify(out.sections.tooltipHover?.dom));
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
