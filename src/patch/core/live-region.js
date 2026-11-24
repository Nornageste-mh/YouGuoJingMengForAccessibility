/*
 * L1 core/live-region.js —— 朗读唯一出口的实现载体。
 * 两个 1px 视觉裁剪的 aria-live 节点（polite / assertive），常驻 body。
 * 禁止 display:none / visibility:hidden（会丢失 AX 暴露）；不可聚焦；aria-atomic=true。
 */
(function (window, document) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.liveRegion && A.liveRegion._inited) { return; }

    function makeNode(id, politeness, role) {
      var node = document.createElement('div');
      node.id = id;
      node.setAttribute('aria-live', politeness);
      node.setAttribute('aria-atomic', 'true');
      if (role) {
        node.setAttribute('role', role);
      }
      node.setAttribute('data-a11y', 'live-' + politeness);
      node.setAttribute('tabindex', '-1');
      node.setAttribute('aria-hidden', 'false');
      /* visually-hidden + clipped；不改变可访问性树 */
      node.style.cssText = [
        'position:absolute',
        'width:1px',
        'height:1px',
        'margin:-1px',
        'padding:0',
        'border:0',
        'overflow:hidden',
        'clip:rect(0 0 0 0)',
        'clip-path:inset(50%)',
        'white-space:nowrap',
        'left:0',
        'top:0',
        'pointer-events:none'
      ].join(';');
      return node;
    }

    var root = document.createElement('div');
    root.id = 'a11y-live-root';
    root.setAttribute('data-a11y', 'live-root');
    root.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;';

    var polite = makeNode('a11y-live-polite', 'polite', 'status');
    var assertive = makeNode('a11y-live-assertive', 'assertive', 'alert');
    root.appendChild(polite);
    root.appendChild(assertive);

    var last = { polite: { text: '', at: 0 }, assertive: { text: '', at: 0 } };

    A.liveRegion = {
      _inited: true,
      _polite: polite,
      _assertive: assertive,
      _root: root,
      _last: last,

      exists: function () {
        return !!document.getElementById('a11y-live-polite') && !!document.getElementById('a11y-live-assertive');
      },

      write: function (kind, text) {
        var k = kind === 'assertive' ? 'assertive' : 'polite';
        var node = k === 'assertive' ? assertive : polite;
        var value = String(text == null ? '' : text);
        if (!node || !value) {
          return false;
        }
        /* 同一文本不重复写入：先清空再写，保证 SR 重新播报（同文本不双播由 speech 层负责压掉） */
        if (last[k].text === value) {
          node.textContent = '';
          var self = this;
          setTimeout(function () {
            try {
              node.textContent = value;
            } catch (e) { /* ignore */ }
          }, 60);
        } else {
          node.textContent = value;
        }
        last[k] = { text: value, at: A.now() };
        return true;
      },

      clear: function () {
        try {
          polite.textContent = '';
          assertive.textContent = '';
          last.polite = { text: '', at: A.now() };
          last.assertive = { text: '', at: A.now() };
        } catch (e) { /* ignore */ }
      },

      lastText: function (kind) {
        return String(last[kind === 'assertive' ? 'assertive' : 'polite'].text || '');
      }
    };

    (document.body || document.documentElement).appendChild(root);
  }

  A.registerModule('core/live-region', init);
})(window, document);
