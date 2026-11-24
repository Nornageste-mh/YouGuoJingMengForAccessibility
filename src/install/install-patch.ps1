# 安装无障碍补丁到《游郭惊梦》的 resources/app（可逆：备份 index.html + 清单）
# 用法：
#   pwsh -File install-patch.ps1                        # 安装到测试副本 tmp/game-test
#   pwsh -File install-patch.ps1 -AppDir 'D:\Steam\steamapps\common\游郭惊梦\resources\app'   # 正式安装（需用户确认）
#   pwsh -File install-patch.ps1 -AppDir ... -PatchSrc ... -DryRun
#
# 安装内容：
#   <AppDir>\a11y-patch\            补丁代码目录（从 -PatchSrc 复制）
#   <AppDir>\index.html             原文件备份为 index.html.a11y-backup，末尾插入 <!-- a11y-patch --> 脚本标签
#   <AppDir>\a11y-patch\install-manifest.json  记录版本/时间/原始 index.html 哈希，供卸载校验
[CmdletBinding()]
param(
    [string]$AppDir   = (Join-Path $PSScriptRoot '..\..\tmp\game-test\resources\app'),
    [string]$PatchSrc = (Join-Path $PSScriptRoot '..\patch'),
    [string]$Version  = '0.1.0',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$AppDir   = [System.IO.Path]::GetFullPath($AppDir)
$PatchSrc = [System.IO.Path]::GetFullPath($PatchSrc)
$indexHtml = Join-Path $AppDir 'index.html'
$backup    = Join-Path $AppDir 'index.html.a11y-backup'
$patchDir  = Join-Path $AppDir 'a11y-patch'
$manifest  = Join-Path $patchDir 'install-manifest.json'
$marker    = '<!-- a11y-patch -->'

if (-not (Test-Path $indexHtml)) { throw "找不到 index.html：$indexHtml" }
if (-not (Test-Path $PatchSrc)) { throw "找不到补丁源目录：$PatchSrc" }
$entry = Join-Path $PatchSrc 'a11y-boot.js'
if (-not (Test-Path $entry)) { throw "补丁源缺少 a11y-boot.js：$PatchSrc" }

$html = Get-Content $indexHtml -Raw -Encoding UTF8
if ($html -match [regex]::Escape($marker)) { throw "index.html 已安装过补丁（存在 $marker）；先运行 uninstall-patch.ps1" }

$snippet = @"
$marker
<script type="text/javascript" src="./a11y-patch/a11y-boot.js"></script>
<!-- /a11y-patch -->
"@

if ($html -match '</body>') {
    $newHtml = $html -replace '(?is)</body>', ($snippet + "`r`n</body>")
}
else {
    $newHtml = $html + "`r`n" + $snippet
}

Write-Host "安装目标：$AppDir"
Write-Host "补丁源：  $PatchSrc（版本 $Version）"
if ($DryRun) {
    Write-Host '[DryRun] 将执行：备份 index.html → index.html.a11y-backup；写入 a11y-patch/；追加脚本标签。'
    exit 0
}

# 1) 备份原始 index.html（只在首次安装时备份；升级时保留最初备份）
if (-not (Test-Path $backup)) {
    Copy-Item -LiteralPath $indexHtml -Destination $backup -Force
    Write-Host "已备份 index.html → index.html.a11y-backup"
}
else {
    Write-Host "已存在原始备份，保留不覆盖。"
}

# 2) 复制补丁目录（先清空旧补丁文件，保留 manifest 由下一步重写）
if (Test-Path $patchDir) { Remove-Item -LiteralPath $patchDir -Recurse -Force }
New-Item -ItemType Directory -Path $patchDir | Out-Null
Copy-Item -Path (Join-Path $PatchSrc '*') -Destination $patchDir -Recurse -Force

# 3) 写 index.html（UTF8 无 BOM）
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexHtml, $newHtml, $utf8)

# 4) 清单（含原始备份哈希，供卸载校验）
$hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
$manifestObj = [ordered]@{
    patchName    = 'youguo-jingmeng-a11y'
    patchVersion = $Version
    installedAt  = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
    patchDir     = 'a11y-patch'
    entry        = 'a11y-patch/a11y-boot.js'
    indexBackup  = 'index.html.a11y-backup'
    indexHash    = $hash
    gameApp      = $AppDir
}
$manifestObj | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host "安装完成。卸载请运行：pwsh -File uninstall-patch.ps1 -AppDir '$AppDir'"
