# 《游郭惊梦》无障碍补丁 · 玩家安装/卸载器
#
# 用法（玩家）：
#   双击 install-player.cmd            —— 自动查找游戏目录并安装
#   双击 uninstall-player.cmd          —— 自动查找游戏目录并卸载
# 或手动：
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-player.ps1 -GameDir "D:\Steam\steamapps\common\游郭惊梦"
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-player.ps1 -Uninstall
#
# 设计原则：
#   - 不联网、不写入游戏资源以外的位置（补丁仅落在 resources\app\a11y-patch\ 并改一行 index.html）；
#   - 安装前备份 index.html，卸载时完整还原；不触碰存档、设置与任何游戏资源；
#   - 找不到/不确定游戏目录时要求显式 -GameDir，不做猜测性写入。
[CmdletBinding()]
param(
    [string]$GameDir,
    [string]$PatchVersion = '0.1.0',
    [switch]$Uninstall,
    [switch]$Yes,
    [switch]$DryRun,
    [switch]$DetectOnly
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) { Write-Host "  $Text" }

# ---------- 1) 定位游戏目录 ----------
function Find-GameDir([string]$Explicit) {
    if ($Explicit) {
        $p = [System.IO.Path]::GetFullPath($Explicit)
        if (Test-Path (Join-Path $p 'resources\app\index.html')) { return $p }
        throw "指定的游戏目录无效（缺 resources\app\index.html）：$p"
    }

    $steamRoots = @()
    $regPaths = @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')
    foreach ($rp in $regPaths) {
        $item = Get-ItemProperty -LiteralPath $rp -ErrorAction SilentlyContinue
        if ($item) {
            if ($item.SteamPath) { $steamRoots += $item.SteamPath }
            if ($item.InstallPath) { $steamRoots += $item.InstallPath }
        }
    }
    $steamRoots = $steamRoots | Select-Object -Unique | Where-Object { Test-Path $_ }

    $libraries = @()
    foreach ($root in $steamRoots) {
        $libraries += $root
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            $text = Get-Content -LiteralPath $vdf -Raw -Encoding UTF8
            foreach ($m in [regex]::Matches($text, '"path"\s+"([^"]+)"')) {
                $lib = $m.Groups[1].Value -replace '\\\\', '\'
                if (Test-Path $lib) { $libraries += $lib }
            }
        }
    }
    $libraries = $libraries | Select-Object -Unique

    $hits = @()
    foreach ($lib in $libraries) {
        $common = Join-Path $lib 'steamapps\common'
        if (-not (Test-Path $common)) { continue }
        $direct = Join-Path $common '游郭惊梦'
        if (Test-Path (Join-Path $direct 'resources\app\index.html')) { $hits += $direct }
        Get-ChildItem -LiteralPath $common -Directory -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -like '*游郭惊梦*' -and (Test-Path (Join-Path $_.FullName 'resources\app\index.html'))
        } | ForEach-Object { $hits += $_.FullName }
    }
    $hits = $hits | Select-Object -Unique

    # 同一个目录可能经注册表/ libraryfolders/ 目录扫描以不同大小写重复命中，按不区分大小写去重
    $seen = @{}
    $hits = @(foreach ($h in $hits) {
        $k = $h.Replace('/', '\').TrimEnd('\').ToLowerInvariant()
        if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $h }
    })

    if ($hits.Count -eq 1) { return $hits[0] }
    if ($hits.Count -gt 1) {
        Write-Host '找到多个候选游戏目录：'
        for ($i = 0; $i -lt $hits.Count; $i++) { Write-Host ("  [{0}] {1}" -f ($i + 1), $hits[$i]) }
        throw '请用 -GameDir 显式指定要安装的目录。'
    }
    throw '未能自动找到《游郭惊梦》安装目录（Steam 库可能不在默认位置）。请用 -GameDir 指定游戏根目录（包含 Kaede.exe 的目录）。'
}

# ---------- 2) 本脚本所在包内定位补丁源 ----------
function Find-PatchSrc {
    $candidates = @(
        (Join-Path $PSScriptRoot 'a11y-patch'),
        (Join-Path $PSScriptRoot '..\patch'),
        (Join-Path $PSScriptRoot 'patch')
    )
    foreach ($c in $candidates) {
        $full = [System.IO.Path]::GetFullPath($c)
        if (Test-Path (Join-Path $full 'a11y-boot.js')) { return $full }
    }
    throw '发布包不完整：找不到 a11y-boot.js（应在包内 a11y-patch\ 目录）。请重新解压完整压缩包。'
}

function Get-ScriptPath([string]$Name) {
    $local = Join-Path $PSScriptRoot $Name
    if (Test-Path $local) { return $local }
    throw "发布包不完整：缺少 $Name"
}

# ---------- 3) 主流程 ----------
$gameDir = Find-GameDir $GameDir
$appDir = Join-Path $gameDir 'resources\app'

if ($DetectOnly) {
    Write-Host "游戏目录：$gameDir"
    Write-Host "App 目录：$appDir"
    exit 0
}

$patchSrc = Find-PatchSrc

Write-Host ''
Write-Host '=== 《游郭惊梦》无障碍补丁 ==='
Write-Host "游戏目录：$gameDir"
if (-not $Uninstall) {
    Write-Host "补丁版本：$PatchVersion"
    Write-Host "补丁文件：$patchSrc"
}
Write-Host ''

$running = @(Get-Process -Name 'Kaede' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0 -and -not $DryRun) {
    throw "游戏正在运行（Kaede 进程 $($running.Count) 个）。请先关闭游戏（含 Steam 中显示运行中的残留进程）再操作。"
}

if ($Uninstall) {
    $script = Get-ScriptPath 'uninstall-patch.ps1'
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script, '-AppDir', $appDir)
    if ($DryRun) { $argv += '-DryRun' }
} else {
    $script = Get-ScriptPath 'install-patch.ps1'
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script, '-AppDir', $appDir, '-PatchSrc', $patchSrc, '-Version', $PatchVersion)
    if ($DryRun) { $argv += '-DryRun' }
}

if (-not $Yes -and -not $DryRun) {
    $action = if ($Uninstall) { '卸载' } else { '安装' }
    $answer = Read-Host "即将对上述目录执行【$action】。输入 Y 确认，其它任意键取消"
    if ($answer -notmatch '^[Yy]') { Write-Host '已取消。'; exit 0 }
}

$ps = (Get-Command powershell.exe -ErrorAction SilentlyContinue)
if (-not $ps) { throw '找不到 powershell.exe（Windows PowerShell 5.1）。' }

& $ps.Source @argv
if ($LASTEXITCODE -ne 0) { throw "脚本执行失败（退出码 $LASTEXITCODE）：$script" }

Write-Host ''
if ($Uninstall) {
    Write-Host '卸载完成。可直接启动游戏。'
} else {
    Write-Host '安装完成。'
    Write-Host '请启动游戏：先确认 NVDA 已运行；进入标题页后用 ↑/↓ 移动、Enter 打开菜单、Backspace 重读。'
    Write-Host '如需卸载：再次运行 uninstall-player.cmd。'
}
