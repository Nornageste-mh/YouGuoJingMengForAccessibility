/*
 * L1 core/selfcheck.js —— 启动自检摘要（SELFTEST SUMMARY，不含台词文本）。
 * 输出到 console 一次，并作为 window.__YOUGUO_A11Y__.selfcheck.summary() 供 CDP 读取。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.selfcheck && A.selfcheck._inited) { return; }

    var startedAt = A.now();
    var readyAt = 0;
    var adapters = {};
    var counts = {};
    var lastSummary = null;

    A.selfcheck = {
      _inited: true,

      markReady: function () {
        readyAt = A.now();
      },

      adapterHit: function (id) {
        var key = String(id || '');
        if (!key) {
          return;
        }
        adapters[key] = (adapters[key] || 0) + 1;
      },

      count: function (key) {
        var k = String(key || '');
        if (!k) {
          return;
        }
        counts[k] = (counts[k] || 0) + 1;
      },

      summary: function () {
        var modules = {};
        for (var name in A.modules) {
          if (!Object.prototype.hasOwnProperty.call(A.modules, name)) {
            continue;
          }
          var m = A.modules[name];
          modules[name] = m.status + (m.error ? (':' + String(m.error).substring(0, 80)) : '');
        }

        var buffer = null;
        try {
          if (A.repeat && typeof A.repeat.snapshot === 'function') {
            var snap = A.repeat.snapshot();
            buffer = {
              bufferLen: snap.bufferLen,
              currentKind: snap.currentKind,
              priorityTag: snap.priorityTag,
              maxItems: snap.maxItems,
              stats: snap.stats
            };
          }
        } catch (e) { /* ignore */ }

        var engine = null;
        try {
          if (A.engine && typeof A.engine.stats === 'function') {
            engine = A.engine.stats();
          }
        } catch (e2) { /* ignore */ }

        return {
          version: A.version,
          ready: A.ready === true,
          readyAt: readyAt,
          msSinceStart: A.now() - startedAt,
          modules: modules,
          bootErrors: A.bootErrors.length,
          failedLoads: A.boot.failedLoads.length,
          adapters: adapters,
          counts: counts,
          gates: {
            a11yReady: A.ready === true,
            blockDepth: A.host ? A.host.blockDepth() : null,
            modalDepth: A.engine && A.engine.modalDepth ? A.engine.modalDepth() : null,
            busy: A.engine && A.engine.isBusy ? A.engine.isBusy() : null,
            keyInputAllowed: A.host && A.host.keyInputAllowed ? A.host.keyInputAllowed() : null
          },
          liveRegion: {
            polite: !!document.getElementById('a11y-live-polite'),
            assertive: !!document.getElementById('a11y-live-assertive')
          },
          engineReady: !!(A.engine && A.engine.isReady && A.engine.isReady()),
          engine: engine,
          buffer: buffer,
          speech: A.speech ? A.speech.stats() : null,
          cfg: A.cfg ? {
            speech: A.cfg.speech,
            voiceGate: A.cfg.voiceGate,
            announceUi: A.cfg.announceUi,
            bufferHistory: A.cfg.bufferHistory,
            diagLog: A.cfg.diagLog
          } : null
        };
      },

      /* 启动时调用一次：写 SELFTEST SUMMARY（已剥离任何台词字段） */
      print: function () {
        var s = this.summary();
        lastSummary = s;
        try {
          window.console.log('[a11y] SELFTEST SUMMARY ' + JSON.stringify(s));
        } catch (e) { /* ignore */ }
        return s;
      },

      lastSummary: function () {
        return lastSummary;
      }
    };
  }

  A.registerModule('core/selfcheck', init);
})(window);
