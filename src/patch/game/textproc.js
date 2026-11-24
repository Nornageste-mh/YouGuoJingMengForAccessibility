/*
 * L3 game/textproc.js —— KAG 文本清洗（去标签、ruby 注音、空白归一、姓名拼接）。
 * 只做文本处理，不触碰 DOM/引擎。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.game && A.game.textproc) { return; }

    var ENTITIES = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&hellip;': '…',
      '&mdash;': '—',
      '&ndash;': '–',
      '&ldquo;': '“',
      '&rdquo;': '”',
      '&lsquo;': '‘',
      '&rsquo;': '’',
      '&middot;': '·',
      '&times;': '×'
    };

    function decodeEntities(text) {
      return String(text == null ? '' : text).replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, function (m) {
        var key = m.toLowerCase();
        if (ENTITIES[key] !== undefined) {
          return ENTITIES[key];
        }
        try {
          if (m.charAt(1) === '#') {
            var code = m.charAt(2) === 'x' || m.charAt(2) === 'X'
              ? parseInt(m.substring(3, m.length - 1), 16)
              : parseInt(m.substring(2, m.length - 1), 10);
            if (!isNaN(code) && code > 0 && code < 0x10ffff) {
              return String.fromCharCode(code);
            }
          }
        } catch (e) { /* ignore */ }
        return m;
      });
    }

    function stripKAGTags(text) {
      var s = String(text == null ? '' : text);
      /* ruby 注音：[ruby text="よみ"]汉字[endruby] → 汉字（よみ） */
      s = s.replace(/\[ruby\s+text=["']([^"']*)["']\s*\]([\s\S]*?)\[endruby\]/gi, function (m, ruby, body) {
        var r = String(ruby || '').trim();
        var b = String(body || '');
        return r ? (b + '（' + r + '）') : b;
      });
      /* 其余 KAG 标签：[p] [r] [color=...] [/color] [wait time=...] 等 */
      s = s.replace(/\[\/?(?:[a-zA-Z_]+)(?:[^\]]*)\]/g, '');
      return s;
    }

    function stripHtml(text) {
      var s = String(text == null ? '' : text);
      /* ruby 标签渲染：<ruby>汉字<rt>よみ</rt></ruby> → 汉字（よみ） */
      s = s.replace(/<ruby[^>]*>([\s\S]*?)<rt[^>]*>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/gi, function (m, base, rt) {
        var b = String(base || '').replace(/<[^>]+>/g, '');
        var r = String(rt || '').replace(/<[^>]+>/g, '').trim();
        return r ? (b + '（' + r + '）') : b;
      });
      s = s.replace(/<br\s*\/?>/gi, ' ');
      s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
      return s;
    }

    function normalize(text) {
      return String(text == null ? '' : text)
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\u3000/g, ' ')
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
    }

    A.game = A.game || {};
    A.game.textproc = {
      decodeEntities: decodeEntities,
      stripKAGTags: stripKAGTags,
      stripHtml: stripHtml,
      normalize: normalize,

      /* 清洗一行台词/选项文本（原文已含 ruby/标签也能处理） */
      clean: function (text) {
        var s = String(text == null ? '' : text);
        s = stripKAGTags(s);
        s = stripHtml(s);
        s = decodeEntities(s);
        return normalize(s);
      },

      /* 姓名清洗（去尾部冒号/空白） */
      cleanName: function (name) {
        var s = this.clean(name);
        s = s.replace(/[：:]\s*$/, '').trim();
        return s;
      },

      /* 姓名 + 正文拼接（VoiceOver/NVDA 都更自然） */
      join: function (name, text) {
        var n = this.cleanName(name);
        var t = this.clean(text);
        if (!t) {
          return n;
        }
        if (!n) {
          return t;
        }
        return n + '：' + t;
      }
    };
  }

  A.registerModule('game/textproc', init);
})(window);
