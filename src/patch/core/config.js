/*
 * L1 core/config.js —— 只读配置：a11y-patch/config.json。
 * 约束：未知键忽略并告警、缺字段用默认值、坏配置不崩、永不写回。
 * file:// 下 fetch/XHR 不可用（Electron 7 + file 协议），走 nodeIntegration 的 require('fs') 读取。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  var DEFAULTS = {
    speech: 'auto',
    voiceGate: 'on',
    announceUi: 'on',
    bufferHistory: 4,
    diagLog: false,
    excludeNames: []
  };
  var ALLOWED = ['speech', 'voiceGate', 'announceUi', 'bufferHistory', 'diagLog', 'excludeNames'];

  function warn(msg, data) {
    A.bufferLog('warn', msg, data);
  }

  function readConfigText() {
    /* 1) 预注入的全局配置（测试/排障用，生产不设置） */
    try {
      if (window.__YOUGUO_A11Y_CONFIG__ && typeof window.__YOUGUO_A11Y_CONFIG__ === 'object') {
        return { source: 'global', obj: window.__YOUGUO_A11Y_CONFIG__ };
      }
    } catch (e) { /* ignore */ }

    /* 2) nodeIntegration：从补丁目录读 config.json（不写回） */
    if (typeof require === 'function') {
      try {
        var fs = require('fs');
        var path = require('path');
        var dir = A.paths && A.paths.patchDirFs ? A.paths.patchDirFs : '';
        if (!dir) {
          try {
            dir = typeof __dirname !== 'undefined' ? path.join(__dirname, 'a11y-patch') : '';
          } catch (e2) {
            dir = '';
          }
        }
        if (dir) {
          var file = path.join(dir, 'config.json');
          if (fs.existsSync(file)) {
            var text = fs.readFileSync(file, 'utf8');
            return { source: file, text: text };
          }
        }
      } catch (e3) {
        warn('config read via fs failed', { error: String((e3 && e3.message) || e3) });
      }
    }

    /* 3) XHR 兜底（file:// 通常失败，失败即默认值） */
    try {
      if (typeof XMLHttpRequest === 'function') {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', (A.paths && A.paths.baseUrl ? A.paths.baseUrl : './a11y-patch/') + 'config.json', false);
        xhr.send(null);
        if (xhr.status === 200 || xhr.status === 0) {
          return { source: 'xhr', text: String(xhr.responseText || '') };
        }
      }
    } catch (e4) { /* ignore */ }

    return { source: 'defaults' };
  }

  function parseRaw(raw) {
    if (raw.obj) {
      return raw.obj;
    }
    if (raw.text) {
      try {
        return JSON.parse(String(raw.text).replace(/^\uFEFF/, ''));
      } catch (e) {
        warn('config.json parse failed, using defaults', { error: String((e && e.message) || e) });
        return null;
      }
    }
    return null;
  }

  function validate(obj) {
    var cfg = {};
    cfg.speech = DEFAULTS.speech;
    cfg.voiceGate = DEFAULTS.voiceGate;
    cfg.announceUi = DEFAULTS.announceUi;
    cfg.bufferHistory = DEFAULTS.bufferHistory;
    cfg.diagLog = DEFAULTS.diagLog;
    cfg.excludeNames = [];

    if (!obj || typeof obj !== 'object') {
      return cfg;
    }

    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) {
        continue;
      }
      if (ALLOWED.indexOf(k) === -1) {
        warn('config unknown key ignored', { key: String(k) });
      }
    }

    if (obj.speech === 'auto' || obj.speech === 'off') {
      cfg.speech = obj.speech;
    } else if (obj.speech !== undefined) {
      warn('config.speech invalid', { value: String(obj.speech) });
    }

    if (obj.voiceGate === 'on' || obj.voiceGate === 'off') {
      cfg.voiceGate = obj.voiceGate;
    } else if (obj.voiceGate !== undefined) {
      warn('config.voiceGate invalid', { value: String(obj.voiceGate) });
    }

    if (obj.announceUi === 'on' || obj.announceUi === 'off') {
      cfg.announceUi = obj.announceUi;
    } else if (obj.announceUi !== undefined) {
      warn('config.announceUi invalid', { value: String(obj.announceUi) });
    }

    if (obj.bufferHistory !== undefined) {
      var n = parseInt(obj.bufferHistory, 10);
      if (isNaN(n) || n < 1) {
        warn('config.bufferHistory invalid', { value: String(obj.bufferHistory) });
      } else {
        cfg.bufferHistory = Math.min(20, n);
      }
    }

    if (obj.diagLog === true || obj.diagLog === false) {
      cfg.diagLog = obj.diagLog;
    } else if (obj.diagLog !== undefined) {
      warn('config.diagLog invalid', { value: String(obj.diagLog) });
    }

    if (Object.prototype.toString.call(obj.excludeNames) === '[object Array]') {
      var arr = [];
      for (var i = 0; i < obj.excludeNames.length; i++) {
        if (typeof obj.excludeNames[i] === 'string' && obj.excludeNames[i]) {
          arr.push(obj.excludeNames[i]);
        }
      }
      cfg.excludeNames = arr;
    } else if (obj.excludeNames !== undefined) {
      warn('config.excludeNames invalid');
    }

    return cfg;
  }

  function init() {
    if (A.cfg) { return; }
    var raw = readConfigText();
    var obj = parseRaw(raw);
    var cfg = validate(obj);
    cfg._source = raw.source || 'defaults';
    A.cfg = cfg;
    A.bufferLog('info', 'config loaded', {
      source: cfg._source,
      speech: cfg.speech,
      voiceGate: cfg.voiceGate,
      announceUi: cfg.announceUi,
      bufferHistory: cfg.bufferHistory,
      diagLog: cfg.diagLog
    });
    if (A.log) {
      A.log.setDiag(cfg.diagLog === true);
    }
  }

  A.registerModule('core/config', init);
})(window);
