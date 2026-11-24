// movie-probe.mjs — warnings 视频跳过稳定性（从标题页开始）
const port = process.argv[2] || '9336';
const delay = Number(process.argv[3] || 0);
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
const key = async (k = 'Enter', code = 13) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = `JSON.stringify((function(){var A=window.__YOUGUO_A11Y__,k=TYRANO.kag,st=k.stat;var v=document.querySelector('video');var cs=v?getComputedStyle(v):null;return {screen:(A.game.patches.screenId())||'',line:st.current_line,sc:st.current_scenario,adding:!!st.is_adding_text,stop:!!st.is_strong_stop,msg:(st.current_message_str||'').slice(0,24),video:v?{w:Math.round(v.getBoundingClientRect().width),disp:cs?cs.display:null,op:cs?cs.opacity:null,ended:!!v.ended,paused:!!v.paused,t:Math.round(v.currentTime*10)/10,d:Math.round((v.duration||0)*10)/10}:null,live:((document.querySelector('#a11y-live-polite')||{}).textContent||'').slice(0,50)}})())`;
const st = async () => JSON.parse(await ev(probe));
try {
  await new Promise(r => { ws.onopen = r; });
  await sleep(1000);
  // 等标题
  for (let i = 0; i < 40; i++) { const s = await st(); if (s.screen === 'title') break; await sleep(200); }
  const out = { delay };
  out.title = await st();
  await key(); // 开始游戏
  // 等 video 出现（最多 4s）
  const t0 = Date.now(); let seen = null;
  for (let i = 0; i < 200; i++) {
    const s = await st();
    if (s.video) { seen = { ms: Date.now() - t0, s }; break; }
    await sleep(20);
  }
  out.videoSeen = seen;
  if (!seen) { out.fail = 'video not seen'; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  await sleep(delay);
  out.beforePress = await st();
  await key(); // 第一次跳过
  await sleep(120);
  out.after1 = await st();
  await key(); // 第二次（模拟用户不放心连按）
  await sleep(250);
  out.after2 = await st();
  // 后续 2s 采样：确认不额外推进
  const tail = [];
  for (let i = 0; i < 12; i++) { await sleep(150); tail.push(await st()); }
  out.tail = tail.map(x => ({ screen: x.screen, line: x.line, video: !!x.video, msg: x.msg }));
  out.lines = Array.from(new Set(tail.map(x => x.line)));
  console.log(JSON.stringify(out, null, 1));
} finally { ws.close(); }
