#!/usr/bin/env node
/**
 * cdp.mjs — 无依赖 Chrome DevTools Protocol 探针/驱动工具（Node >= 21，用原生 WebSocket）。
 *
 * 用途：《游郭惊梦》Electron 页面实机探针、DOM/AXTree 取证、真实键鼠注入、控制台采集。
 * 启动游戏时注意：必须先在父进程清除环境变量 ELECTRON_RUN_AS_NODE（上层 harness 会设置它），
 * 否则 Kaede.exe 会以 Node 模式启动并立刻退出。示例：
 *   $env:ELECTRON_RUN_AS_NODE=$null
 *   Start-Process 'D:\Steam\steamapps\common\游郭惊梦\Kaede.exe' -ArgumentList '--remote-debugging-port=9333','--force-renderer-accessibility'
 *
 * 用法：
 *   node cdp.mjs targets
 *   node cdp.mjs eval --expr "document.title"
 *   node cdp.mjs eval --file tmp.js
 *   node cdp.mjs dom [--out out/evidence/dom.json] [--grep 开始] [--limit N]
 *   node cdp.mjs ax [--out file.json] [--grep 开始]
 *   node cdp.mjs shot --out out/evidence/title.png [--full]
 *   node cdp.mjs keys --seq "Enter ArrowDown" [--delay 300]
 *   node cdp.mjs click --sel "#tyrano_base .button" | --x 100 --y 200
 *   node cdp.mjs wait --expr "!!document.querySelector('.message')" --timeout 5000
 *   node cdp.mjs console --ms 3000
 *   node cdp.mjs inject --file patch.js      # 页面重载后仍生效
 *   node cdp.mjs reload
 *   node cdp.mjs raw --method Page.captureScreenshot --params '{"format":"png"}'
 *
 * 全局选项：--port 9333  --target <url/title 子串>  --json (机器可读)
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opt[name] = next; i++; }
    else opt[name] = true;
  }
}
const PORT = Number(opt.port || process.env.CDP_PORT || 9333);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTargets() {
  const res = await fetch(`${BASE}/json/list`);
  if (!res.ok) throw new Error(`/json/list HTTP ${res.status}`);
  return res.json();
}

async function pickTarget() {
  const list = await getTargets();
  const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!pages.length) throw new Error('没有可用的 page target；游戏是否已带 --remote-debugging-port 启动？');
  if (opt.target) {
    const hit = pages.find((t) => (t.url || '').includes(opt.target) || (t.title || '').includes(opt.target));
    if (!hit) throw new Error(`没有匹配 --target ${opt.target} 的页面；现有: ${pages.map((p) => p.title + ' ' + p.url).join(' | ')}`);
    return hit;
  }
  return pages[0];
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP websocket 已关闭'));
      this.pending.clear();
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('WebSocket 连接超时')), 8000);
      ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('WebSocket 连接失败')); }, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch {} }
}

async function evaluate(cdp, expr, { awaitPromise = true } = {}) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
    includeCommandLineAPI: true,
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(`页面异常: ${d.text} ${d.exception && d.exception.description ? d.exception.description : ''}`.trim());
  }
  return r.result ? r.result.value : undefined;
}

const KEYMAP = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  F9: { key: 'F9', code: 'F9', vk: 120 },
};
for (let c = 65; c <= 90; c++) {
  const ch = String.fromCharCode(c);
  KEYMAP[ch] = { key: ch.toLowerCase(), code: 'Key' + ch, vk: c, text: ch.toLowerCase() };
}
for (let d = 0; d <= 9; d++) {
  KEYMAP[String(d)] = { key: String(d), code: 'Digit' + d, vk: 48 + d, text: String(d) };
}

function modMask(mods = '') {
  let m = 0;
  if (/alt/i.test(mods)) m |= 1;
  if (/ctrl/i.test(mods)) m |= 2;
  if (/meta/i.test(mods)) m |= 4;
  if (/shift/i.test(mods)) m |= 8;
  return m;
}

async function main() {
  const target = await pickTarget();
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const out = (v) => {
    if (opt.json) console.log(JSON.stringify(v, null, 2));
    else if (typeof v === 'string') console.log(v);
    else console.log(JSON.stringify(v, null, 2));
  };
  const writeOut = (path, data) => {
    const p = resolve(path);
    mkdirSync(dirname(p), { recursive: true });
    if (Buffer.isBuffer(data)) writeFileSync(p, data);
    else writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
    console.log(`已写入 ${p}`);
  };

  switch (cmd) {
    case 'targets':
      out((await getTargets()).map((t) => ({ id: t.id, type: t.type, title: t.title, url: t.url })));
      break;
    case 'eval': {
      const expr = opt.file ? readFileSync(String(opt.file), 'utf8') : String(opt.expr ?? '');
      if (!expr) throw new Error('需要 --expr 或 --file');
      const v = await evaluate(cdp, expr, { awaitPromise: !opt['no-await'] });
      if (opt.out) writeOut(String(opt.out), v);
      else out(v);
      break;
    }
    case 'wait': {
      const timeout = Number(opt.timeout || 10000);
      const t0 = Date.now();
      let last;
      while (Date.now() - t0 < timeout) {
        try { last = await evaluate(cdp, String(opt.expr)); if (last) { out({ ok: true, value: last, elapsedMs: Date.now() - t0 }); break; } } catch (e) { last = String(e); }
        await sleep(200);
      }
      if (!last) { console.error(`等待超时 ${timeout}ms: ${opt.expr}`); process.exitCode = 2; }
      break;
    }
    case 'dom': {
      const script = `(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.01;
        };
        const pathOf = (el) => {
          const parts = [];
          let cur = el;
          for (let i = 0; i < 5 && cur && cur.nodeType === 1; i++) {
            let s = cur.tagName.toLowerCase();
            if (cur.id) { s += '#' + cur.id; parts.unshift(s); break; }
            const cls = (cur.className && typeof cur.className === 'string') ? cur.className.split(/\\s+/).filter(Boolean) : [];
            const first = cls.slice(0, 3).map((c) => '.' + c).join('');
            const parent = cur.parentElement;
            let nth = '';
            if (parent) {
              const sibs = Array.from(parent.children).filter((x) => x.tagName === cur.tagName);
              if (sibs.length > 1) nth = ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
            }
            parts.unshift(s + first + nth);
            cur = cur.parentElement;
          }
          return parts.join(' > ');
        };
        const res = [];
        const root = document.querySelector('#tyrano_base') || document.body;
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') continue;
          const r = el.getBoundingClientRect();
          const txt = (el.childNodes ? Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ') : '').trim();
          const attrs = {};
          for (const a of ['role', 'aria-label', 'aria-hidden', 'aria-live', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'tabindex', 'title', 'alt', 'href']) {
            if (el.hasAttribute(a)) attrs[a] = el.getAttribute(a);
          }
          res.push({
            path: pathOf(el), tag, id: el.id || '', cls: (typeof el.className === 'string' ? el.className : ''),
            role: el.getAttribute('role') || '', attrs, text: txt.slice(0, 120),
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            visible: visible(el), focusable: !!(el.tabIndex >= 0 || el.getAttribute('tabindex') !== null),
          });
        }
        return res;
      })()`;
      let nodes = await evaluate(cdp, script);
      if (opt.grep) nodes = nodes.filter((n) => JSON.stringify(n).includes(String(opt.grep)));
      if (opt.limit) nodes = nodes.slice(0, Number(opt.limit));
      if (opt.out) { writeOut(String(opt.out), nodes); out({ count: nodes.length }); }
      else {
        for (const n of nodes) {
          console.log(`${n.visible ? 'V' : '.'} ${n.tag}${n.id ? '#' + n.id : ''}${n.cls ? '.' + n.cls.split(/\s+/).slice(0, 2).join('.') : ''} [${n.rect.join(',')}] ${n.attrs.role ? 'role=' + n.attrs.role + ' ' : ''}${n.attrs['aria-label'] ? 'label=' + n.attrs['aria-label'] + ' ' : ''}${n.text ? JSON.stringify(n.text) : ''} :: ${n.path}`);
        }
        console.log(`共 ${nodes.length} 个节点`);
      }
      break;
    }
    case 'ax': {
      await cdp.send('Accessibility.enable');
      const tree = await cdp.send('Accessibility.getFullAXTree');
      const nodes = tree.nodes
        .filter((n) => !n.ignored)
        .map((n) => {
          const prop = (k) => {
            const p = (n.properties || []).find((x) => x.name === k);
            return p && p.value ? p.value.value : undefined;
          };
          return {
            nodeId: n.nodeId, role: n.role ? n.role.value : '', name: n.name ? n.name.value : '',
            value: n.value ? n.value.value : undefined, description: n.description ? n.description.value : undefined,
            backendDOMNodeId: n.backendDOMNodeId, focused: prop('focused'), live: prop('live'), atomic: prop('atomic'), relevant: prop('relevant'),
          };
        });
      let filtered = nodes;
      if (opt.grep) filtered = nodes.filter((n) => JSON.stringify(n).includes(String(opt.grep)));
      if (opt.out) { writeOut(String(opt.out), { fetchedAt: new Date().toISOString(), count: nodes.length, nodes }); }
      for (const n of filtered.slice(0, Number(opt.limit || 300))) {
        console.log(`${n.nodeId} ${n.role}${n.focused ? ' [focused]' : ''}${n.live ? ' [live=' + n.live + ']' : ''} ${JSON.stringify(n.name)}${n.value !== undefined ? ' val=' + JSON.stringify(n.value) : ''}`);
      }
      if (!opt.out) console.log(`共 ${filtered.length} 个可访问节点`);
      break;
    }
    case 'shot': {
      const params = { format: 'png' };
      if (opt.full) params.captureBeyondViewport = true;
      const r = await cdp.send('Page.captureScreenshot', params);
      writeOut(String(opt.out || 'tmp/shot.png'), Buffer.from(r.data, 'base64'));
      break;
    }
    case 'keys': {
      const seq = String(opt.seq || '').split(/[\s,]+/).filter(Boolean);
      const mods = modMask(String(opt.mods || ''));
      const delay = Number(opt.delay || 120);
      for (const k of seq) {
        let spec = KEYMAP[k];
        if (!spec && k.length === 1) spec = KEYMAP[k.toUpperCase()];
        if (!spec) throw new Error(`不支持的按键: ${k}`);
        const base = { key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk, modifiers: mods };
        await cdp.send('Input.dispatchKeyEvent', { ...base, type: spec.text && !mods ? 'keyDown' : 'rawKeyDown', ...(spec.text && !mods ? { text: spec.text } : {}) });
        await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
        await sleep(delay);
      }
      out({ ok: true, seq });
      break;
    }
    case 'click': {
      if (opt.sel) {
        const box = await evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(String(opt.sel))}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
        if (!box) throw new Error(`找不到元素: ${opt.sel}`);
        opt.x = String(box.x); opt.y = String(box.y);
      }
      const x = Number(opt.x), y = Number(opt.y);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      out({ ok: true, x, y });
      break;
    }
    case 'console': {
      const ms = Number(opt.ms || 3000);
      const events = [];
      cdp.on('Runtime.consoleAPICalled', (p) => events.push({ kind: 'console', type: p.type, args: (p.args || []).map((a) => a.value !== undefined ? a.value : a.description) }));
      cdp.on('Runtime.exceptionThrown', (p) => events.push({ kind: 'exception', text: p.exceptionDetails && (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text) }));
      await cdp.send('Log.enable');
      cdp.on('Log.entryAdded', (p) => events.push({ kind: 'log', level: p.entry.level, text: p.entry.text }));
      await sleep(ms);
      out(events);
      break;
    }
    case 'inject': {
      const src = readFileSync(String(opt.file), 'utf8');
      const r = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
      out({ ok: true, identifier: r.identifier });
      break;
    }
    case 'reload':
      await cdp.send('Page.reload', { ignoreCache: true });
      out({ ok: true });
      break;
    case 'raw': {
      const params = opt.params ? JSON.parse(String(opt.params)) : {};
      out(await cdp.send(String(opt.method), params));
      break;
    }
    default:
      console.error('未知命令。可用: targets eval dom ax shot keys click wait console inject reload raw');
      process.exitCode = 1;
  }
  cdp.close();
}

main().then(() => process.exit(0), (e) => { console.error(String(e && e.stack || e)); process.exit(1); });
