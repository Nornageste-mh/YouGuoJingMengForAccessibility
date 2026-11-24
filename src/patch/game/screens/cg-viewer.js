/*
 * L3 game/screens/cg-viewer.js —— CG 查看器（全屏 CG 图片 + [l] 等待点击）。
 * 依据 docs/01c §3.2：#root_layer_game 内 data/bgimage/ 的满屏 img、无 alt/role；
 *   Enter 实测可退出。补丁职责：给图片 role=img + 名称、进入时播报一次提示、
 *   Esc/Enter 走游戏真实推进路径退出（不朗读剧情、不残留提示）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens['cg-viewer']) { return; }
    A.screens = A.screens || {};

    var screen = {
      id: 'cg-viewer',
      priority: 58,
      _el: null,
      _initedKey: '',
      _armed: false,

      /* 仅当用户从 CG 画廊点了「已解锁」槽后才允许接管（防止菜单/标题的满屏背景图误判） */
      arm: function () { this._armed = true; },

      findViewer: function () {
        /* CG 画廊状态排在 cg-viewer 前：只要还有可见的 6 个 CG 槽（*clickcg / *no_image），
         * 就说明是画廊页而不是查看器，否则画廊背景图会误判成满屏 CG（v0.1 冒烟发现）。 */
        var slots = document.querySelectorAll('#tyrano_base img.event-setting-element');
        for (var si = 0; si < slots.length; si++) {
          if (!A.game.dom.isVisible(slots[si])) { continue; }
          var spm = A.game.dom.eventPM(slots[si]);
          var st = spm && typeof spm.target === 'string' ? spm.target : '';
          if (st === '*clickcg' || st === '*no_image') {
            return null;
          }
        }
        var imgs = document.querySelectorAll('#root_layer_game img, #tyrano_base img');
        for (var i = 0; i < imgs.length; i++) {
          var el = imgs[i];
          if (!A.game.dom.isVisible(el)) { continue; }
          var src = String(el.getAttribute('src') || '');
          if (!/data\/bgimage\//i.test(src) && !/\.(jpg|jpeg|png|gif)$/i.test(src)) { continue; }
          var base = src.split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
          /* 排除标题/画廊背景等非 CG 大图 */
          if (base === 'bg' || base === 'back' || base === '背景' || /^0-/.test(base) || /封面/.test(base)) { continue; }
          var r = el.getBoundingClientRect();
          /* 满屏图片（CG 查看器）：宽高都接近视口 */
          if (r.width > window.innerWidth * 0.85 && r.height > window.innerHeight * 0.85) {
            return el;
          }
        }
        return null;
      },

      detect: function () {
        if (!A.game || !A.game.dom) { return false; }
        if (this._armed !== true) { return false; }
        return !!this.findViewer();
      },

      refresh: function () {
        var el = this.findViewer();
        this._el = el;
        if (!el) { return []; }
        var src = String(el.getAttribute('src') || '');
        var file = src.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
        A.game.dom.annotate(el, { role: 'img', name: 'CG 图片：' + file, tabindex: 0, control: 'cg-viewer' });
        return [el];
      },

      activate: function () {
        var els = this.refresh();
        if (!els.length) { return; }
        var key = String(this._el && this._el.getAttribute('src') || '');
        if (key !== this._initedKey) {
          this._initedKey = key;
          A.host.say('CG 查看器。按 Esc 或 Enter 返回。', {
            source: 'ui', target: 'ui', force: true, interrupt: true
          });
        }
        if (this._el && document.activeElement !== this._el) {
          A.game.dom.focus(this._el);
        }
      },

      deactivate: function () {
        this._el = null;
        this._initedKey = '';
        this._armed = false;
      },

      onKey: function (action) {
        if (action === 'activate' || action === 'back') {
          var el = this._el || this.findViewer();
          if (!el) { return false; }
          /* 游戏真实推进路径：Enter/点击等价 */
          try {
            if (A.engine.advance() === true) { return true; }
          } catch (e) { /* 交回游戏原生键 */ }
          return A.engine.clickElement(el) === true;
        }
        if (action === 'repeat') {
          A.host.say('CG 查看器。按 Esc 或 Enter 返回。', { source: 'ui' });
          return true;
        }
        return false;
      },

      tick: function () { /* 开关由 patches 检测负责 */ }
    };

    A.game.registerScreen(screen);
    A.screens['cg-viewer'] = screen;
  }

  A.registerModule('game/screens/cg-viewer', init);
})(window);
