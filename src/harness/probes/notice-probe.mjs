// notice-probe.mjs — 开场 warnings.mp4（[bgmovie]+[l]）交互机制探针
const port = process.argv[2] || '9336';
const mode = process.argv[3] || 'click-video';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
const key = async (k = 'Enter', code = 13) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = `JSON.stringify((function(){var A=window.__YOUGUO_A11Y__,k=TYRANO.kag,st=k.stat;var v=document.querySelector('video');var cs=v?getComputedStyle(v):null;var r=v?v.getBoundingClientRect():null;return {screen:(A&&A.game&&A.game.patches&&A.game.patches.screenId&&A.game.patches.screenId())||'',line:st.current_line,sc:st.current_scenario,adding:!!st.is_adding_text,stop:!!st.is_strong_stop,order:(st.current_order||null),msg:(st.current_message_str||'').slice(0,20),video:v?{src:(v.currentSrc||v.src||'').split('/').pop(),w:Math.round(r.width),h:Math.round(r.height),disp:cs.display,vis:cs.visibility,op:cs.opacity,ended:!!v.ended,paused:!!v.paused,t:Math.round(v.currentTime*10)/10,d:Math.round((v.duration||0)*10)/10,ready:!!v.readyState}:null,live:((document.querySelector('#a11y-live-polite')||{}).textContent||'').slice(0,60),liveA:((document.querySelector('#a11y-live-assertive')||{}).textContent||'').slice(0,90),focus:(document.activeElement&&(document.activeElement.id||document.activeElement.getAttribute('aria-label')))||''}})())`;
const st = async () => { for (let i = 0; i < 30; i++) { try { const v = await ev(probe); if (v) return JSON.parse(v); } catch (e) {} await sleep(120); } throw new Error('probe: no value from page'); };
try {
  await new Promise(r => { ws.onopen = r; });
  await sleep(500);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1800);
  for (let i = 0; i < 100; i++) { const s = await st(); if (s.screen === 'title') break; await sleep(150); }
  const out = { mode, title: await st() };
  await key(); // 开始游戏
  // 等 video 出现并可见
  let seen = null;
  for (let i = 0; i < 300; i++) {
    const s = await st();
    if (s.video && s.video.disp !== 'none' && s.video.w > 600) { seen = { at: Date.now(), s }; break; }
    await sleep(25);
  }
  out.videoSeen = seen;
  if (!seen) { out.fail = 'video not visible'; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  // 等到视频播完/最后帧（最多 7s），或立刻操作
  if (mode === 'click-video' || mode === 'click-screen' || mode === 'enter' || mode === 'mouse-center' || mode === 'mouse-video' || mode === 'a11y-advance' || mode === 'jq-video' || mode === 'notice-enter' || mode === 'notice-click') {
    await sleep(1200);
    out.before = await st();
    if (mode === 'click-video') out.action = await ev(`(function(){var v=document.querySelector('video');if(!v)return 'no';v.click();return 'video.click()'})()`);
    else if (mode === 'notice-enter') { await key(); out.action = 'Enter'; }
    else if (mode === 'notice-click') out.action = await ev(`(function(){var b=document.getElementById('a11y-notice-ok');if(!b)return 'no-btn';b.click();return 'notice-btn.click()'})()`);
    else if (mode === 'a11y-advance') out.action = await ev(`(function(){var A=window.__YOUGUO_A11Y__;if(!A||!A.engine||!A.engine.advance)return 'no-engine';var r=A.engine.advance();return 'advance='+r})()`);
    else if (mode === 'jq-video') out.action = await ev(`(function(){var v=document.querySelector('video');if(!v)return 'no';if(window.jQuery){jQuery(v).trigger('click');return 'jq.trigger(click)';}return 'no-jq'})()`);
    else if (mode === 'click-screen') out.action = await ev(`(function(){var el=document.querySelector('#root_layer_game .layer_event')||document.querySelector('.layer_event')||document.querySelector('#tyrano_base');if(!el)return 'no';var r=el.getBoundingClientRect();var t=document.elementFromPoint(Math.round(r.width/2),Math.round(r.height/2));var tgt=t||el;tgt.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:Math.round(r.width/2),clientY:Math.round(r.height/2)}));return 'elementFromPoint='+(t?t.tagName+'.'+t.className:'null')})()`);
    else if (mode === 'mouse-center' || mode === 'mouse-video') {
      const rect = mode === 'mouse-video'
        ? await ev(`(function(){var v=document.querySelector('video');if(!v)return null;var r=v.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
        : await ev(`(function(){return {x:Math.round(innerWidth/2),y:Math.round(innerHeight/2)}})()`);
      out.mouseAt = rect;
      const x = Math.round(rect.x), y = Math.round(rect.y);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      out.action = 'trusted-mouse-click';
    }
    else { await key(); out.action = 'Enter'; }
    const samples = [];
    for (let i = 0; i < 24; i++) { await sleep(150); samples.push(await st()); }
    out.samples = samples.map(x => ({ screen: x.screen, line: x.line, order: x.order, video: x.video ? { src: x.video.src, ended: x.video.ended, paused: x.video.paused, t: x.video.t, disp: x.video.disp } : null, live: x.live, focus: x.focus }));
    out.lines = Array.from(new Set(samples.map(x => x.line)));
  } else if (mode === 'wait-end') {
    for (let i = 0; i < 60; i++) { const s = await st(); if (s.video && s.video.ended) { out.endedAt = { ms: i * 200, s }; break; } await sleep(200); }
    out.afterEnd = await st();
    await sleep(500);
    out.afterEnd2 = await st();
  }
  console.log(JSON.stringify(out, null, 1));
} finally { ws.close(); }
