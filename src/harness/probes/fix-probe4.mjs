// fix-probe4.mjs — 菜单检测延迟 / 打字中开菜单 / 下一句推进后的屏恢复间隔
const port = process.argv[2] || '9336';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r && r.exceptionDetails) return { __error: String(r.exceptionDetails.text) }; return r.result && r.result.value; };
const KEYS = { Enter: 13, Escape: 27, ArrowDown: 40 };
const key = async (k) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: KEYS[k], nativeVirtualKeyCode: KEYS[k] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: KEYS[k], nativeVirtualKeyCode: KEYS[k] }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const st = async () => JSON.parse(await ev(`JSON.stringify((function(){var A=window.__YOUGUO_A11Y__,k=TYRANO.kag,st=k.stat;var mm=document.querySelector('#menu_menu_wrapper');return {screen:A.game.patches.screenId(),line:st.current_line,adding:!!st.is_adding_text,skip:!!st.is_skip,msg:(st.current_message_str||'').slice(0,24),mv:!!(mm&&mm.offsetParent!==null),live:((document.querySelector('#a11y-live-polite')||{}).textContent||'').slice(0,40),active:(document.activeElement&&(document.activeElement.id||document.activeElement.getAttribute('aria-label')))||''}})())`));
const wait = async (fn, ms = 6000, step = 40) => { const t0 = Date.now(); for (;;) { const s = await st(); if (fn(s)) return { ok: true, ms: Date.now() - t0, s }; if (Date.now() - t0 > ms) return { ok: false, ms: Date.now() - t0, s }; await sleep(step); } };
const focusMenu = () => ev(`(function(){var A=window.__YOUGUO_A11Y__;var d=A.screens.dialogue;var sc=d.refresh();var t=null;for(var i=0;i<sc.length;i++){var l=sc[i].getAttribute&&sc[i].getAttribute('aria-label');if(l==='菜单'){t=sc[i];break;}}if(!t)return 'no menu';A.game.dom.focus(t);return document.activeElement&&document.activeElement.getAttribute('aria-label')})()`);
const out = {};
try {
  await new Promise(r => { ws.onopen = r; });
  await sleep(1200);
  // 到剧情稳定
  for (let i = 0; i < 40; i++) { const s = await st(); if (s.screen === 'dialogue' && !s.adding) break; await key('Enter'); await sleep(700); }
  let s0 = await wait(x => x.screen === 'dialogue' && !x.adding);
  out.base = s0.s;

  // （1）菜单：聚焦→Enter→测 screen==menu 延迟→Esc→测回 dialogue 延迟
  out.focusMenu = await focusMenu();
  await key('Enter');
  out.menuOpen = await wait(x => x.screen === 'menu', 5000, 30);
  await key('Escape');
  out.menuClose = await wait(x => x.screen === 'dialogue', 5000, 30);

  // （2）下一句推进：click 后逐 100ms 采样屏幕/行/文本 2 秒
  const before = await st();
  const clk = await ev(`(function(){var e=document.querySelector('#a11y-next-line');if(!e)return 'noel';e.click();return 'ok'})()`);
  const samples = [];
  for (let i = 0; i < 22; i++) { await sleep(100); samples.push(await st()); }
  out.nextLine = { before, clk, samples: samples.map(x => ({ t: 100, screen: x.screen, line: x.line, adding: x.adding, msg: x.msg })) };

  // （3）打字中开菜单：等稳定→聚焦菜单→Enter 起新行→立刻 focus 菜单（若焦点丢失）→在 adding=true 时 Enter
  await wait(x => x.screen === 'dialogue' && !x.adding, 8000, 50);
  await key('Enter');
  const typing = await wait(x => x.adding === true, 3000, 20);
  const focusMenu2 = await focusMenu();
  const typingBefore = await st();
  await key('Enter');
  const typingMenu = await wait(x => x.screen === 'menu', 4000, 30);
  out.menuDuringTyping = { typing, focusMenu2, typingBefore, result: typingMenu };
  if (typingMenu.ok) await key('Escape');
  console.log(JSON.stringify(out, null, 2));
} finally { ws.close(); }
