/*
 * L3 game/screens/remodal.js —— 通用确认框（remodal）适配器，最高优先。
 * 静态结构（docs/01c §10.3）：.remodal_wrapper > .remodal > .remodal_title + .remodal_txt
 *   + button.remodal-cancel + button.remodal-confirm；closeOnEscape:false。
 * 行为：进入播报标题+正文；焦点落「取消」；↑↓ 切按钮；Enter/Space 激活；Esc=取消（back 接管）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens.remodal) { return; }
    A.screens = A.screens || {};

    var screen = {
      id: 'remodal',
      priority: 80,
      _scope: [],
      _initedKey: '',

      findRoot: function () {
        var list = document.querySelectorAll('.remodal');
        for (var i = 0; i < list.length; i++) {
          if (A.game.dom.isVisible(list[i])) {
            return list[i];
          }
        }
        return null;
      },

      textOf: function (root, sel) {
        var el = root.querySelector(sel);
        return el ? A.game.dom.textOf(el) : '';
      },

      detect: function () {
        return !!this.findRoot();
      },

      refresh: function () {
        var root = this.findRoot();
        if (!root) { return []; }
        var self = this;
        var btns = [];
        var cancel = root.querySelector('button.remodal-cancel, .remodal-cancel');
        var confirm = root.querySelector('button.remodal-confirm, .remodal-confirm');
        if (cancel) {
          A.game.dom.annotate(cancel, { role: 'button', name: '取消', tabindex: 0, control: 'remodal' });
          btns.push(cancel);
        }
        if (confirm) {
          A.game.dom.annotate(confirm, { role: 'button', name: '确认', tabindex: 0, control: 'remodal' });
          btns.push(confirm);
        }
        this._scope = btns;
        return btns;
      },

      activate: function () {
        var root = this.findRoot();
        if (!root) { return; }
        this.refresh();
        var title = this.textOf(root, '.remodal-title, .remodal_title');
        var body = this.textOf(root, '.remodal_txt, .remodal-txt, .remodal_text');
        /* 标题/正文自带句末标点时不要叠加「。。」 */
        function trimEnd(s) {
          return String(s || '').replace(/[。．.!！?？\s]+$/, '');
        }
        var msg = [trimEnd(title), trimEnd(body)].filter(Boolean).join('。');
        var key = msg + '|' + String(this._scope.length);
        if (key !== this._initedKey) {
          this._initedKey = key;
          A.host.say((msg ? msg + '。' : '') + '取消，确认两个按钮。', {
            source: 'ui', target: 'ui', force: true, interrupt: true
          });
        }
        var cancel = root.querySelector('button.remodal-cancel, .remodal-cancel');
        if (cancel && this._scope.indexOf(document.activeElement) === -1) {
          A.game.dom.focus(cancel);
        }
      },

      deactivate: function () {
        this._scope = [];
        this._initedKey = '';
      },

      onKey: function (action) {
        var scope = this._scope.length ? this._scope : this.refresh();
        if (!scope.length) { return false; }
        if (action === 'up' || action === 'down') {
          var r = A.game.dom.moveFocus(scope, action === 'down' ? 1 : -1);
          if (!r.moved) {
            A.host.say(r.boundary === 'first' ? '已到第一项' : '已到最后一项', { source: 'ui' });
          }
          return true;
        }
        if (action === 'activate') {
          var el = document.activeElement;
          if (el && scope.indexOf(el) !== -1) {
            return A.engine.clickElement(el) === true;
          }
          if (scope[0]) { return A.engine.clickElement(scope[0]) === true; }
          return false;
        }
        /* Esc = 取消（不再透传给游戏） */
        if (action === 'back') {
          var cancel = scope[0];
          if (cancel && /取消/.test(A.game.dom.labelOf(cancel))) {
            return A.engine.clickElement(cancel) === true;
          }
          return false;
        }
        if (action === 'repeat') {
          var focused = document.activeElement;
          var label = focused ? A.game.dom.labelOf(focused) : '';
          A.host.say(label || '确认框', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () {
        /* 确认框内容可能动态变化；由 patches 的 400ms 检测负责开关屏 */
      }
    };

    A.game.registerScreen(screen);
    A.screens.remodal = screen;
  }

  A.registerModule('game/screens/remodal', init);
})(window);
