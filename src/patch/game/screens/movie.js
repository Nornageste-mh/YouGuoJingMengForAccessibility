/**
 * L3 game/screens/movie.js —— 过场 / 结局视频屏（U1：含音频的视频播放期间不朗读剧情文本）。
 *
 * 依据 game-analyst 离线解析（2026-11-23）：9 个结局 movie（Be01/BeB06/BeB07/BeN02/BeN03/
 * Demo/HeB08/HeN04/Ne05_end.mp4）与 HE_B07.ks:285 的 Bai.mp4 均含 AAC 音轨；warnings.mp4 无。
 * 本作全库无逐行配音标签，因此 U1 的唯一落点是 movie 阶段。
 *
 * 行为：
 * - 检测：存在可见且未结束的 <video>（Tyrano bgmovie / layermode_movie）。
 * - 进入：只播报一次「过场视频…按 Enter 或点击跳过」，置 host.setMuteAll(true)
 *   （期间剧情行由 dialogue 以 note 进重读缓冲，不朗读），视频元素 data-a11y-voice="voiced"
 *   且 aria-hidden（画面不朗读、不产生 AX 噪声）。
 * - 激活：Enter/点击 → el.click() 走游戏自身视频 skip 链路；失败则交回游戏原生键处理。
 * - 退出：deactivate 恢复 setMuteAll(false)，后续剧情行照常朗读。
 */
(function (window) {
  'use strict';

  var A = window.__YOUGUO_A11Y__;
  if (!A) {
    return;
  }

  function init() {
    if (A.screens && A.screens.movie) {
      return;
    }
    A.screens = A.screens || {};

    var screen = {
      id: 'movie',
      priority: 60,
      _announcedKey: '',

      detect: function () {
        if (!A.engine || !A.engine.movieState) {
          return false;
        }
        var mv = A.engine.movieState();
        /* [bgmovie] 是背景视频（zIndex 0、skip=false、剧情继续/在 [l] 等点击），
           不是阻塞式过场；当成 movie 屏会吞掉 Enter 导致“警告视频跳不过”。
           只对 [movie]（zIndex 199999，skip=true 有跳过处理器）建立 movie 屏。 */
        return !!(mv && mv.el && mv.bgmode !== true);
      },

      refresh: function () {
        var mv = A.engine.movieState ? A.engine.movieState() : null;
        if (!mv || !mv.el) {
          return [];
        }
        try {
          mv.el.setAttribute('aria-hidden', 'true');
          mv.el.setAttribute('data-a11y-voice', 'voiced');
          if (mv.el.getAttribute('tabindex') !== null) {
            mv.el.setAttribute('tabindex', '-1');
          }
        } catch (e) { /* 去噪失败不影响游戏 */ }
        return [mv.el];
      },

      activate: function () {
        var mv = this.refresh();
        if (!mv.length) {
          return;
        }
        var key = String((A.engine.movieState() || {}).src || 'video');
        this._announcedKey = key;
        A.host.setMuteAll(true);
        /* P2：无音轨的视频不播「含配音」措辞（warnings.mp4 等），有音轨才提保留原声。
         * 加载窗口（video 已 append、display:none 等 canplay）里 hasAudio 未知，用中性措辞，
         * 避免用户听到「含配音」却按了没反应。 */
        var mvState = A.engine.movieState ? A.engine.movieState() : null;
        var hasAudio = !!(mvState && mvState.hasAudio);
        var pending = !!(mvState && mvState.pending);
        A.host.say(pending
          ? '过场视频加载中。按 Enter 或点击跳过。'
          : (hasAudio
            ? '过场视频（含原声）。按 Enter 或点击跳过。'
            : '过场视频。按 Enter 或点击跳过。'), {
          source: 'ui',
          target: 'ui',
          force: true
        });
        if (A.log) {
          A.log.diag('movie started', { key: key.split('/').pop(), pending: pending });
        }
      },

      deactivate: function () {
        this._announcedKey = '';
        A.host.setMuteAll(false);
        /* P2：视频结束后不残留旧提示（live region 清空，避免 SR 重复播报） */
        try {
          if (A.speech && A.speech.cancelPending) {
            A.speech.cancelPending();
          }
          if (A.liveRegion && A.liveRegion.clear) {
            A.liveRegion.clear();
          }
        } catch (e) { /* 清空失败不影响游戏 */ }
      },

      onKey: function (action) {
        if (action === 'activate') {
          /* 视频被 skip 点击移除后，短时间内再按 Enter 会落到已脱离文档的 video 上，
             进而透传给游戏造成额外推进（用户感觉“跳过后不稳定”）。加 600ms 冷却窗口。 */
          var now = A.now ? A.now() : Date.now();
          if (this._lastActivateAt && (now - this._lastActivateAt) < 600) {
            return true;
          }
          var mv = A.engine.movieState ? A.engine.movieState() : null;
          if (mv && mv.bgmode === true) {
            return false; /* 背景视频不是过场屏，按键交回游戏（[l] 等点击） */
          }
          if (mv && mv.el) {
            this._lastActivateAt = now;
            /* 加载窗口：video 仍 display:none（canplay 未完成），clickElement 的可见性检查会拒绝；
               但游戏 skip 处理器在创建 video 时已绑定，直接 el.click() 即可跳过。
               同时吞掉按键，避免透传给游戏 nextOrder 推进背后剧情。 */
            if (mv.pending === true) {
              try {
                mv.el.click();
              } catch (ep) {
                try {
                  var evp = document.createEvent('MouseEvents');
                  evp.initEvent('click', true, true);
                  mv.el.dispatchEvent(evp);
                } catch (ep2) { /* ignore */ }
              }
              return true;
            }
            /* 播放中：走游戏自身视频 skip（点击）；已播完但 [l] 等待：走 nextOrder 继续 */
            if (mv.ended === true) {
              try {
                if (A.engine.advance() === true) {
                  return true;
                }
              } catch (e1) { /* fallthrough */ }
            }
            try {
              if (A.engine.clickElement(mv.el) === true) {
                return true;
              }
            } catch (e) { /* 交回游戏原生键 */ }
            /* 视频刚 append、canplay 尚未完成时不可见 → 点击失败；短延后补一次点击
               （skip 处理器在 playVideo 里创建 video 时即绑定，重试即可命中）。 */
            var self = this;
            setTimeout(function () {
              try {
                if (A.game.patches.currentScreen() !== self) {
                  return;
                }
                var mv2 = A.engine.movieState ? A.engine.movieState() : null;
                if (mv2 && mv2.el && mv2.ended !== true) {
                  A.engine.clickElement(mv2.el);
                }
              } catch (e2) { /* ignore */ }
            }, 180);
            return true;
          }
          return false;
        }
        return false;
      },

      tick: function () { /* 切换由 patches 的 400ms 检测负责 */ }
    };

    A.screens.movie = screen;
    if (A.game && typeof A.game.registerScreen === 'function') {
      A.game.registerScreen(screen);
    }
  }

  A.registerModule('game/screens/movie', init);
})(window);
