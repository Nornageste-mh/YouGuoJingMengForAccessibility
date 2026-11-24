/*
 * L1 core/log.js —— 分级日志（info/diag/warn/error）+ 环形缓冲 + 诊断开关。
 * 纪律：日志不得含台词文本（调用方只传长度/计数/类型/模块名）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.log) { return; }

    var ring = [];
    var MAX = 300;
    var diag = false;

    function ts() {
      var d = new Date();
      function p(n) { return n < 10 ? '0' + n : '' + n; }
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds());
    }

    function emit(level, msg, data) {
      var rec = {
        t: A.now(),
        time: ts(),
        level: String(level),
        msg: String(msg)
      };
      if (data !== undefined && data !== null) {
        rec.data = data;
      }
      ring.push(rec);
      if (ring.length > MAX) {
        ring.shift();
      }
      if (level === 'diag' && !diag) {
        return;
      }
      try {
        if (window.console && typeof window.console.log === 'function') {
          if (data === undefined || data === null) {
            window.console.log('[a11y][' + level + '] ' + rec.msg);
          } else {
            window.console.log('[a11y][' + level + '] ' + rec.msg, data);
          }
        }
      } catch (e) { /* console 不可用忽略 */ }
    }

    A.log = {
      info: function (msg, data) { emit('info', msg, data); },
      diag: function (msg, data) { emit('diag', msg, data); },
      warn: function (msg, data) { emit('warn', msg, data); },
      error: function (msg, data) { emit('error', msg, data); },
      setDiag: function (on) { diag = !!on; },
      isDiag: function () { return diag; },
      dump: function () {
        var out = [];
        for (var i = 0; i < ring.length; i++) {
          out.push(ring[i]);
        }
        return out;
      },
      count: function () { return ring.length; }
    };

    if (A.cfg && A.cfg.diagLog === true) {
      diag = true;
    }

    /* 回放 boot 阶段的缓冲日志 */
    if (A.pendingLogs && A.pendingLogs.length) {
      var pend = A.pendingLogs.splice(0, A.pendingLogs.length);
      for (var i = 0; i < pend.length; i++) {
        emit(pend[i].level, pend[i].msg, pend[i].data);
      }
    }
  }

  A.registerModule('core/log', init);
})(window);
