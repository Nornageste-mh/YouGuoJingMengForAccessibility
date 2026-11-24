# 组装《游郭惊梦》无障碍补丁发布包（开发用）
#
# 产物：
#   out/release/youguo-jingmeng-a11y-v<Version>/
#     install-player.cmd / uninstall-player.cmd / install-player.ps1
#     install-patch.ps1 / uninstall-patch.ps1
#     a11y-patch/           补丁本体（src/patch 全量）
#     INSTALL.md / OPERATION.md / FAQ.md / NOTICE.md / LICENSE
#   out/release/youguo-jingmeng-a11y-v<Version>.zip
#   out/release/SHA256SUMS.txt
#
# 发布前检查（本脚本自动执行一部分）：
#   - src/patch/a11y-boot.js 与全部 MODULES 清单里的文件存在；
#   - 所有 js 通过 `node --check`；
#   - 安装说明中不再残留 TODO（除“已知限制”小节）；
#   - 版本号写在 patch 内 a11y-boot.js 的 VERSION 与本脚本 -Version 一致（人工核对）。
[CmdletBinding()]
param(
    [string]$Version = '0.1.0',
    [switch]$SkipNodeCheck
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$PatchSrc = Join-Path $ProjectRoot 'src\patch'
$InstallSrc = Join-Path $ProjectRoot 'src\install'
$DocTpl = Join-Path $ProjectRoot 'docs\templates'
$OutRoot = Join-Path $ProjectRoot 'out\release'
$PkgName = "youguo-jingmeng-a11y-v$Version"
$PkgDir = Join-Path $OutRoot $PkgName
$ZipPath = Join-Path $OutRoot "$PkgName.zip"

function Fail([string]$msg) { throw "[发布检查失败] $msg" }

# ---------- 1) 补丁完整性 ----------
if (-not (Test-Path (Join-Path $PatchSrc 'a11y-boot.js'))) { Fail 'src/patch/a11y-boot.js 不存在' }

$bootText = Get-Content -LiteralPath (Join-Path $PatchSrc 'a11y-boot.js') -Raw -Encoding UTF8
$m = [regex]::Match($bootText, 'var VERSION = ''([^'']+)'';')
if ($m.Success -and $m.Groups[1].Value -ne $Version) {
    Fail "a11y-boot.js VERSION=$($m.Groups[1].Value) 与 -Version $Version 不一致"
}
$modsMatch = [regex]::Match($bootText, '(?s)var MODULES = \[(.*?)\];')
if (-not $modsMatch.Success) { Fail 'a11y-boot.js 中找不到 MODULES 数组' }
foreach ($mm in [regex]::Matches($modsMatch.Groups[1].Value, "'([^']+)'")) {
    $rel = $mm.Groups[1].Value
    $f = Join-Path $PatchSrc ($rel -replace '/', '\')
    if (-not (Test-Path $f)) { Fail "MODULES 声明了 $rel 但文件不存在" }
}

# ---------- 2) JS 语法检查 ----------
if (-not $SkipNodeCheck) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { Write-Host '[warn] 未找到 node，跳过语法检查'; }
    else {
        $bad = @()
        Get-ChildItem -LiteralPath $PatchSrc -Recurse -Filter '*.js' | ForEach-Object {
            $out = & $node.Source --check $_.FullName 2>&1
            if ($LASTEXITCODE -ne 0) { $bad += "$($_.FullName): $out" }
        }
        if ($bad.Count -gt 0) { Fail ("JS 语法检查失败：`n" + ($bad -join "`n")) }
        Write-Host "JS 语法检查通过（$((Get-ChildItem -LiteralPath $PatchSrc -Recurse -Filter '*.js').Count) 个文件）"
    }
}

# ---------- 3) 组装目录 ----------
if (Test-Path $PkgDir) { Remove-Item -LiteralPath $PkgDir -Recurse -Force }
New-Item -ItemType Directory -Path $PkgDir | Out-Null

Copy-Item -LiteralPath $PatchSrc -Destination (Join-Path $PkgDir 'a11y-patch') -Recurse -Force
foreach ($f in @('install-player.ps1', 'install-player.cmd', 'uninstall-player.cmd', 'install-patch.ps1', 'uninstall-patch.ps1')) {
    $src = Join-Path $InstallSrc $f
    if (Test-Path $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $PkgDir $f) -Force }
}

# GUI 安装器（installer-eng 产物）：有则一并打包，没有则警告
$GuiExe = Join-Path $OutRoot 'gui-staging\install-youguo-a11y.exe'
if (Test-Path $GuiExe) {
    Copy-Item -LiteralPath $GuiExe -Destination (Join-Path $PkgDir 'install-youguo-a11y.exe') -Force
    Write-Host ("GUI 安装器：已打包（SHA256 " + (Get-FileHash -LiteralPath $GuiExe -Algorithm SHA256).Hash + '）')
} else {
    Write-Host '[warn] 未找到 out/release/gui-staging/install-youguo-a11y.exe，发布包暂不含 GUI 安装器'
}

# 玩家文档：把模板转成发布版文件名；TODO 数量报告给发布者
$docMap = [ordered]@{
    'install-guide.md'          = 'INSTALL.md'
    'operation-conventions.md'  = 'OPERATION.md'
    'faq.md'                    = 'FAQ.md'
}
foreach ($k in $docMap.Keys) {
    $src = Join-Path $DocTpl $k
    if (-not (Test-Path $src)) { Fail "缺少文档模板 docs/templates/$k" }
    $text = Get-Content -LiteralPath $src -Raw -Encoding UTF8
    $todoCount = ([regex]::Matches($text, 'TODO')).Count
    if ($todoCount -gt 0) { Write-Host "[warn] $k 仍有 $todoCount 处 TODO，发布前需填写" }
    Set-Content -LiteralPath (Join-Path $PkgDir $docMap[$k]) -Value $text -Encoding UTF8
}

Copy-Item -LiteralPath (Join-Path $ProjectRoot 'LICENSE') -Destination (Join-Path $PkgDir 'LICENSE') -Force -ErrorAction SilentlyContinue

$notice = @"
# NOTICE / 第三方组件与许可说明

- 本补丁为《游郭惊梦》的非官方无障碍补丁，与游戏开发商、发行商无关。
- 本补丁**不包含**任何游戏本体、剧本、图片、音频、视频或 TyranoScript/Electron 引擎文件；运行时由游戏自身提供。
- 补丁自身以 MIT 许可证发布，见同目录 LICENSE。
- 设计参考用户自有的 GalA11yForge 项目 Framework 文档，未复制其 C# 平台层代码。
- 不包含 NVDA 的 controller client DLL；朗读完全依赖玩家自己的屏幕阅读器（NVDA）。
"@
Set-Content -LiteralPath (Join-Path $PkgDir 'NOTICE.md') -Value $notice -Encoding UTF8

# ---------- 4) 校验和与压缩 ----------
if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Compress-Archive -LiteralPath $PkgDir -DestinationPath $ZipPath -CompressionLevel Optimal

$sums = Get-ChildItem -LiteralPath $OutRoot -File | Where-Object { $_.Name -match '\.(zip)$' } | ForEach-Object {
    $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    "$h  $($_.Name)"
}
$sums | Set-Content -LiteralPath (Join-Path $OutRoot 'SHA256SUMS.txt') -Encoding ASCII

Write-Host ''
Write-Host "发布包：$PkgDir"
Write-Host "压缩包：$ZipPath"
Write-Host ("SHA256：" + (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash)
Write-Host '提醒：发布前确认 INSTALL.md/OPERATION.md/FAQ.md 中 TODO 已清空、README 状态与 CHANGELOG 已更新。'
