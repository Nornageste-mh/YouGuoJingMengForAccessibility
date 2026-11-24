/*
 * L3 game/patches.js —— 游戏层装配：DOM 辅助、界面注册/检测/切换、键盘路由接入。
 * 职责：发现当前所属界面（title/dialogue/choices…），切换时调用适配器 activate/deactivate，
 *       把键盘事件路由给当前界面（core/keys 的 screenResolver），驱动 tick。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.game && A.game.patches) { return; }

    A.game = A.game || {};
    A.game.screens = A.game.screens || [];

    /* ---------- DOM 辅助（game 层共用） ---------- */
    A.game.dom = {
      isVisible: function (el) {
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
      },

      /* 菜单/面板类界面专用：kag.html 模板加载后 fadeIn(duration)，渐显期 opacity 从 0 起。
         若用 isVisible（含 opacity 判断）会在 fadeIn 期间漏检，造成“界面已出现但补丁没反应”。
         此函数只看 display/visibility/尺寸，不看 opacity。 */
      isRoughVisible: function (el) {
        if (!el || !el.getBoundingClientRect) {
          return false;
        }
        try {
          var style = window.getComputedStyle ? window.getComputedStyle(el, null) : null;
          if (style && (style.display === 'none' || style.visibility === 'hidden')) {
            return false;
          }
          if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
            return false;
          }
          var rect = el.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        } catch (e) {
          return false;
        }
      },

      queryVisible: function (selector, root) {
        var list = (root || document).querySelectorAll(selector);
        var out = [];
        for (var i = 0; i < list.length; i++) {
          if (this.isVisible(list[i])) {
            out.push(list[i]);
          }
        }
        return out;
      },

      textOf: function (el) {
        if (!el) {
          return '';
        }
        var text = '';
        try {
          text = (typeof el.innerText === 'string' && el.innerText) ? el.innerText : el.textContent;
        } catch (e) {
          text = el.textContent;
        }
        return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      },

      labelOf: function (el) {
        if (!el || !el.getAttribute) {
          return '';
        }
        return String(el.getAttribute('data-a11y-name') || el.getAttribute('aria-label') || '').trim();
      },

      /* 标注为可交互控件：role/名称/tabindex/补丁标记；并清除去噪标记 */
      annotate: function (el, spec) {
        if (!el || !el.setAttribute) {
          return el;
        }
        var s = spec || {};
        try {
          el.setAttribute('role', s.role || 'button');
          if (s.name != null) {
            el.setAttribute('aria-label', String(s.name));
            el.setAttribute('data-a11y-name', String(s.name));
          }
          el.setAttribute('tabindex', String(s.tabindex === undefined ? 0 : s.tabindex));
          if (s.control) {
            el.setAttribute('data-a11y-control', String(s.control));
          }
          el.removeAttribute('aria-hidden');
          el.removeAttribute('data-a11y-hidden');
        } catch (e) { /* ignore */ }
        return el;
      },

      /* 从可访问性树移除（不删除节点、不改变视觉） */
      hideFromAX: function (el, hidden) {
        if (!el || !el.setAttribute) {
          return;
        }
        try {
          if (hidden === false) {
            el.removeAttribute('aria-hidden');
            el.removeAttribute('data-a11y-hidden');
            return;
          }
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-a11y-hidden', '1');
          if (el.getAttribute('tabindex') !== null) {
            el.setAttribute('tabindex', '-1');
          }
        } catch (e) { /* ignore */ }
      },

      focus: function (el) {
        if (!el || typeof el.focus !== 'function') {
          return false;
        }
        try {
          el.focus({ preventScroll: true });
          return document.activeElement === el;
        } catch (e) {
          try {
            el.focus();
            return document.activeElement === el;
          } catch (e2) {
            return false;
          }
        }
      },

      /* 焦域移动：当前不在域内 → 聚焦第一项；到边界返回 {moved:false, boundary} */
      moveFocus: function (scope, dir) {
        if (!scope || !scope.length) {
          return { moved: false, boundary: '' };
        }
        var current = document.activeElement;
        var idx = -1;
        for (var i = 0; i < scope.length; i++) {
          if (scope[i] === current) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          this.focus(scope[0]);
          return { moved: true, index: 0 };
        }
        var next = idx + (dir > 0 ? 1 : -1);
        if (next < 0) {
          return { moved: false, boundary: 'first' };
        }
        if (next >= scope.length) {
          return { moved: false, boundary: 'last' };
        }
        this.focus(scope[next]);
        return { moved: true, index: next };
      },

      /* 读取 data-event-pm（[button]/[glink] 等事件标签的权威参数） */
      eventPM: function (el) {
        if (!el || !el.getAttribute) {
          return null;
        }
        var raw = el.getAttribute('data-event-pm');
        if (!raw) {
          return null;
        }
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }
    };

    /* ---------- 界面注册 ---------- */
    A.game.registerScreen = function (screen) {
      if (!screen || !screen.id) {
        return;
      }
      var list = A.game.screens;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === screen.id) {
          list[i] = screen;
          return;
        }
      }
      list.push(screen);
      /* 优先级降序，同优先级保持注册顺序（V8 稳定排序） */
      list.sort(function (a, b) {
        return (b.priority || 0) - (a.priority || 0);
      });
    };

    /* ---------- 检测与切换 ---------- */
    var state = {
      started: false,
      current: null,
      timer: null,
      detectTimer: null,
      observer: null
    };

    function runDetection() {
      if (!A.ready) {
        return;
      }
      var list = A.game.screens;
      var active = null;
      for (var i = 0; i < list.length; i++) {
        var screen = list[i];
        var hit = false;
        try {
          hit = screen.detect ? screen.detect() === true : false;
        } catch (e) {
          if (A.log) {
            A.log.error('screen detect failed', {
              screen: String(screen.id || ''),
              error: String((e && e.message) || e)
            });
          }
          hit = false;
        }
        if (hit) {
          active = screen;
          break;
        }
      }

      if (active !== state.current) {
        var prev = state.current;
        state.current = active;
        if (prev && typeof prev.deactivate === 'function') {
          try {
            prev.deactivate();
          } catch (e2) {
            if (A.log) {
              A.log.error('screen deactivate failed', { screen: String(prev.id || '') });
            }
          }
        }
        if (A.host) {
          /* 先通知 host（会 cancelPending 清掉上一界面的残留提示），再 activate——
           * 否则 activate 里刚 push 的朗读（如选项组）会被清掉。 */
          A.host.onScreenChanged(prev ? prev.id : null, active ? active.id : null);
        }
        if (active) {
          if (A.selfcheck) {
            A.selfcheck.adapterHit(active.id);
          }
          try {
            if (typeof active.activate === 'function') {
              active.activate();
            }
          } catch (e3) {
            if (A.log) {
              A.log.error('screen activate failed', {
                screen: String(active.id || ''),
                error: String((e3 && e3.message) || e3)
              });
            }
          }
        }
      } else if (active && typeof active.refresh === 'function') {
        try {
          active.refresh();
        } catch (e4) { /* ignore */ }
      }

      if (active && typeof active.tick === 'function') {
        try {
          active.tick();
        } catch (e5) { /* ignore */ }
      }
    }

    function scheduleDetection(delay) {
      if (state.detectTimer) {
        clearTimeout(state.detectTimer);
      }
      state.detectTimer = setTimeout(function () {
        state.detectTimer = null;
        try {
          runDetection();
        } catch (e) { /* ignore */ }
      }, delay || 120);
    }

    function startDetection() {
      if (state.timer) {
        return;
      }
      state.started = true;
      try {
        runDetection();
      } catch (e) { /* ignore */ }
      state.timer = setInterval(function () {
        try {
          runDetection();
        } catch (e) { /* ignore */ }
      }, 250);

      var Obs = window.MutationObserver || window.WebKitMutationObserver;
      if (Obs && !state.observer) {
        state.observer = new Obs(function () {
          scheduleDetection(60);
        });
        state.observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
    }

    A.game.patches = {
      /* boot 完成后调用：接键盘路由 + 启动引擎附着 + 启动检测 */
      start: function () {
        if (state.started) {
          return;
        }
        try {
          if (A.keys && A.keys.setScreenResolver) {
            A.keys.setScreenResolver(function () {
              return state.current;
            });
          }
        } catch (e) {
          if (A.log) {
            A.log.error('keys resolver install failed', { error: String((e && e.message) || e) });
          }
        }
        try {
          if (A.engine && A.engine.attach) {
            A.engine.attach(function () {
              if (A.log) {
                A.log.info('patch attached to engine');
              }
              scheduleDetection(0);
            });
          }
        } catch (e2) {
          if (A.log) {
            A.log.error('engine attach call failed', { error: String((e2 && e2.message) || e2) });
          }
        }
        startDetection();
      },

      currentScreen: function () {
        return state.current;
      },

      screenId: function () {
        return state.current ? String(state.current.id || '') : '';
      },

      isStarted: function () {
        return state.started === true;
      },

      /* 排障用：手动触发一次检测 */
      detectNow: function () {
        runDetection();
        return this.screenId();
      }

      /* 界面切换后的“催促”：立即+短延时再检测，缩短菜单/弹窗被感知的延迟。
         与 detectNow 分开命名，供 screens 调用（避免每次点击都同步重入）。 */
      ,
      kickDetection: function () {
        var self = this;
        var delays = [0, 60, 150, 300];
        for (var i = 0; i < delays.length; i++) {
          (function (d) {
            setTimeout(function () {
              try {
                scheduleDetection(0);
              } catch (e) { /* ignore */ }
            }, d);
          })(delays[i]);
        }
        return self.screenId();
      }
    };
  }

  A.registerModule('game/patches', init);
})(window);
