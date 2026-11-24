# 无障碍补丁源码（a11y-patch）v0.1.0-r2

《游郭惊梦》无障碍补丁的**宿主侧注入代码**。运行方式：安装脚本把本目录复制到
`<AppDir>/a11y-patch/`，并在 `index.html` 的 `</body>` 前插入
`<script src="./a11y-patch/a11y-boot.js"></script>`（带 `<!-- a11y-patch -->` 标记）。

> 本目录不修改游戏文件、不修改玩家配置、不写存档；卸载脚本恢复 `index.html` 并删除注入目录。
> 版本号保持 0.1.0（`a11y-boot.js` VERSION 不改），r2 为迭代批次标记，0.1.0.4 为警告屏/四项修复批次。

## 安装 / 卸载

```powershell
pwsh -File src/install/install-patch.ps1 -PatchSrc <abs>\src\patch -AppDir <abs>\tmp\game-test\resources\app
pwsh -File src/install/uninstall-patch.ps1 -AppDir <abs>\tmp\game-test\resources\app
```

> **升级必走 uninstall → install**：`install-patch.ps1` 检测到 index.html 已有
> `<!-- a11y-patch -->` 会直接失败；`uninstall` 先恢复备份，`install` 再重新注入。
> 批量脚本里不要用 `| Out-Null` 吞输出，安装后应用 `Select-String` 校验新标记再 reload。

## 启动（测试实例）

```powershell
pwsh -File src/install/launch-game.ps1 -GameRoot <abs>\tmp\game-test-r2 -Port 9336 -UserDataDir <abs>\tmp\profile-r2
```

## 模块表

| 层 | 模块 | 职责 |
| --- | --- | --- |
| 入口 | `a11y-boot.js` | 幂等守卫、按顺序注入 25 个模块、错误隔离、启动日志、`window.__YOUGUO_A11Y__` |
| L1 | `core/log.js` | 分级日志（info/diag/warn/error）+ 环形缓冲；不含台词文本 |
| L1 | `core/config.js` | 只读 `config.json`（Electron 7 file:// 走 `require('fs')`）；校验/默认值/永不写回 |
| L1 | `core/live-region.js` | 两个 1px 视觉裁剪的 aria-live 节点（polite/assertive），朗读唯一载体 |
| L1 | `core/speech.js` | 朗读调度：同文本 1.8s 去重、分段、队列、assistive interrupt |
| L1 | `core/repeat.js` | 重读缓冲（U1/U2）：`say/note/push/drop/again/replay/clear/current`，默认 4 条、priority |
| L1 | `core/keys.js` | keydown 边沿/IME/组合键/焦点门 → 屏幕适配器路由；Enter/Space 250ms 闩锁；无适配器屏不吞原生键 |
| L1 | `core/selfcheck.js` | SELFTEST SUMMARY（启动打印，不含台词）+ CDP 可读的 `selfcheck.summary()` |
| L2 | `a11y-host.js` | `cfg`、`say`（界面朗读）、`shouldMute`、`setMuteAll`、`blockAdvance`、`onInputGate`、`keyInputAllowed`、`tick` |
| L2.5 | `engine/tyrano-adapter.js` | Tyrano 适配：attach、stat/tf、行事件（`pushBackLog` 权威钩子 + MutationObserver 180ms 稳定）、`advance()`、`revealText()`、选项事件、`movieState()`、`hideMessageFromAX()`、点击、busy/模态 |
| L3 | `game/textproc.js` | KAG 标签/ruby/实体/空白清洗，姓名拼接 |
| L3 | `game/name-map.js` | 图片名/`data-event-pm.role` → 可读中文名（含依据注释） |
| L3 | `game/voice.js` | 配音三态（voiced/unvoiced/unknown）；本作默认 unknown→朗读（宁可多读） |
| L3 | `game/patches.js` | DOM 辅助、界面注册/检测/切换、键盘路由接入 |
| L3 | `game/screens/title.js` | 标题页 5 按钮：名称/角色/tabindex/焦域/↑↓/Enter·Space；重复节点去噪+幂等 |
| L3 | `game/screens/choices.js` | 选项组（`div.glink_button`）：整组播报+push、1–9、↑↓+Enter、消失 drop |
| L3 | `game/screens/dialogue.js` | 剧情行播报/入缓冲、快进 note+停止补念、**「下一句」虚拟控件（打字中「显示完整文本」）**、8 个系统按钮焦域、Backspace 重读 |
| L3 | `game/screens/movie.js` | 过场/结局视频屏（U1 落点）：进入播报一次提示（无音轨中性文案/有音轨提示保留原声）、`setMuteAll(true)` 期间不读剧情文本（行仍 note 进缓冲）、Enter/点击走游戏自身跳过、退出恢复并清 live 残留 |
| L3 | `game/screens/notice.js` | 开场 WARNINGS 警告屏（`[bgmovie warnings.mp4]`+`[l]`）：朗读警告全文（静态文案，不依赖 OCR）、单一「以上OK，继续」控件（默认焦点，Enter/Space/AT 默认动作→`engine.advance()` 可靠跳过）、Backspace 重读警告；非本屏不可达，鼠标仍可原生点击视频 |
| L3 | `game/screens/menu.js` | 游戏内菜单 5 项：存档/读取存档/设置/返回标题/关闭菜单，↑↓/Enter/Esc |
| L3 | `game/screens/remodal.js` | 确认框（退出等）：标题+正文播报、焦点落「取消」、Esc=取消、Enter=默认按钮 |
| L3 | `game/screens/config.js` | 设置 47 控件：分组（back/BGM/SE/文字速度/自动速度/未读/画面）、↑↓移动、**←→ 档位增减（点击邻居档位并播报新值）**、Tab 切组、当前值从 `TYRANO.kag.variable.tf` 读、开关状态播报 |
| L3 | `game/screens/cg-gallery.js` | CG 画廊 8 控件/页：6 槽（锁定播「未解锁」）+ 翻页 + 返回标题、页码播报、网格方向键 |
| L3 | `game/screens/cg-viewer.js` | CG 查看器：仅由画廊解锁槽激活（`_armed` 防误判）、播「按 Esc 或 Enter 返回」、Esc/Enter 关闭 |
| L3 | `game/screens/saveload.js` | 存/读档：5 槽（`li.save_display_area[data-num]`）、空槽播「空存档槽」、关闭按钮、↑↓ 移动 |
| L3 | `game/screens/backlog.js` | 历史记录：`.log_body` 条目逐条 ↑↓ 播报（首尾边界提示）、关闭按钮、Esc 返回 |

## 键盘语义（补丁接管部分）

| 键 | 行为 |
| --- | --- |
| ↑ / ↓ | 当前界面焦点域内移动；边界播「已到第一项/最后一项」 |
| ← / → | 仅设置类界面：档位/滑条增减（语音/文字速度等），并播报新值 |
| Tab / Shift+Tab | 仅登记 ≥2 面板组的界面（config 5 组）切换组；其余界面透传给游戏 |
| Enter / Space | 激活唯一通路 `el.click()`；250ms 闩锁防双提交；**剧情中=「下一句」（打字中先显示完整文本）** |
| Esc | 优先激活界面登记的返回/关闭控件，其次取消（remodal=取消），无登记则透传 |
| Backspace | 有控件焦点→重读该控件；否则重读缓冲当前项（U2） |
| 1–9 | 选项面板直选 |
| 0 | 沉默（预留） |

## 数据流约定

- 剧情/选项 → `A.repeat`（live region 唯一朗读出口 + 重读缓冲）。
- 界面/控件/状态 → `A.host.say()`（只 announce，永不进缓冲，满足 U2）。
- 焦点唯一游标 `document.activeElement`；激活唯一通路 `el.click()`。
- 单模块异常只禁用该模块（boot 记录进 `__YOUGUO_A11Y__.bootErrors`），不打断游戏。
- 视频（`movie` 屏）→ 期间 `host.setMuteAll(true)`，剧情行只 note 不进 live region；退出恢复（U1）。

## CDP 验证片段

```powershell
node src/harness/cdp.mjs eval --port 9336 --expr "JSON.stringify({v:window.__YOUGUO_A11Y__.version,ready:window.__YOUGUO_A11Y__.ready,screen:window.__YOUGUO_A11Y__.game.patches.screenId(),active:document.activeElement.getAttribute('aria-label')})"
node src/harness/cdp.mjs eval --port 9336 --expr "JSON.stringify({p:document.getElementById('a11y-live-polite').textContent,a:document.getElementById('a11y-live-assertive').textContent})"
node src/harness/cdp.mjs ax --port 9336 --grep button
node src/harness/cdp.mjs keys --port 9336 --seq "Enter"
```

复验脚本：`tmp/r2-suite9.ps1`（下一句/菜单/设置/存读档/backlog 导航）、`tmp/r2-typing2.js`（打字中显示全文）、`tmp/ax-verify.mjs`（aria-hidden 的 partial AXTree 口径）。
证据：`out/evidence/patch-r2-*.png` 与 `out/evidence/patch-r2-verification.md`。

## 已知限制（v0.1.0-r2）

1. **界面覆盖**：标题、剧情（含「下一句」）、选项、系统栏 8 按钮、游戏内菜单、设置 config（47 控件）、CG 画廊、CG 查看器、存读档列表、backlog、确认框 remodal 已适配；**地图 tooltip 与 KeyConfig 仍未做**（P1 下一批）；remodal 目前只处理退出确认，覆盖存档等其他确认框复用同一 shim（未逐一实测）。
2. **CG 查看器焦点**：进入查看器时屏幕与提示正确，但 CDP 读到 `document.activeElement` 的 `aria-label` 为 null（焦点可能仍在 body），键盘 Enter/Esc 可关闭；焦点断言待复核。
3. **设置值显示**：BGM/SE/文字速度/自动速度/未读/画面由 `TYRANO.kag.variable.tf` 读取；文字速度/自动速度的档位索引按实测表（0 基）换算，若未来游戏改表需同步 `config.js` 的 `CH_LEVELS/AUTO_LEVELS`。
4. **HUD 边界（游戏原生状态）**：若先从标题进入 CG 画廊再返回标题开始游戏，8 个 `img.fixlayer.role_button` 可能不出现（`hud=0`，菜单/读档/backlog 无键盘入口）；正常「标题→开始游戏」路径 `hud=8`。属游戏自身状态行为，补丁不改游戏。
5. **存读档写盘验证**：仅在测试副本 `tmp/game-test-r2` 上验证；读档会触发游戏原生确认框时由 remodal shim 接管。
6. 图像不朗读、不 OCR；纯图片按钮依赖资源名映射，映射不到时退化为「按钮」。
7. 有配音行静音为防御骨架：本作阶段性结论无角色配音；`voiceGate` 判据来自 DOM 标记 `data-a11y-voice`，接入真实配音需在 engine 层补 `kag.stat` 语音标记。
8. 快进（skip）中的行只入缓冲不朗读；跳过整段后停止时补念当前句（`repeat.replay`）。
9. 不提供 Alt+Shift+F9 全局热键（docs/04 决策）；CDP 合成键 ≠ 真实键盘，U3/U5 的 L3/L4 验收需真机键盘 + 读屏人工回归。
10. **AX 逐字噪声的证据口径（重要）**：DOM 中 `.message_outer/.message_inner/.chara_name_area/.current_span` 已全部 `aria-hidden="true"`。用 `Accessibility.getPartialAXTree`（真实 AT 看到的子树）验证：`.message_inner` 子树节点返回 `role=Ignored / ignored=true / ignoredReasons=[{name:"ariaHiddenElement",value:true}]` → 读屏不会读到逐字文本。**注意**：Chromium 78 的 CDP `Accessibility.getFullAXTree` 序列化不剪枝 aria-hidden（逐字 text 仍报 `ignored=false`），因此 full-tree 里的逐字节点是**取证口径假象**，不能作为噪声判据；AX 验收请用 `tmp/ax-verify.mjs`（partial tree）或 NVDA 人工听测。
11. 视频阶段（movie 屏）只播报提示，不描述画面、不做 OCR；`warnings.mp4` 无音轨（中性文案），结局 movie 与 `Bai.mp4` 含 AAC 音轨（提示保留原声）——有音轨视频期间原声保留、剧情文本不朗读（U1）。警告屏（notice）的警告文本为 `notice.js` 内静态文案（依据游戏画面/剧本），游戏改文案时需同步。
12. 警告屏的「以上OK」控件走 `engine.advance()`（实测可靠）；游戏原生鼠标仍可直接点击视频区域跳过，补丁不改变该行为。

## 后续 TODO

- 地图界面 tooltip（P1）与 KeyConfig。
- CG 查看器焦点复核（activeElement）。
- 覆盖存档等非退出类 remodal 的实测。
- 全界面 `run-ax-diff`「无名称可操作节点数=0」自动化断言（src/tests/ 尚未落地）。
