/*
 * L3 game/screens/dialogue.js —— 剧情对话适配器（P0）。
 * 职责：剧情行（角色名+正文，KAG 清洗）行完成播报、入重读缓冲（U1 三态）、快进 note + 停止补念；
 *       对白中 8 个 fixlayer 系统按钮（快速存档/读取/自动/快进/历史/全屏/关闭/菜单）纳入焦域（↑↓+Enter）。
 * 行文本来源：engine.onLineShown（pushBackLog 权威文本，含快进路径；DOM 兜底）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  /* 系统栏按钮固定顺序（按 info.game 约定） */
  var SYSTEM_ORDER = ['qsave', 'qload', 'auto', 'skip', 'log', 'screen', 'close', 'menu'];

  function init() {
    if (A.screens && A.screens.dialogue) { return; }

    A.screens = A.screens || {};

    var screen = {
      id: 'dialogue',
      priority: 10,
      _scope: [],
      _lastLineKey: '',
      _lastFull: '',
      _lastWasSkip: false,
      _skipLine: null,
      _inited: false,
      _nextEl: null,
      _nextLabel: '',

      /* 「下一句」虚拟控件：1px 视觉裁剪、常驻 body、可聚焦、可被 ↑↓ 到达。
       * 不得 aria-hidden / display:none（否则真实 AT 看不到、Tab/方向键无法到达）。 */
      ensureNextEl: function () {
        var el = this._nextEl || document.getElementById('a11y-next-line');
        if (!el) {
          el = document.createElement('div');
          el.id = 'a11y-next-line';
          el.setAttribute('data-a11y-control', 'next-line');
          el.setAttribute('data-a11y-name', '下一句');
          el.setAttribute('aria-label', '下一句');
          el.setAttribute('role', 'button');
          /* 默认不可聚焦；只有剧情屏 activate() 时才置 0（防标题/菜单等屏被残留焦点卡住） */
          el.setAttribute('tabindex', '-1');
          el.style.cssText = [
            'position:fixed', 'left:0', 'top:0', 'width:1px', 'height:1px',
            'margin:-1px', 'padding:0', 'border:0', 'overflow:hidden',
            'clip:rect(0 0 0 0)', 'clip-path:inset(50%)', 'white-space:nowrap',
            'pointer-events:none', 'z-index:1'
          ].join(';');
          document.body.appendChild(el);
        }
        this._nextEl = el;
        this._setNextLabel();
        /* 真实 AT（NVDA）对 div[role=button] 的默认动作是 DOM click；
           没有 click 监听时「下一句」控件只能走键盘 Enter，鼠标/AT 点击会“无反应”。
           因此必须绑定 click，并只经 nextLineActivate 单通路推进（防双推进）。 */
        if (!this._nextClickBound) {
          this._nextClickBound = true;
          var self = this;
          el.addEventListener('click', function (ev) {
            try {
              if (ev && typeof ev.preventDefault === 'function') {
                ev.preventDefault();
              }
            } catch (e0) { /* ignore */ }
            try {
              self.nextLineActivate();
            } catch (e) { /* 点击失败不影响游戏 */ }
          }, false);
        }
        return el;
      },

      /* 打字中 =「显示完整文本」，完成后 =「下一句」 */
      _setNextLabel: function () {
        var el = this._nextEl;
        if (!el) {
          return;
        }
        var st = A.engine && A.engine.stat ? A.engine.stat() : null;
        var typing = !!(st && st.isAddingText);
        var label = typing ? '显示完整文本' : '下一句';
        if (label !== this._nextLabel) {
          this._nextLabel = label;
          el.setAttribute('aria-label', label);
          el.setAttribute('data-a11y-name', label);
        }
      },

      /* 鼠标语义：打字中→显示完整文本；完成后→推进下一句。都走游戏真实推进路径
       * （打字中置 is_click_text；完成时 kag.ftag.nextOrder()，与点击/Enter 原生行为等价，一次只推进一拍）。 */
      nextLineActivate: function () {
        this._setNextLabel();
        var st = A.engine && A.engine.stat ? A.engine.stat() : null;
        if (st && st.isAddingText) {
          try {
            if (A.engine.revealText() === true) {
              return true;
            }
          } catch (e0) { /* 走推进路径兜底 */ }
        }
        try {
          var ok = A.engine.advance() === true;
          /* 引擎偶发处于强停/过渡（nextOrder 返回 false）：短延后重试一次，
             避免出现“按了没反应”的假成功。不重复推进（只有 false 才重试）。 */
          if (!ok && !this._advanceRetry) {
            var self = this;
            this._advanceRetry = setTimeout(function () {
              self._advanceRetry = null;
              try {
                if (A.game.patches.currentScreen() === self && self.detect()) {
                  A.engine.advance();
                }
              } catch (e1) { /* ignore */ }
            }, 160);
          }
          return ok;
        } catch (e) {
          if (A.log) {
            A.log.error('next-line activate failed', { error: String((e && e.message) || e) });
          }
          return false;
        }
      },

      init: function () {
        if (this._inited) {
          return;
        }
        this._inited = true;
        if (A.engine && A.engine.onLineShown) {
          var self = this;
          A.engine.onLineShown(function (evt) {
            try {
              self.handleLine(evt);
            } catch (e) {
              if (A.log) {
                A.log.error('dialogue.handleLine failed', { error: String((e && e.message) || e) });
              }
            }
          });
        }
      },

      /* 剧情进行中：消息窗口可见且已有文本（打字中亦算）。
       * 过渡瞬间（[l]/[p]/[cm] 处理、下一行开头）message_inner 会短暂清空，
       * 若只看 DOM 文本会把当前屏骤判为“无界面”，导致 Enter/↑↓ 在 300~500ms 内被丢弃
       * （用户感受就是“点下一句后偶尔没反应”）。因此把引擎的 current_message_str 也算作证据。 */
      detect: function () {
        if (!A.game || !A.game.dom) {
          return false;
        }
        var inner = document.querySelector('.message_inner');
        if (!inner) {
          return false;
        }
        if (!A.game.dom.isVisible(inner)) {
          return false;
        }
        var text = A.game.dom.textOf(inner);
        if (text) {
          return true;
        }
        var st = A.engine && A.engine.stat ? A.engine.stat() : null;
        if (st && st.isAddingText) {
          return true;
        }
        return !!(st && st.messageStr);
      },

      /* 系统栏按钮 → 焦域 */
      refresh: function () {
        var list = document.querySelectorAll('#tyrano_base img.event-setting-element');
        var found = [];
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          var pm = A.game.dom.eventPM(el);
          if (!pm || !pm.graphic) {
            continue;
          }
          if (!A.game.dom.isVisible(el)) {
            continue;
          }
          var name = A.game.nameMap.resolve(pm, '');
          if (!name) {
            continue;
          }
          var key = String(pm.graphic);
          var order = 99;
          for (var k = 0; k < SYSTEM_ORDER.length; k++) {
            if (key.toLowerCase().indexOf(SYSTEM_ORDER[k]) !== -1) {
              order = k;
              break;
            }
          }
          found.push({ el: el, name: name, order: order });
        }
        /* 同一按钮在 DOM 可能重复：按事件参数 name+graphic 去重，保留最后一个可见节点 */
        var byKey = {};
        for (var j = 0; j < found.length; j++) {
          var f = found[j];
          var dk = String(f.name);
          byKey[dk] = f;
        }
        var scope = [];
        for (var dk2 in byKey) {
          if (Object.prototype.hasOwnProperty.call(byKey, dk2)) {
            var item = byKey[dk2];
            A.game.dom.annotate(item.el, { role: 'button', name: item.name, tabindex: 0, control: 'system' });
            scope.push(item);
          }
        }
        scope.sort(function (a, b) {
          return a.order - b.order;
        });
        var els = [];
        /* 「下一句」永远在焦域最前 */
        var nextEl = this.ensureNextEl();
        if (nextEl) {
          els.push(nextEl);
        }
        for (var m = 0; m < scope.length; m++) {
          els.push(scope[m].el);
        }
        this._scope = els;

        /* 去噪（U5）：正文逐字 span / 姓名容器 / next 箭头一律不进 AX，
         * 朗读唯一来源是 live region。统一由 adapter 常驻维护（每轮 poll +
         * mutation 回调 + 各 screen refresh 都会重贴），这里直接调用。 */
        if (A.engine && A.engine.hideMessageFromAX) {
          A.engine.hideMessageFromAX();
        }
        return els;
      },

      activate: function () {
        this.refresh();
        /* 进游戏默认焦点落在「下一句」：用户无需先 Tab 即可 Enter 推进 */
        var el = this._nextEl || document.getElementById('a11y-next-line');
        if (el) {
          el.removeAttribute('aria-hidden');
          el.setAttribute('tabindex', '0');
          if (this._scope.indexOf(document.activeElement) === -1) {
            A.game.dom.focus(el);
          }
          this._setNextLabel();
        }
        /* 进入对话不 clear 缓冲：界面切换/转场不失效重读（docs/04 缓冲失效规则）。
         * 缓冲只在回标题/读档/退出时由对应适配器 clear。 */
      },

      deactivate: function () {
        this._scope = [];
        this._lastWasSkip = false;
        this._skipLine = null;
        /* 非剧情屏不暴露「下一句」控件（菜单/选项/视频/标题不可到达） */
        if (this._nextEl) {
          this._nextEl.setAttribute('aria-hidden', 'true');
          this._nextEl.setAttribute('tabindex', '-1');
        }
      },

      /* 行事件：U1 三态 + U2 缓冲 */
      handleLine: function (evt) {
        if (!evt) {
          return;
        }
        var st = A.engine && A.engine.stat ? A.engine.stat() : null;
        var text = A.game.textproc.clean(evt.text);
        if (!text) {
          return;
        }
        var name = A.game.textproc.cleanName(evt.name || '');
        var voice = A.game.voice.stateFor(evt);
        var full = A.game.textproc.join(name, text);
        var key = (st ? st.scenario : '') + '|' + (st ? st.line : '') + '|' + text;
        if (key === this._lastLineKey) {
          return;
        }
        this._lastLineKey = key;
        this._lastFull = full;

        var skipping = evt.skip === true || (st && st.isSkip === true);
        this._lastWasSkip = skipping === true;

        var inMovie = false;
        try {
          inMovie = !!(A.engine && A.engine.movieState && A.engine.movieState());
        } catch (e4) { /* ignore */ }
        if (inMovie) {
          /* U1：视频（含音频）播放阶段不朗读剧情行，但仍进重读缓冲 */
          A.repeat.note(full, { voice: 'voiced', movie: true });
        } else if (skipping) {
          this._skipLine = { text: full, at: A.now() };
          A.repeat.note(full, { voice: voice, fastForward: true });
        } else if (voice === 'voiced') {
          /* U1：有配音行静音（含姓名），但入缓冲 */
          A.repeat.note(full, { voice: voice });
        } else {
          A.repeat.say(full, { voice: voice });
        }

        if (A.log) {
          A.log.diag('line shown', {
            voice: String(voice),
            skip: skipping === true,
            chars: full.length,
            line: st ? st.line : 0
          });
        }
      },

      /* 快进停止后补念当前句（不重复整段历史） */
      tick: function () {
        var st = A.engine && A.engine.stat ? A.engine.stat() : null;
        if (!st) {
          return;
        }
        /* 打字状态变化时更新「下一句/显示完整文本」标签 */
        this._setNextLabel();
        if (this._lastWasSkip && !st.isSkip) {
          this._lastWasSkip = false;
          var pending = this._skipLine;
          this._skipLine = null;
          if (pending && (A.now() - pending.at) < 10000) {
            try {
              A.repeat.replay({ source: 'skip-catchup' });
            } catch (e) { /* ignore */ }
          }
        }
      },

      /* 菜单/弹窗正在被游戏异步构建（kag.html + fadeIn，检测器尚未切屏）。
         这期间若把按键交给剧情适配器，Enter 会推进剧情、↑↓ 会移动背后系统栏焦点，
         用户看到的就是“菜单打开没反应/不及时”。故先吞掉，交给即将激活的界面。
         注意必须用“可见性”判断：菜单关闭后 layer_menu 里仍留有 .menu_item 节点，
         若只按存在性判断会永久吞掉所有剧情键。 */
      _systemOverlayOpening: function () {
        try {
          if (typeof A.game.dom.isRoughVisible !== 'function') {
            return false;
          }
          var sels = [
            '.layer_menu .menu_item',
            '#menu_menu_wrapper',
            '#menu_save_wrapper',
            '#menu_load_wrapper',
            '#menu_backlog_wrapper',
            '.remodal-wrapper'
          ];
          for (var i = 0; i < sels.length; i++) {
            var list = document.querySelectorAll(sels[i]);
            for (var j = 0; j < list.length; j++) {
              if (A.game.dom.isRoughVisible(list[j])) {
                return true;
              }
            }
          }
          return false;
        } catch (e) {
          return false;
        }
      },

      /* 点击系统栏按钮后game会异步建菜单；立即催促检测器（0/80/200/400ms）以缩短反应延迟。 */
      _kickDetection: function () {
        var patches = A.game && A.game.patches;
        if (!patches) {
          return;
        }
        var delays = [0, 80, 200, 400];
        for (var i = 0; i < delays.length; i++) {
          (function (d) {
            setTimeout(function () {
              try {
                if (typeof patches.detectNow === 'function') {
                  patches.detectNow();
                }
              } catch (e) { /* ignore */ }
            }, d);
          })(delays[i]);
        }
      },

      onKey: function (action) {
        if (action === 'repeat') {
          var focused = document.activeElement;
          /* 剧情页默认焦点在「下一句」上；此时 Backspace 的意图是重读当前台词，
             而不是念「下一句」这个控件名（否则重读缓冲在剧情中永远够不到）。 */
          if (focused && focused.getAttribute && focused.getAttribute('data-a11y-control') === 'next-line') {
            A.repeat.again();
            return true;
          }
          if (focused && focused.getAttribute && focused.getAttribute('data-a11y-control')) {
            var label = A.game.dom.labelOf(focused);
            if (label) {
              A.host.say(label, { source: 'ui' });
              return true;
            }
          }
          A.repeat.again();
          return true;
        }

        /* 系统菜单/弹窗正在打开（检测器尚未切屏）：先吞键，避免 Enter 推进背后剧情。 */
        if (this._systemOverlayOpening()) {
          return true;
        }

        var scope = this._scope.length ? this._scope : this.refresh();
        if (!scope.length) {
          return false;
        }

        if (action === 'up' || action === 'down') {
          var result = A.game.dom.moveFocus(scope, action === 'down' ? 1 : -1);
          if (!result.moved) {
            A.host.say(result.boundary === 'first' ? '已到第一项' : '已到最后一项', { source: 'ui' });
          }
          return true;
        }

        if (action === 'activate') {
          var el = document.activeElement;
          if (el === this._nextEl || !el || scope.indexOf(el) === -1) {
            return this.nextLineActivate();
          }
          if (scope.indexOf(el) !== -1) {
            var st = A.engine && A.engine.stat ? A.engine.stat() : null;
            var wasTyping = !!(st && st.isAddingText);
            /* 系统栏「菜单」：优先走引擎动作方法（kag.menu.showMenu）。
               DOM click 会先被 kag.tag.js 的 role 守卫吞掉（打字中/等待中），
               用户就会遇到“按了菜单没反应、时好时坏”。 */
            var src = (el.getAttribute && el.getAttribute('src')) || '';
            var isMenu = (A.game.dom.labelOf(el) === '菜单') || src.indexOf('system/menu') >= 0;
            if (isMenu && A.engine.openMenu) {
              var mo = A.engine.openMenu();
              if (mo) {
                this._kickDetection();
                return true;
              }
            }
            if (wasTyping) {
              try { A.engine.revealText(); } catch (e0) { /* ignore */ }
            }
            var ok = A.engine.clickElement(el) === true;
            if (ok) {
              this._kickDetection();
              if (wasTyping) {
                var self = this;
                setTimeout(function () {
                  try {
                    if (A.game.patches.currentScreen() === self) {
                      A.engine.clickElement(el);
                      self._kickDetection();
                    }
                  } catch (e1) { /* ignore */ }
                }, 150);
              }
            }
            return ok;
          }
          return this.nextLineActivate();
        }

        return false;
      }
    };

    A.game.registerScreen(screen);
    A.screens.dialogue = screen;
    screen.init();
  }

  A.registerModule('game/screens/dialogue', init);
})(window);
