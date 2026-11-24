#!/usr/bin/env node
/**
 * probe-panels.mjs —— 游戏内「菜单 / 存档 / backlog / 选项 / tooltip」面板与键盘可达性实测探针。
 *
 * 用途（把 U5「所有控件都能导航到」的取证一次性抓齐）：
 *   0) 剧情页右下方 8 个 fixlayer 系统按钮（qsave/qload/auto/skip/log/screen/close/menu）的真实 DOM、坐标、事件；
 *   1) 点九宫格 .button_menu 打开游戏内菜单，记录各 .menu_item 面板、键盘是否可达、myobj.config 入口是否可点；
 *   2) 存档面板（save.html）槽位 DOM、文本、键盘可达性、返回路径；
 *   3) backlog 面板（backlog.html）内容、滚动方式、关闭方式；
 *   4) glink 选项（scene1 *map_01）的键盘矩阵与点击链路；
 *   5) tooltip 词条（scene1 第 74 行「三越」）的运行时 DOM、hover/键盘可发现性。
 *
 * 用法：
 *   node src/harness/probe-panels.mjs --port 9340 --out out/evidence/24-panels.json --shotdir out/evidence
 * 前提：游戏实例带 --remote-debugging-port 启动，停在标题页或剧情页皆可（脚本会自适应）。
 * 安全：只读观测 + 界面导航，不执行 [save]/[qsave]，不点退出确认；存档只可能因引擎自身 label/iscript 写副本目录。
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
const OUT = opt.out || 'out/evidence/24-panels.json';
const SHOTDIR = opt.shotdir || 'out/evidence';
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端（cdp.mjs 是 CLI 不导出函数，故内联一份；Node>=21 原生 WebSocket） */
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
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.logs.push({ type: 'console', text: (m.params?.args || []).map((a) => a.value ?? a.description).join(' ').slice(0, 400) });
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
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
};

/** 发送真实按键（keydown+keyup），让 jQuery(document).keydown 收到与真人一致的 keyCode */
async function press(cdp, name) {
  const k = KEYMAP[name];
  if (!k) throw new Error('未知按键 ' + name);
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
  await cdp.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/** 鼠标移动到元素中心（触发 CSS :hover，用于 tooltip） */
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

/** AX 摘要：role/name 计数 + 有名节点 + 无名 img 数（NVDA 噪声指标） */
async function axSummary(cdp) {
  await cdp.send('Accessibility.enable');
  const t = await cdp.send('Accessibility.getFullAXTree');
  const nodes = t.nodes.filter((n) => !n.ignored);
  const byRole = {};
  let unnamedImg = 0;
  const named = [];
  for (const n of nodes) {
    const role = n.role?.value || '';
    byRole[role] = (byRole[role] || 0) + 1;
    const name = n.name?.value || '';
    if (role === 'img' && !name) unnamedImg++;
    if (name) named.push({ role, name: name.slice(0, 120), focused: !!n.properties?.find((p) => p.name === 'focused')?.value?.value });
  }
  return { total: nodes.length, byRole, unnamedImg, named, focusedName: named.find((x) => x.focused)?.name || null };
}

/** 通用：状态快照 */
const STATE = `(function(){
  var kag=TYRANO.kag, st=kag.stat;
  var lm=document.querySelector('.layer_menu');
  var act=document.activeElement;
  return {
    scen: st.current_scenario, line: st.current_line,
    stop: st.is_stop, strong: st.is_strong_stop, adding: st.is_adding_text,
    enableKeyconfig: st.enable_keyconfig, hideMsg: st.is_hide_message,
    menuDisplay: lm ? getComputedStyle(lm).display : null,
    focus: act ? act.tagName + '.' + (act.className || '') : null,
    scrollY: window.scrollY
  };
})()`;

/** 通用：打开游戏内菜单（真实点击 .button_menu，走引擎 showmenu 链路） */
async function openMenu(cdp) {
  await ev(cdp, `(function(){var $=jQuery;var b=$('.button_menu');if(b.length&&b.css('display')!='none'){b.trigger('click');return 'button_menu';}TYRANO.kag.menu.showMenu();return 'showMenu';})()`);
  await sleep(900);
}
async function closeMenu(cdp) {
  await ev(cdp, `(function(){var $=jQuery;if($('.menu_close').length){$('.menu_close').trigger('click');return 'menu_close';}if(TYRANO.kag.menu&&TYRANO.kag.menu.layer_menu){TYRANO.kag.menu.layer_menu.hide();}return 'fallback';})()`);
  await sleep(700);
}

async function main() {
  const page = await pickPage();
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const out = { meta: { port: PORT, startedAt: new Date().toISOString(), url: page.url }, sections: {} };
  /** 每段落盘：实例可能被外部清理杀死，先写盘再继续 */
  const save = () => { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(resolve(OUT), JSON.stringify(out, null, 1), 'utf8'); };
  try {
    // ---------- 若在标题页：进入剧情 ----------
    let scen = await ev(cdp, 'TYRANO.kag.stat.current_scenario');
    out.sections.boot = { scen };
    if (scen === 'title_screen.ks') {
      await ev(cdp, `document.querySelector('img.img_7').click()`);
      await sleep(3000);
    }
    // 越过 warnings.mp4 的 [l]，一路推进到含「三越」tooltip 的那句（scene1.ks line 74）
    // 每次点击：正在打字则先补完打字，打字完成后才推进下一句，与真人操作一致
    for (let i = 0; i < 80; i++) {
      const s = await ev(cdp, `(function(){var st=TYRANO.kag.stat;return {msg:st.current_message_str||'',adding:st.is_adding_text,scen:st.current_scenario,line:st.current_line};})()`);
      if (s.scen !== 'scene1.ks') break;
      if (s.msg.indexOf('三越') >= 0 && !s.adding) break;
      await ev(cdp, `(function(){var $=jQuery;if($('.layer_event_click').length){$('.layer_event_click').trigger('click');}else{TYRANO.kag.ftag.nextOrder();}})()`);
      await sleep(450);
    }
    await sleep(700);
    out.sections.dialogue = await ev(cdp, STATE);

    // ---------- 5) tooltip 运行时 DOM（当前句即 scene1.ks:74「三越」）----------
    out.sections.tooltipDom = await ev(cdp, `(function(){
      var t=document.querySelector('.message_inner .tooltip');
      if(!t) return {found:false, msgHtml:(document.querySelector('.message_inner')||{}).innerHTML ? document.querySelector('.message_inner').innerHTML.slice(0,1200):null};
      var r=t.getBoundingClientRect(), cs=getComputedStyle(t);
      var d=t.querySelector('.desc_top');
      return {found:true, text:t.innerText.slice(0,100), html:t.outerHTML.slice(0,700),
        rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], cursor:cs.cursor,
        desc: d?{display:getComputedStyle(d).display, text:d.innerText.slice(0,160), attrs:[].map.call(d.attributes,function(a){return a.name;})}:null,
        attrs:[].map.call(t.attributes,function(a){return a.name;})};
    })()`);
    const hb = await hover(cdp, '.message_inner .tooltip');
    await sleep(450);
    out.sections.tooltipHover = {
      box: hb,
      dom: await ev(cdp, `(function(){var t=document.querySelector('.message_inner .tooltip');if(!t)return {found:false};var d=t.querySelector('.desc_top');return {found:true, descDisplay:d?getComputedStyle(d).display:null, descRect:(function(){if(!d)return null;var r=d.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(), descText:d?d.innerText.slice(0,160):null};})()`),
      ax: await axSummary(cdp)
    };
    out.sections.tooltipHover.shot = await screenshot(cdp, '24-tooltip.png');

    // ---------- 0) fixlayer 系统按钮 ----------
    out.sections.fixlayer = await ev(cdp, `(function(){
      var nodes=[].slice.call(document.querySelectorAll('#tyrano_base > img.fixlayer'));
      return nodes.map(function(e){
        var r=e.getBoundingClientRect(), cs=getComputedStyle(e);
        var evs=window.jQuery?jQuery._data(e,'events'):null;
        return { cls:e.className, id:e.id, src:e.getAttribute('src'), alt:e.getAttribute('alt'), title:e.getAttribute('title'),
          display:cs.display, rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
          styleLeft:e.style.left, styleTop:e.style.top, events:evs?Object.keys(evs):null,
          attrs:[].map.call(e.attributes,function(a){return a.name;}) };
      });
    })()`);

    // ---------- 1) 游戏内菜单 ----------
    await openMenu(cdp);
    out.sections.menu = await ev(cdp, `(function(){
      var $=jQuery, lm=document.querySelector('.layer_menu');
      var wrap=document.querySelector('#menu_menu_wrapper')||document.querySelector('.layer_menu');
      var items=[].slice.call(document.querySelectorAll('.layer_menu .menu_item'));
      var myobjInfo={ typeofMyobj: typeof window.myobj };
      try{ myobjInfo.keys = window.myobj?Object.keys(window.myobj):null; }catch(e){ myobjInfo.keysErr=String(e); }
      return {
        layerMenuDisplay: lm?getComputedStyle(lm).display:null,
        wrapHtml: wrap?wrap.innerHTML.replace(/\\s+/g,' ').slice(0,1500):null,
        items: items.map(function(e){var r=e.getBoundingClientRect(),evs=jQuery._data(e,'events');return {cls:e.className, text:e.innerText.slice(0,60), rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], events:evs?Object.keys(evs):null, tag:e.tagName};}),
        menuConfigAnchor: (function(){var a=document.querySelector('.menu_config a');return a?{onclick:a.getAttribute('onclick'),outer:a.outerHTML.slice(0,200)}:null;})(),
        myobj: myobjInfo,
        bg: (function(){var b=document.querySelector('#menu_menu_wrapper img.img_bg_base');return b?{src:b.getAttribute('src'),rect:(function(r){return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(b.getBoundingClientRect())}:null;})()
      };
    })()`);
    out.sections.menuAx = await axSummary(cdp);
    save();
    await screenshot(cdp, '24-menu.png');
    // 键盘测试：在菜单里按 Tab/Esc/方向/Enter，看是否能聚焦/关闭
    const menuKeyTests = [];
    for (const k of ['Tab', 'Tab', 'Escape', 'ArrowDown', 'Enter']) {
      await press(cdp, k);
      await sleep(350);
      menuKeyTests.push({ key: k, state: await ev(cdp, STATE) });
    }
    out.sections.menuKeyTests = menuKeyTests;
    save();
    // myobj.config() 是否可用（theme menu.html 里 .menu_config 的 onclick）
    out.sections.menuConfigClick = await ev(cdp, `(function(){
      var log=[];
      try{
        var my=window.myobj;
        log.push('typeof myobj='+typeof my);
        if(my&&typeof my.config==='function'){ my.config(); log.push('myobj.config() called'); }
        else { var a=document.querySelector('.menu_config a'); if(a){ a.click(); log.push('anchor.click'); } else log.push('no entry'); }
      }catch(e){ log.push('ERR:'+e.message); }
      return { log: log, scen: TYRANO.kag.stat.current_scenario, menuDisplay: (function(){var lm=document.querySelector('.layer_menu');return lm?getComputedStyle(lm).display:null;})() };
    })()`);
    await sleep(800);
    out.sections.menuConfigAfter = { state: await ev(cdp, STATE), errors: cdp.logs.slice(-5) };
    if (out.sections.menuConfigAfter.state.menuDisplay !== 'block') { await openMenu(cdp); }

    // ---------- 2) 存档面板 ----------
    await ev(cdp, `(function(){var $=jQuery;if($('.menu_save').length){$('.menu_save').trigger('click');return 1;}TYRANO.kag.menu.displaySave();return 2;})()`);
    await sleep(900);
    out.sections.save = await ev(cdp, `(function(){
      var wrap=document.querySelector('#menu_save_wrapper');
      var items=[].slice.call(document.querySelectorAll('#menu_save_wrapper .save_list_item'));
      var close=document.querySelector('#menu_save_wrapper .menu_close');
      return {
        wrapDisplay: wrap?getComputedStyle(wrap).display:null,
        close: close?{cls:close.className, rect:(function(r){return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(close.getBoundingClientRect()), events:(function(){var e=jQuery._data(close,'events');return e?Object.keys(e):null;})()}:null,
        items: items.map(function(e){
          var r=e.getBoundingClientRect();
          var th=e.querySelector('.save_list_item_thumb img');
          var dt=e.querySelector('.save_list_item_date');
          var tx=e.querySelector('.save_list_item_text');
          var evs=jQuery._data(e,'events');
          return { cls:e.className, num:e.getAttribute('data-num'), rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
            thumb: th?th.getAttribute('src'):null, date: dt?dt.innerText:null, text: tx?tx.innerText.slice(0,80):null, events:evs?Object.keys(evs):null };
        }),
        arrowUp: (function(){var a=document.querySelector('#menu_save_wrapper .button_arrow_up');return a?{display:getComputedStyle(a).display,rect:(function(r){return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(a.getBoundingClientRect())}:null;})()
      };
    })()`);
    out.sections.saveAx = await axSummary(cdp);
    save();
    await screenshot(cdp, '24-save.png');
    const saveKeyTests = [];
    for (const k of ['Tab', 'Escape', 'Enter', 'ArrowDown']) {
      await press(cdp, k); await sleep(350);
      saveKeyTests.push({ key: k, state: await ev(cdp, STATE) });
    }
    out.sections.saveKeyTests = saveKeyTests;
    // 关闭存档面板（返回游戏内菜单）
    await ev(cdp, `(function(){var c=document.querySelector('#menu_save_wrapper .menu_close');if(c){jQuery(c).trigger('click');return 1;}return 0;})()`);
    await sleep(700);
    out.sections.afterSaveClose = await ev(cdp, STATE);

    // ---------- 3) backlog 面板 ----------
    await ev(cdp, `(function(){if(document.querySelector('#menu_backlog_wrapper'))return 'already';TYRANO.kag.menu.displayLog();return 'displayLog';})()`);
    await sleep(800);
    out.sections.backlog = await ev(cdp, `(function(){
      var wrap=document.querySelector('#menu_backlog_wrapper');
      var body=document.querySelector('#menu_backlog_wrapper .log_body');
      var close=document.querySelector('#menu_backlog_wrapper .menu_close');
      var ups=[].slice.call(document.querySelectorAll('#menu_backlog_wrapper .button_smart'));
      return {
        wrapDisplay: wrap?getComputedStyle(wrap).display:null,
        body: body?{ childCount: body.children.length, htmlHead: body.innerHTML.slice(0,900), innerTextTail: body.innerText.slice(-300),
          scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
          overflow: getComputedStyle(body).overflowY, rect:(function(r){return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(body.getBoundingClientRect()) }: null,
        close: close?{cls:close.className, rect:(function(r){return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(close.getBoundingClientRect()), events:(function(){var e=jQuery._data(close,'events');return e?Object.keys(e):null;})()}:null,
        smart: ups.map(function(e){var r=e.getBoundingClientRect();return {cls:e.className,display:getComputedStyle(e).display,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]};})
      };
    })()`);
    out.sections.backlogAx = await axSummary(cdp);
    save();
    await screenshot(cdp, '24-backlog.png');
    const backlogKeyTests = [];
    for (const k of ['Tab', 'ArrowUp', 'PageUp', 'Escape']) {
      const before = await ev(cdp, `(function(){var b=document.querySelector('#menu_backlog_wrapper .log_body');return {top:b?b.scrollTop:null,focus:document.activeElement.tagName,menu:(function(){var lm=document.querySelector('.layer_menu');return lm?getComputedStyle(lm).display:null;})()};})()`);
      await press(cdp, k === 'PageUp' ? 'ArrowUp' : k);
      await sleep(350);
      const after = await ev(cdp, `(function(){var b=document.querySelector('#menu_backlog_wrapper .log_body');return {top:b?b.scrollTop:null,focus:document.activeElement.tagName,menu:(function(){var lm=document.querySelector('.layer_menu');return lm?getComputedStyle(lm).display:null;})()};})()`);
      backlogKeyTests.push({ key: k, before, after });
    }
    out.sections.backlogKeyTests = backlogKeyTests;
    await ev(cdp, `(function(){var c=document.querySelector('#menu_backlog_wrapper .menu_close');if(c){jQuery(c).trigger('click');return 1;}var $=jQuery;if($('.menu_close').length){$('.menu_close').trigger('click');return 2;}TYRANO.kag.menu.layer_menu.hide();return 3;})()`);
    await sleep(700);
    out.sections.afterBacklogClose = await ev(cdp, STATE);

    // ---------- 4) glink 选项（跳到 scene1 *map_01）----------
    await ev(cdp, `(function(){ TYRANO.kag.ftag.startTag('jump',{storage:'scene1.ks',target:'*map_01'}); return 1; })()`);
    await sleep(1600);
    out.sections.glink = await ev(cdp, `(function(){
      var nodes=[].slice.call(document.querySelectorAll('.glink_button'));
      return { state: (function(){var st=TYRANO.kag.stat;return {scen:st.current_scenario,line:st.current_line,strong:st.is_strong_stop};})(),
        items: nodes.map(function(e){var r=e.getBoundingClientRect();var evs=jQuery._data(e,'events');return {cls:e.className,text:e.innerText,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],events:evs?Object.keys(evs):null,tabindex:e.getAttribute('tabindex'),role:e.getAttribute('role'),attrs:[].map.call(e.attributes,function(a){return a.name;})};}),
        msgDisplay: (function(){var d=document.querySelector('.message0_fore');return d?getComputedStyle(d).display:null;})()
      };
    })()`);
    out.sections.glinkAx = await axSummary(cdp);
    save();
    await screenshot(cdp, '24-glink.png');
    const glinkKeyTests = [];
    for (const k of ['Tab', 'Enter', 'Space', 'Escape', 'ArrowDown', 'ArrowUp', '1']) {
      if (k === '1') continue;
      await press(cdp, k); await sleep(400);
      glinkKeyTests.push({ key: k, state: await ev(cdp, STATE) });
    }
    out.sections.glinkKeyTests = glinkKeyTests;
    // 真实点击第一个选项，验证链路
    out.sections.glinkClick = await ev(cdp, `(function(){var $=jQuery;var n=$('.glink_button').first();if(!n.length)return 'none';n.trigger('click');return 'clicked:'+n.text();})()`);
    await sleep(2000);
    out.sections.afterGlinkClick = await ev(cdp, STATE);

    // ---------- 收尾：记录最终状态（不点退出确认）----------
    out.sections.finalState = await ev(cdp, STATE);
  } finally {
    out.meta.finishedAt = new Date().toISOString();
    out.meta.consoleTail = cdp.logs.slice(-20);
    cdp.close();
  }
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 1), 'utf8');
  console.log('ok:', OUT);
  console.log('  fixlayer:', (out.sections.fixlayer || []).length, ' menuItems:', (out.sections.menu?.items || []).length,
    ' saveItems:', (out.sections.save?.items || []).length, ' backlogChildren:', out.sections.backlog?.body?.childCount,
    ' glink:', (out.sections.glink?.items || []).length);
  console.log('  menuConfigClick:', JSON.stringify(out.sections.menuConfigClick).slice(0, 300));
  console.log('  glinkKeyTests:', (out.sections.glinkKeyTests || []).map((t) => `${t.key}->${t.state.scen}/${t.state.line}/strong=${t.state.strong}`).join(' | '));
  console.log('  tooltipHover:', JSON.stringify(out.sections.tooltipHover?.dom).slice(0, 300));
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
