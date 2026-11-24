# 卸载《游郭惊梦》无障碍补丁（恢复 index.html 备份并删除 a11y-patch）
# 用法：
#   pwsh -File uninstall-patch.ps1                       # 卸载测试副本
#   pwsh -File uninstall-patch.ps1 -AppDir 'D:\Steam\steamapps\common\游郭惊梦\resources\app'
#   pwsh -File uninstall-patch.ps1 -AppDir ... -DryRun
[CmdletBinding()]
param(
    [string]$AppDir = (Join-Path $PSScriptRoot '..\..\tmp\game-test\resources\app'),
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$AppDir    = [System.IO.Path]::GetFullPath($AppDir)
$indexHtml = Join-Path $AppDir 'index.html'
$backup    = Join-Path $AppDir 'index.html.a11y-backup'
$patchDir  = Join-Path $AppDir 'a11y-patch'

if (-not (Test-Path $AppDir)) { throw "找不到游戏 app 目录：$AppDir" }

if (-not (Test-Path $backup)) {
    if (Test-Path $patchDir) { throw "存在 a11y-patch 目录但缺少 index.html.a11y-backup，无法安全卸载；请手动检查 $AppDir" }
    Write-Host '未发现已安装的补丁（无备份、无 a11y-patch 目录）。'
    exit 0
}

if ($DryRun) {
    Write-Host "[DryRun] 将恢复 index.html ← $backup，并删除 $patchDir"
    exit 0
}

# 1) 恢复 index.html
Copy-Item -LiteralPath $backup -Destination $indexHtml -Force
Write-Host '已从备份恢复 index.html'

# 2) 删除补丁目录
if (Test-Path $patchDir) {
    Remove-Item -LiteralPath $patchDir -Recurse -Force
    Write-Host '已删除 a11y-patch 目录'
}

# 3) 清理备份与临时文件（备份已由原 index.html 覆盖，可删）
Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
Write-Host '卸载完成。可重新启动游戏验证恢复原状。'
