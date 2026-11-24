/*
 * L3 game/screens/notice.js —— 开场 WARNINGS 警告屏（[bgmovie warnings.mp4] + [l]）。
 *
 * 依据（2026-11-24 探针）：
 * - scene1.ks:8  [bgmovie storage="warnings.mp4"]；:9 [l]；:10 [stop_bgmovie]。
 * - warnings.mp4 无音轨，播完后停在最后一帧「以上OK？READY？」并等一次点击（[l]）。
 * - 引擎的 [l] 只 showNextImg，不绑定 click；点击推进由 event 层处理，
 *   video.click() 合成点击无效，但 kag.ftag.nextOrder()（engine.advance）可可靠推进。
 * - 用户要求（m02370）：警告可用「以上OK」跳过，并朗读警告文本。
 *
 * 行为：
 * - detect：可见大尺寸 video 且 src 含 warnings.mp4（全库仅 warnings 用 bgmovie）。
 * - activate：朗读警告全文，焦点落单一「以上OK，继续」控件。
 * - 激活：Enter/Space/AT 默认动作（DOM click）→ engine.advance() 可靠性优先，
 *   失败再尝试点击 video；一次一键，冷却 500ms 防重复推进。
 * - 非本屏不可达；不改变鼠标原生点击（游戏自身仍可直接点 video 区域）。
 * - U1：warnings.mp4 无音轨；若未来有音轨仍按 voiceGate 静音（视频元素 aria-hidden）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) {
    return;
  }

  /* 截图与剧本原文（m02369 / scene1.ks）——静态文案，不依赖图像识别。 */
  var WARNING_TEXT = '游戏警告。' +
    '本故事纯属虚构，所涉及的人物、事件和场景均为作者想象，与现实世界中的任何个人、组织或事件无关。' +
    '本作品包含可能引起不适的内容描述，如果您感到不快或不适，请及时关闭游戏并寻求适当的支持。' +
    '本作品的所有内容，包括但不限于文字、图像、音效和音乐，均为原创或已获得合法授权。未经许可，严禁复制、分发或修改。' +
    '游戏中的观点和情节不代表作者立场。' +
    '以上内容确认「以上OK」，按 Enter 或点击继续。';

  var BTN_ID = 'a11y-notice-ok';

  function init() {
    if (A.screens && A.screens.notice) {
      return;
    }
    A.screens = A.screens || {};

    var screen = {
      id: 'notice',
      priority: 65,
      _scope: [],
      _announcedSrc: '',
      _lastActivateAt: 0,
      _clickBound: false,

      findVideo: function () {
        var list = document.querySelectorAll('video');
        for (var i = 0; i < list.length; i++) {
          var v = list[i];
          var src = String(v.currentSrc || v.src || '');
          if (src.indexOf('warnings.mp4') === -1) {
            continue;
          }
          if (A.game.dom.isRoughVisible(v)) {
            return v;
          }
        }
        return null;
      },

      ensureButton: function () {
        var el = document.getElementById(BTN_ID);
        if (!el) {
          el = document.createElement('div');
          el.id = BTN_ID;
          el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;' +
            'clip:rect(0 0 0 0);clip-path:inset(50%);margin:0;padding:0;border:0;';
          (document.body || document.documentElement).appendChild(el);
        }
        A.game.dom.annotate(el, {
          role: 'button',
          name: '以上OK，继续',
          tabindex: 0,
          control: 'notice-ok'
        });
        el.removeAttribute('aria-hidden');
        if (!this._clickBound) {
          this._clickBound = true;
          var self = this;
          el.addEventListener('click', function (ev) {
            if (ev && ev.preventDefault) {
              ev.preventDefault();
            }
            self._confirm();
          }, false);
        }
        return el;
      },

      destroyButton: function () {
        var el = document.getElementById(BTN_ID);
        if (el) {
          try {
            el.setAttribute('aria-hidden', 'true');
            el.setAttribute('tabindex', '-1');
          } catch (e) { /* ignore */ }
        }
      },

      detect: function () {
        return !!this.findVideo();
      },

      refresh: function () {
        var v = this.findVideo();
        if (!v) {
          return [];
        }
        try {
          v.setAttribute('aria-hidden', 'true');
          v.setAttribute('data-a11y-voice', 'voiced');
        } catch (e) { /* ignore */ }
        var btn = this.ensureButton();
        this._scope = [btn];
        return this._scope;
      },

      announce: function () {
        A.host.say(WARNING_TEXT, {
          source: 'ui',
          target: 'ui',
          force: true,
          interrupt: true
        });
      },

      activate: function () {
        var scope = this.refresh();
        if (!scope.length) {
          return;
        }
        this.announce();
        if (scope.indexOf(document.activeElement) === -1) {
          A.game.dom.focus(scope[0]);
        }
        if (A.log) {
          A.log.diag('notice screen shown', { text: 'warnings.mp4' });
        }
      },

      deactivate: function () {
        this._scope = [];
        this._announcedSrc = '';
        this.destroyButton();
        try {
          if (A.liveRegion && A.liveRegion.clear) {
            A.liveRegion.clear();
          }
        } catch (e) { /* ignore */ }
      },

      /* 统一的确认动作：advance() 一次；失败再点 video；500ms 冷却。返回是否已处理。 */
      _confirm: function () {
        var now = A.now ? A.now() : Date.now();
        if (this._lastActivateAt && (now - this._lastActivateAt) < 500) {
          return true;
        }
        this._lastActivateAt = now;
        try {
          if (A.engine.advance && A.engine.advance() === true) {
            return true;
          }
        } catch (e) { /* fallthrough */ }
        try {
          var v = this.findVideo();
          if (v && A.engine.clickElement) {
            return A.engine.clickElement(v) === true;
          }
        } catch (e2) { /* ignore */ }
        return true;
      },

      onKey: function (action) {
        if (action === 'activate') {
          return this._confirm();
        }
        if (action === 'repeat') {
          this.announce();
          return true;
        }
        if (action === 'up' || action === 'down') {
          A.host.say('只有一个可以确认的按钮：以上OK，继续。', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () { /* 切换由 patches 的轮询/MutationObserver 检测 */ }
    };

    A.game.registerScreen(screen);
    A.screens.notice = screen;
  }

  A.registerModule('game/screens/notice', init);
})(window);
