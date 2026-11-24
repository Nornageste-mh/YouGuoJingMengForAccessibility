/*
 * L2 a11y-host.js —— 中间层：配置读取、朗读出口、界面切换、五闸访问器。
 * 纪律：只依赖 L1（core/*）与 L2.5（engine）暴露的能力；不出现游戏界面名/剧本常量。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.host && A.host._inited) { return; }

    var blockDepth = 0;
    var inputGate = false;
    var muteAll = false;
    var tickTimer = null;

    A.host = {
      _inited: true,
      cfg: A.cfg || null,

      /* 界面/控件/状态朗读：只 announce（live region），永不进重读缓冲（U2） */
      say: function (text, opts) {
        var options = opts || {};
        try {
          if (options.force !== true && this.shouldMute(options.target || 'ui')) {
            return false;
          }
          return A.speech.say(text, options);
        } catch (e) {
          if (A.log) {
            A.log.error('host.say failed', { error: String((e && e.message) || e) });
          }
          return false;
        }
      },

      /* 是否应静音：speech=off、announceUi=off（界面类）、引擎 busy、全局静音 */
      shouldMute: function (target) {
        if (muteAll === true) {
          return true;
        }
        if (A.cfg && A.cfg.speech === 'off') {
          return true;
        }
        if (target === 'ui' && A.cfg && A.cfg.announceUi === 'off') {
          return true;
        }
        if (A.engine && typeof A.engine.isBusy === 'function' && A.engine.isBusy()) {
          return true;
        }
        return false;
      },

      onScreenChanged: function (prevId, nextId) {
        try {
          if (A.speech && typeof A.speech.cancelPending === 'function') {
            A.speech.cancelPending();
          }
        } catch (e) { /* ignore */ }
        if (A.selfcheck) {
          A.selfcheck.count('screenChanges');
        }
        if (A.log) {
          A.log.info('screen changed', { from: String(prevId || ''), to: String(nextId || '') });
        }
      },

      onInputGate: function (active) {
        inputGate = active === true;
      },

      isInputGateActive: function () {
        return inputGate === true;
      },

      blockAdvance: function (on) {
        if (on === true) {
          blockDepth++;
        } else if (blockDepth > 0) {
          blockDepth--;
        }
        return blockDepth;
      },

      blockDepth: function () {
        return blockDepth;
      },

      setMuteAll: function (on) {
        muteAll = on === true;
      },

      isMuteAll: function () {
        return muteAll === true;
      },

      isModal: function () {
        try {
          if (A.engine && typeof A.engine.modalDepth === 'function') {
            return A.engine.modalDepth() > 0;
          }
        } catch (e) { /* ignore */ }
        return false;
      },

      keyInputAllowed: function () {
        var doc = window.document;
        if (doc && doc.visibilityState && doc.visibilityState !== 'visible') {
          return false;
        }
        if (blockDepth > 0) {
          return false;
        }
        if (inputGate === true) {
          return false;
        }
        if (muteAll === true) {
          return false;
        }
        return true;
      },

      tick: function () {
        try {
          if (A.engine && typeof A.engine.tick === 'function') {
            A.engine.tick();
          }
        } catch (e) { /* ignore */ }
      }
    };

    /* droppable：切到后台时清空朗读队列 */
    try {
      window.addEventListener('blur', function () {
        try {
          if (A.speech && typeof A.speech.cancelPending === 'function') {
            A.speech.cancelPending();
          }
        } catch (e) { /* ignore */ }
      }, false);
    } catch (e2) { /* ignore */ }

    /* 周期 tick：驱动适配器状态机（快进停止补念、选项消失 drop 等） */
    try {
      tickTimer = window.setInterval(function () {
        try {
          A.host.tick();
        } catch (e) { /* ignore */ }
      }, 400);
      if (tickTimer && tickTimer.unref) {
        tickTimer.unref();
      }
    } catch (e3) { /* ignore */ }
  }

  A.registerModule('a11y-host', init);
})(window);
