/*
 * L3 game/screens/backlog.js —— 历史记录（backlog）界面。
 * 依据 docs/01c §6.3：打开 log 后 #menu_backlog_wrapper display:block；正文 .log_body#touchbox
 *   （HTML 字符串 join("<br />") 写入，数据源 TYRANO.kag.variable.tf.system.backlog，上限 50）；
 *   关闭 .menu_item.menu_close（1680,29,130,138）。键盘全无效。
 * 行为：进入播报条数；↑↓ 逐条朗读（最新在前序：↑ 回看更早）；Enter/Esc 关闭。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens.backlog) { return; }
    A.screens = A.screens || {};

    var screen = {
      id: 'backlog',
      priority: 50,
      _scope: [],
      _entries: [],
      _idx: -1,
      _initedKey: '',

      findWrapper: function () {
        var el = document.getElementById('menu_backlog_wrapper');
        if (el && A.game.dom.isRoughVisible(el)) { return el; }
        var body = document.querySelector('.log_body');
        if (body && A.game.dom.isRoughVisible(body)) {
          return body.parentNode || body;
        }
        return null;
      },

      findBody: function () {
        var body = document.querySelector('.log_body, #touchbox');
        if (body && A.game.dom.isRoughVisible(body)) { return body; }
        return null;
      },

      collect: function () {
        var w = this.findWrapper();
        if (!w) { return null; }
        var close = w.querySelector('.menu_item.menu_close, .menu_close');
        if (!close) {
          var all = document.querySelectorAll('.menu_item.menu_close, .menu_close');
          for (var i = 0; i < all.length; i++) {
            if (A.game.dom.isRoughVisible(all[i])) { close = all[i]; break; }
          }
        }
        return { wrapper: w, body: this.findBody(), close: close };
      },

      readEntries: function (body) {
        if (!body) { return []; }
        var out = [];
        var kids = body.children;
        if (kids && kids.length) {
          for (var i = 0; i < kids.length; i++) {
            if (kids[i].tagName === 'BR') { continue; }
            var t = A.game.dom.textOf(kids[i]);
            if (t) { out.push(t); }
          }
        }
        if (!out.length) {
          var raw = A.game.dom.textOf(body);
          if (raw) {
            out = raw.split(/\s{2,}|\n/);
          }
        }
        var clean = [];
        for (var j = 0; j < out.length; j++) {
          var v = String(out[j]).replace(/\s+/g, ' ').trim();
          if (v) { clean.push(v); }
        }
        return clean;
      },

      detect: function () {
        if (!A.game || !A.game.dom) { return false; }
        return !!this.collect();
      },

      refresh: function () {
        var c = this.collect();
        if (!c) { return []; }
        var items = [];
        if (c.close) {
          A.game.dom.annotate(c.close, { role: 'button', name: '关闭历史记录', tabindex: 0, control: 'backlog' });
          items.push({ el: c.close, label: '关闭历史记录', close: true });
        }
        this._scope = [];
        for (var i = 0; i < items.length; i++) { this._scope.push(items[i].el); }
        return this._scope;
      },

      activate: function () {
        var c = this.collect();
        if (!c) { return; }
        this.refresh();
        this._entries = this.readEntries(c.body);
        this._idx = this._entries.length - 1;
        var key = String(this._entries.length) + '|' + (this._entries[this._idx] || '');
        if (key !== this._initedKey) {
          this._initedKey = key;
          if (!this._entries.length) {
            A.host.say('历史记录为空。按 Esc 关闭。', { source: 'ui', target: 'ui', force: true, interrupt: true });
          } else {
            /* 条目自带句末标点时不要叠加「。。」 */
            var last = String(this._entries[this._idx] || '').replace(/[。．.!！?？\s]+$/, '');
            A.host.say('历史记录，共 ' + this._entries.length + ' 条。最后一条：' + last +
              '。按 Esc 关闭。', { source: 'ui', target: 'ui', force: true, interrupt: true });
          }
        }
        if (this._scope.length && this._scope.indexOf(document.activeElement) === -1) {
          A.game.dom.focus(this._scope[0]);
        }
      },

      deactivate: function () {
        this._scope = [];
        this._entries = [];
        this._idx = -1;
        this._initedKey = '';
      },

      onKey: function (action) {
        if (action === 'up' || action === 'down') {
          if (!this._entries.length) {
            A.host.say('历史记录为空', { source: 'ui' });
            return true;
          }
          /* 缓冲顺序为旧→新：↑ 看更早一条（idx 减），↓ 看更新一条（idx 加） */
          var d = action === 'up' ? -1 : 1;
          var next = this._idx + d;
          if (next < 0) {
            A.host.say('已到最早一条', { source: 'ui' });
            return true;
          }
          if (next >= this._entries.length) {
            A.host.say('已到最新一条', { source: 'ui' });
            return true;
          }
          this._idx = next;
          A.host.say('第 ' + (this._idx + 1) + ' 条：' + this._entries[this._idx], { source: 'ui', interrupt: true });
          return true;
        }
        if (action === 'activate' || action === 'back') {
          for (var i = 0; i < this._scope.length; i++) {
            var it = this._scope[i];
            if (it.getAttribute && it.getAttribute('data-a11y-control') === 'backlog') {
              return A.engine.clickElement(it) === true;
            }
          }
          return false;
        }
        if (action === 'repeat') {
          if (this._idx >= 0 && this._entries[this._idx]) {
            A.host.say('第 ' + (this._idx + 1) + ' 条：' + this._entries[this._idx], { source: 'ui' });
          } else {
            A.host.say('历史记录为空', { source: 'ui' });
          }
          return true;
        }
        return false;
      },

      tick: function () { /* 内容在打开时一次性读取，打开期间不会新增 */ }
    };

    A.game.registerScreen(screen);
    A.screens.backlog = screen;
  }

  A.registerModule('game/screens/backlog', init);
})(window);
