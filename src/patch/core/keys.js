/*
 * L1 core/keys.js —— 键盘归一与分发。
 * 规则：keydown 边沿（忽略 event.repeat/IME/组合键）；焦点门（input/textarea/contenteditable 放行）；
 *       路由到当前界面适配器 screen.onKey(action)；适配器返回 true 才 preventDefault，
 *       否则透传游戏（Tab/Esc 等游戏自身键位不被抢）。
 * 语义：up/down/left/right/activate/back/repeat/tab/tabPrev/choice1..9/silence
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.keys && A.keys._inited) { return; }

    var pressed = {};
    var screenResolver = null;
    var enabled = true;
    var lastActivateAt = 0;

    function isEditableTarget(el) {
      try {
        if (!el || !el.tagName) {
          return false;
        }
        var tag = String(el.tagName).toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return true;
        }
        if (el.isContentEditable === true) {
          return true;
        }
        if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    }

    /* 结构全角数字键（含小键盘 96-105）→ 1-9 */
    function digitOf(code) {
      if (code >= 49 && code <= 57) {
        return code - 48;
      }
      if (code >= 97 && code <= 105) {
        return code - 96;
      }
      return 0;
    }

    function actionOf(ev) {
      var code = ev.keyCode;
      switch (code) {
        case 38: return 'up';
        case 40: return 'down';
        case 37: return 'left';
        case 39: return 'right';
        case 13: return 'activate';
        case 32: return 'activate';
        case 27: return 'back';
        case 8: return 'repeat';
        case 9: return ev.shiftKey ? 'tabPrev' : 'tab';
        case 48: return 'silence';
        default: {
          var d = digitOf(code);
          return d ? 'choice' + d : null;
        }
      }
    }

    function currentScreen() {
      if (typeof screenResolver === 'function') {
        try {
          return screenResolver();
        } catch (e) {
          if (A.log) {
            A.log.error('screenResolver failed', { error: String((e && e.message) || e) });
          }
        }
      }
      return null;
    }

    function activateFocused() {
      var el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) {
        return false;
      }
      if (!el.getAttribute || !el.getAttribute('data-a11y-control')) {
        return false;
      }
      if (A.engine && typeof A.engine.clickElement === 'function') {
        return A.engine.clickElement(el) === true;
      }
      try {
        el.click();
        return true;
      } catch (e) {
        return false;
      }
    }

    function repeatFocused() {
      var el = document.activeElement;
      if (!el || el === document.body) {
        return false;
      }
      if (!el.getAttribute || !el.getAttribute('data-a11y-control')) {
        return false;
      }
      var label = '';
      try {
        label = el.getAttribute('data-a11y-name') || el.getAttribute('aria-label') || '';
      } catch (e) {
        label = '';
      }
      if (!label) {
        return false;
      }
      if (A.host && typeof A.host.say === 'function') {
        A.host.say(label, { source: 'ui' });
      }
      return true;
    }

    function onKeyDown(ev) {
      try {
        if (!ev || ev.repeat === true) {
          return;
        }
        if (ev.isComposing === true || ev.keyCode === 229) {
          return; /* IME 组合中 */
        }
        if (ev.ctrlKey || ev.altKey || ev.metaKey) {
          return; /* 组合键不接管 */
        }
        var action = actionOf(ev);
        if (!action) {
          return;
        }
        if (ev.shiftKey && action !== 'tabPrev' && action !== 'tab') {
          return;
        }
        if (isEditableTarget(ev.target) && action !== 'back') {
          return; /* 原生输入框优先 */
        }
        if (enabled !== true) {
          return;
        }
        if (pressed[ev.keyCode] === true) {
          return;
        }
        pressed[ev.keyCode] = true;

        if (!A.ready) {
          return;
        }
        if (A.host && typeof A.host.keyInputAllowed === 'function' && !A.host.keyInputAllowed()) {
          if (A.log) {
            A.log.diag('key gated', { action: action });
          }
          return;
        }

        /* Enter/Space 250ms 闩锁：一次提交只触发一次 */
        if (action === 'activate') {
          var now = A.now();
          if (now - lastActivateAt < 250) {
            return;
          }
          lastActivateAt = now;
        }

        var screen = currentScreen();
        var handled = false;
        if (screen && typeof screen.onKey === 'function') {
          try {
            handled = screen.onKey(action, ev) === true;
          } catch (e) {
            if (A.log) {
              A.log.error('screen.onKey failed', {
                screen: String(screen.id || ''),
                action: action,
                error: String((e && e.message) || e)
              });
            }
          }
        }

        if (!handled && screen) {
          /* 通用兜底：控件聚焦时重读该控件；否则 Backspace 始终可重读缓冲（与界面无关）。
           * 无适配器屏（转场/引擎自有等待）不兜底，让 Enter/Space 走游戏原生推进。 */
          if (action === 'activate') {
            handled = activateFocused();
          } else if (action === 'repeat') {
            handled = repeatFocused();
            if (!handled) {
              try {
                handled = A.repeat && typeof A.repeat.again === 'function' ? A.repeat.again() === true : false;
              } catch (e2) {
                handled = false;
              }
            }
          }
        }

        if (handled) {
          ev.preventDefault();
          ev.stopPropagation();
          if (A.log && A.log.isDiag && A.log.isDiag()) {
            A.log.diag('key handled', { action: action, screen: screen ? String(screen.id || '') : '' });
          }
        }
      } catch (e) {
        if (A.log) {
          A.log.error('key handler failed (isolated)', { error: String((e && e.message) || e) });
        }
      }
    }

    function onKeyUp(ev) {
      try {
        if (ev && ev.keyCode) {
          delete pressed[ev.keyCode];
        }
      } catch (e) { /* ignore */ }
    }

    function onBlur() {
      pressed = {};
    }

    A.keys = {
      _inited: true,
      setScreenResolver: function (fn) {
        screenResolver = fn;
      },
      setEnabled: function (on) {
        enabled = on !== false;
      },
      isEnabled: function () {
        return enabled === true;
      },
      isPressed: function (code) {
        return pressed[code] === true;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur, false);
  }

  A.registerModule('core/keys', init);
})(window);
