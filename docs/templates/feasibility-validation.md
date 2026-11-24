# 无障碍可行性验证（模板 · P0 产物）

> 依据：Framework《无障碍可行性验证.md》（P0 出口文档）、《无障碍补丁流水线》§6 P0。
> 用途：回答「这个游戏能不能做无障碍补丁、代价最大的三处是什么、两个第 0 决策（技术栈路线 / 交互形态）定完没有」。
> 出口条件：§0 结论可回答「能做/不能做/有条件做」；§3、§4、§5 填实；§7 交互形态判定有结论（或明确 TODO 与阻塞点）。
> 当前状态：**P0 进行中**（已打通 CDP 探针、已知引擎与 DOM 暴露事实；剧本统计/交互形态/补丁点表待 P1）。

## 0. 元信息与结论摘要

| 项 | 填写 |
|---|---|
| 游戏 | 《游郭惊梦》，Steam AppID 3299340 |
| 引擎/宿主 | Electron 7.1.2 + TyranoScript 5（Chromium 渲染，DOM 通过 UIA 暴露给 NVDA） |
| 开发/发行 | TODO(开发商/发行商，Steam 页面) |
| 验证机器 / 日期 | Windows 10/11 · NVDA · 2026-11-23 |
| 技术栈路线 | **Electron 渲染层 JS 注入（DOM 原生无障碍）**（已定；见 `README.md` 决策记录） |
| 交互形态 | **TODO(P1)**（见 §7） |
| 结论 | **有条件可做**：DOM 已暴露、安装/卸载形态可落地；主要风险=控件语义缺失、配音判定来源未定、全界面控件覆盖工作量大 |

**代价最大的三处**（P0 必须回答，TODO 待 P1 修正）：

1. **全界面控件语义化与逐项验收（U5）**：需要逐界面清点、命名、焦点域、返回路径，并逐项实测；工作量与验证成本最高，且任何遗漏都可能导致「鼠标孤岛」。
2. **配音行判定的可靠性（U1）**：若无法稳定判定「哪一行有配音」，静音策略要么误静音（漏内容）要么误朗读（与配音打架）。
3. **DOM 文本事件的稳定性**：打字机、快进、自动播放、backlog、界面切换的事件获取是否一致，决定朗读与重读缓冲是否可靠。

## 0.1 公开资料检索（只作线索）

| 来源 | 类型 | 对应版本/日期 | 可信度 | 已本机核对 |
|---|---|---|---|---|
| Steam 商店页 | 官方描述/截图 | TODO | 中 | TODO：键位/界面截图与实测对照 |
| Steam 社区/攻略/wiki | 玩家资料 | TODO | 低 | TODO：只用于定位界面与功能，不作证据 |
| 旧自动化产物 `01-galgame-a11y/游郭惊梦/mod-exp-project/` | 旧尝试 | 已失败（引擎识别 unknown、Ghidra 超时） | 极低（U4：只作线索） | 不核对；不得引用其结论 |

**剧透纪律**：攻略/截图/剧情资料只用于开发者定位（界面在哪、功能有何），**不得**进入补丁朗读、提示、安装说明、README；公开资料与实测不一致时，以本机实测为准。

## 0.2 测试便捷通道

| 通道 | 是否可用 | 说明 |
|---|---|---|
| 游戏自带开发者面板/控制台 | TODO 未确认 | TODO：先找游戏自带通道，再评估替代方案 |
| CDP 调试端口 | **可用**（已打通） | 清 `ELECTRON_RUN_AS_NODE` 后带 `--remote-debugging-port=9333 --force-renderer-accessibility` 启动；`src/harness/cdp.mjs` 可 dom/ax/keys/click/shot |
| 测试副本 | **可用** | `src/install/make-test-copy.ps1`；不修改 Steam 库原目录 |
| 调试跳转/测试单元 | TODO | 如需要，只在测试构建/调试开关；发布默认关闭、不注册玩家热键、不写安装说明、不绕过限时/剧透/可达范围 |

> 结论同步到 `docs/templates/project-status.md` §1。只有玩家正常路径的实机操作能写「已验证」。

## 1. 目标游戏

| 项 | 内容 | 证据 |
|---|---|---|
| 名称 / AppID | 《游郭惊梦》/ 3299340 | [文件] `README.md` |
| 引擎/运行时 | Electron 7.1.2 + TyranoScript 5 | [文件] `README.md`、`00-project-brief.md` |
| 安装目录（只读） | `D:\Steam\steamapps\common\游郭惊梦` | [文件] `00-project-brief.md` |
| 安装形态 | Steam 正版；补丁以 `resources/app/index.html` 注入 + `a11y-patch/` | [文件] `src/install/install-patch.ps1` |
| 公开资料需纠正处 | TODO | |

## 2. 剧情文本存放位置

| 内容 | 位置/格式 | 提取方式 | 证据 |
|---|---|---|---|
| 剧本 | `data/scenario/*.ks`（68 个） | 直接读文本 / `kag.parser.js` | [文件] `README.md` |
| 行类型 | `text` / `chara_ptext` 等标签 | `kag.parser.js` 解析 | [文件] `README.md` |
| 角色名显示 | `message_window.ks` 的 `chara_name_area` | 静态阅读 + 运行时 DOM | [文件] `README.md`（线索） |
| 配音关联 | TODO(T1)：未定（标签/音频/数据表） | TODO | TODO |

## 3. 剧本结构统计（P1 填写，game-analyst）

### 3.1 行类型与数量

| 项 | 数值 | 方法 |
|---|---|---|
| `.ks` 文件数 | 68（已知） | TODO 复核 |
| 台词行数 | TODO | 脚本统计 |
| 其中 `text` / `chara_ptext` | TODO | `kag.parser.js` |
| 富文本标签（`[ruby]`/`[color]`/`[font]`/`[wait]` 等） | TODO | 脚本统计 |
| 变量/条件表达式行 | TODO | 脚本统计 |

### 3.2 配音覆盖（U1 关键）

| 项 | 数值/结论 | 方法 |
|---|---|---|
| 有配音行数 / 占比 | TODO(T1) | 剧本标签或运行时判定 |
| 无配音行数 / 占比 | TODO | 同上 |
| 无法判定（unknown）比例 | TODO | 同上；必须给出保守策略与日志计数 |

### 3.3 分支与选项

| 项 | 数值 | 方法 |
|---|---|---|
| 选项点数量 / 选项总数 | TODO | 脚本统计 |
| 是否有限时选项/倒计时 | TODO(T15) | 脚本 + 实机（如有一律「只拉长不取消」） |
| 分支结构复杂度 | TODO | 脚本统计 |

### 3.4 说话人分布

| 项 | 数值/说明 |
|---|---|
| 主要说话人数量 | TODO |
| 旁白占比 | TODO |
| 角色名与显示名是否一致 | TODO |

### 3.5 量化问题清单（P0 要求）

- [ ] 总行数、有配音行数与占比、说话人分布、选项数量、行内富文本标签；
- [ ] 界面技术栈（DOM 是否全部可访问、是否有 canvas/Shadow DOM）；
- [ ] A/B/C 判定逐界面清点（见 §7 与交互形态判定文件）；
- [ ] 公开资料检索记录（§0.1）；
- [ ] 测试便捷通道（§0.2）；
- [ ] 引擎与宿主、引擎是否自动加载插件目录（本作=注入脚本，不适用插件目录）；
- [ ] 安装与还原形态（索引/清单/卸载）。

## 4. 运行时架构与补丁点

### 4.1 架构（P0 已知）

`Kaede.exe`（Electron 主进程）→ `resources/app/index.html`（TyranoScript 启动）→ KAG 解析 `.ks` → DOM 渲染（`#tyrano_base` 等）→ Chromium → UIA → NVDA。

补丁位置：`index.html` 末尾注入 `a11y-patch/a11y-boot.js`，在渲染层运行，只读 DOM/只加属性、事件驱动。

### 4.2 补丁点表（P1 逐项验证存在性与命中）

| 补丁点 | 目的 | 挂载方式（候选） | 存在性 | 命中证据 |
|---|---|---|---|---|
| 当前台词节点 | 获取已完成的一行 | MutationObserver（`<p>` 块聚合 120–200ms） | TODO | TODO |
| 无配音判定 | 决定是否朗读 | 行级判定（T1） | TODO | TODO |
| 换行/继续 | 区分「正在打字」与「一行完成」 | 文本稳定/事件 | TODO | TODO |
| 选项出现/消失 | 缓冲 + 编号播报 | `.glink_button` 集合观察 | TODO | TODO |
| 界面切换 | 焦点域重建、取消延迟朗读 | 菜单层显示/隐藏事件 | TODO | TODO |
| 存档/读档流程 | 静音与 clear | 游戏自己的读档入口/忙状态 | TODO | TODO |
| 按键语义 | ↑↓←→ Tab Enter Esc Backspace 1–9 0 | 文档级 keydown（捕获阶段，焦点门） | TODO | TODO |
| 推进拦截（必要时） | 防止读屏操作误推进 | 游戏自己的状态/事件 | TODO | TODO |

> 每个补丁点必须有「存在性」与「命中计数」两类证据（G14：挂载 ≠ 被调用）。

### 4.3 本作特有的麻烦

1. **初始语义全无**：标题页 5 张无 alt 图片按钮、AXTree 只有 img——需要逐控件补 `role/name/focus`，且不能自绘。
2. **配音判定未知**：U1 要求整行静音，但判定来源未定（T1），必须先取证再实现。
3. **DOM 事件稳定性**：Tyrano 打字机逐字 append、快进/自动播放路径不同，需统一到同一「行完成」事件。
4. **Steam 校验/更新**：`index.html` 可能被还原；需在安装说明与 FAQ 说明。
5. **无 BepInEx 生态**：安装、回滚、日志、诊断全部要自己实现（安装脚本已具备雏形）。

## 5. 范围与「不做什么」

**做**：未配音剧情朗读；有配音行静音但可重读回放；选项导航与播报；界面控件语义化与键盘可达（U5 全控件）；重读缓冲区；门控与静音；安装/卸载/诊断。

**明确不做**：

- 不做图像内容朗读/OCR/猜测；
- 不修改游戏资源、音量、画面、存档格式；
- 不提供导航模式、不自绘 UI、不伪造 OS 输入；
- 不跳过限时选择、不提前 reveal、不读未显示内容；
- 不改变游戏难度/分支/达成条件（不扩大可达范围）；
- 不联网、不收集数据、不内置 TTS（朗读交给 NVDA）。

## 6. 复现方式

```powershell
# 1) 测试副本（不修改 Steam 库）
pwsh src/install/make-test-copy.ps1

# 2) 安装补丁到测试副本
pwsh src/install/install-patch.ps1 -AppDir "tmp\game-test\resources\app" -PatchSrc "src\patch"

# 3) 启动（脚本清除 ELECTRON_RUN_AS_NODE，带调试端口与强制渲染器无障碍）
pwsh src/install/launch-game.ps1

# 4) CDP 取证（示例）
node src/harness/cdp.mjs ax --out out\evidence\ax-title.json
node src/harness/cdp.mjs dom --out out\evidence\dom-title.txt
node src/harness/cdp.mjs shot --out out\evidence\title.png
node src/harness/cdp.mjs keys --seq "ArrowDown Enter"
```

- 游戏目录只读；所有修改实验只在测试副本。
- 反编译/逆向仅限本机已安装游戏、用于定位接口；反编译产物不入库、不传播（IP 红线）。

## 7. 交互形态判定

→ 见 `docs/templates/interaction-form-decision.md`（P0 必填 A/B/C；未判定不得进入 P2）。

## 8. 操作约定

→ 见 `docs/templates/operation-conventions.md`（P0 起草、P3 定稿、P4 问卷 §2/§5 核对）。

## 9. 证据索引与待办

| 项 | 位置/状态 |
|---|---|
| AXTree 基线 | `out/evidence/ax-*.json`（TODO：补丁前后各一份） |
| DOM 快照 | `out/evidence/dom-*.txt` |
| 截图 | `out/evidence/*.png`（基线已有 `baseline-01.png`） |
| 剧本统计脚本 | TODO：`src/tools/`（待建） |
| 未解决 unknowns | T1/T2/T3/T4/T5/T8/T15（见 `docs/02-framework-design.md` §13） |
