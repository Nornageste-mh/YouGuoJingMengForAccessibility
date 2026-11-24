# 交互形态判定（模板 · P0 产物，P3/P4 复核）

> 依据：Framework《交互形态纪律.md》（第 0 条纪律 + A/B/C 路线 + X1–X9）、《无障碍补丁流水线》§3.6/§3.8。
> 使用方式：P0 由 game-analyst 以**实测证据**填写结论与逐界面清点；P4 用测试问卷 §2「验收七问」复核，两者结论必须一致。
> 重要：A/B/C 是**实测结论**，读代码/看文档推断不算。未完成本文件前不得进入 P2（骨架）——这是流水线硬门槛。
> 当前状态：**未判定（TODO P1）**。本模板已按本作已知事实预填「待测项」，不得把预填内容当作结论。

## 0. 元信息

| 项 | 填写 |
|---|---|
| 游戏 | 《游郭惊梦》（Steam AppID 3299340） |
| 引擎/宿主 | Electron 7.1.2 + TyranoScript 5（Chromium DOM 暴露给 NVDA） |
| 补丁形态 | `index.html` 注入 + `a11y-patch/`（非 BepInEx） |
| 判定人 / 日期 | TODO(P1)：game-analyst / |
| 结论 | **TODO(P1)：A / B / C（三选一）** |
| 证据类型 | 实机按键走查 / P1 探针（DOM+AXTree）/ 反编译或源码实查方法名 / 截图 |
| 证据位置 | `out/evidence/...`、`docs/01c-control-inventory.md` |

---

## 1. 结论（P0 必填）

> A = 游戏已有完全键盘控制（不装补丁即可纯键盘走完全流程）→ 补丁只朗读，不碰输入焦点与键位。
> B = 有键盘但不完全（部分界面/控件必须鼠标）→ 在游戏自己的输入/焦点层补缺失键与动作，不设模式开关。
> C = 没有键盘控制/控件模型（必要时直接调用游戏动作函数，最小选中表示，不新建 UI 层）。

**本作结论：TODO(P1)。**

判定理由（必须写「看到了什么」而不是「觉得」）：

- TODO：例如标题页图片按钮是否可聚焦、是否响应 Enter；菜单/设置是否可用方向键；对话框推进是否键盘可用；选项是否键盘可选；各界面 Esc/返回是否有路径。
- 当前**已知事实**（只作方向，不构成结论）：
  - [文件] `README.md`：标题页是 5 张无 alt 图片按钮/链接，AXTree 只有 `img` 无名称 → 语义缺失，但**是否可聚焦/可键盘激活未验证**。
  - [文件] `README.md`：Chromium 原生把 DOM 暴露给 NVDA → 存在「只补语义+焦点即达 A/B」的可能性。
  - [推断] 若游戏自身监听 `click` 且控件是 `<a>`/`div`，补丁加 `tabindex` + `role` + 键盘触发 `click()` 即可 B 类达标；若游戏控件是 canvas/自绘，则倾向 C 类。验证方法：P1 DOM 扫描 + 焦点/按键实验（T3/T8）。

---

## 2. 完全键盘控制逐界面清点（P0 核心表）

> 对每个界面回答：不装补丁能否纯键盘完成？（推进 → 移动 → 激活 → 退出四步）缺什么？补法是什么？游戏自己的入口方法/控件是什么？

| 界面 | 不装补丁纯键盘可行？ | 游戏自己的键位/焦点机制 | 缺什么 | 本作补法（A/B/C） | 游戏自身入口（控件/方法） | 证据 |
|---|---|---|---|---|---|---|
| 标题页 | TODO(P1) | TODO | TODO | TODO | TODO | TODO |
| 剧情页（推进/自动/快进） | TODO | TODO | TODO | TODO | TODO | TODO |
| 选项 | TODO | TODO | TODO | TODO | TODO | TODO |
| 设置 config / config1 | TODO | TODO | TODO | TODO | TODO | TODO |
| 存/读档 | TODO | TODO | TODO | TODO | TODO | TODO |
| 画廊 / CG 查看 | TODO | TODO | TODO | TODO | TODO | TODO |
| 历史 backlog | TODO | TODO | TODO | TODO | TODO | TODO |
| 消息窗菜单 | TODO | TODO | TODO | TODO | TODO | TODO |
| 地图 / tooltip | TODO | TODO | TODO | TODO | TODO | TODO |
| 确认框（remodal） | TODO | TODO | TODO | TODO | TODO | TODO |
| 退出确认 | TODO | TODO | TODO | TODO | TODO | TODO |
| 键位设置 tb_keyconfig | TODO | TODO | TODO | TODO | TODO | TODO |

### 2.1 补充事实（P0 必须填）

| 项 | 内容 | 证据 |
|---|---|---|
| 游戏自己的选中态/焦点链 | TODO：是否有「选中项」概念？焦点如何表现（class/hover/高亮图）？ | TODO |
| 游戏自己的键位表 | TODO(T2)：KAG 默认 + 本作 `Config.tjs`/`KeyConfig` | TODO |
| 游戏原生占用的键 | TODO(T2)：方向键/Tab/Backspace/Esc 在游戏内是否已有用途 | TODO |
| 界面开关事件 | TODO：菜单打开/关闭是否可观察（DOM/事件） | TODO |
| 公开资料 | TODO：Steam 页面/攻略/ wiki 只作线索，记录版本与日期，并与实测差异对照 | `templates/feasibility-validation.md` §0.1 |
| 操作语义对齐 | TODO(P0/P3)：与《操作逻辑公约》逐条对齐，差异进《操作约定》§2.3 | `templates/operation-conventions.md` |

### 2.2 焦点/输入技术事实（决定 B 或 C）

| 问题 | 答案 | 证据 |
|---|---|---|
| 控件是原生可聚焦元素吗（button/a/input）？ | TODO | P1 DOM |
| 游戏是否为控件绑定 `click` 监听？ | TODO | P1 事件探针 |
| 焦点移动是否会触发游戏自己的视觉高亮？ | TODO(T14) | 实机截图对比 |
| 是否存在 canvas/自绘界面/Shadow DOM？ | TODO(T8) | DOM 扫描 |
| 游戏是否用 Tab 做原生操作？ | TODO(T13) | 实测 |
| 滑条是原生 `input[type=range]` 还是自绘？ | TODO(T4) | DOM 扫描 |

---

## 3. 反模式自查（X1–X9，逐条「有/无 + 理由」）

| 反模式 | 本作是否出现 | 理由/证据 |
|---|---|---|
| X1 模式键（先按某键进入导航/操作模式） | 无（设计目标） | 本作无模式状态；`docs/02` §5.1 |
| X2 自扫屏/自维护焦点列表 | 无 | 焦点=浏览器 `activeElement`；控件清单只是语义配置，不是游标 |
| X3 拦截/静音 submit、改 `sendNavigationEvents` | 无 | 不触碰浏览器读屏事件；不全局拦截键盘 |
| X4 每帧扫 UI 猜界面 | 无 | 事件驱动（MutationObserver/游戏事件）；`tick` 仅兜底 |
| X5 自绘覆盖层/提示条/焦点框 | 无 | 只用视觉隐藏 live region |
| X6 合成 OS 输入（SendInput/坐标点击） | 无（玩家路径） | 激活用真实元素 `click()`；CDP 合成仅测试取证 |
| X7 玩家背编号/背键位 | 无 | 选项可 ↑↓+Enter；不要求记忆映射 |
| X8 全局读键无焦点门作唯一入口 | 无 | `keyInputAllowed` 焦点门 |
| X9 把导航当新作出厂默认 | 无 | 无导航模式；Tab 限面板组 |

> 允许的例外必须写清判据：例如 X3 若游戏完全不用选中态，可做「最小修复」，必须在此说明改了什么、为什么最小、怎么回退。

---

## 4. 验收七问（P4 填写，与测试问卷 §2 一致）

| # | 问题 | 结果 | 证据 |
|---|---|---|---|
| 1 | 不按模式键能否纯键盘走完主流程？ | TODO(P4) | 问卷 §2.1 |
| 2 | 当前朗读项是否=游戏选中项？ | TODO | 问卷 §2.2 |
| 3 | 关掉补丁后游戏键位行为是否完全不变？ | TODO | 问卷 §7 |
| 4 | 是否没有新增可见物？ | TODO | 截图 |
| 5 | 是否没有让玩家背游戏不存在的操作？ | TODO | 安装说明 |
| 6 | 朗读是否由游戏事件触发？ | TODO | 日志 |
| 7 | 任一「否」是否已如实登记遗留缺陷？ | TODO | §5 |

---

## 5. 遗留缺陷（允许带缺陷发布，但不许让玩家以为已覆盖）

| 缺陷 | 影响界面/操作 | 为什么补不上（技术/成本/风险） | 玩家如何感知 | 计划 | 登记位置 |
|---|---|---|---|---|---|
| TODO(P3/P4) | TODO | TODO | TODO | TODO | README「已知问题」/ FAQ |

> 该表与 `README.md`「已知问题」、测试问卷 §2.7 必须一致（三处交叉核对）。

---

## 6. 变更记录

| 日期 | 版本 | 变更 | 证据 |
|---|---|---|---|
| 2026-11-23 | v0.1 | 模板初稿：判定框架与待测项预填，结论留 TODO(P1) | 本任务 |
