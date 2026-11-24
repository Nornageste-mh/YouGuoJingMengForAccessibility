/*
 * 游郭惊梦 无障碍补丁 v0.1.0 —— 唯一入口
 * 职责：幂等守卫 / 模块顺序加载 / 错误隔离 / 启动日志 / 暴露 window.__YOUGUO_A11Y__
 * 约束：纯 ES5；无外部依赖；单模块异常只禁用该模块，不打断游戏。
 */
(function (window, document) {
  'use strict';

  var A = window.__YOUGUO_A11Y__;
  if (A && A.__booted === true) {
    return;
  }
  A = window.__YOUGUO_A11Y__ = (A || {});

  var VERSION = '0.1.0';
  A.version = VERSION;
  A.__booted = true;
  A.ready = false;
  A.bootedAt = 0;
  A.modules = A.modules || {};
  A.bootErrors = [];
  A.pendingLogs = A.pendingLogs || [];
  A.screens = A.screens || {};

  A.now = function () {
    return Date.now ? Date.now() : new Date().getTime();
  };

  /* 日志模块就绪前的兜底缓冲（log.js 初始化时回放）。 */
  A.bufferLog = function (level, msg, data) {
    if (A.log && typeof A.log[level] === 'function') {
      try {
        A.log[level](msg, data);
        return;
      } catch (e) { /* fall through */ }
    }
    if (A.pendingLogs.length < 200) {
      A.pendingLogs.push({ t: A.now(), level: String(level), msg: String(msg), data: data === undefined ? null : data });
    }
  };

  /* 模块注册：脚本加载时只登记 init，全部加载完成后按顺序执行（错误隔离）。 */
  A.registerModule = function (name, initFn) {
    A.modules[name] = {
      name: name,
      status: 'loaded',
      init: initFn,
      error: null,
      loadedAt: A.now()
    };
  };

  function findBootScript() {
    var el = null;
    try {
      el = document.currentScript || null;
    } catch (e) { el = null; }
    if (!el) {
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute('src') || '';
        if (src.indexOf('a11y-boot.js') !== -1) {
          el = scripts[i];
          break;
        }
      }
    }
    return el;
  }

  function scriptBaseUrl() {
    var el = findBootScript();
    var src = el && el.src ? String(el.src) : '';
    if (src) {
      var cut = src.lastIndexOf('/');
      if (cut !== -1) {
        return src.substring(0, cut + 1);
      }
    }
    /* fallback：index.html 与 a11y-patch 同级 */
    try {
      return new URL('./a11y-patch/', window.location.href).href;
    } catch (e) {
      return './a11y-patch/';
    }
  }

  function urlToFsPath(url) {
    var s = String(url || '');
    if (s.indexOf('file:///') === 0) {
      s = s.substring(8);
    } else if (s.indexOf('file://') === 0) {
      s = s.substring(7);
    }
    try {
      s = decodeURIComponent(s);
    } catch (e) { /* ignore */ }
    if (s.charAt(0) === '/') {
      s = s.substring(1);
    }
    return s.replace(/\//g, '\\');
  }

  var baseUrl = scriptBaseUrl();
  A.paths = {
    baseUrl: baseUrl,
    patchDirFs: urlToFsPath(baseUrl)
  };

  /* 模块清单（顺序 = 加载顺序 = init 顺序）。 */
  var MODULES = [
    'core/log.js',
    'core/config.js',
    'core/live-region.js',
    'core/speech.js',
    'core/repeat.js',
    'core/keys.js',
    'core/selfcheck.js',
    'a11y-host.js',
    'engine/tyrano-adapter.js',
    'game/textproc.js',
    'game/name-map.js',
    'game/voice.js',
    'game/patches.js',
    'game/screens/title.js',
    'game/screens/choices.js',
    'game/screens/dialogue.js',
    'game/screens/menu.js',
    'game/screens/movie.js',
    'game/screens/notice.js',
    'game/screens/remodal.js',
    'game/screens/config.js',
    'game/screens/cg-gallery.js',
    'game/screens/cg-viewer.js',
    'game/screens/saveload.js',
    'game/screens/backlog.js'
  ];

  A.boot = {
    version: VERSION,
    modules: MODULES,
    failedLoads: [],
    startedAt: A.now()
  };

  A.bufferLog('info', 'a11y boot start', { version: VERSION, baseUrl: baseUrl });

  function moduleKeyOf(path) {
    return String(path).replace(/\.js$/, '');
  }

  function runInits() {
    for (var i = 0; i < MODULES.length; i++) {
      var key = moduleKeyOf(MODULES[i]);
      var mod = A.modules[key];
      if (!mod || typeof mod.init !== 'function') {
        A.bootErrors.push('module not registered: ' + key);
        A.bufferLog('error', 'module not registered', { module: key });
        continue;
      }
      if (mod.status === 'ok') {
        continue;
      }
      try {
        mod.init();
        mod.status = 'ok';
      } catch (e) {
        mod.status = 'failed';
        mod.error = String((e && e.message) || e);
        A.bootErrors.push(key + ': ' + mod.error);
        A.bufferLog('error', 'module init failed (isolated)', { module: key, error: mod.error });
      }
    }
    bootComplete();
  }

  function bootComplete() {
    A.ready = true;
    A.readyAt = A.now();
    try {
      if (A.selfcheck && typeof A.selfcheck.markReady === 'function') {
        A.selfcheck.markReady();
      }
    } catch (e) {
      A.bufferLog('error', 'selfcheck.markReady failed', { error: String((e && e.message) || e) });
    }
    A.bufferLog('info', 'a11y ready', {
      version: VERSION,
      modules: countOk(),
      errors: A.bootErrors.length
    });

    try {
      if (A.game && A.game.patches && typeof A.game.patches.start === 'function') {
        A.game.patches.start();
      }
    } catch (e) {
      A.bufferLog('error', 'patches.start failed', { error: String((e && e.message) || e) });
    }

    try {
      var timer = setTimeout(function () {
        try {
          if (A.selfcheck && typeof A.selfcheck.print === 'function') {
            A.selfcheck.print();
          }
        } catch (e) {
          A.bufferLog('error', 'selfcheck.print failed', { error: String((e && e.message) || e) });
        }
      }, 1500);
      if (timer && timer.unref) {
        timer.unref();
      }
    } catch (e2) { /* ignore */ }

    /* 全局错误只记录（不吞掉、不打断游戏）。 */
    try {
      window.addEventListener('error', function (ev) {
        try {
          if (A.log) {
            A.log.error('window error', {
              message: String((ev && ev.message) || ''),
              source: String((ev && ev.filename) || ''),
              line: ev && ev.lineno
            });
          }
        } catch (e) { /* ignore */ }
      }, false);
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          if (A.log) {
            A.log.error('unhandled rejection', { reason: String((ev && ev.reason && ev.reason.message) || (ev && ev.reason) || '') });
          }
        } catch (e) { /* ignore */ }
      }, false);
    } catch (e3) { /* ignore */ }
  }

  function countOk() {
    var n = 0;
    for (var k in A.modules) {
      if (Object.prototype.hasOwnProperty.call(A.modules, k) && A.modules[k].status === 'ok') {
        n++;
      }
    }
    return n;
  }

  function loadNext(index) {
    if (index >= MODULES.length) {
      setTimeout(runInits, 0);
      return;
    }
    var rel = MODULES[index];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = false;
    script.setAttribute('data-a11y-module', rel);
    script.src = baseUrl + rel;
    script.onload = function () {
      loadNext(index + 1);
    };
    script.onerror = function () {
      A.boot.failedLoads.push(rel);
      A.bufferLog('error', 'module load failed', { module: rel });
      loadNext(index + 1);
    };
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  try {
    document.documentElement.setAttribute('data-a11y-patch', VERSION);
  } catch (e) { /* ignore */ }

  loadNext(0);
})(window, document);
