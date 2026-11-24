// typing-probe.mjs — 精确验证「打字机中按 Enter 先显示全文」的行为（Lead 独立复测）
// 用法: node typing-probe.mjs <port>
const port = process.argv[2] || '9336';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('index.html')) || list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result); delete msg.id; }
};
const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, { resolve }); ws.send(JSON.stringify({ id: mid, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};
const key = async (code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => evalJs(`(function(){var k=window.TYRANO&&TYRANO.kag;var n=document.querySelector('#a11y-next-line');return JSON.stringify({adding:!!(k&&k.stat.is_adding_text),line:k?k.stat.current_line:null,msg:k?k.stat.current_message_str:null,inner:(document.querySelector('.message_inner')||{}).innerText||'',label:n?n.getAttribute('aria-label'):null,screen:(window.__YOUGUO_A11Y__&&window.__YOUGUO_A11Y__.game.patches.screenId())||''})})()`);
try {
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await sleep(1500);
  const out = { steps: [] };
  const s0 = JSON.parse(await snap());
  out.steps.push({ t: 0, s0 });
  // 推进到进入剧情：若在标题按一次 Enter
  if (s0.screen === 'title') { await key(); await sleep(2500); }
  // 跳过 movie / 等剧情页
  for (let i = 0; i < 20; i++) {
    const s = JSON.parse(await snap());
    out.steps.push({ t: 'drive', s });
    if (s.screen === 'dialogue') break;
    await key(); await sleep(1800);
  }
  // 主动按 Enter 直到再出现下一行的打字中状态
  let caught = null;
  for (let i = 0; i < 60 && !caught; i++) {
    const s = JSON.parse(await snap());
    if (s.screen === 'dialogue' && s.adding) { caught = s; break; }
    if (s.screen === 'dialogue' && !s.adding) { await key(); await sleep(120); continue; }
    await sleep(150);
  }
  out.caught = caught;
  if (!caught) { out.result = 'NO_TYPING_CAUGHT'; console.log(JSON.stringify(out, null, 2)); process.exit(0); }
  // 立刻按 Enter（打字中），并在最短延迟内取状态
  const before = JSON.parse(await snap());
  await key();
  await sleep(60);
  const after60 = JSON.parse(await snap());
  await sleep(300);
  const after360 = JSON.parse(await snap());
  out.result = {
    before,
    after60,
    after360,
    textUnchanged60: before.msg === after60.msg,
    textUnchanged360: before.msg === after360.msg,
    revealed60: before.adding === true && after60.adding === false,
    label60: after60.label,
  };
  console.log(JSON.stringify(out, null, 2));
} finally { ws.close(); }
