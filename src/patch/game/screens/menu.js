/*
 * L3 game/screens/menu.js —— 游戏内系统菜单（P0：打开/↑↓/Enter/Esc 返回）。
 * Tyrano 菜单模板（theme_kopanda_23）：5 个可见 .menu_item > img.menu_btn_*.png：
 *   close（右上角关闭）/ save / load / config / back_title。
 * 名称来源：img 文件名映射；激活 = img.click()（jQuery 处理器绑定在菜单项上，引擎 clickElement 兼容）。
 * 顺序按视觉列：存档→读取存档→设置→返回标题→关闭菜单（close 右上角，固定放最后，写入 README 约定）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  var ITEMS = [
    { key: 'menu_btn_save', order: 0, name: '存档' },
    { key: 'menu_btn_load', order: 1, name: '读取存档' },
    { key: 'menu_btn_config', order: 2, name: '设置' },
    { key: 'menu_btn_title', order: 3, name: '返回标题' },
    { key: 'menu_btn_close', order: 4, name: '关闭菜单' }
  ];

  function basename(src) {
    var s = String(src || '');
    var i = s.lastIndexOf('/');
    return (i >= 0 ? s.slice(i + 1) : s).toLowerCase();
  }

  function closestA(el) {
    var n = el.parentNode;
    while (n && n.nodeType === 1) {
      if (n.tagName && n.tagName.toLowerCase() === 'a') {
        return n;
      }
      n = n.parentNode;
    }
    return null;
  }

  /* 菜单由 kag.html 异步加载后 fadeIn(300)：渐显期间 opacity 从 0 起，
     A.game.dom.isVisible 会判不可见，导致切屏检测要等渐显结束（用户感觉“菜单打开不及时”）。
     这里只排除真正被隐藏的节点（display:none / visibility:hidden / 无尺寸），不看 opacity。 */
  function roughVisible(el) {
    try {
      if (!el || !document.documentElement.contains(el)) {
        return false;
      }
      var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden')) {
        return false;
      }
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch (e) {
      return false;
    }
  }

  function itemOf(img) {
    var base = basename(img.getAttribute('src'));
    for (var i = 0; i < ITEMS.length; i++) {
      if (base.indexOf(ITEMS[i].key) !== -1) {
        return ITEMS[i];
      }
    }
    return null;
  }

  function init() {
    if (A.screens && A.screens.menu) { return; }

    A.screens = A.screens || {};

    var screen = {
      id: 'menu',
      priority: 40,
      _scope: [],

      candidates: function () {
        var list = document.querySelectorAll('.menu_item img');
        var out = [];
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          var info = itemOf(el);
          if (!info) {
            continue;
          }
          if (!roughVisible(el)) {
            continue;
          }
          /* 去噪（U5）：config 项是 <a onclick="myobj.config();"><img></a>，
           * 若把 img 标成 button 会同时留下一个 link 节点。统一把可聚焦/可读的
           * 目标收敛到 <a>（无 <a> 时用 img 本身），img 一律 aria-hidden。 */
          var a = closestA(el);
          var target = a || el;
          out.push({ el: target, img: el, info: info, link: !!a });
        }
        return out;
      },

      detect: function () {
        if (!A.game || !A.game.dom) {
          return false;
        }
        return this.candidates().length > 0;
      },

      refresh: function () {
        if (A.engine && A.engine.hideMessageFromAX) { A.engine.hideMessageFromAX(); }
        var found = this.candidates();
        var byKey = {};
        var i;
        for (i = 0; i < found.length; i++) {
          byKey[found[i].info.key] = found[i]; /* 同名重复节点保留最后一个可见节点 */
        }
        var scope = [];
        for (i = 0; i < ITEMS.length; i++) {
          var item = byKey[ITEMS[i].key];
          if (!item) {
            continue;
          }
          A.game.dom.annotate(item.el, { role: 'button', name: item.info.name, tabindex: 0, control: 'menu' });
          if (item.img && item.img !== item.el) {
            A.game.dom.hideFromAX(item.img, true);
          }
          scope.push(item.el);
        }
        this._scope = scope;
        return scope;
      },

      activate: function () {
        var scope = this.refresh();
        if (!scope.length) {
          return;
        }
        /* 打开菜单时焦点必须落到菜单内（原焦点可能在背后的系统栏按钮上） */
        if (scope.indexOf(document.activeElement) === -1) {
          A.game.dom.focus(scope[0]);
        }
        /* 主动播报确认，弥补引擎 fadeIn 期间“看起来没反应”的观感 */
        var label = A.game.dom.labelOf(document.activeElement) || '';
        A.host.say('菜单，共 ' + scope.length + ' 项。' + label, { source: 'ui' });
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

        if (action === 'back') {
          /* Esc：优先关闭菜单（等价点击 close 项） */
          var closeEl = null;
          for (var i = 0; i < scope.length; i++) {
            if (A.game.dom.labelOf(scope[i]) === '关闭菜单') {
              closeEl = scope[i];
              break;
            }
          }
          if (closeEl) {
            return A.engine.clickElement(closeEl) === true;
          }
          return false;
        }

        if (action === 'repeat') {
          var focused = document.activeElement;
          var label = focused ? A.game.dom.labelOf(focused) : '';
          if (label) {
            A.host.say(label, { source: 'ui' });
            return true;
          }
          A.repeat.again();
          return true;
        }

        return false;
      },

      tick: function () { /* 菜单打开期间无定时逻辑（检测间隔即可） */ }
    };

    A.game.registerScreen(screen);
    A.screens.menu = screen;
  }

  A.registerModule('game/screens/menu', init);
})(window);
