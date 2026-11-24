/*
 * L3 game/screens/choices.js —— 选项适配器（P0）。
 * 选项 = div.glink_button（[glink] 生成，追加到 free 层，z-index 999999）。
 * 语义：出现时整组播报（1. …；2. …）并 push 进重读缓冲；1–9 直选；↑↓+Enter；消失时 drop('choices')。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.screens && A.screens.choices) { return; }

    A.screens = A.screens || {};

    var screen = {
      id: 'choices',
      priority: 30,
      _scope: [],
      _lastKey: '',

      options: function () {
        if (!A.game || !A.game.dom) {
          return [];
        }
        return A.game.dom.queryVisible('div.glink_button');
      },

      detect: function () {
        return this.options().length > 0;
      },

      format: function (texts) {
        var parts = [];
        for (var i = 0; i < texts.length; i++) {
          parts.push((i + 1) + '. ' + texts[i]);
        }
        return parts.join('；');
      },

      refresh: function () {
        if (A.engine && A.engine.hideMessageFromAX) { A.engine.hideMessageFromAX(); }
        var opts = this.options();
        var texts = [];
        var i;
        for (i = 0; i < opts.length; i++) {
          var text = A.game.textproc.clean(A.game.dom.textOf(opts[i])) || ('选项' + (i + 1));
          texts.push(text);
          A.game.dom.annotate(opts[i], { role: 'button', name: text, tabindex: 0, control: 'choice' });
        }
        this._scope = opts;
        return { options: opts, texts: texts };
      },

      activate: function () {
        var info = this.refresh();
        if (!info.options.length) {
          return;
        }
        var key = info.texts.join('\u0001');
        if (key !== this._lastKey) {
          this._lastKey = key;
          /* 选项组一次性念完，并作为优先重读条目 */
          A.repeat.push(this.format(info.texts), 'choices');
        }
        var active = document.activeElement;
        if (!active || active === document.body || info.options.indexOf(active) === -1) {
          A.game.dom.focus(info.options[0]);
        }
      },

      deactivate: function () {
        this._scope = [];
        this._lastKey = '';
        try {
          A.repeat.drop('choices');
        } catch (e) { /* ignore */ }
      },

      tick: function () {
        /* 面板消失但检测未及时切换时，主动 drop */
        var opts = this.options();
        if (!opts.length && this._scope.length) {
          this._scope = [];
          this._lastKey = '';
          try {
            A.repeat.drop('choices');
          } catch (e) { /* ignore */ }
        }
      },

      onKey: function (action) {
        var opts = this.options();
        if (!opts.length) {
          return false;
        }
        if (!this._scope.length) {
          this.refresh();
          opts = this._scope;
        }

        if (action === 'up' || action === 'down') {
          var result = A.game.dom.moveFocus(opts, action === 'down' ? 1 : -1);
          if (!result.moved) {
            A.host.say(result.boundary === 'first' ? '已到第一项' : '已到最后一项', { source: 'ui' });
          }
          return true;
        }

        if (action === 'activate') {
          var el = document.activeElement;
          if (el && opts.indexOf(el) !== -1) {
            var ok = A.engine.clickElement(el) === true;
            if (ok) {
              this.deactivate();
            }
            return ok;
          }
          return false;
        }

        if (action.indexOf('choice') === 0) {
          var n = parseInt(action.substring(6), 10);
          if (!isNaN(n) && n >= 1 && n <= opts.length) {
            var clicked = A.engine.clickElement(opts[n - 1]) === true;
            if (clicked) {
              this.deactivate();
            }
            return clicked;
          }
          return false;
        }

        if (action === 'repeat') {
          A.repeat.again();
          return true;
        }

        return false;
      }
    };

    A.game.registerScreen(screen);
    A.screens.choices = screen;
  }

  A.registerModule('game/screens/choices', init);
})(window);
