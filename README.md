# YouGuoJingMengForAccessibility

本仓库是**专门针对 Steam 游戏《游郭惊梦》** 的屏幕阅读器
辅助补丁（游戏内 DOM 注入，通过 NVDA / 系统读屏读取浏览器无障碍树朗读）。

> ## 🎮 关于本作
>
> | | |
> |---|---|
> | 中文名 | **游郭惊梦** |
> | 英文名 | —（Steam 英文页同名） |
> | 开发 | **做完散伙制作组** |
> | 发行 | **做完散伙制作组**（自研自发） |
> | Steam | [AppID 3299340](https://store.steampowered.com/app/3299340/) |
> | 发售 | 2025 年 8 月 16 日 |
>
> **这个补丁是玩家自制的第三方工具，与做完散伙制作组 没有任何关系，
> 也没有得到他们的授权或背书。** 游戏的著作权归他们所有，
> 本仓库只发布自己的补丁代码，不含任何游戏资源。

> ## 致 做完散伙制作组
>
> 我们欠你们一句道歉。
>
> 做这个补丁的过程中，我们读取了你们随游戏一起发布的 TyranoScript 引擎源码
> （`resources/app/tyrano/`），也读了 `data/scenario/` 下的剧本文件，
> 用来判断哪些行有配音、哪些界面控件没有名字 —— **这些都没有事先问过你们。**
>
> 技术上这是绕不开的一步：这个游戏的界面按钮几乎全是图片，正文由逐字
> `span` 拼出来，不读引擎和剧本就找不到能挂钩子的地方。但**「必要」不等于
> 「可以不打招呼」**。我们做这件事的出发点不是不尊重这部作品，恰恰相反 ——
> 是因为觉得它值得被更多人玩到，才想让读屏玩家也能走完一遍。
>
> 已经做的补救：
>
> - 读取的剧本与界面文案**从未进入版本库**（全历史核查过，含其它分支），
>   只在本机用于分析，已被 `.gitignore` 排除，也**不随发布包分发**
> - 仓库与发布包**不含任何游戏资源**，只有我们自己的补丁代码和文档
> - 唯一的例外是开场 WARNINGS 画面上的四条免责声明文字：它烧在
>   `warnings.mp4` 的画面里，为了让读屏能念出来，我们把它**转录成静态文案**
>   放进了 `src/patch/game/screens/notice.js`。这部分文字属于游戏，
>   若你们认为不妥，我们立刻改成别的提示
> - 发给玩家的文档里没有任何剧情内容，也没有泄露结局相关的信息
> - **如果你们认为任何部分不妥，请联系我们 —— 我们会立刻调整，或者整体下架**
>
> 也请读到这里、并且用得上这个补丁的玩家：
> **它让你能玩上这款游戏，不是让你不必买这款游戏。请去买一份正版。**
> 这部作品是做完散伙制作组的。

> ## ⚠️ 郑重警告（请务必阅读）
>
> - 本项目是 **Vibe coding 产物**（AI 辅助生成），**非官方**，
>   与开发兼发行 **做完散伙制作组** **没有任何关系**。
> - **请务必支持正版：本辅助仅面向已在 Steam 购买《游郭惊梦》的玩家。**
>   **强烈要求每一位使用者通过 Steam 购买正版游戏。** 我们坚决反对任何形式的盗版、
>   破解、未授权传播；请勿将本工具用于协助获取或游玩盗版副本。
>   **这个补丁是让你能玩上这款游戏，不是让你不必买它** ——
>   做完散伙制作组的劳动成果值得被正当地支持。
> - 本项目**不保证可用、不保证稳定**，代码可能存在各种问题（兼容性、稳定性、安全性等），
>   **无任何维护承诺**。使用风险自负，仅供个人学习/研究参考，请勿用于商业或分发牟利。
> - **建议在完全理解代码的前提下再使用**，自行承担一切后果。
> - 本仓库**不包含任何游戏资源**，只发布运行时补丁代码与文档。
> - **如您是 做完散伙制作组 的成员**，或本作的版权方，认为本仓库有任何不妥，
>   请联系我们，我们会立即配合调整或移除。

---

## 说明

本辅助的作用：让使用读屏软件的玩家，也能基本正常地游玩《游郭惊梦》。

- 朗读**没有配音**的剧情文本（旁白、角色名 + 台词）；有配音的影片只放原声并
  静音正文（**想听文字按 `Backspace`**）
- 朗读选项，并用数字键 `1`-`9` 选择（游戏原本的选项按钮是绘制的
  `div.glink_button`，读屏无法定位）
- 剧情页提供「**下一句**」控件：`Enter` / `空格` 推进；打字中第一次按键先
  「显示完整文字」，再按才推进
- 游戏内菜单 / 系统栏 / 设置 / CG 画廊与查看器 / 存读档 / 历史回顾 /
  退出确认的键盘导航与朗读（游戏原本这些界面几乎只能鼠标点）
- 开场 WARNINGS 警告画面：朗读四条免责声明，焦点落「以上OK，继续」，
  `Enter` / 读屏器点击即可跳过并进入剧情
- 重读缓冲区只收「剧情」与「选项」，界面播报不进去；`Backspace` 在剧情页
  重读当前台词（含角色名），在其他界面重读当前控件
- 朗读通道：常驻 `role=status` / `role=alert` 的 live region，经 Chromium
  无障碍树被 NVDA 以 MSAA `EVENT_OBJECT_LIVEREGIONCHANGED` 消费；
  **不注入 DLL、不需要游戏外挂进程、不需要管理员权限**

游戏版本：TyranoScript 5（Electron 7.1.2 / Chromium 78）。补丁是纯 JavaScript，
注入 `resources/app/index.html` 的一行 `<script>`，**不修改任何游戏资源**。

当前版本：`0.1.0`（内部迭代 `0.1.0.4` 已并入本版，见 [CHANGELOG.md](CHANGELOG.md)）。

---

## 安装（仅限正版玩家）

**最快的装法**：到 [Releases](../../releases) 下载整合包 zip，解压后运行里面的
`install-youguo-a11y.exe`（GUI 安装器）。它会自动找到 Steam 库里的
`steamapps\common\游郭惊梦`；找不到时点「浏览…」选到游戏根目录
（有 `Kaede.exe` 的那一层）。

想用命令行、或没有图形环境：解压后双击 `install-player.cmd`，或

```powershell
powershell -ExecutionPolicy Bypass -File .\install-player.ps1 -GameDir "D:\Steam\steamapps\common\游郭惊梦"
```

补丁由安装器**备份 `resources\app\index.html` 后注入一行脚本**，卸载时还原。
**不修改游戏资源，不碰存档。**

卸载：再次运行安装器点「卸载补丁」；或双击 `uninstall-player.cmd`。
手动路径：删掉 `resources\app\a11y-patch\`，把 `index.html.a11y-backup`
改名回 `index.html`。

> **存档注意**：本作的存档是游戏根目录下的 `Kaede_tyrano_data.sav` 等文件，
> 且有存档位置 hash 校验。补丁不读写它们；但请不要用隔离的 Electron profile
> 去启动**真实**游戏目录，否则会被判定「存档位置变更」并拒绝启动。
> 测试请用复制品 + 独立 profile。

详细步骤、每个界面的按键表、配置项、故障排查见发布包里的
`INSTALL.md` / `OPERATION.md` / `FAQ.md`。

---

## 主要快捷键

| 快捷键 | 功能 |
| --- | --- |
| `1` - `9` | 选择对应编号的选项（剧情选项） |
| `Backspace` | 剧情页：重读当前台词（含角色名）；其他界面：重读当前控件 |
| `↑` `↓` | 上一项 / 下一项 |
| `←` `→` | 调整滑条 / 数值（设置界面的音量、文字速度、自动速度） |
| `Enter` / `空格` | 激活控件；剧情页 = 下一句（打字中先显示全文） |
| `Esc` | 返回 / 关闭当前面板（游戏原生行为优先） |
| `Tab` / `Shift+Tab` | 在「≥2 个面板组」的界面切换面板组 |

> 鼠标操作全部保留；补丁只增加键盘与读数，不拦截原生点击。

**游戏原生占用的键**（补丁不抢）：`Enter` / 空格推进与隐藏文本、
`Ctrl` 快进、鼠标右键隐藏、鼠标中键菜单、滚轮上/下（历史 / 推进）。
方向键游戏未占用，所以补丁用作导航；`Tab` 只在多面板界面接管，
单面板界面透传给游戏。

---

## 已知问题 / 注意事项

- 通过读取游戏运行时 DOM 工作，**游戏更新后可能失效**（选择器按
  `data-event-pm`、模板类名挂的）
- 本作界面按钮大多是纯图片（`img.event-setting-element`），名称来自
  `data-event-pm` 里的 `graphic`；游戏新增的界面若没有这个属性，补丁读不到名字
- 本作**没有逐行配音**（全库 `.ks` 无 voice 标签，仅结局与过场影片带音轨）：
  「有配音不朗读」这一条只在**影片阶段**生效；影片只播「过场视频」提示，
  不做画面口述
- 「下一句」与「打开菜单」在打字 / 转场的瞬间仍有几十毫秒的时机差异；
  菜单展开带游戏原生 `fadeIn(300)`，朗读通常 0.4–0.8 秒内出现（功能正常，
  不是卡死）
- 地图 tooltip、KeyConfig 界面尚未适配（方向键可达但未接朗读）
- `Tab` 面板组只在「≥2 组」的界面生效：设置 5 组、CG 画廊 2 组、存读档 2 组、
  backlog 2 组、HUD 2 组；标题 / 菜单 / 选项 / 确认框只有 1 组
- 朗读依赖 Chromium 无障碍树与 NVDA 对 MSAA live region 的消费；
  **其他读屏软件未验证**（UIA 不暴露该事件）
- **NVDA 真机长时间听测还没有做**：自动化证据是 CDP 合成键（L2），
  主观听感需要你带读屏实际走一遍
- 警告屏文案是**静态转录**（见上文「致 做完散伙制作组」），游戏改文案需同步
- GUI 安装器在本机某些 UIA 客户端会把 WinForms 子控件统一报成 `Pane`
  （MSAA / NVDA 路径正常）
- 点显器（盲文）输出**尚未接入**

---

## 构建

```powershell
cd <仓库根目录>
pwsh src\installer-gui\build.ps1                  # 先编 GUI 安装器（可选，缺省打警告）
pwsh src\install\make-release.ps1 -Version 0.1.0  # 语法检查 + 组装发布包 + 打 zip
```

需要：Windows 10/11、PowerShell 5.1 或 7、Node.js（`node --check` 语法检查）、
系统自带的 .NET Framework 4.8 的 `csc.exe`（编译 GUI 安装器）。

产物在 `out\release\`，zip 可直接发 Release。

> `src\install\*.ps1` 是 `.ps1`，必须保存为 **UTF-8 带 BOM** ——
> Windows PowerShell 5.1 读无 BOM 的脚本会按 GBK 解码，中文注释变乱码并直接
> 语法错误。提交闸门 `tools\check-staged.ps1` 会拦住这种情况。

### 目录结构

```
.
├─ src/
│  ├─ patch/                 补丁本体（纯 JavaScript，注入 index.html）
│  │  ├─ a11y-boot.js        入口：模块清单、按序动态加载、自检
│  │  ├─ a11y-host.js        宿主契约：朗读、焦点、门控、重读缓冲出口
│  │  ├─ core/               配置、live region、语音队列、重读缓冲、按键路由
│  │  ├─ engine/             TyranoScript 适配（pushBackLog、stat、点击、影片状态）
│  │  ├─ game/
│  │  │  ├─ screens/         标题/剧情/选项/菜单/设置/CG/存读档/backlog/确认/警告/影片
│  │  │  └─ *.js             文本清洗、名称映射、界面补丁
│  │  └─ config.json         默认配置
│  ├─ install/               安装/卸载脚本、发布打包脚本
│  ├─ installer-gui/         GUI 安装器（C# / WinForms，系统 csc 编译）
│  └─ harness/               CDP 探针与开发用脚本（不入发布包）
├─ docs/
│  └─ templates/             玩家文档模板（打包时转成 INSTALL/OPERATION/FAQ）
└─ tools/
   └─ check-staged.ps1       提交前安全闸门
```

### 补丁做了什么

| 功能 | 挂载点 |
|---|---|
| 朗读剧情正文 | 包装 `kag.pushBackLog(str, type)`（每个 `[text]` 一次，快进也入账）+ 观察 `.message_inner` |
| 判断整句打完 | 轮询 `kag.stat.is_adding_text`（文字完成时播报） |
| 角色名 | `.chara_name_area`（引擎 `[chara_ptext]` 写入的 `jname`） |
| 朗读选项 / 数字键选择 | 可见的 `div.glink_button`；补丁发送原生 `click` |
| 标题 / 菜单 / 系统栏控件 | `img.event-setting-element` 的 `data-event-pm`（名称、target、坐标） |
| 界面检测 | MutationObserver + 250ms 轮询 + 点击后主动催检测 |
| 打开游戏内菜单 | 直接调 `kag.menu.showMenu()`（绕开引擎 role 守卫） |
| 剧情「下一句」 | 补丁自建 `#a11y-next-line`：完成态 `kag.ftag.nextOrder()`，打字中 `is_click_text` 显示全文 |
| 开场警告屏 | 识别 `warnings.mp4` 的 `[bgmovie]`，激活走 `engine.advance()` |
| 朗读输出 | 常驻 `role=status` / `role=alert` 的 live region（NVDA 经 MSAA 消费） |

### 几条踩过的坑（改之前请先读）

- **启动脚本绝不能继承调用者的管道句柄**：本机 PowerShell 7 的
  `Start-Process -PassThru` 会无限挂起；`.NET Process.Start` 会让游戏继承
  父进程 stdout 管道，调用方一直等到游戏退出才 EOF。现在用 WMI
  `Win32_Process.Create` 分离启动。
- **`ELECTRON_RUN_AS_NODE`**：宿主环境里如果带着这个变量启动 `Kaede.exe`，
  Electron 会按 Node 模式跑，报 `bad option: --remote-debugging-port` 并退出。
  启动前必须清掉。
- **别对真实游戏目录用隔离 profile**：本作有存档 hash 校验，profile 里的
  `save_key` 与 `Kaede_tyrano_data.sav` 不一致会弹「检测到存档位置变更」
  并拒绝启动。测试一律用复制品 + 独立 profile。
- **CDP `getFullAXTree` 不剪枝 `aria-hidden` 是序列化假象**：真实读屏走
  `partialAXTree`，`aria-hidden` 子树是 `ignored=true / ariaHiddenElement`。
  用 full tree 统计噪声会得出错误结论。
- **对 `<video>` 调合成 `el.click()` 不会触发 `[bgmovie]` 的跳过处理器**：
  那个处理器绑在 jQuery 事件上，需要真实点击或直接调引擎推进方法。
- **`[button]` 的 role 守卫**：打字 / 等待中引擎会忽略 `menu` / `save` /
  `quicksave` / `sleepgame` 的点击；直接调 `kag.menu.showMenu()` 才稳。
- **`[bgmovie]` 与 `[movie]` 不是一回事**：`bgmovie` 是背景层视频 + `[l]`
  等点击，`movie` 才是带跳过处理的过场影片。把开场警告当 `movie` 会误建屏、
  还会吞掉推进键。
- **live region 必须常驻**：创建时带文本不会触发事件；只有改动已有节点的
  `textContent` 才会播报。
- **PowerShell 5.1 把无 BOM 的 `.ps1` 当 GBK 读**：中文注释变乱码、直接
  语法错误。所有 `.ps1` 必须 UTF-8 BOM（提交闸门会拦）。
- **别用 `$pid` 当变量名**：PowerShell 保留变量，赋值会冲突，用 `$procId`。
- **`node -e` 传中文 / 反引号在 PowerShell 里很容易被拆**：临时脚本写成
  `.mjs` 文件再跑。

---

## 如何复现分析

全部是只读分析，不需要反编译、不提取资源：

1. 复制一份游戏目录做测试副本（不要动 Steam 库原目录）；
2. 启动 `Kaede.exe --remote-debugging-port=<端口> --force-renderer-accessibility --user-data-dir=<副本 profile>`，用 CDP 看 DOM / 无障碍树
   （`src/harness/cdp.mjs` 是现成探针）；
3. 读 `resources/app/tyrano/` 的引擎源码（`kag.pushBackLog`、`tag.l`、
   `tag.movie`、`playVideo` 等）和 `data/scenario/*.ks`，判断行 / 按钮 / 配音；
4. **剧本原文、界面文案、游戏资源一律不得入库**，`.gitignore` 与
   `tools/check-staged.ps1` 会拦。

---

## 合规说明

- 在绝大部分国家和地区，为自己使用而修改你**合法拥有**的软件通常是允许的；
  但把**修改后的软件提供给第三方**，以及**绕过技术保护措施**，
  在绝大部分国家和地区都是**不被允许**的。
  各国规定不尽相同，请以你所在地的法律为准。
- 本补丁因此**不包含任何游戏资源**，只发布补丁代码；整合包通过本仓库的
  Releases 提供，其中**不含游戏本体、不含任何游戏资源**。
- 补丁通过修改 `resources\app\index.html` 注入脚本，属于可逆的用户侧修改；
  不绕过 Steam DRM，不修改、不替换、不再分发游戏文件。

---

## 许可

补丁代码与文档采用 [MIT 许可](LICENSE) 发布，附加的署名要求与免责条款见 [NOTICE.md](NOTICE.md)。

第三方组件：**无** —— 补丁是纯 JavaScript；GUI 安装器使用 Windows 自带的
.NET Framework 4.8（系统组件，不随包分发）。游戏引擎 TyranoScript 与
Electron 运行时属于游戏本体，不在本仓库分发。

简要说明：

- **可自由使用、修改、再分发**（含商用），但须标注出处 —— 本仓库地址与作者
  Nornageste-mh；若你做了修改，须注明「已修改」，不得让人误以为修改版出自原作者。
- **本项目为非官方第三方工具**：本补丁是非官方玩家自制补丁，与游戏开发商、发行商
  做完散伙制作组 无任何关系，未获其授权或背书。游戏著作权归他们所有，
  本仓库只发布补丁代码，不含任何游戏资源。
- **按「现状」提供，不承担任何责任**：因使用本软件导致的游戏存档损坏、游戏崩溃、
  账号受限、或与游戏厂商及任何第三方产生的争议与索赔，作者与贡献者均不负责。
  是否使用请自行判断并自担风险。
