/*
 * L3 game/screens/cg-gallery.js —— CG 画廊（cg.ks）。
 * 依据 docs/01c §3：关闭(gallery_close → *backtitle)、6 个 CG 槽（未解锁 target=*no_image /
 *   已解锁 target=*clickcg，逻辑 rect 3 列 × 2 行）、上一页(*backpage，page≥1 才出现)、
 *   下一页(*nextpage)、分页文本 p.pagination「1/3」、解锁表 TYRANO.kag.variable.sf.cg_view。
 * 行为：6 槽 + 翻页 + 关闭纳入焦域；锁定槽播「未解锁」且不点击；↑↓/←→ 移动（网格按行列），
 *   Enter 激活；Esc 关闭；激活翻页后播报页码。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens['cg-gallery']) { return; }
    A.screens = A.screens || {};

    var screen = {
      id: 'cg-gallery',
      priority: 44,
      _scope: [],
      _items: [],
      _initedKey: '',

      classify: function (el, pm) {
        var target = String((pm && pm.target) || '');
        var graphic = String((pm && pm.graphic) || '').toLowerCase();
        var cls = String(el.className || '');
        if (/backtitle/i.test(target)) { return 'close'; }
        if (/backpage/i.test(target) || /gallery_prev/.test(graphic)) { return 'prev'; }
        if (/nextpage/i.test(target) || /gallery_next/.test(graphic)) { return 'next'; }
        if (/no_image/i.test(target) || /lock/.test(graphic) || /lock/.test(cls.toLowerCase())) { return 'slot-locked'; }
        if (/clickcg/i.test(target) || /selected_cg_image/.test(String(pm.exp || ''))) { return 'slot'; }
        return '';
      },

      collect: function () {
        var list = document.querySelectorAll('#tyrano_base img.event-setting-element');
        var slots = [], others = [], seen = {};
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          if (!A.game.dom.isVisible(el)) { continue; }
          var pm = A.game.dom.eventPM(el);
          if (!pm) { continue; }
          var kind = this.classify(el, pm);
          if (!kind) { continue; }
          /* 6 个锁定槽共用 target=*no_image + graphic=lock.png，去重键必须带上位置，
           * 否则 6 槽会被折叠成 1 个（v0.1 冒烟发现的 bug）。 */
          var dk = kind + '|' + String(pm.target || '') + '|' + String(pm.graphic || '') + '|' + String(pm.x || '') + '|' + String(pm.y || '');
          if (seen[dk]) { continue; }
          seen[dk] = true;
          var it = {
            el: el, pm: pm, kind: kind,
            x: Number(pm.x || 0), y: Number(pm.y || 0),
            file: String((pm.preexp || pm.exp || '')).replace(/^.*?_image=/, '')
          };
          if (kind === 'slot' || kind === 'slot-locked') { slots.push(it); } else { others.push(it); }
        }
        slots.sort(function (a, b) {
          if (Math.abs(a.y - b.y) > 40) { return a.y - b.y; }
          return a.x - b.x;
        });
        /* 槽编号按页内顺序 1..6；解锁态优先展示文件名 */
        for (var s = 0; s < slots.length; s++) {
          slots[s].index = s + 1;
          if (slots[s].kind === 'slot') {
            var m = slots[s].file.match(/([^/=]+\.(?:jpg|jpeg|png|gif))/i);
            slots[s].name = '第' + (s + 1) + '张 CG，' + (m ? m[1] : '已解锁');
          } else {
            slots[s].name = '第' + (s + 1) + '张 CG，未解锁';
          }
        }
        return { slots: slots, prev: this.firstOf(others, 'prev'), next: this.firstOf(others, 'next'), close: this.firstOf(others, 'close') };
      },

      firstOf: function (list, kind) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].kind === kind) { return list[i]; }
        }
        return null;
      },

      pageText: function () {
        var p = document.querySelector('p.pagination');
        if (p && A.game.dom.isVisible(p)) { return A.game.dom.textOf(p); }
        var tf = A.engine && A.engine.tf ? A.engine.tf() : null;
        return tf && tf.page != null ? ('第 ' + (Number(tf.page) + 1) + ' 页') : '';
      },

      detect: function () {
        if (!A.game || !A.game.dom) { return false; }
        var c = this.collect();
        return c.slots.length > 0;
      },

      refresh: function () {
        var c = this.collect();
        var items = [];
        if (c.close) { items.push(c.close); }
        items = items.concat(c.slots);
        if (c.prev) { items.push(c.prev); }
        if (c.next) { items.push(c.next); }
        var names = {
          close: '返回标题', prev: '上一页', next: '下一页'
        };
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          it.label = it.kind === 'slot' || it.kind === 'slot-locked' ? it.name : names[it.kind];
          A.game.dom.annotate(it.el, { role: 'button', name: it.label, tabindex: 0, control: 'cg-gallery' });
        }
        this._items = items;
        this._scope = [];
        for (var j = 0; j < items.length; j++) { this._scope.push(items[j].el); }
        return this._scope;
      },

      activate: function () {
        this.refresh();
        var page = this.pageText();
        var key = String(this._items.length) + '|' + page;
        if (key !== this._initedKey) {
          this._initedKey = key;
          A.host.say('CG 画廊' + (page ? '，' + page : '') + '，共 ' + this._items.length + ' 项。', {
            source: 'ui', target: 'ui', force: true, interrupt: true
          });
        }
        if (this._items.length && this._scope.indexOf(document.activeElement) === -1) {
          /* 默认落在第一个 CG 槽（不是关闭） */
          for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].kind === 'slot' || this._items[i].kind === 'slot-locked') {
              A.game.dom.focus(this._items[i].el);
              return;
            }
          }
          A.game.dom.focus(this._scope[0]);
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
          var el = document.activeElement;
          var cur = null;
          for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].el === el) { cur = this._items[i]; break; }
          }
          /* 网格导航：槽位 3 列；←→ 优先页内横移，up/down 上下移；到页边界可翻页 */
          if (cur && (cur.kind === 'slot' || cur.kind === 'slot-locked')) {
            var slots = [];
            for (var s = 0; s < this._items.length; s++) {
              if (this._items[s].kind === 'slot' || this._items[s].kind === 'slot-locked') { slots.push(this._items[s]); }
            }
            var idx = slots.indexOf(cur);
            var delta = 0;
            if (action === 'left') { delta = -1; } else if (action === 'right') { delta = 1; }
            else if (action === 'up') { delta = -3; } else if (action === 'down') { delta = 3; }
            var t = slots[idx + delta];
            if (t) {
              A.game.dom.focus(t.el);
            } else if (action === 'left' || action === 'up') {
              A.host.say('已到第一项', { source: 'ui' });
            } else if (action === 'right' || action === 'down') {
              A.host.say('已到最后一项', { source: 'ui' });
            }
            return true;
          }
          var r = A.game.dom.moveFocus(scope, action === 'down' || action === 'right' ? 1 : -1);
          if (!r.moved) {
            A.host.say(r.boundary === 'first' ? '已到第一项' : '已到最后一项', { source: 'ui' });
          }
          return true;
        }
        if (action === 'activate') {
          var f = document.activeElement;
          var item = null;
          for (var q = 0; q < this._items.length; q++) {
            if (this._items[q].el === f) { item = this._items[q]; break; }
          }
          if (!item) {
            if (this._items[0]) { A.game.dom.focus(this._items[0].el); }
            return true;
          }
          if (item.kind === 'slot-locked') {
            A.host.say('未解锁', { source: 'ui', interrupt: true });
            return true;
          }
          var wasPage = item.kind === 'prev' || item.kind === 'next';
          var ok = A.engine.clickElement(item.el) === true;
          if (ok && !wasPage && item.kind === 'slot') {
            /* 已解锁槽：点击后游戏进入 [l] 等待 + 满屏 CG 图 → 允许 cg-viewer 接管。
             * 只有从画廊点开才 arm，避免把菜单/标题等满屏背景图误判成 CG 查看器。 */
            try {
              var viewer = A.screens && A.screens['cg-viewer'];
              if (viewer && typeof viewer.arm === 'function') { viewer.arm(); }
            } catch (e0) { /* ignore */ }
          }
          if (ok && wasPage) {
            var self = this;
            setTimeout(function () {
              try {
                var page = self.pageText();
                A.host.say(page ? page : '已翻页', { source: 'ui', interrupt: true });
                self.refresh();
              } catch (e) { /* ignore */ }
            }, 250);
          }
          return ok;
        }
        if (action === 'back') {
          for (var b = 0; b < this._items.length; b++) {
            if (this._items[b].kind === 'close') { return A.engine.clickElement(this._items[b].el) === true; }
          }
          return false;
        }
        if (action === 'repeat') {
          var focus = document.activeElement;
          var label = '';
          for (var w = 0; w < this._items.length; w++) {
            if (this._items[w].el === focus) { label = this._items[w].label; break; }
          }
          A.host.say(label || 'CG 画廊', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () {
        /* 翻页/解锁态可能被游戏更新：页码变化时刷新标签 */
        var page = this.pageText();
        var key = String(this._items.length) + '|' + page;
        if (key !== this._initedKey) {
          try { this.refresh(); } catch (e) { /* ignore */ }
          this._initedKey = key;
        }
      }
    };

    A.game.registerScreen(screen);
    A.screens['cg-gallery'] = screen;
  }

  A.registerModule('game/screens/cg-gallery', init);
})(window);
