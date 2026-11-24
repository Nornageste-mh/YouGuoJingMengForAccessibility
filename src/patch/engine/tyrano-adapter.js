/*
 * L2.5 engine/tyrano-adapter.js —— TyranoScript 引擎适配（唯一允许出现引擎内部名的层）。
 * 提供：attach / stat / isBusy / findMessageNode / findCharaNameNode / getMessageText /
 *       onLineShown / onOptionsChanged / onScreenChanged / findOptions / clickElement /
 *       selectChoice / lineVoiceState / modalDepth / tick
 * 行事件来源：优先包裹 kag.pushBackLog（权威、含快进路径），MutationObserver 180ms 防抖 +
 *             is_adding_text=false（文本稳定）后 emit；DOM 文本仅作无钩子时的兜底。
 */
(function (window, document) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.engine && A.engine._inited) { return; }

    var self = A.engine = {
      _inited: true,
      _ready: false,
      _kag: null,
      _hooksInstalled: false,
      _observer: null,
      _emitTimer: null,
      _pollTimer: null,
      _pendingRaw: null,
      _last: {
        key: '',
        lineKey: '',
        emitAt: 0,
        scenario: '',
        line: -1,
        skip: false,
        optionsKey: '',
        pendingAt: 0
      },
      _callbacks: { line: [], options: [], screen: [] },
      _stats: { rawHooks: 0, backlogEmits: 0, domEmits: 0, optionsEmits: 0, pollTicks: 0, lastSource: '' },

      /* ---------- 生命周期 ---------- */
      init: function () { /* 空实现：装配由 patches.start 调用 attach */ },

      attach: function (cb) {
        var tries = 0;
        function probe() {
          tries++;
          var kag = null;
          try {
            kag = window.TYRANO && window.TYRANO.kag;
          } catch (e) { kag = null; }
          if (kag && kag.stat && kag.ftag) {
            try {
              self._kag = kag;
              self._ready = true;
              self._installHooks();
              self._startPolling();
            } catch (e2) {
              if (A.log) {
                A.log.error('engine hook install failed (isolated)', { error: String((e2 && e2.message) || e2) });
              }
            }
            if (A.log) {
              A.log.info('engine attached', { tries: tries });
            }
            if (typeof cb === 'function') {
              try {
                cb();
              } catch (e3) {
                if (A.log) {
                  A.log.error('engine attach callback failed', { error: String((e3 && e3.message) || e3) });
                }
              }
            }
            return;
          }
          if (tries < 600) {
            setTimeout(probe, 100);
          } else if (A.log) {
            A.log.error('engine attach timeout', { tries: tries });
          }
        }
        probe();
      },

      isReady: function () {
        return self._ready === true;
      },

      kag: function () {
        if (self._kag) {
          return self._kag;
        }
        try {
          return window.TYRANO && window.TYRANO.kag;
        } catch (e) {
          return null;
        }
      },

      /* 游戏系统变量（只读）：TYRANO.kag.variable.tf。界面当前值（音量/速度/开关）唯一来源。 */
      tf: function () {
        try {
          var kag = self.kag();
          if (!kag || !kag.variable || !kag.variable.tf) {
            return null;
          }
          return kag.variable.tf;
        } catch (e) {
          return null;
        }
      },

      isAddingText: function () {
        var st = self.stat();
        return !!(st && st.isAddingText);
      },

      /* 打字中「显示完整文本」：与原生鼠标点击等价的引擎路径。
       * 引擎 nextOrder() 在 is_adding_text 时直接 return false（见 kag.tag.js），
       * 原生点击是置 stat.is_click_text=true 让逐字定时器立即收尾（kag.key_mouse.js）。 */
      revealText: function () {
        try {
          var kag = self.kag();
          if (!kag || !kag.stat) {
            return false;
          }
          if (kag.stat.is_adding_text !== true) {
            return false;
          }
          kag.stat.is_click_text = true;
          return true;
        } catch (e) {
          return false;
        }
      },

      /* ---------- 状态 ---------- */
      stat: function () {
        var kag = self.kag();
        if (!kag || !kag.stat) {
          return null;
        }
        var s = kag.stat;
        return {
          scenario: String(s.current_scenario || ''),
          line: Number(s.current_line || 0),
          isSkip: s.is_skip === true,
          isAuto: s.is_auto === true,
          isAddingText: s.is_adding_text === true,
          isStrongStop: s.is_strong_stop === true,
          isWait: s.is_wait === true,
          isTrans: s.is_trans === true,
          isWaitAnim: s.is_wait_anim === true,
          isStop: s.is_stop === true,
          messageStr: String(s.current_message_str == null ? '' : s.current_message_str),
          charaPtext: String(s.chara_ptext == null ? '' : s.chara_ptext)
        };
      },

      isBusy: function () {
        var st = self.stat();
        if (!st) {
          return true;
        }
        return st.isTrans === true || st.isWaitAnim === true;
      },

      modalDepth: function () {
        var sels = ['.remodal-wrapper', '.remodal', '.save_list', '.log_body', '.menu_item_wrapper'];
        var depth = 0;
        for (var i = 0; i < sels.length; i++) {
          var list = document.querySelectorAll(sels[i]);
          for (var j = 0; j < list.length; j++) {
            if (self._isVisible(list[j])) {
              depth = 1;
              break;
            }
          }
          if (depth) {
            break;
          }
        }
        return depth;
      },

      tick: function () {
        try {
          if (self._pendingRaw && (A.now() - self._pendingRaw.at) > 120) {
            var st = self.stat();
            if (st && !st.isAddingText) {
              self._tryEmit();
            }
          }
        } catch (e) { /* ignore */ }
      },

      /* ---------- 消息 DOM ---------- */
      findMessageNode: function () {
        return document.querySelector('.message_inner p') || null;
      },

      findMessageInner: function () {
        return document.querySelector('.message_inner') || null;
      },

      findCharaNameNode: function () {
        return document.querySelector('.chara_name_area') || null;
      },

      getMessageText: function () {
        var p = self.findMessageNode();
        if (!p) {
          return '';
        }
        var text = '';
        try {
          text = (typeof p.innerText === 'string' && p.innerText) ? p.innerText : p.textContent;
        } catch (e) {
          text = p.textContent;
        }
        return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      },

      getCharaNameText: function () {
        var node = self.findCharaNameNode();
        if (!node) {
          return '';
        }
        var text = '';
        try {
          text = (typeof node.innerText === 'string' && node.innerText) ? node.innerText : node.textContent;
        } catch (e) {
          text = node.textContent;
        }
        return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      },

      /* 引擎提供的配音三态（本轮游戏无配音，恒返回 unknown；dom 标记优先） */
      lineVoiceState: function (node) {
        try {
          var el = node || self.findMessageNode();
          if (el && el.getAttribute) {
            var v = el.getAttribute('data-a11y-voice');
            if (v === 'voiced' || v === 'unvoiced' || v === 'unknown') {
              return v;
            }
          }
        } catch (e) { /* ignore */ }
        return 'unknown';
      },

      /* ---------- 事件订阅 ---------- */
      onLineShown: function (cb) {
        if (typeof cb === 'function') {
          self._callbacks.line.push(cb);
        }
      },

      onOptionsChanged: function (cb) {
        if (typeof cb === 'function') {
          self._callbacks.options.push(cb);
        }
      },

      onScreenChanged: function (cb) {
        if (typeof cb === 'function') {
          self._callbacks.screen.push(cb);
        }
      },

      /* ---------- 选项 ---------- */
      findOptions: function () {
        var list = document.querySelectorAll('div.glink_button');
        var out = [];
        for (var i = 0; i < list.length; i++) {
          if (self._isVisible(list[i])) {
            out.push(list[i]);
          }
        }
        return out;
      },

      optionTexts: function () {
        var opts = self.findOptions();
        var out = [];
        for (var i = 0; i < opts.length; i++) {
          out.push(String(opts[i].textContent == null ? '' : opts[i].textContent).replace(/\s+/g, ' ').trim());
        }
        return out;
      },

      /* ---------- 激活（唯一通路：el.click()） ---------- */
      clickElement: function (el) {
        if (!el || typeof el.click !== 'function') {
          return false;
        }
        try {
          if (!document.contains(el) || !self._isVisible(el)) {
            return false;
          }
        } catch (e) { /* 继续尝试 */ }
        try {
          el.click();
          return true;
        } catch (e2) {
          try {
            var ev = document.createEvent('MouseEvents');
            ev.initEvent('click', true, true);
            el.dispatchEvent(ev);
            return true;
          } catch (e3) {
            if (A.log) {
              A.log.error('clickElement failed', { error: String((e3 && e3.message) || e3) });
            }
            return false;
          }
        }
      },

      /* 打开游戏内系统菜单：走引擎自身动作方法 kag.menu.showMenu()（第 0 条纪律三级顺序①）。
       * 系统栏「菜单」按钮的 DOM click 在有打字/等待状态时会先被 kag.tag.js 的 role 守卫吞掉，
       * 导致用户“按了没反应”；直接调动作方法可绕过该守卫，且仍是由游戏自己构建菜单界面。 */
      openMenu: function () {
        try {
          var kag = self.kag();
          if (kag && kag.menu && typeof kag.menu.showMenu === 'function') {
            var r = kag.menu.showMenu();
            return r !== false;
          }
        } catch (e) {
          if (A.log) {
            A.log.error('openMenu failed', { error: String((e && e.message) || e) });
          }
        }
        return false;
      },

      /* 推进剧情（无控件聚焦时的 Enter/Space 语义）：等价于点击画面。
       * Tyrano 5 的 nextOrder 在 ftag 上（点击/键 13 最终都走它）；异常隔离，不打断游戏。
       * 必须回传引擎结果：nextOrder 在强停/打字中会 return false（假成功会让用户觉得“按了没反应”）。 */
      advance: function () {
        try {
          var kag = self.kag();
          var ftag = kag && kag.ftag;
          if (!ftag || typeof ftag.nextOrder !== 'function') {
            return false;
          }
          var r = ftag.nextOrder();
          return r !== false;
        } catch (e) {
          if (A.log) {
            A.log.error('advance failed', { error: String((e && e.message) || e) });
          }
          return false;
        }
      },

      selectChoice: function (index) {
        var opts = self.findOptions();
        var i = parseInt(index, 10);
        if (isNaN(i) || i < 0 || i >= opts.length) {
          return false;
        }
        return self.clickElement(opts[i]);
      },

      stats: function () {
        var out = {};
        for (var k in self._stats) {
          if (Object.prototype.hasOwnProperty.call(self._stats, k)) {
            out[k] = self._stats[k];
          }
        }
        out.ready = self._ready === true;
        out.pendingRaw = !!self._pendingRaw;
        return out;
      },

      /* ---------- 内部：钩子与观察 ---------- */
      _installHooks: function () {
        if (self._hooksInstalled) {
          return;
        }
        self._hooksInstalled = true;
        var kag = self.kag();

        try {
          if (kag && typeof kag.pushBackLog === 'function' && kag.__a11yPushBackLog !== true) {
            var orig = kag.pushBackLog;
            kag.__a11yOrigPushBackLog = orig;
            kag.pushBackLog = function (str, type) {
              try {
                self._onBacklog(str, type);
              } catch (e) { /* 绝不影响原行为 */ }
              return orig.apply(this, arguments);
            };
            kag.__a11yPushBackLog = true;
          }
        } catch (e2) {
          if (A.log) {
            A.log.error('pushBackLog hook failed', { error: String((e2 && e2.message) || e2) });
          }
        }

        self._installObserver();
      },

      _installObserver: function () {
        if (self._observer) {
          return;
        }
        var Obs = window.MutationObserver || window.WebKitMutationObserver;
        if (!Obs) {
          return;
        }
        self._observer = new Obs(function (muts) {
          self._onMutations(muts);
        });
        self._observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
      },

      _onBacklog: function (str, type) {
        self._stats.rawHooks++;
        self._stats.lastSource = 'backlog';
        var s = String(str == null ? '' : str);
        if (!s) {
          return;
        }
        self._pendingRaw = { raw: s, type: String(type || ''), at: A.now() };
        self._scheduleEmit(150);
      },

      /* U1：检测可见的过场/结局视频（Tyrano bgmovie / layermode_movie）。
       * 返回 {el, src, hasAudio, ended}；无可见大尺寸 video 时返回 null。
       * 注意：视频播完后 Tyrano 的 [l] 等待仍保留 video 节点（需点击才继续），
       * 此时也必须识别为 movie 屏，否则 Enter/点击无处接管（实测 warnings.mp4 即如此）。
       * hasAudio 为尽力探测（captureStream 音轨数），拿不到时为 null。 */
      movieState: function () {
        var pending = null;
        try {
          var list = document.querySelectorAll('video');
          for (var i = 0; i < list.length; i++) {
            var v = list[i];
            var src = '';
            try {
              src = String(v.currentSrc || v.getAttribute('src') || '');
            } catch (e) { /* ignore */ }
            var isMovieSrc = src.indexOf('/data/video/') >= 0 || src.indexOf('\\data\\video\\') >= 0;
            /* 不用 dom.isVisible：视频淡入期 opacity 暂为 0（jQuery animate 300ms）。
               playVideo 追加 <video> 后先 display:none，等 canplay 才显示；这段“加载窗口”
               里如果不算 movie 屏，Enter 会透传给游戏推进剧情（用户看到的就是“过场视频跳不过/乱跳”）。 */
            var st2 = null;
            try {
              st2 = window.getComputedStyle ? window.getComputedStyle(v, null) : null;
            } catch (e0) { /* ignore */ }
            var hidden = !!(st2 && (st2.display === 'none' || st2.visibility === 'hidden'));
            var rect2 = v.getBoundingClientRect();
            var big = rect2.width >= 600 && rect2.height >= 300;
            if (!big && !isMovieSrc) {
              continue;
            }
            var hasAudio = null;
            try {
              if (!hidden && typeof v.captureStream === 'function') {
                var stream = v.captureStream();
                if (stream && typeof stream.getAudioTracks === 'function') {
                  hasAudio = stream.getAudioTracks().length > 0;
                }
              }
            } catch (e2) {
              hasAudio = null;
            }
            var stObj = {
              el: v, src: src, hasAudio: hasAudio,
              ended: v.ended === true,
              pending: hidden || !big,
              /* [bgmovie] 用 zIndex=0 当背景视频（skip=false，无跳过处理器，剧情在 [l] 等点击，
                 不能当成阻塞式 movie 屏吞键）；[movie] 用 zIndex=199999，才可 skip。 */
              bgmode: !(parseInt(st2 && st2.zIndex, 10) >= 1000)
            };
            if (!stObj.pending) {
              return stObj;
            }
            if (!pending) {
              pending = stObj;
            }
          }
        } catch (e3) { /* ignore */ }
        return pending;
      },

      /* 常驻去噪（U5）：剧情文字一律不进可访问性树，朗读唯一来源是 live region。
       * 引擎每行都会重建 <p>/<span>（新节点没有 aria-hidden），且切到菜单/存读档等
       * 界面后 dialogue.refresh 不再执行——因此必须在 adapter 级常驻维护，不能只靠
       * 单个 screen 的 refresh。只改属性，不动 DOM 结构与视觉/点击。 */
      hideMessageFromAX: function () {
        try {
          var hit = document.querySelectorAll(
            '.message_outer, .message_inner, .chara_name_area, .current_span'
          );
          for (var i = 0; i < hit.length; i++) {
            if (hit[i].getAttribute('aria-hidden') !== 'true') {
              hit[i].setAttribute('aria-hidden', 'true');
            }
          }
          var nextImg = document.querySelector('.img_next');
          if (nextImg && nextImg.getAttribute('aria-hidden') !== 'true') {
            nextImg.setAttribute('aria-hidden', 'true');
          }
          /* 视频画面不朗读（U1）；bgmovie 背景视频也要去噪，避免无名 img/video 节点。 */
          var vids = document.querySelectorAll('video');
          for (var vi = 0; vi < vids.length; vi++) {
            if (vids[vi].getAttribute('aria-hidden') !== 'true') {
              vids[vi].setAttribute('aria-hidden', 'true');
            }
          }
        } catch (e) { /* 去噪失败不影响游戏 */ }
      },

      _onMutations: function (muts) {
        self.hideMessageFromAX();
        var relevant = false;
        var options = false;
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          var target = m.target;
          var el = target && target.nodeType === 3 ? target.parentNode : target;
          if (el && el.closest) {
            try {
              if (el.closest('.message_inner') || el.closest('.chara_name_area')) {
                relevant = true;
              }
              if (el.closest('div.glink_button')) {
                options = true;
              }
            } catch (e) { /* ignore */ }
          }
          if (!options && m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (node && node.nodeType === 1) {
                var cls = String(node.className || '');
                if (cls.indexOf('glink_button') !== -1) {
                  options = true;
                }
              }
            }
          }
        }
        if (relevant) {
          self._scheduleEmit(180);
        }
        if (options) {
          self._scheduleOptionsCheck(150);
        }
      },

      _scheduleEmit: function (delay) {
        if (self._emitTimer) {
          clearTimeout(self._emitTimer);
        }
        self._emitTimer = setTimeout(function () {
          self._emitTimer = null;
          self._tryEmit();
        }, delay || 180);
      },

      _tryEmit: function () {
        if (!self._ready) {
          return;
        }
        var st = self.stat();
        if (!st) {
          return;
        }
        if (st.isAddingText === true) {
          self._scheduleEmit(120);
          return;
        }
        self._emitLine(st);
      },

      _emitLine: function (st) {
        var payload = null;
        if (self._pendingRaw) {
          var parsed = self._parseBacklog(self._pendingRaw.raw);
          self._pendingRaw = null;
          if (parsed && parsed.text) {
            payload = { name: parsed.name || '', text: parsed.text, rawText: parsed.rawText, source: 'backlog' };
          }
        }
        if (!payload && self._stats.rawHooks === 0) {
          var domText = self.getMessageText();
          if (domText) {
            payload = { name: self.getCharaNameText(), text: domText, rawText: domText, source: 'dom' };
          }
        }
        if (!payload) {
          return;
        }
        var key = st.scenario + '|' + st.line + '|' + payload.text;
        if (key === self._last.lineKey) {
          return;
        }
        self._last.lineKey = key;
        self._last.emitAt = A.now();
        self._stats.domEmits++;
        if (payload.source === 'backlog') {
          self._stats.backlogEmits++;
        }
        self._stats.lastSource = payload.source;

        var evt = {
          name: payload.name,
          text: payload.text,
          rawText: payload.rawText,
          source: payload.source,
          line: st.line,
          scenario: st.scenario,
          skip: st.isSkip
        };
        var cbs = self._callbacks.line;
        for (var i = 0; i < cbs.length; i++) {
          try {
            cbs[i](evt);
          } catch (e) {
            if (A.log) {
              A.log.error('onLineShown callback failed', { error: String((e && e.message) || e) });
            }
          }
        }
      },

      /* 解析 pushBackLog 的原始串：<span class='backlog_text 姓名'>正文</span> */
      _parseBacklog: function (raw) {
        var s = String(raw == null ? '' : raw);
        var name = '';
        var text = s;
        var m = /^<span\s+class=['"]backlog_text\s*([^'"]*)['"]>([\s\S]*)<\/span>\s*$/i.exec(s);
        if (m) {
          name = String(m[1] || '').trim();
          text = String(m[2] || '');
        }
        return { name: name, text: text, rawText: s };
      },

      /* ---------- 内部：轮询（选项变化/场景变化/兜底 emit） ---------- */
      _startPolling: function () {
        if (self._pollTimer) {
          return;
        }
        self._pollTimer = setInterval(function () {
          try {
            self._poll();
          } catch (e) { /* ignore */ }
        }, 250);
      },

      _poll: function () {
        self._stats.pollTicks++;
        self.hideMessageFromAX();
        var st = self.stat();
        if (!st) {
          return;
        }

        /* 场景/行号变化 */
        if (st.scenario !== self._last.scenario || st.line !== self._last.line) {
          var prevScenario = self._last.scenario;
          self._last.scenario = st.scenario;
          self._last.line = st.line;
          if (prevScenario !== st.scenario && prevScenario !== '') {
            var screenCbs = self._callbacks.screen;
            for (var i = 0; i < screenCbs.length; i++) {
              try {
                screenCbs[i]({ from: prevScenario, to: st.scenario });
              } catch (e) { /* ignore */ }
            }
          }
        }

        /* 选项变化（childList 之外的兜底） */
        var texts = self.optionTexts();
        var key = texts.join('\u0001');
        if (key !== self._last.optionsKey) {
          self._last.optionsKey = key;
          self._stats.optionsEmits++;
          var optionCbs = self._callbacks.options;
          for (var j = 0; j < optionCbs.length; j++) {
            try {
              optionCbs[j]({ texts: texts, elements: self.findOptions() });
            } catch (e2) { /* ignore */ }
          }
        }

        /* 快进状态变化 */
        if (st.isSkip !== self._last.skip) {
          self._last.skip = st.isSkip;
        }
      },

      _scheduleOptionsCheck: function (delay) {
        if (self._optionsTimer) {
          clearTimeout(self._optionsTimer);
        }
        self._optionsTimer = setTimeout(function () {
          self._optionsTimer = null;
          try {
            var texts = self.optionTexts();
            var key = texts.join('\u0001');
            if (key !== self._last.optionsKey) {
              self._last.optionsKey = key;
              self._stats.optionsEmits++;
              var cbs = self._callbacks.options;
              for (var i = 0; i < cbs.length; i++) {
                try {
                  cbs[i]({ texts: texts, elements: self.findOptions() });
                } catch (e) { /* ignore */ }
              }
            }
          } catch (e2) { /* ignore */ }
        }, delay || 150);
      },

      _isVisible: function (el) {
        if (!el || !el.getBoundingClientRect) {
          return false;
        }
        try {
          var style = window.getComputedStyle ? window.getComputedStyle(el, null) : null;
          if (style) {
            if (style.display === 'none' || style.visibility === 'hidden') {
              return false;
            }
            var op = parseFloat(style.opacity);
            if (!isNaN(op) && op === 0) {
              return false;
            }
          }
          if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
            return false;
          }
          var rect = el.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        } catch (e) {
          return false;
        }
      }
    };
  }

  A.registerModule('engine/tyrano-adapter', init);
})(window, document);
