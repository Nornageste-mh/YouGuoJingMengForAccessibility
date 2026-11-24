/*
 * L3 game/screens/saveload.js —— 存读档界面（theme save.html / load.html）。
 * 依据 docs/01c §4/§5：#menu_save_wrapper / #menu_load_wrapper 显示；.save_list > li.save_display_area
 *   [data-num 0..4]；空档 .save_list_item_text =「现在没有保存的数据。」；关闭 .menu_item.menu_close
 *   （back.png，click 后 layer_menu.fadeOut(300)）。键盘全无效，全部由补丁提供。
 * 行为：5 槽 + 关闭纳入焦域；↑↓ 移动；Enter 激活（读档空槽播「空存档槽」不点击，存档空槽照常点击写盘）；
 *   Esc=关闭。写盘只发生在测试副本（真实目录禁止实验）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens.saveload) { return; }
    A.screens = A.screens || {};

    var screen = {
      id: 'saveload',
      priority: 45,
      _scope: [],
      _items: [],
      _kind: '',
      _initedKey: '',

      findWrapper: function () {
        var ids = [
          { id: 'menu_save_wrapper', kind: 'save' },
          { id: 'menu_load_wrapper', kind: 'load' }
        ];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i].id);
          /* 面板由 kag.html 异步 fadeIn，渐显期 opacity=0；用 rough 判定避免漏检 */
          if (el && A.game.dom.isRoughVisible(el)) {
            return { el: el, kind: ids[i].kind };
          }
        }
        return null;
      },

      collect: function () {
        var w = this.findWrapper();
        if (!w) { return null; }
        var slots = w.el.querySelectorAll('.save_display_area, .save_list_item');
        var items = [];
        for (var i = 0; i < slots.length; i++) {
          var slot = slots[i];
          if (!A.game.dom.isRoughVisible(slot)) { continue; }
          var num = slot.getAttribute('data-num');
          if (num === null) { num = String(i); }
          var txtEl = slot.querySelector('.save_list_item_text');
          var txt = txtEl ? A.game.dom.textOf(txtEl) : '';
          var empty = !txt || /没有保存|没有存档|无数据|no data/i.test(txt);
          items.push({
            el: slot,
            num:Number(num) + 1,
            empty: empty,
            text: empty ? '' : txt
          });
        }
        var close = w.el.querySelector('.menu_item.menu_close, .menu_close');
        return { kind: w.kind, slots: items, close: close };
      },

      kindName: function () {
        return this._kind === 'save' ? '存档' : '读档';
      },

      detect: function () {
        if (!A.game || !A.game.dom) { return false; }
        var w = this.findWrapper();
        if (!w) { return false; }
        return w.el.querySelectorAll('.save_display_area, .save_list_item').length > 0;
      },

      refresh: function () {
        var c = this.collect();
        if (!c) { return []; }
        this._kind = c.kind;
        var items = [];
        for (var i = 0; i < c.slots.length; i++) {
          var s = c.slots[i];
          var label = this.kindName() + '槽 ' + s.num + '：' + (s.empty ? '空存档槽' : s.text.slice(0, 40));
          A.game.dom.annotate(s.el, { role: 'button', name: label, tabindex: 0, control: 'saveload' });
          items.push({ el: s.el, label: label, empty: s.empty, num: s.num });
        }
        if (c.close) {
          var closeLabel = '关闭' + this.kindName() + '界面';
          A.game.dom.annotate(c.close, { role: 'button', name: closeLabel, tabindex: 0, control: 'saveload' });
          items.push({ el: c.close, label: closeLabel, close: true });
        }
        this._items = items;
        this._scope = [];
        for (var j = 0; j < items.length; j++) { this._scope.push(items[j].el); }
        return this._scope;
      },

      activate: function () {
        var scope = this.refresh();
        if (!scope.length) { return; }
        var key = this._kind + '|' + this._items.length;
        if (key !== this._initedKey) {
          this._initedKey = key;
          A.host.say(this.kindName() + '界面，共 ' + (this._items.length - 1) + ' 个存档槽。', {
            source: 'ui', target: 'ui', force: true, interrupt: true
          });
        }
        if (scope.indexOf(document.activeElement) === -1) {
          A.game.dom.focus(scope[0]);
        }
      },

      deactivate: function () {
        this._scope = [];
        this._items = [];
        this._initedKey = '';
      },

      onKey: function (action) {
        var scope = this._scope.length ? this._scope : this.refresh();
        if (!scope.length) { return false; }
        if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
          var r = A.game.dom.moveFocus(scope, action === 'down' || action === 'right' ? 1 : -1);
          if (!r.moved) {
            A.host.say(r.boundary === 'first' ? '已到第一项' : '已到最后一项', { source: 'ui' });
          }
          return true;
        }
        if (action === 'activate') {
          var el = document.activeElement;
          if (!el || scope.indexOf(el) === -1) {
            if (scope[0]) { A.game.dom.focus(scope[0]); }
            return true;
          }
          var item = null;
          for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].el === el) { item = this._items[i]; break; }
          }
          if (!item) { return false; }
          if (item.close) {
            return A.engine.clickElement(el) === true;
          }
          if (item.empty && this._kind === 'load') {
            A.host.say('空存档槽', { source: 'ui', interrupt: true });
            return true;
          }
          var ok = A.engine.clickElement(el) === true;
          if (ok) {
            var self = this;
            setTimeout(function () {
              try {
                var t = A.game.dom.textOf(el);
                A.host.say(t || (self.kindName() + '槽 ' + item.num), { source: 'ui', interrupt: true });
              } catch (e) { /* ignore */ }
            }, 250);
          }
          return ok;
        }
        if (action === 'back') {
          for (var b = 0; b < this._items.length; b++) {
            if (this._items[b].close) { return A.engine.clickElement(this._items[b].el) === true; }
          }
          return false;
        }
        if (action === 'repeat') {
          var f = document.activeElement;
          var label = '';
          for (var q = 0; q < this._items.length; q++) {
            if (this._items[q].el === f) { label = this._items[q].label; break; }
          }
          A.host.say(label || this.kindName() + '界面', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () {
        var c = this.collect();
        if (!c) { return; }
        var key = c.kind + '|' + c.slots.length + '|' + (c.close ? 'c' : '');
        if (key !== this._initedKey) {
          try { this.refresh(); } catch (e) { /* ignore */ }
        }
      }
    };

    A.game.registerScreen(screen);
    A.screens.saveload = screen;
  }

  A.registerModule('game/screens/saveload', init);
})(window);
