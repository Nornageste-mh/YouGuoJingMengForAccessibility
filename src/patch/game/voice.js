/*
 * L3 game/voice.js —— 配音三态策略（voiced / unvoiced / unknown）。
 * 本作阶段性结论「无角色配音」：默认返回 unknown → 朗读（宁可多读，绝不默认静音）。
 * voiceGate 配置只影响判定来源；U1 验收用 data-a11y-voice 标记注入模拟 voiced 行。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  function init() {
    if (A.game && A.game.voice) { return; }

    A.game = A.game || {};
    A.game.voice = {
      STATES: ['voiced', 'unvoiced', 'unknown'],

      /* 行配音状态：cfg.voiceGate=off → 全按 unvoiced（全朗读）；
       * 否则看引擎/DOM 标记，无标记 → unknown（朗读并入缓冲）。 */
      stateFor: function (info) {
        try {
          var cfg = A.cfg || {};
          if (cfg.voiceGate === 'off') {
            return 'unvoiced';
          }
          var el = null;
          try {
            el = A.engine && A.engine.findMessageNode ? A.engine.findMessageNode() : null;
          } catch (e) {
            el = null;
          }
          var fromDom = A.engine && A.engine.lineVoiceState ? A.engine.lineVoiceState(el) : 'unknown';
          if (fromDom === 'voiced' || fromDom === 'unvoiced') {
            return fromDom;
          }
          /* 引擎接口留白：若未来 kag.stat 暴露语音播放标记，在这里接入。
           * 目前本作无配音资源，恒为 unknown。 */
          return 'unknown';
        } catch (e2) {
          return 'unknown';
        }
      },

      /* 测试/排障注入：给当前消息节点打三态标记（不改变游戏行为） */
      markCurrentLine: function (state) {
        try {
          if (this.STATES.indexOf(state) === -1) {
            return false;
          }
          var el = A.engine && A.engine.findMessageNode ? A.engine.findMessageNode() : null;
          if (!el) {
            return false;
          }
          el.setAttribute('data-a11y-voice', state);
          return true;
        } catch (e) {
          return false;
        }
      }
    };
  }

  A.registerModule('game/voice', init);
})(window);
