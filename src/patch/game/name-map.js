/*
 * L3 game/name-map.js —— 控件名称映射（图像按钮无文字，名称由脚本/资源名推导）。
 * 图片名 → 可读中文名；依据是剧本 [button graphic=...] 与打包资源文件名。
 * patch 侧不修改剧本，只做可读名映射；查不到返回空串（调用方决定是否退化为「按钮」）。
 */
(function (window) {
  'use strict';
  var A = window.__YOUGUO_A11Y__;
  if (!A) { return; }

  /* 键一律小写。依据：title_screen.ks [button graphic=开始游戏_A.png ...]；
   * 系统栏依据 theme_kopanda_23/image/button/*.png 资源名（qsave/qload/auto/skip/log/screen/close/menu）。 */
  var GRAPHIC_NAMES = {
    /* 标题页 5 按钮（title_screen.ks） */
    '开始游戏': '开始游戏',
    '继续游戏': '继续游戏',
    'cg画廊': 'CG画廊',
    '游戏设置': '游戏设置',
    '退出游戏': '退出游戏',
    /* 对话中系统栏（fixlayer 8 按钮） */
    'qsave': '快速存档',
    'qload': '快速读取',
    'auto': '自动播放',
    'skip': '快进',
    'log': '历史记录',
    'screen': '全屏切换',
    'close': '关闭消息窗口',
    'menu': '菜单',
    /* 通用返回/翻页（config/CG/存档界面，P1 使用） */
    'back': '返回',
    'prev': '上一页',
    'next': '下一页',
    'page_prev': '上一页',
    'page_next': '下一页'
  };

  /* data-event-pm.role 兜底映射（不同主题 role 字符串略有差异，按小写包含匹配） */
  var ROLE_NAMES = [
    ['quicksave', '快速存档'],
    ['quickload', '快速读取'],
    ['autoplay', '自动播放'],
    ['auto', '自动播放'],
    ['skip', '快进'],
    ['backlog', '历史记录'],
    ['log', '历史记录'],
    ['fullscreen', '全屏切换'],
    ['screen', '全屏切换'],
    ['window_close', '关闭消息窗口'],
    ['close', '关闭消息窗口'],
    ['menu', '菜单'],
    ['save', '存档'],
    ['load', '读档'],
    ['back', '返回'],
    ['prev', '上一页'],
    ['next', '下一页']
  ];

  function baseName(path) {
    var s = String(path == null ? '' : path);
    var cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (cut !== -1) {
      s = s.substring(cut + 1);
    }
    var dot = s.lastIndexOf('.');
    if (dot > 0) {
      s = s.substring(0, dot);
    }
    return s;
  }

  function candidatesOf(path) {
    var base = baseName(path);
    var out = [];
    if (!base) {
      return out;
    }
    out.push(base.toLowerCase());
    var stripped = base.replace(/[_\-][a-z0-9]{1,3}$/i, '');
    if (stripped && stripped !== base) {
      out.push(stripped.toLowerCase());
    }
    var noDigits = base.replace(/[0-9]+$/, '');
    if (noDigits && noDigits !== base) {
      out.push(noDigits.toLowerCase());
      var noDigits2 = noDigits.replace(/[_\-][a-z0-9]{1,3}$/i, '');
      if (noDigits2 && noDigits2 !== noDigits) {
        out.push(noDigits2.toLowerCase());
      }
    }
    return out;
  }

  function init() {
    if (A.game && A.game.nameMap) { return; }

    A.game = A.game || {};
    A.game.nameMap = {
      /* 按图片路径/文件名查可读名（无则空串） */
      byGraphic: function (path) {
        var cands = candidatesOf(path);
        for (var i = 0; i < cands.length; i++) {
          if (GRAPHIC_NAMES[cands[i]]) {
            return GRAPHIC_NAMES[cands[i]];
          }
        }
        return '';
      },

      /* 按 data-event-pm.role 查可读名（无则空串） */
      byRole: function (role) {
        var r = String(role == null ? '' : role).toLowerCase();
        if (!r) {
          return '';
        }
        for (var i = 0; i < ROLE_NAMES.length; i++) {
          if (r.indexOf(ROLE_NAMES[i][0]) !== -1) {
            return ROLE_NAMES[i][1];
          }
        }
        return '';
      },

      /* 综合：优先图片名，其次 role；都查不到返回 fallback */
      resolve: function (pm, fallback) {
        var p = pm || {};
        var name = this.byGraphic(p.graphic || '');
        if (!name) {
          name = this.byRole(p.role || '');
        }
        if (!name) {
          name = typeof fallback === 'string' ? fallback : '';
        }
        return name;
      },

      entries: function () {
        var out = [];
        for (var k in GRAPHIC_NAMES) {
          if (Object.prototype.hasOwnProperty.call(GRAPHIC_NAMES, k)) {
            out.push({ key: k, name: GRAPHIC_NAMES[k] });
          }
        }
        return out;
      }
    };
  }

  A.registerModule('game/name-map', init);
})(window);
