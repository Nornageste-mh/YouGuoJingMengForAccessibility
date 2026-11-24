/*
 * L3 game/screens/title.js —— 标题页适配器（P0）。
 * 5 个可见按钮（开始游戏/继续游戏/CG画廊/游戏设置/退出游戏），DOM 顺序 = img_7..img_11。
 * 名称来源：data-event-pm.target 映射（title_screen.ks [button target=...]）；去噪：无意义 img 从 AX 移除。
 * 幂等：从 config/load 返回标题会重复追加按钮（5→10），按可见性 + target 去重，始终只保留每个 target 的最后可见节点。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  var TARGETS = {
    '*start': { order: 0, name: '开始游戏' },
    '*load': { order: 1, name: '继续游戏' },
    '*cg': { order: 2, name: 'CG画廊' },
    '*config': { order: 3, name: '游戏设置' },
    '*exit': { order: 4, name: '退出游戏' }
  };

  function init() {
    if (A.screens && A.screens.title) { return; }

    A.screens = A.screens || {};

    var screen = {
      id: 'title',
      priority: 20,
      _scope: [],

      /* 标题页可见性：存在 target ∈ TARGETS 的可见 img.event-setting-element */
      detect: function () {
        if (!A.game || !A.game.dom) {
          return false;
        }
        try {
          if (A.engine && A.engine.modalDepth && A.engine.modalDepth() > 0) {
            return false;
          }
        } catch (e) { /* ignore */ }
        return this.candidates().length > 0;
      },

      candidates: function () {
        var list = document.querySelectorAll('#tyrano_base img.event-setting-element');
        var out = [];
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          var pm = A.game.dom.eventPM(el);
          if (!pm || !pm.target || !TARGETS[pm.target]) {
            continue;
          }
          if (!A.game.dom.isVisible(el)) {
            continue;
          }
          out.push({ el: el, pm: pm, target: pm.target, order: TARGETS[pm.target].order });
        }
        return out;
      },

      /* 去重 + 标注 + 生成焦域（幂等，可重复调用） */
      refresh: function () {
        var visible = this.candidates();
        var kept = {};
        var i;
        for (i = 0; i < visible.length; i++) {
          kept[visible[i].target] = visible[i].el; /* 后出现的可见节点优先（旧节点是泄漏残影） */
        }

        /* 所有 title 类 img：保留者标注，其余从 AX 移除 */
        var all = document.querySelectorAll('#tyrano_base img.event-setting-element');
        for (i = 0; i < all.length; i++) {
          var el = all[i];
          var pm = A.game.dom.eventPM(el);
          if (!pm || !pm.target || !TARGETS[pm.target]) {
            continue;
          }
          var info = TARGETS[pm.target];
          if (kept[pm.target] === el && A.game.dom.isVisible(el)) {
            A.game.dom.annotate(el, { role: 'button', name: info.name, tabindex: 0, control: 'title' });
          } else if (A.game.dom.isVisible(el)) {
            A.game.dom.hideFromAX(el, true);
          }
        }

        var scope = [];
        for (var target in kept) {
          if (Object.prototype.hasOwnProperty.call(kept, target)) {
            scope.push(kept[target]);
          }
        }
        scope.sort(function (a, b) {
          var pa = A.game.dom.eventPM(a);
          var pb = A.game.dom.eventPM(b);
          var oa = pa && TARGETS[pa.target] ? TARGETS[pa.target].order : 99;
          var ob = pb && TARGETS[pb.target] ? TARGETS[pb.target].order : 99;
          return oa - ob;
        });
        this._scope = scope;
        return scope;
      },

      activate: function () {
        /* 回标题：清空重读缓冲（docs/04 缓冲失效规则） */
        try {
          if (A.repeat) {
            A.repeat.clear('title');
          }
        } catch (e) { /* ignore */ }
        var scope = this.refresh();
        if (scope.length) {
          var active = document.activeElement;
          /* 修复：上一屏（如对话的「下一句」）可能仍持有焦点；只判断 body/html 会让焦点
           * 永远留在不可达控件上，Enter 落到 title.onKey 时不在 scope 内 → 标题按钮点不动。 */
          if (!active || scope.indexOf(active) === -1) {
            A.game.dom.focus(scope[0]);
          }
        }
      },

      deactivate: function () {
        this._scope = [];
      },

      onKey: function (action) {
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
          if (el && scope.indexOf(el) !== -1) {
            return A.engine.clickElement(el) === true;
          }
          return false;
        }

        if (action === 'repeat') {
          A.repeat.again();
          return true;
        }

        return false;
      },

      tick: function () { /* 标题页无定时逻辑（检测间隔即可） */ }
    };

    A.game.registerScreen(screen);
    A.screens.title = screen;
  }

  A.registerModule('game/screens/title', init);
})(window);
