# 游郭惊梦 无障碍补丁 —— GUI 安装器（install-youguo-a11y.exe）

《游郭惊梦》NVDA 无障碍补丁的 Windows 图形化安装/卸载工具。单个 `install-youguo-a11y.exe`，
目标机器无需安装 .NET 运行时（Win10/11 自带 .NET Framework 4.8），无需管理员权限，
不写注册表、不装服务、不联网。

版本：**0.1.0**（与补丁源码 `a11y-boot.js` 的 VERSION 保持一致，不单独升版本号）。

## 目录内容

| 文件 | 说明 |
| --- | --- |
| `Native.cs` | Win32 互操作：DPI 感知、把控制台桥接到调用方（CLI 模式需要） |
| `SteamLocator.cs` | Steam 库自动定位（注册表 + `libraryfolders.vdf` + `appmanifest_3299340.acf`） |
| `InstallerCore.cs` | 核心逻辑：状态检测、安装、卸载、SHA256、manifest（与 `src/install/*.ps1` 等价） |
| `DiagnosticsLog.cs` | `%TEMP%\youguo-a11y-installer.log` 诊断日志 |
| `Program.cs` | 入口：无参数 → GUI；CLI 参数 → 无界面自测模式 |
| `MainForm.cs` | WinForms 界面（NVDA 可读的控件与 Tab 顺序） |
| `AssemblyInfo.cs` | 程序集版本 0.1.0.0 |
| `build.ps1` | 用系统自带 csc.exe 编译出单文件 EXE |
| `selftest.ps1` | CLI 全流程自测（在 `tmp\` 测试副本上运行，绝不触碰真实游戏目录） |

## 编译

在项目根 `01-galgame-a11y/youguo-jingmeng-a11y/` 下运行：

```powershell
pwsh -File src\installer-gui\build.ps1
```

产物：`out\release\gui-staging\install-youguo-a11y.exe`（单文件，约 51 KB）。

编译环境要求与说明：

* 使用 Windows 自带的 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`
  （.NET Framework 4.8 自带的旧版编译器，**只支持 C# 5 语法**：不能用 `$"..."`、`?.`、
  nameof、表达式体成员、自动属性初始化器）。
* 源码统一保存为 **UTF-8 with BOM**，并加 `/codepage:65001`，避免中文系统默认 GBK 代码页导致乱码。
* `build.ps1` 会自动：定位 csc.exe → 补齐 BOM → 编译 → 打印 EXE 大小与 SHA256。

手动编译等价命令（在项目根执行）：

```powershell
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" `
    /nologo /target:winexe /platform:anycpu /codepage:65001 /optimize+ `
    /out:out\release\gui-staging\install-youguo-a11y.exe `
    /reference:System.dll /reference:System.Core.dll `
    /reference:System.Drawing.dll /reference:System.Windows.Forms.dll `
    src\installer-gui\*.cs
```

## 使用（GUI）

1. 把 `install-youguo-a11y.exe` 放在发布包解压目录中，**与 `a11y-patch\` 文件夹同级**
   （EXE 从自己所在目录读取补丁源；单独拷走 EXE 会提示“找不到补丁文件”）。
2. 双击启动。窗口标题：`游郭惊梦 无障碍补丁安装器`。
3. 游戏目录：程序启动后会自动在 Steam 库中查找《游郭惊梦》；
   也可以点「自动检测」重新查找，或点「浏览…」手动选择游戏根文件夹（包含 `Kaede.exe`）。
4. 状态区显示：`未安装` / `已安装 0.1.0` / `安装异常，需要人工处理` / `目录无效`，
   以及 App 目录、备份/补丁目录是否存在、index.html 注入标记数。
5. 点「安装补丁」→ 确认对话框（提示会先备份 `index.html` 为 `index.html.a11y-backup`）→ 完成。
6. 点「卸载补丁」→ 确认对话框（提示会从备份还原原始 `index.html`）→ 完成。
7. 「操作日志」文本域记录每一步结果；底部显示 NVDA 运行状态（补丁需要 NVDA 才能朗读）。
8. 安装/卸载前请**完全退出游戏**：检测到 `Kaede` 进程时程序会拒绝操作并提示先退出。

## 使用（CLI 自测模式）

同一个 EXE，带参数运行即无界面模式（供自动化/故障排查使用）：

```powershell
install-youguo-a11y.exe --detect                         # 自动检测游戏目录
install-youguo-a11y.exe --status  "D:\...\游郭惊梦"       # 查看安装状态
install-youguo-a11y.exe --install "D:\...\游郭惊梦"       # 安装
install-youguo-a11y.exe --uninstall "D:\...\游郭惊梦"     # 卸载
install-youguo-a11y.exe --version / --help
```

* 游戏目录可省略（自动在 Steam 库中查找）；也可以是 `<游戏目录>\resources\app`。
* 退出码：`0` 成功；`2` 可修复错误（参数/目录/已安装/游戏运行中/缺备份等）；`3` 意外错误。
* 命令行下运行请用管道或 `Start-Process -Wait -RedirectStandardOutput` 捕获输出
  （Windows GUI 子系统的 EXE 不会被 `$x = & exe` 这种无管道方式等待）。

## 自测

```powershell
pwsh -File src\installer-gui\selftest.ps1
```

脚本会：

1. 重新编译 EXE，并把 EXE + 发布包的 `a11y-patch\` 复制到 `tmp\gui-selftest\bin\`（模拟发布包结构）；
2. 用 `src\install\make-test-copy.ps1 -Dest tmp\gui-test -Force` 生成游戏副本
   （真实游戏已装过旧补丁，副本会继承该状态，脚本先把它还原为原始未安装状态再测试）；
3. 依次执行 19 个 CLI 用例：detect、status 未安装、install（标记 3 处 / 备份 SHA / manifest 字段）、
   status 已安装、重复安装拒绝、uninstall（index.html SHA256 还原、目录删除）、再次 uninstall、
   非法目录、缺补丁源、`resources\app` 形式目录、备份缺失异常状态、Kaede 运行门禁、
   非法参数、--version、--help 等；
4. 证据写入 `out\evidence\installer-gui-selftest-<时间戳>.json`（断言级 pass/fail 与关键输出）。

GUI 冒烟验证（可选，Windows PowerShell 5.1）：`tmp\gui-smoke2.ps1` 会启动 GUI，用 UIA 校验全部控件
可访问名称与状态，用 MSAA（NVDA 实际使用的路径）校验按钮/静态文本/可编辑文本角色并激活
「刷新状态」，再 `PrintWindow` 截图；最新一次结果 **PASS 34/34**，证据见
`out\evidence\installer-gui-smoke-<时间戳>.json` 与 `out\evidence\installer-gui-window-<时间戳>.png`。

安全约束：测试只操作 `tmp\gui-test` 副本；脚本开头会校验副本位于项目目录内，并只读校验
真实 Steam 目录的 `index.html` 哈希前后一致；结束时要求副本恢复原始状态。

## 分发与 SmartScreen 说明

* 本 EXE 未做代码签名（个人小工具，无证书），首次从网上下载运行时 Windows SmartScreen
  可能显示“Windows 已保护你的电脑”：
  点「更多信息」→「仍要运行」即可；也可右键 EXE → 属性 → 勾选「解除锁定」。
* 请只使用发布包中随附的 EXE 与 `a11y-patch\`，不要从第三方渠道下载。
* 安装器不写注册表、不装服务、不联网、不需要管理员权限；诊断日志只写在
  `%TEMP%\youguo-a11y-installer.log`。
* 卸载补丁请使用同一安装器的「卸载补丁」；卸载只依赖游戏目录内的
  `index.html.a11y-backup`，若该备份丢失，安装器会拒绝卸载并提示用 Steam
  验证文件完整性恢复原始文件。

## 已知限制

* 无自定义程序图标（`/win32icon` 为可选，未提供图标文件）。
* 仅支持 Windows（WinForms + .NET Framework 4.8）。
* 自动检测依赖 Steam 注册表/库配置；便携版 Steam 或非常规安装位置可能检测不到，
  此时请用「浏览…」手动选择。
* 本机用 Windows PowerShell 5.1 的 UIAutomationClient 自动化枚举时，WinForms 子控件会被统一报告为 `ControlType.Pane`
  （环境级 MSAA→UIA 桥接表现，最小 WinForms 程序同样如此），不影响 NVDA 的 MSAA 读取；自动化验证因此同时使用 MSAA 断言。
