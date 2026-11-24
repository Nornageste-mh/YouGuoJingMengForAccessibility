# 安装与运行脚本（src/install）

> 本目录是《游郭惊梦》无障碍补丁的安装/卸载/启动工具。
> **玩家**用发布包根目录的 `install-player.cmd` / `uninstall-player.cmd`（发布时从这里复制打包）；
> **开发/验证**用下面的 PowerShell 脚本。

## 0. 三条铁律（违反会触发游戏存档反篡改，黑屏无法启动）

本作 TyranoScript 的存档是**游戏根目录**下的 `Kaede_tyrano_data.sav`、`Kaede_sf.sav`，
save_key 存在 Electron profile 的 localStorage。二者 hash 不一致 → 游戏弹「检测到存档位置变更…启动终止」。
因此：

1. **禁止**对 `D:\Steam\steamapps\common\游郭惊梦`（原始游戏目录）用 `--user-data-dir` 隔离 profile 启动；
2. 一切开发/验证实例必须使用 `make-test-copy.ps1` 生成的**游戏目录副本** + 独立 profile；
3. 玩家正常安装/使用补丁**不改变启动方式**、不换 profile、不读写存档；补丁只改 `resources\app\index.html` 一行并新增 `a11y-patch\`。

## 1. 开发流程

```powershell
# 当前目录：01-galgame-a11y/youguo-jingmeng-a11y
pwsh src/install/make-test-copy.ps1          # 生成 tmp/game-test（data 为 junction，不复制 1.6GB）
pwsh src/install/install-patch.ps1 -AppDir "<项目>\tmp\game-test\resources\app" -PatchSrc "<项目>\src\patch"
pwsh src/install/launch-game.ps1 -GameRoot "<项目>\tmp\game-test" -Port 9336 -UserDataDir "<项目>\tmp\profile-patch-eng"
```

- `launch-game.ps1` 用 **WMI `Win32_Process.Create` 分离启动**：不继承调用者句柄表（所以 `pwsh -File ... | ...` 捕获输出也不会卡住）、不带 `ELECTRON_RUN_AS_NODE`，加 `--remote-debugging-port` / `--force-renderer-accessibility` / `--user-data-dir`，等 `/json/version` 就绪后返回；`-Kill` 结束自己那个进程（按 PID 文件，不按镜像名）。
- 2026-11-23 实机定位的两次“启动脚本挂起”：① `Start-Process -PassThru` 走 ShellExecuteEx 不返回；② `.NET Process.Start` 会让子进程继承可继承的 stdout/stderr 管道句柄，调用方捕获输出时等 EOF 等到游戏退出。两条都已规避，勿改回。
- 端口约定（同一时刻一人一端口）：Lead 9335、patch-eng 9336、verifier 9337、game-analyst 9340、sr-bridge 9334。
- 副本会继承原目录的 `.sav` 吗？**不会**——`make-test-copy.ps1` 生成后立即删除副本内所有 `.sav`，保证副本模拟“干净安装”。

## 2. 卸载

```powershell
pwsh src/install/uninstall-patch.ps1 -AppDir "<项目>\tmp\game-test\resources\app"
```

恢复 `index.html` 备份 → 删除 `a11y-patch` → 删备份；备份缺失但有补丁目录时**报错不静默**。

## 3. 玩家版（发布包）

发布包结构：

```
youguo-jingmeng-a11y-vX.Y.Z/
  install-player.cmd
  uninstall-player.cmd
  install-player.ps1
  uninstall-patch.ps1
  install-patch.ps1
  a11y-patch/            ← 补丁本体（a11y-boot.js、core/、game/、config.json…）
  INSTALL.md             ← 安装说明（docs/templates/install-guide.md 填写版）
  OPERATION.md           ← 操作约定
  FAQ.md
  NOTICE.md / LICENSE
```

`install-player.ps1` 自动定位游戏：注册表 SteamPath → `libraryfolders.vdf` 各库 → `steamapps\common\游郭惊梦`；
找不到/多处命中时要求 `-GameDir`。还支持：

```powershell
# 只检测游戏目录，不改任何文件
powershell -NoProfile -ExecutionPolicy Bypass -File install-player.ps1 -DetectOnly
# 静默（不询问 Y/N，供自动化）
powershell -NoProfile -ExecutionPolicy Bypass -File install-player.ps1 -Yes
# 预演
powershell -NoProfile -ExecutionPolicy Bypass -File install-player.ps1 -DryRun
```

## 4. 脚本清单

| 脚本 | 作用 |
|---|---|
| `make-test-copy.ps1` | 从原游戏生成测试副本（复制小文件+代码，`data` 用 junction；删除继承的 `.sav`） |
| `launch-game.ps1` | 带 CDP/无障碍开关启动指定游戏目录，写 PID 文件；`-Kill` 只杀自己 |
| `install-patch.ps1` | 开发版安装：备份 index.html + 复制补丁 + 注入 script 标签 + 写 manifest |
| `uninstall-patch.ps1` | 开发版卸载：从备份还原、删补丁目录与备份 |
| `install-player.ps1` | 玩家版安装/卸载（自动找目录、确认、调用上两款） |
| `install-player.cmd` / `uninstall-player.cmd` | 双击入口（ASCII 包装，中文提示由 PowerShell 输出） |

## 5. 注意

- `.ps1` 若要在 **Windows PowerShell 5.1**（玩家默认）下运行，文件必须保存为 **UTF-8 with BOM**，否则中文会被按 ANSI 解析报语法错误。本目录脚本已加 BOM；用工具改文件后请重新确认 BOM。
- 安装脚本会检查 `resources\app\index.html` 是否已含 `<!-- a11y-patch -->`，重复安装会拒绝并要求先卸载。
- 所有脚本都不联网、不上传、不改存档。
