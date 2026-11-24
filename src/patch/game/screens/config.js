/*
 * L3 game/screens/config.js —— 设置界面（config.ks，47 个 event-setting-element 控件）。
 * 依据 docs/01c §2/§10.4：
 *   back(*backtitle) / BGM 10 档(*vol_bgm_change)+静音(*vol_bgm_mute) /
 *   SE 10 档(*vol_se_change)+静音(*vol_se_mute) / 文字速度 10 档(*ch_speed_change) /
 *   自动速度 10 档(*auto_speed_change) / 已读跳过(*skip_off,*skip_on) / 屏幕模式(*screen_full,*screen_window)。
 * 当前值唯一来源：TYRANO.kag.variable.tf（current_bgm_vol / current_se_vol /
 *   index_num_ch / index_num_auto / text_skip / screen_size），每次播报前实时读。
 * 键盘：↑↓ 移动、←→ 档位增减（滑条）、Enter 激活、Esc=返回（back 按钮）、Tab 切面板组。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  var GROUP_ORDER = ['back', 'bgm', 'bgm_mute', 'se', 'se_mute', 'ch', 'auto', 'unread', 'screen'];
  var GROUP_NAMES = {
    back: '返回',
    bgm: 'BGM 音量',
    bgm_mute: 'BGM 静音',
    se: '音效音量',
    se_mute: '音效静音',
    ch: '文字速度',
    auto: '自动播放速度',
    unread: '已读文本',
    screen: '屏幕模式'
  };

  function init() {
    if (A.screens && A.screens.config) { return; }
    A.screens = A.screens || {};

    function parseLevel(pm, el) {
      var src = String((pm && (pm.graphic || pm.enterimg)) || '') + ' ' + String(el && el.className || '');
      var m = src.match(/(?:bgmvol|sevol|auto|ch)_?(\d+)/i);
      if (m) { return parseInt(m[1], 10); }
      return -1;
    }

    var screen = {
      id: 'config',
      priority: 46,
      _scope: [],
      _items: [],
      _sig: '',
      _initedKey: '',

      /* 一个可见的设置控件 → 类型/组/档位 */
      classify: function (el, pm) {
        var target = String((pm && pm.target) || '').toLowerCase();
        var graphic = String((pm && pm.graphic) || '').toLowerCase();
        var cls = String(el.className || '').toLowerCase();
        var level = parseLevel(pm, el);
        if (/backtitle/.test(target)) { return { group: 'back', level: 0 }; }
        if (/vol_bgm_mute/.test(target)) { return { group: 'bgm_mute', level: 0 }; }
        if (/vol_bgm_change/.test(target)) { return { group: 'bgm', level: level }; }
        if (/vol_se_mute/.test(target)) { return { group: 'se_mute', level: 0 }; }
        if (/vol_se_change/.test(target)) { return { group: 'se', level: level }; }
        if (/ch_speed_change/.test(target)) { return { group: 'ch', level: level }; }
        if (/auto_speed_change/.test(target)) { return { group: 'auto', level: level }; }
        if (/skip_off/.test(target)) { return { group: 'unread', level: 0 }; }
        if (/skip_on/.test(target)) { return { group: 'unread', level: 1 }; }
        if (/screen_full/.test(target)) { return { group: 'screen', level: 0 }; }
        if (/screen_window/.test(target)) { return { group: 'screen', level: 1 }; }
        /* 兜底按 class/graphic 猜（个别主题 target 命名可能不同） */
        if (/bgmvol/.test(cls)) { return { group: /_0\b|mute/.test(cls) ? 'bgm_mute' : 'bgm', level: level }; }
        if (/sevol/.test(cls)) { return { group: /_0\b|mute/.test(cls) ? 'se_mute' : 'se', level: level }; }
        if (/gallery|back/.test(graphic)) { return { group: 'back', level: 0 }; }
        return null;
      },

      collect: function () {
        var list = document.querySelectorAll('#tyrano_base img.event-setting-element');
        var items = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          if (!A.game.dom.isVisible(el)) { continue; }
          var pm = A.game.dom.eventPM(el);
          if (!pm) { continue; }
          var c = this.classify(el, pm);
          if (!c) { continue; }
          /* 去重键必须带档位：同组 10 档共用同一 target/graphic（如 *vol_bgm_change + c_btn.gif），
           * 只用 target/graphic 会把 10 档折叠成 1 个（v0.1 冒烟发现的 bug）。 */
          var dk = c.group + '|' + c.level + '|' + (typeof pm.target === 'string' ? pm.target : '') + '|' + String(pm.graphic || '');
          if (seen[dk]) { continue; }
          seen[dk] = true;
          items.push({ el: el, pm: pm, group: c.group, level: c.level });
        }
        /* 组内按档位排序；back 恒在最前 */
        items.sort(function (a, b) {
          var ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
          if (ga !== gb) { return ga - gb; }
          return a.level - b.level;
        });
        return items;
      },

      detect: function () {
        if (!A.game || !A.game.dom) { return false; }
        var items = this.collect();
        if (items.length < 10) { return false; }
        /* 设置页至少同时有 BGM/SE/文字速度三类控件 */
        var g = {};
        for (var i = 0; i < items.length; i++) { g[items[i].group] = true; }
        return !!(g.bgm && g.se && (g.ch || g.auto));
      },

      /* 实时读 tf 当前值 → 生成播报用描述 */
      values: function () {
        var tf = A.engine && A.engine.tf ? A.engine.tf() : null;
        var v = {
          available: !!tf,
          bgm: tf ? Number(tf.current_bgm_vol) : NaN,
          se: tf ? Number(tf.current_se_vol) : NaN,
          bgmIdx: tf ? Number(tf.index_num_bgm) : NaN,
          seIdx: tf ? Number(tf.index_num_se) : NaN,
          chIdx: tf ? Number(tf.index_num_ch) : NaN,
          autoIdx: tf ? Number(tf.index_num_auto) : NaN,
          textSkip: tf ? tf.text_skip : undefined,
          screenSize: tf ? tf.screen_size : undefined
        };
        return v;
      },

      labelOf: function (item, v) {
        var g = item.group;
        if (g === 'back') { return '返回'; }
        if (g === 'bgm') { return 'BGM 音量 ' + item.level + '%' + (item.level === v.bgm ? '，当前' : ''); }
        if (g === 'se') { return '音效音量 ' + item.level + '%' + (item.level === v.se ? '，当前' : ''); }
        if (g === 'ch') {
          var chList = [100, 80, 50, 40, 30, 25, 20, 11, 8, 5];
          /* index_num_ch 可能 0 或 1 基：两种都试，命中即标当前（探针实测后固定） */
          var ch0 = chList[v.chIdx], ch1 = v.chIdx >= 1 ? chList[v.chIdx - 1] : undefined;
          var isChCur = (item.level === ch0) || (item.level === ch1);
          return '文字速度 ' + item.level + (isChCur ? '，当前' : '');
        }
        if (g === 'auto') {
          /* 实测 DOM 档位（config.ks）：5000/4500/4000/3500/3000/2500/2000/1300/800/500；index_num_auto=7 为 0 基 → 1300 */
          var autoList = [5000, 4500, 4000, 3500, 3000, 2500, 2000, 1300, 800, 500];
          var a0 = autoList[v.autoIdx], a1 = v.autoIdx >= 1 ? autoList[v.autoIdx - 1] : undefined;
          var isAutoCur = (item.level === a0) || (item.level === a1);
          return '自动播放速度 ' + item.level + ' 毫秒' + (isAutoCur ? '，当前' : '');
        }
        if (g === 'bgm_mute') { return 'BGM 静音' + (v.bgm === 0 ? '，当前' : ''); }
        if (g === 'se_mute') { return '音效静音' + (v.se === 0 ? '，当前' : ''); }
        if (g === 'unread') {
          var on = (v.textSkip === 'ON' || v.textSkip === true || v.textSkip === 1);
          var want = item.level === 1;
          return (want ? '跳过已读文本' : '不跳过已读文本') + (want === on ? '，当前' : '');
        }
        if (g === 'screen') {
          var cur = String(v.screenSize || '');
          var isFull = /full/i.test(cur);
          var wantFull = item.level === 0;
          return (wantFull ? '全屏显示' : '窗口显示') + (wantFull === isFull ? '，当前' : '');
        }
        return GROUP_NAMES[g] || g;
      },

      refresh: function (force) {
        var items = this.collect();
        var v = this.values();
        var sig = [items.length, v.bgm, v.se, v.chIdx, v.autoIdx, v.textSkip, v.screenSize].join('|');
        if (force === true || sig !== this._sig) {
          this._sig = sig;
        }
        var scope = [];
        this._items = items;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var label = this.labelOf(it, v);
          it.label = label;
          A.game.dom.annotate(it.el, {
            role: 'button', name: label, tabindex: 0, control: 'config'
          });
          scope.push(it.el);
        }
        this._scope = scope;
        return scope;
      },

      activate: function () {
        this.refresh(true);
        var items = this._items;
        var key = String(items.length);
        if (key !== this._initedKey) {
          this._initedKey = key;
          var v = this.values();
          A.host.say('设置界面，共 ' + items.length + ' 个控件。BGM 音量 ' + (isNaN(v.bgm) ? '未知' : v.bgm) +
            '%，音效音量 ' + (isNaN(v.se) ? '未知' : v.se) + '%。', {
            source: 'ui', target: 'ui', force: true, interrupt: true
          });
        }
        if (items.length) {
          /* 焦点优先落在「当前档位」控件（label 带「，当前」），否则第一个 BGM 档位，最后退回首控件。
           * 用户进入设置后可直接 ←→ 调整当前值，不必先盲走一圈。 */
          var curEl = null;
          for (var ci = 0; ci < items.length; ci++) {
            if (String(items[ci].label || '').indexOf('，当前') >= 0) { curEl = items[ci].el; break; }
          }
          if (!curEl) {
            for (var bj = 0; bj < items.length; bj++) {
              if (items[bj].group === 'bgm') { curEl = items[bj].el; break; }
            }
          }
          if (!curEl) { curEl = this._scope[0]; }
          if (this._scope.indexOf(document.activeElement) === -1) {
            A.game.dom.focus(curEl);
          }
        }
      },

      deactivate: function () {
        this._scope = [];
        this._items = [];
        this._initedKey = '';
        this._sig = '';
      },

      /* ←→：同组档位增减（滑条语义）。返回 true 表示已处理（防透传给游戏） */
      adjust: function (dir) {
        var el = document.activeElement;
        var cur = null, curIdx = -1;
        for (var i = 0; i < this._items.length; i++) {
          if (this._items[i].el === el) { cur = this._items[i]; curIdx = i; break; }
        }
        if (!cur) { return false; }
        var g = cur.group;
        if (g === 'bgm' || g === 'se' || g === 'ch' || g === 'auto') {
          var peers = [];
          for (var j = 0; j < this._items.length; j++) {
            if (this._items[j].group === g) { peers.push(this._items[j]); }
          }
          peers.sort(function (a, b) { return a.level - b.level; });
          var pi = peers.indexOf(cur);
          var target = peers[pi + dir];
          if (!target) {
            A.host.say(g === 'ch' ? '已是' + (dir > 0 ? '最快' : '最慢') : (dir > 0 ? '已到最大值' : '已到最小值'), { source: 'ui' });
            return true;
          }
          A.game.dom.focus(target.el);
          A.engine.clickElement(target.el);
          var v = this.values();
          this.refresh(true);
          var li = -1;
          for (var k = 0; k < this._items.length; k++) {
            if (this._items[k].el === target.el) { li = k; break; }
          }
          var label = li >= 0 ? this._items[li].label : this.labelOf(target, v);
          A.host.say(label.replace('，当前', '') + '，当前', { source: 'ui', interrupt: true });
          return true;
        }
        /* 开关/按钮：←→ 等同于在组内切换 */
        if (g === 'unread' || g === 'screen' || g === 'bgm_mute' || g === 'se_mute') {
          A.engine.clickElement(cur.el);
          var v2 = this.values();
          this.refresh(true);
          var self = this;
          setTimeout(function () {
            try {
              var vv = self.values();
              var li2 = -1;
              for (var m = 0; m < self._items.length; m++) {
                if (self._items[m].el === cur.el) { li2 = m; break; }
              }
              if (li2 >= 0) { A.host.say(self._items[li2].label.replace('，当前', ''), { source: 'ui', interrupt: true }); }
            } catch (e) { /* ignore */ }
          }, 120);
          void v2;
          return true;
        }
        return false;
      },

      /* Tab：跳到下一个面板组的第一项并播报组名 */
      nextGroup: function (back) {
        if (!this._items.length) { return false; }
        var groups = [];
        for (var i = 0; i < this._items.length; i++) {
          if (groups.indexOf(this._items[i].group) === -1) { groups.push(this._items[i].group); }
        }
        if (groups.length < 2) { return false; }
        var curG = '';
        for (var j = 0; j < this._items.length; j++) {
          if (this._items[j].el === document.activeElement) { curG = this._items[j].group; break; }
        }
        var gi = Math.max(0, groups.indexOf(curG));
        gi = (gi + (back ? groups.length - 1 : 1)) % groups.length;
        var want = groups[gi];
        for (var k = 0; k < this._items.length; k++) {
          if (this._items[k].group === want) {
            A.game.dom.focus(this._items[k].el);
            A.host.say(GROUP_NAMES[want] || want, { source: 'ui' });
            return true;
          }
        }
        return false;
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
        if (action === 'left') { return this.adjust(-1); }
        if (action === 'right') { return this.adjust(1); }
        if (action === 'tab') { return this.nextGroup(false); }
        if (action === 'tabPrev') { return this.nextGroup(true); }
        if (action === 'activate') {
          var el = document.activeElement;
          if (!el || scope.indexOf(el) === -1) {
            if (scope[0]) { A.game.dom.focus(scope[0]); }
            return scope.length > 0;
          }
          var clicked = A.engine.clickElement(el) === true;
          if (clicked) {
            var self = this;
            setTimeout(function () {
              try {
                self.refresh(true);
                var idx = -1;
                for (var i = 0; i < self._items.length; i++) {
                  if (self._items[i].el === el) { idx = i; break; }
                }
                if (idx >= 0) {
                  A.host.say(self._items[idx].label.replace('，当前', '') + '，当前', { source: 'ui', interrupt: true });
                }
              } catch (e) { /* ignore */ }
            }, 120);
          }
          return true;
        }
        if (action === 'back') {
          for (var b = 0; b < this._items.length; b++) {
            if (this._items[b].group === 'back') {
              return A.engine.clickElement(this._items[b].el) === true;
            }
          }
          return false;
        }
        if (action === 'repeat') {
          var f = document.activeElement;
          var label = '';
          for (var q = 0; q < this._items.length; q++) {
            if (this._items[q].el === f) { label = this._items[q].label; break; }
          }
          A.host.say(label || '设置', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () {
        /* 值可能被游戏变化（如拖动/快捷方式）→ 刷新标签，但不打断当前焦点 */
        var sig = (function (v) {
          return [v.bgm, v.se, v.chIdx, v.autoIdx, v.textSkip, v.screenSize].join('|');
        })(this.values());
        if (sig !== this._sig) {
          this.refresh();
        }
      }
    };

    A.game.registerScreen(screen);
    A.screens.config = screen;
  }

  A.registerModule('game/screens/config', init);
})(window);
