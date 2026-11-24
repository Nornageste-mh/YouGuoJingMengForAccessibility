/*
 * L1 core/speech.js —— 朗读调度：所有朗读文本都经此处写入 live region。
 * 约束：speech=off 时不写；同源同文 1.8s 内不双播；分段队列避免长文本被截断；
 * 界面提示与剧情朗读共用 live region，但剧情行由 repeat 层决定入缓冲。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  var MAX_SEGMENTS = 12;
  var SEGMENT_LIMIT = 220;
  var QUEUE_LIMIT = 200;
  var STEP_MS = 80;

  function init() {
    if (A.speech && A.speech._inited) { return; }

    var queue = [];
    var timer = null;
    var last = { text: '', source: '', at: 0 };
    var stats = { written: 0, deduped: 0, suppressed: 0, segments: 0 };

    function splitText(text) {
      var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      if (!t) {
        return [];
      }
      if (t.length <= SEGMENT_LIMIT) {
        return [t];
      }
      var pieces = [];
      var rest = t;
      var guard = 0;
      while (rest.length > SEGMENT_LIMIT && pieces.length < MAX_SEGMENTS - 1 && guard < MAX_SEGMENTS) {
        guard++;
        var cut = -1;
        var window2 = rest.substring(0, SEGMENT_LIMIT);
        var marks = ['。', '！', '？', '；', '. ', '!', '?', ';', '，', ','];
        for (var i = 0; i < marks.length && cut === -1; i++) {
          var at = window2.lastIndexOf(marks[i]);
          if (at > SEGMENT_LIMIT * 0.4) {
            cut = at + marks[i].length;
          }
        }
        if (cut === -1) {
          cut = SEGMENT_LIMIT;
        }
        pieces.push(rest.substring(0, cut));
        rest = rest.substring(cut);
      }
      if (rest) {
        pieces.push(rest);
      }
      return pieces;
    }

    function pump() {
      if (timer) {
        return;
      }
      function step() {
        timer = null;
        var item = queue.shift();
        if (!item) {
          return;
        }
        try {
          A.liveRegion.write(item.kind, item.text);
          stats.written++;
        } catch (e) { /* ignore */ }
        if (queue.length) {
          timer = setTimeout(step, STEP_MS);
        }
      }
      timer = setTimeout(step, 30);
    }

    A.speech = {
      _inited: true,

      /* 朗读（默认 polite；interrupt=true 用 assertive 并清空待播队列） */
      say: function (text, opts) {
        var options = opts || {};
        var value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        if (!value) {
          return false;
        }
        if (A.cfg && A.cfg.speech === 'off') {
          stats.suppressed++;
          return false;
        }
        var source = String(options.source || 'ui');
        var now = A.now();
        if (options.dedupe !== false && last.text === value && last.source === source && (now - last.at) < 1800) {
          stats.deduped++;
          return false;
        }

        var pieces = splitText(value);
        if (!pieces.length) {
          return false;
        }
        var interrupt = options.interrupt === true;
        if (interrupt) {
          queue = [];
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
        for (var i = 0; i < pieces.length; i++) {
          queue.push({
            text: pieces[i],
            kind: (interrupt && i === 0) ? 'assertive' : 'polite'
          });
          stats.segments++;
        }
        if (queue.length > QUEUE_LIMIT) {
          queue.splice(0, queue.length - QUEUE_LIMIT);
        }
        pump();
        last = { text: value, source: source, at: now };
        return true;
      },

      /* 丢弃排队中尚未播出的内容（界面切换时调用，避免残留提示串台） */
      cancelPending: function () {
        queue = [];
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },

      stats: function () {
        return {
          written: stats.written,
          deduped: stats.deduped,
          suppressed: stats.suppressed,
          segments: stats.segments,
          queueLen: queue.length
        };
      },

      last: function () {
        return { text: last.text, source: last.source, at: last.at };
      }
    };
  }

  A.registerModule('core/speech', init);
})(window);
