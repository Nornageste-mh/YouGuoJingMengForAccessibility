# 项目状态（模板 · 单一入口）

> 依据：Framework《project_status.md》。本文档是**状态与待办的唯一入口**：只看这一份就能知道「做到哪、证据在哪、还剩什么、接手要注意什么」。
> 维护规则：每个阶段（P0/P1/P2/P3/P4/P5/P6/P7）结束时更新；未验证项一律 `待实机验证` 或 `遗留`，**不得**写成「已完成」。
> 当前版本：v0.1（2026-11-23，P0 进行中）

## 1. 项目概况

| 项 | 内容 |
|---|---|
| 项目 | 《游郭惊梦》屏幕阅读器无障碍补丁 |
| 游戏 | Steam AppID 3299340，Electron 7.1.2 + TyranoScript 5；安装目录 `D:\Steam\steamapps\common\游郭惊梦`（**只读**） |
| 目标 | NVDA 可读未配音剧情/选项/界面控件；有配音剧情静音但可重读；全界面控件键盘可达（U1–U5） |
| 技术栈路线 | **Electron 渲染层 JS 注入 + DOM 原生无障碍**（非 Unity/BepInEx；已定，依据 `README.md` 决策记录） |
| 安装与还原 | `install-patch.ps1`：备份 `index.html` → 注入 `a11y-patch/a11y-boot.js` → 写 `install-manifest.json`；`uninstall-patch.ps1` 按清单恢复 |
| 设计依据 | `docs/02-framework-design.md`（三层+ L2.5 映射）、`docs/00-project-brief.md`（U1–U5） |
| 公开资料检索 | `docs/templates/feasibility-validation.md` §0.1（TODO 填充）；只作线索，不作证据 |
| 测试便捷通道 | 测试副本 + CDP 探针（`src/harness/cdp.mjs`，`--remote-debugging-port=9333`）；开发者面板 TODO 确认 |
| 操作语义 | `docs/templates/operation-conventions.md`（P0 起草，P3 定稿） |
| 构建/验证入口 | 安装：`src/install/install-patch.ps1`；启动：`launch-game.ps1`；取证：`cdp.mjs`；问卷：`docs/templates/test-questionnaire.md` |
| 发布状态 | **开发中**（P0 进行中；未实机验收，不得对外宣称可用） |
| 证据等级口径 | L4 用户本人 / L3 真机+客观证据 / L2 自动化或代码 / L1 仅文档 / L0 无 |

## 2. 模块索引

| 模块 | 代码/文档 | 状态 | 证据等级 |
|---|---|---|---|
| 需求与裁决 | `docs/00-project-brief.md` | 已定 | L1 |
| Framework 设计映射 | `docs/02-framework-design.md` | 初稿完成 | L1 |
| 合规检查单 | `docs/compliance-checklist.md` | 初版完成（实测项待填） | L1 |
| 全界面控件清单 | `docs/01c-control-inventory.md` | **进行中**（game-analyst） | TODO L2/L3 |
| 交互形态判定 | `docs/templates/interaction-form-decision.md` 实例 | **未判定（P1 阻塞）** | TODO |
| 可行性验证 | `docs/templates/feasibility-validation.md` 实例 | P0 进行中（引擎/探针已确认，剧本统计待补） | L2 部分 |
| 安装/卸载脚本 | `src/install/install-patch.ps1`、`uninstall-patch.ps1` | 可用（开发形态） | L2 |
| 启动/测试副本脚本 | `src/install/launch-game.ps1`、`make-test-copy.ps1` | 可用 | L2 |
| CDP 取证工具 | `src/harness/cdp.mjs` | 可用（dom/ax/keys/click/shot/inject） | L2 |
| 补丁入口 | `src/patch/a11y-boot.js` | **待建**（P2） | — |
| L1 DOM-Host 平台层 | `src/patch/core/*.js` | 待建（P2） | — |
| L2 契约层 | `src/patch/a11y-host.js` | 待建（P2） | — |
| L2.5 Tyrano 适配层 | `src/patch/engine/tyrano-adapter.js` | 待建（P2） | — |
| L3 文本处理/配音判定 | `src/patch/game/textproc.js`、`voice.js` | 待建（P3，T1 未定） | — |
| L3 界面适配器 | `src/patch/game/screens/*.js` | 待建（P3，依赖控件清单） | — |
| 测试 Harness | `tests/` | 待建（P4） | — |
| 发布打包 | `src/install/`（玩家安装器）、发布包文档 | 待建（P5/P6） | — |

## 3. 证据索引

| 证据 | 位置 | 说明 |
|---|---|---|
| 标题页基线截图 | `out/evidence/baseline-01.png` | 补丁前视觉基线（已有） |
| 安装冒烟截图 | `out/evidence/smoke-install.png` | 安装形态冒烟（已有） |
| AXTree 基线 | `out/evidence/ax-*.json` | TODO：补丁前后各一份（`cdp.mjs ax --out`） |
| DOM 快照 | `out/evidence/dom-*.txt` | TODO：关键界面（`cdp.mjs dom --out`） |
| 运行日志 | `a11y-patch/logs/`（测试副本内） | **不含台词**；发布包不带日志 |
| 回归输出 | `out/evidence/regression-*` | TODO：CDP harness 输出与退出码 |
| 人工听测记录 | 测试问卷（用户填写） | L3/L4 最终依据 |

> IP 红线：证据目录不放含台词的日志/截图内容；截图不含剧本文字（或已裁剪）；探针不记录台词。

## 4. 待实机验证（P1/P4 checklist）

- [ ] T1 配音行判定来源与覆盖率（U1 关键）
- [ ] T2 游戏原生键位表与冲突
- [ ] T3 全界面控件清单（含返回/关闭/隐藏控件）
- [ ] T4 文本/选项事件稳定性（打字机/快进/自动/backlog）
- [ ] T5 面板组清单（U3 Tab 实现依据）
- [ ] T6 renderer 写盘权限（配置/日志落盘）
- [ ] T7 NVDA 对 DOM 焦点/aria-live 的实际表现
- [ ] T8 是否存在 Shadow DOM / canvas 自绘界面
- [ ] T9 Steam 校验/更新对补丁的影响
- [ ] T11 重读回放是否含角色名（与用户确认）
- [ ] T12 每界面返回路径
- [ ] T13 游戏是否原生占用 Tab/方向键/Backspace
- [ ] T14 焦点移动是否带动游戏视觉高亮
- [ ] T15 是否有限时选项
- [ ] 关闭补丁/卸载后行为不变（回归硬要求）
- [ ] 测试跳转/开发热键只在测试构建、发布件无残留

## 5. 遗留缺陷

| 缺陷 | 影响 | 替代路径 | 登记位置 |
|---|---|---|---|
| 暂无（尚未进入实现阶段） | — | — | — |

> 与 `interaction-form-decision.md` §5、README「已知问题」、测试问卷 §2.7 保持一致；允许带缺陷发布，但不许让玩家误以为已覆盖。

## 6. 下一步 / 交接

**下一步（按优先级）**：

1. game-analyst：完成 P1 控件清单与 T1/T2/T3/T4/T5/T8/T15（阻塞交互形态判定与 P2）。
2. sr-bridge：T6（写盘权限）、T7（NVDA 实测）、AXTree/DOM 基线证据。
3. Lead：T9（Steam 校验）、T10（许可证/发布形态）、T11（用户确认回放是否含角色名）。
4. fw-analyst：本任务交付物（docs/02、检查单、7 模板）——完成后由 Lead 审核并入主文档。

**接手前必须知道**：

- 不要启动游戏做破坏性实验；只用测试副本或只读原目录。
- 不要写 `docs/01c-control-inventory.md`（game-analyst 所有）。
- 不要修改 `gal-a11y-forge/`、`Framework/`、游戏目录、旧自动化产物目录。
- 不要依据旧自动化产物结论（U4：只作线索）。
- 文档中的「已验证」只能是 L3/L4 项；L2 写「自动化通过」。

**不要动**：`README.md`（Lead 维护）、`docs/00-project-brief.md`（需求基线）、他人 write scope。

## 7. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|---|---|---|---|
| 2026-11-23 | v0.1 | 模板初稿：状态/模块/证据/待验证/交接框架，按本作事实预填 | fw-analyst |
