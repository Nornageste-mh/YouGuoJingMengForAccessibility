# 生成《游郭惊梦》游戏测试副本（供补丁开发/验证，不修改 Steam 库）
# 策略：复制游戏根目录小文件与 resources/app 的代码文件；data 大目录用 junction 指向原游戏（只读使用）。
# 重要（sr-bridge 实机发现，2026-11-23）：
#   - 本作 TyranoScript 存档在游戏根目录（Kaede_tyrano_data.sav / Kaede_sf.sav），不在 userData；
#     configSave=="file" 时 profile localStorage 里存 save_key，与 .sav 内 hash 不一致会触发
#     「检测到存档位置变更…启动终止」并 boot 失败（黑屏）。
#   - 因此：① 绝不能用 --user-data-dir 隔离 profile 去跑【原始游戏目录】；② 副本必须删掉从原目录
#     复制来的 .sav（本脚本已自动删除），让副本以自己的 exe 路径 + 干净 profile 首次启动；
#     ③ 玩家正常启动（原目录 + 默认 profile）不受影响，补丁也不改启动方式。
# 用法：
#   pwsh -File make-test-copy.ps1            # 默认原游戏 -> <项目>/tmp/game-test
#   pwsh -File make-test-copy.ps1 -Force     # 已存在则删除重建
[CmdletBinding()]
param(
    [string]$GameRoot = 'D:\Steam\steamapps\common\游郭惊梦',
    [string]$Dest     = (Join-Path $PSScriptRoot '..\..\tmp\game-test'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $GameRoot 'Kaede.exe'))) {
    throw "找不到游戏根目录（Kaede.exe）：$GameRoot"
}
if (-not (Test-Path (Join-Path $GameRoot 'resources\app\index.html'))) {
    throw "找不到 resources\app\index.html：$GameRoot"
}

$Dest = [System.IO.Path]::GetFullPath($Dest)
if (Test-Path $Dest) {
    if (-not $Force) { throw "目标已存在：$Dest（用 -Force 重建）" }
    Write-Host "删除旧测试副本：$Dest"
    Remove-Item -LiteralPath $Dest -Recurse -Force
}

New-Item -ItemType Directory -Path $Dest | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Dest 'resources') | Out-Null

Write-Host '复制游戏根目录文件...'
# 根目录只复制文件（exe/dll/pak/bin/dat 等）与 locales/swiftshader 目录；resources 单独处理
Get-ChildItem -LiteralPath $GameRoot -Force | ForEach-Object {
    if ($_.PSIsContainer) {
        if ($_.Name -in @('resources', 'locales', 'swiftshader')) {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dest $_.Name) -Recurse -Force
        }
    }
    else {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dest $_.Name) -Force
    }
}

Write-Host '复制 resources 根文件...'
$origRes = Join-Path $GameRoot 'resources'
$newRes  = Join-Path $Dest 'resources'
Get-ChildItem -LiteralPath $origRes -Force | ForEach-Object {
    if (-not $_.PSIsContainer) {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $newRes $_.Name) -Force
    }
}

Write-Host '复制 resources/app 代码文件（data 目录用 junction）...'
$origApp = Join-Path $origRes 'app'
$newApp  = Join-Path $newRes 'app'
New-Item -ItemType Directory -Path $newApp | Out-Null
Get-ChildItem -LiteralPath $origApp -Force | ForEach-Object {
    if ($_.Name -eq 'data') { return }
    if ($_.PSIsContainer) {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $newApp $_.Name) -Recurse -Force
    }
    else {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $newApp $_.Name) -Force
    }
}
$dataLink = Join-Path $newApp 'data'
cmd /c mklink /J "$dataLink" "$(Join-Path $origApp 'data')" | Out-Null
if (-not (Test-Path (Join-Path $dataLink 'scenario'))) { throw "data junction 创建失败：$dataLink" }

# 如果源目录已经装过补丁（玩家本机测试时会发生），副本必须回到干净未安装状态：
# 优先用备份还原 index.html；否则删除注入标记块；随后删除 a11y-patch 目录与备份。
$newIndex = Join-Path $newApp 'index.html'
$newBackup = Join-Path $newApp 'index.html.a11y-backup'
if (Test-Path $newBackup) {
    Copy-Item -LiteralPath $newBackup -Destination $newIndex -Force
    Remove-Item -LiteralPath $newBackup -Force
    Write-Host '副本内发现已安装补丁：已用 index.html.a11y-backup 还原为原版'
}
elseif (Test-Path $newIndex) {
    $idxText = Get-Content -LiteralPath $newIndex -Raw
    if ($idxText -match 'a11y-patch') {
        $clean = [regex]::Replace($idxText, '(?s)<!--\s*a11y-patch\s*-->.*?<!--\s*/a11y-patch\s*-->\s*', '')
        Set-Content -LiteralPath $newIndex -Value $clean -Encoding UTF8 -NoNewline
        Write-Host '副本内发现已安装补丁标记：已移除注入块（无备份可还原）'
    }
}
$inheritedPatchDir = Join-Path $newApp 'a11y-patch'
if (Test-Path $inheritedPatchDir) {
    Remove-Item -LiteralPath $inheritedPatchDir -Recurse -Force
    Write-Host '已删除副本内继承的 a11y-patch 目录（副本应为未安装状态）'
}

# 删除从原目录复制来的存档文件：副本必须是干净状态（否则副本 profile 无 save_key 会触发反篡改/继承用户存档）
$savFiles = @(Get-ChildItem -LiteralPath $Dest -File -Filter '*.sav' -Force -ErrorAction SilentlyContinue)
foreach ($s in $savFiles) {
    Remove-Item -LiteralPath $s.FullName -Force
    Write-Host "已删除副本内继承的存档：$($s.Name)"
}

$sizeMB = [math]::Round(((Get-ChildItem $Dest -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host ''
Write-Host "测试副本已生成：$Dest"
Write-Host "副本文件体积约 $sizeMB MB（data 为 junction，不重复占用空间）"
Write-Host "启动：launch-game.ps1 -GameDir '$Dest' -Port 9336 -Profile '<项目>\tmp\profile-xxx'"
Write-Host "注意：存档落在副本根目录（Kaede_*.sav）；每个并行实例用独立副本 + 独立 profile，禁止对原始游戏目录做隔离 profile 启动。"
