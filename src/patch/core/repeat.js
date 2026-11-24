/*
 * L1 core/repeat.js —— 重读缓冲（U1/U2 的唯一数据源）。
 * 进入：无声剧情行 say、有配音剧情行 note（含姓名，入缓冲不朗读）、unknown 行 say、
 *       快进行 note（不朗读、停止后补念）、选项组 push（一次性念 1. …；2. …）。
 * 不进入：界面/控件/状态/菜单/确认框（它们走 A11y.say，只 announce 不进缓冲）。
 * 失效：drop('choices') 选项面板消失；clear() 读档完成/回标题/退出。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.repeat && A.repeat._inited) { return; }

    var maxItems = 4;
    if (A.cfg && A.cfg.bufferHistory) {
      var n = parseInt(A.cfg.bufferHistory, 10);
      if (!isNaN(n) && n > 0) {
        maxItems = Math.min(20, n);
      }
    }

    var history = [];
    var priority = null; /* 选项组（同一时刻只保留当前组的 push 条目） */
    var stats = {
      linesSeen: 0,
      bufferSays: 0,
      bufferNotes: 0,
      voicedMuted: 0,
      unvoicedSpoken: 0,
      unknownSpoken: 0,
      fastForwardNotes: 0,
      choicesPushed: 0,
      readAgainCount: 0,
      lastInvalidateReason: ''
    };

    function norm(text) {
      return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    }

    function entryOf(text, kind, meta) {
      return {
        text: text,
        kind: kind,
        voice: meta.voice || 'unknown',
        tag: meta.tag || null,
        source: meta.source || 'story',
        at: A.now()
      };
    }

    function addHistory(entry) {
      var lastEntry = history.length ? history[history.length - 1] : null;
      if (lastEntry && lastEntry.text === entry.text && lastEntry.kind === entry.kind && lastEntry.source === entry.source) {
        return false; /* 相邻重复不记 */
      }
      history.push(entry);
      while (history.length > maxItems) {
        history.shift();
      }
      return true;
    }

    function announce(text, opts) {
      try {
        if (A.speech) {
          A.speech.say(text, opts);
        }
      } catch (e) {
        if (A.log) {
          A.log.error('repeat announce failed', { error: String((e && e.message) || e) });
        }
      }
    }

    A.repeat = {
      _inited: true,
      maxItems: maxItems,

      getStats: function () {
        var out = {};
        for (var k in stats) {
          if (Object.prototype.hasOwnProperty.call(stats, k)) {
            out[k] = stats[k];
          }
        }
        out.maxItems = maxItems;
        return out;
      },

      /* 无声剧情行：入缓冲并朗读 */
      say: function (text, meta) {
        var t = norm(text);
        if (!t) {
          return false;
        }
        var options = meta || {};
        stats.linesSeen++;
        stats.bufferSays++;
        if (options.voice === 'unknown') {
          stats.unknownSpoken++;
        } else {
          stats.unvoicedSpoken++;
        }
        addHistory(entryOf(t, 'say', options));
        announce(t, { source: 'story' });
        return true;
      },

      /* 有配音/快进行：入缓冲，不朗读 */
      note: function (text, meta) {
        var t = norm(text);
        if (!t) {
          return false;
        }
        var options = meta || {};
        stats.linesSeen++;
        stats.bufferNotes++;
        if (options.voice === 'voiced') {
          stats.voicedMuted++;
        }
        if (options.fastForward === true) {
          stats.fastForwardNotes++;
        }
        addHistory(entryOf(t, 'note', options));
        return true;
      },

      /* 选项组：一次性朗读整组，同时作为优先重读条目 */
      push: function (text, tag) {
        var t = norm(text);
        if (!t) {
          return false;
        }
        var options = { tag: tag || 'priority', source: 'choices' };
        priority = entryOf(t, 'push', options);
        stats.choicesPushed++;
        announce(t, { source: 'choices' });
        return true;
      },

      drop: function (tag) {
        if (priority && (!tag || priority.tag === tag)) {
          priority = null;
          stats.lastInvalidateReason = 'drop:' + (tag || 'priority');
          return true;
        }
        return false;
      },

      /* Backspace 重读：优先读选项组，否则最后一条剧情/快进行 */
      again: function () {
        stats.readAgainCount++;
        var current = this.current();
        if (!current) {
          announce('还没有可以重读的内容。', { source: 'repeat', interrupt: true, dedupe: false });
          return false;
        }
        announce(current.text, { source: 'repeat', interrupt: true, dedupe: false });
        return true;
      },

      /* 补念当前条目但不计入重读次数（快进停止后的补念） */
      replay: function (opts) {
        var current = this.current();
        if (!current) {
          return false;
        }
        announce(current.text, { source: (opts && opts.source) || 'skip-catchup', dedupe: false });
        return true;
      },

      current: function () {
        if (priority) {
          return priority;
        }
        return history.length ? history[history.length - 1] : null;
      },

      history: function () {
        var out = [];
        for (var i = 0; i < history.length; i++) {
          out.push(history[i]);
        }
        return out;
      },

      clear: function (reason) {
        history = [];
        priority = null;
        stats.lastInvalidateReason = 'clear:' + String(reason || '');
      },

      len: function () {
        return history.length + (priority ? 1 : 0);
      },

      snapshot: function () {
        var current = this.current();
        return {
          bufferLen: this.len(),
          currentKind: current ? current.kind : '',
          currentText: current ? current.text : '',
          priorityTag: priority ? priority.tag : '',
          maxItems: maxItems,
          stats: this.getStats()
        };
      }
    };
  }

  A.registerModule('core/repeat', init);
})(window);
