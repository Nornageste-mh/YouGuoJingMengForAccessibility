#Requires -Version 5.1
<#
.SYNOPSIS
    《游郭惊梦》无障碍补丁 GUI 安装器 —— CLI 自测脚本。

.DESCRIPTION
    在项目 tmp 目录内生成测试用游戏副本（绝不触碰真实 Steam 目录），然后对
    out\release\gui-staging\install-youguo-a11y.exe 运行全部 CLI 用例：

      detect / status(未安装) / install / status(已安装) / 重复 install 拒绝 /
      uninstall / status(已安装) / 再次 uninstall / 非法目录 / 缺补丁源 /
      resources\app 形式目录 / 备份缺失的异常状态 / Kaede 运行门禁 /
      非法参数 / --version / --help

    结果写入 out\evidence\installer-gui-selftest-<时间戳>.json（断言级证据）。

.PARAMETER Dest
    测试副本目录，默认 tmp\gui-test。必须位于项目目录内。

.PARAMETER SkipBuild
    跳过 build.ps1（直接用现有 EXE 测试）。

.EXAMPLE
    pwsh -File src\installer-gui\selftest.ps1
#>
[CmdletBinding()]
param(
    [string]$Dest = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
try { $OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

# ================================================================ 路径与常量
$scriptDir = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
$releaseExe = Join-Path $projectRoot 'out\release\gui-staging\install-youguo-a11y.exe'
$releasePatch = Join-Path $projectRoot 'out\release\youguo-jingmeng-a11y-v0.1.0\a11y-patch'
$srcPatch = Join-Path $projectRoot 'src\patch'
$workDir = Join-Path $projectRoot 'tmp\gui-selftest'
$binDir = Join-Path $workDir 'bin'
$binNoPatchDir = Join-Path $workDir 'bin-nopatch'
$evidenceDir = Join-Path $projectRoot 'out\evidence'
$expectedSha = 'C4D26A95C41AD67412AE4D0D228F1C5CA1CE2B841775573DC93CD0D56BD94E99'
$realGame = 'D:\Steam\steamapps\common\游郭惊梦'
$realGameIndex = Join-Path $realGame 'resources\app\index.html'

if (-not $Dest) {
    $Dest = Join-Path $projectRoot 'tmp\gui-test'
}
$testGame = [System.IO.Path]::GetFullPath($Dest)
if (-not $testGame.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "安全限制：测试副本必须位于项目目录内（$projectRoot），当前为 $testGame"
}
if ($testGame -like 'D:\Steam*') {
    throw "安全限制：禁止对真实 Steam 游戏目录运行自测：$testGame"
}

$script:appDir = Join-Path $testGame 'resources\app'
$script:indexPath = Join-Path $script:appDir 'index.html'
$script:backupPath = Join-Path $script:appDir 'index.html.a11y-backup'
$script:patchDirPath = Join-Path $script:appDir 'a11y-patch'
$script:manifestPath = Join-Path $script:patchDirPath 'install-manifest.json'
$script:originalIndexCopy = Join-Path $workDir 'original-index.html'
$script:binExe = Join-Path $binDir 'install-youguo-a11y.exe'
$script:binNoPatchExe = Join-Path $binNoPatchDir 'install-youguo-a11y.exe'
$script:expectedSha = $expectedSha
$script:binPatchDir = Join-Path $binDir 'a11y-patch'

$script:cases = New-Object System.Collections.ArrayList
$script:current = $null

$script:realGameShaBefore = $null
if (Test-Path -LiteralPath $realGameIndex) {
    $script:realGameShaBefore = (Get-FileHash -LiteralPath $realGameIndex -Algorithm SHA256).Hash
}

# ================================================================ 断言辅助
function Add-Assertion {
    param([string]$Name, [bool]$Pass, [string]$Expected = '', [string]$Actual = '')
    if ($null -eq $script:current) { throw 'Add-Assertion 必须在用例内调用' }
    [void]$script:current.assertions.Add([pscustomobject]@{
            name     = $Name
            pass     = [bool]$Pass
            expected = [string]$Expected
            actual   = [string]$Actual
        })
}

function Assert-Equal {
    param([string]$Name, $Expected, $Actual)
    Add-Assertion -Name $Name -Pass ([string]$Expected -eq [string]$Actual) `
        -Expected ([string]$Expected) -Actual ([string]$Actual)
}

function Assert-True {
    param([string]$Name, [bool]$Condition, [string]$Expected = 'true', [string]$Actual = '')
    Add-Assertion -Name $Name -Pass $Condition -Expected $Expected -Actual $Actual
}

function Assert-Match {
    param([string]$Name, [string]$Pattern, [string]$Text)
    $ok = ($Text -match $Pattern)
    $expected = 'match /' + $Pattern + '/'
    $actual = if ($ok) { 'matched' } else { 'not matched' }
    Add-Assertion -Name $Name -Pass $ok -Expected $expected -Actual $actual
}

function Get-IndexStats {
    param([string]$Path)
    $text = [System.IO.File]::ReadAllText($Path)
    return [pscustomobject]@{
        text   = $text
        open   = ([regex]::Matches($text, [regex]::Escape('<!-- a11y-patch -->'))).Count
        close  = ([regex]::Matches($text, [regex]::Escape('<!-- /a11y-patch -->'))).Count
        script = ([regex]::Matches($text, [regex]::Escape('a11y-patch/a11y-boot.js'))).Count
    }
}

function Get-Sha256OrNull {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

# ================================================================ 用例执行
function Run-Case {
    param(
        [string]$Name,
        [string]$ExePath,
        [string[]]$Arguments = @(),
        [int]$ExpectedExit = 0,
        [scriptblock]$Verify = $null
    )
    Write-Host ''
    Write-Host ('== 用例：' + $Name)

    $script:current = [ordered]@{
        name           = $Name
        executable     = $ExePath
        arguments      = @($Arguments)
        expectedExit   = $ExpectedExit
        exitCode       = $null
        output         = ''
        assertions     = New-Object System.Collections.ArrayList
        passed         = $false
    }
    $started = Get-Date
    $output = ''
    try {
        $output = & $ExePath @Arguments 2>&1 | Out-String
        $exit = $LASTEXITCODE
    }
    catch {
        $output = 'EXCEPTION: ' + $_.Exception.Message
        $exit = -1
    }
    $script:current.exitCode = $exit
    $script:current.output = $output.TrimEnd()
    Write-Host ("   退出码=$exit 期望=$ExpectedExit")

    Assert-Equal 'CLI 退出码' $ExpectedExit $exit
    if ($Verify) { & $Verify $output }

    $failed = @($script:current.assertions | Where-Object { -not $_.pass }).Count
    $script:current.passed = ($failed -eq 0)
    $script:current.durationMs = [int]((Get-Date) - $started).TotalMilliseconds
    foreach ($assertion in $script:current.assertions) {
        if ($assertion.pass) {
            Write-Host ('   [PASS] ' + $assertion.name)
        }
        else {
            Write-Host ('   [FAIL] ' + $assertion.name + '  期望=' + $assertion.expected + '  实际=' + $assertion.actual)
        }
    }
    [void]$script:cases.Add([pscustomobject]$script:current)
    $script:current = $null
    return ($failed -eq 0)
}

# ================================================================ 准备环境
Write-Host '============================================================'
Write-Host '《游郭惊梦》无障碍补丁安装器 —— CLI 自测'
Write-Host '============================================================'

$runningKaede = @(Get-Process -Name Kaede -ErrorAction SilentlyContinue)
if ($runningKaede.Count -gt 0) {
    throw ('检测到 Kaede 进程正在运行（PID: ' + (($runningKaede | ForEach-Object { $_.Id }) -join ', ') +
        '）。请先完全退出游戏，再运行自测。')
}

if (-not $SkipBuild) {
    Write-Host ''
    Write-Host '-- 编译 EXE'
    & (Join-Path $scriptDir 'build.ps1')
}
if (-not (Test-Path -LiteralPath $releaseExe)) {
    throw "找不到编译产物：$releaseExe（可去掉 -SkipBuild 重新编译）"
}

# EXE + 补丁源 → bin 目录（模拟发布包解压后的结构）
foreach ($dir in @($binDir, $binNoPatchDir, $evidenceDir)) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
Copy-Item -LiteralPath $releaseExe -Destination $script:binExe -Force
Copy-Item -LiteralPath $releaseExe -Destination $script:binNoPatchExe -Force
if (Test-Path -LiteralPath $script:binPatchDir) { Remove-Item -LiteralPath $script:binPatchDir -Recurse -Force }
$patchSourceDir = $null
if (Test-Path -LiteralPath (Join-Path $releasePatch 'a11y-boot.js')) { $patchSourceDir = $releasePatch }
elseif (Test-Path -LiteralPath (Join-Path $srcPatch 'a11y-boot.js')) { $patchSourceDir = $srcPatch }
if (-not $patchSourceDir) { throw '找不到补丁源（release 包或 src\patch 中的 a11y-patch）' }
Copy-Item -LiteralPath $patchSourceDir -Destination $script:binPatchDir -Recurse -Force
$patchFileCount = @(Get-ChildItem -LiteralPath $script:binPatchDir -Recurse -File).Count
if (-not (Test-Path -LiteralPath (Join-Path $script:binPatchDir 'a11y-boot.js'))) {
    throw '补丁源缺少 a11y-boot.js'
}

# 测试副本
Write-Host ''
Write-Host ('-- 生成测试副本：' + $testGame)
Push-Location $projectRoot
try {
    & (Join-Path $projectRoot 'src\install\make-test-copy.ps1') -Dest $testGame -Force
}
finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $script:indexPath)) { throw "测试副本缺少 index.html：$($script:indexPath)" }

# 还原为「未安装补丁」的原状（真实游戏已装旧补丁，副本会继承；只操作副本）
Write-Host '-- 把测试副本还原为原始未安装状态'
if (Test-Path -LiteralPath $script:backupPath) {
    Copy-Item -LiteralPath $script:backupPath -Destination $script:indexPath -Force
    Remove-Item -LiteralPath $script:backupPath -Force
}
if (Test-Path -LiteralPath $script:patchDirPath) {
    Remove-Item -LiteralPath $script:patchDirPath -Recurse -Force
}
$pristineSha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
if ($pristineSha -ne $expectedSha) {
    throw "测试副本还原失败：index.html SHA256=$pristineSha，期望 $expectedSha"
}
Copy-Item -LiteralPath $script:indexPath -Destination $script:originalIndexCopy -Force
Write-Host ('   index.html SHA256 = ' + $pristineSha + '（与原始版一致）')

# ================================================================ 用例 1：detect
Run-Case -Name 'detect 自动定位游戏目录' -ExePath $script:binExe -Arguments @('--detect') -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '识别补丁版本 0.1.0' '补丁版本：0\.1\.0' $out
    Assert-Match '输出自动找到的游戏目录' '游戏目录：' $out
    Assert-Match '输出 App 目录' 'App 目录：.*resources\\app' $out
    Assert-Match 'Steam 检测命中《游郭惊梦》' '游郭惊梦' $out
}

# ================================================================ 用例 2：status 未安装
Run-Case -Name 'status 未安装（原始副本）' -ExePath $script:binExe -Arguments @('--status', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '状态为未安装' '安装状态：未安装' $out
    Assert-Match 'state: not-installed' 'state: not-installed' $out
    $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-Equal 'index.html SHA256 为原始值' $script:expectedSha $sha
}

# ================================================================ 用例 3：install
$afterInstallSha = $null
Run-Case -Name 'install 安装补丁' -ExePath $script:binExe -Arguments @('--install', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出安装完成' '安装完成' $out
    Assert-Match '输出补丁版本 0.1.0' '补丁源：.*0\.1\.0' $out

    # 标记 3 处：开标记 / script 标签 / 闭标记各 1 处
    $stats = Get-IndexStats -Path $script:indexPath
    Assert-Equal '开标记 <!-- a11y-patch --> 数量' 1 $stats.open
    Assert-Equal '脚本标签 a11y-patch/a11y-boot.js 数量' 1 $stats.script
    Assert-Equal '闭标记 <!-- /a11y-patch --> 数量' 1 $stats.close
    Assert-Equal '注入标记合计 3 处' 3 ($stats.open + $stats.script + $stats.close)
    Assert-Match '脚本标签位于 </body> 之前' '(?is)<!-- a11y-patch -->\s*<script[^>]*a11y-patch/a11y-boot\.js[^>]*></script>\s*<!-- /a11y-patch -->\s*</body>' $stats.text

    # 备份
    Assert-True '原始备份 index.html.a11y-backup 存在' (Test-Path -LiteralPath $script:backupPath)
    $backupSha = Get-Sha256OrNull -Path $script:backupPath
    Assert-Equal '备份 SHA256 与原 index.html 一致' $script:expectedSha $backupSha
    $newSha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-True 'index.html 已被修改（hash 变化）' ($newSha -ne $script:expectedSha) $script:expectedSha $newSha
    $script:afterInstallSha = $newSha

    # 补丁目录与清单
    Assert-True 'a11y-patch 目录已复制' (Test-Path -LiteralPath $script:patchDirPath)
    Assert-True 'a11y-boot.js 入口存在' (Test-Path -LiteralPath (Join-Path $script:patchDirPath 'a11y-boot.js'))
    Assert-True 'install-manifest.json 存在' (Test-Path -LiteralPath $script:manifestPath)
    Assert-Equal '补丁文件数量与源一致' $patchFileCount (@(Get-ChildItem -LiteralPath $script:patchDirPath -Recurse -File).Count)

    if (Test-Path -LiteralPath $script:manifestPath) {
        $manifestText = [System.IO.File]::ReadAllText($script:manifestPath)
        $manifest = $null
        try { $manifest = $manifestText | ConvertFrom-Json }
        catch { Add-Assertion -Name 'manifest 是合法 JSON' -Pass $false -Expected 'valid json' -Actual $_.Exception.Message }
        if ($manifest) {
            Assert-Equal 'manifest.patchName' 'youguo-jingmeng-a11y' $manifest.patchName
            Assert-Equal 'manifest.patchVersion' '0.1.0' $manifest.patchVersion
            Assert-Equal 'manifest.patchDir' 'a11y-patch' $manifest.patchDir
            Assert-Equal 'manifest.entry' 'a11y-patch/a11y-boot.js' $manifest.entry
            Assert-Equal 'manifest.indexBackup' 'index.html.a11y-backup' $manifest.indexBackup
            Assert-Equal 'manifest.indexHash 为原始 SHA256' $script:expectedSha ($manifest.indexHash).ToUpperInvariant()
            Assert-Match 'manifest.installedAt 为 ISO8601+时区' '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$' ([string]$manifest.installedAt)
            Assert-Equal 'manifest.gameApp 指向 App 目录' ([System.IO.Path]::GetFullPath($script:appDir)) ([System.IO.Path]::GetFullPath([string]$manifest.gameApp))
        }
    }
}

# ================================================================ 用例 4：status 已安装
Run-Case -Name 'status 已安装 0.1.0' -ExePath $script:binExe -Arguments @('--status', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '状态为已安装 0.1.0' '安装状态：已安装 0\.1\.0' $out
    Assert-Match 'state: installed' 'state: installed' $out
    Assert-Match 'version: 0.1.0' 'version: 0\.1\.0' $out
    Assert-Match '标记 1 处（开标记口径）' '注入标记：1 处' $out
}

# ================================================================ 用例 5：重复 install 拒绝
Run-Case -Name '重复 install 应拒绝' -ExePath $script:binExe -Arguments @('--install', $testGame) -ExpectedExit 2 -Verify {
    param($out)
    Assert-Match '错误提示已安装/不能重复' '已安装补丁|不能重复安装' $out
    $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-Equal '重复安装后 index.html 未改变' $script:afterInstallSha $sha
    $stats = Get-IndexStats -Path $script:indexPath
    Assert-Equal '重复安装后标记仍为 1 处（未叠加）' 1 $stats.open
}

# ================================================================ 用例 6：uninstall
Run-Case -Name 'uninstall 卸载补丁' -ExePath $script:binExe -Arguments @('--uninstall', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出卸载完成' '卸载完成' $out
    $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-Equal 'index.html SHA256 已还原为原始值' $script:expectedSha $sha
    Assert-True 'a11y-patch 目录已删除' (-not (Test-Path -LiteralPath $script:patchDirPath))
    Assert-True '原始备份已删除' (-not (Test-Path -LiteralPath $script:backupPath))
    $stats = Get-IndexStats -Path $script:indexPath
    Assert-Equal '卸载后不再有注入标记' 0 $stats.open
}

# ================================================================ 用例 7：status 卸载后
Run-Case -Name 'status 卸载后为未安装' -ExePath $script:binExe -Arguments @('--status', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '状态为未安装' '安装状态：未安装' $out
    Assert-Match 'state: not-installed' 'state: not-installed' $out
}

# ================================================================ 用例 8：再次 uninstall
Run-Case -Name '再次 uninstall 应幂等成功' -ExePath $script:binExe -Arguments @('--uninstall', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '提示未发现已安装的补丁' '未发现已安装的补丁' $out
    Assert-Match 'changed: false' 'changed: false' $out
}

# ================================================================ 用例 9：非法目录
$emptyDir = Join-Path $workDir 'empty-game'
if (-not (Test-Path -LiteralPath $emptyDir)) { New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null }
Run-Case -Name 'status 非法目录应报错' -ExePath $script:binExe -Arguments @('--status', $emptyDir) -ExpectedExit 2 -Verify {
    param($out)
    Assert-Match '错误提示目录无效' '游戏目录无效' $out
}

# ================================================================ 用例 10：缺补丁源
Run-Case -Name 'install 缺补丁源应报错' -ExePath $script:binNoPatchExe -Arguments @('--install', $testGame) -ExpectedExit 2 -Verify {
    param($out)
    Assert-Match '错误提示找不到补丁文件' '找不到补丁文件' $out
    Assert-Match '提示把 EXE 放在发布包目录' 'a11y-patch' $out
    $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-Equal '缺补丁源时未修改 index.html' $script:expectedSha $sha
}

# ================================================================ 用例 11：resources\app 形式的目录
$appDirPath = $script:appDir
Run-Case -Name 'install 使用 resources\app 目录形式' -ExePath $script:binExe -Arguments @('--install', $appDirPath) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出安装完成' '安装完成' $out
    Assert-Match 'App 目录识别正确' 'App 目录：' $out
}
Run-Case -Name 'uninstall 使用 resources\app 目录形式' -ExePath $script:binExe -Arguments @('--uninstall', $appDirPath) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出卸载完成' '卸载完成' $out
    $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
    Assert-Equal 'index.html 已还原' $script:expectedSha $sha
}

# ================================================================ 用例 12：备份缺失的异常状态
$installAgain = Run-Case -Name 'install 再次安装（为异常状态测试做准备）' -ExePath $script:binExe -Arguments @('--install', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出安装完成' '安装完成' $out
}
if (Test-Path -LiteralPath $script:backupPath) { Remove-Item -LiteralPath $script:backupPath -Force }
Run-Case -Name 'status 备份缺失应显示异常' -ExePath $script:binExe -Arguments @('--status', $testGame) -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '状态为异常 broken' 'state: broken' $out
    Assert-Match '提示缺少原始备份' '缺少原始备份' $out
}
Run-Case -Name 'uninstall 备份缺失应拒绝' -ExePath $script:binExe -Arguments @('--uninstall', $testGame) -ExpectedExit 2 -Verify {
    param($out)
    Assert-Match '错误提示无法安全卸载' '无法安全卸载' $out
    Assert-Match '建议 Steam 验证文件完整性' '验证文件完整性' $out
}
# 手工清理异常状态（用先前保存的原始副本还原）
Copy-Item -LiteralPath $script:originalIndexCopy -Destination $script:indexPath -Force
if (Test-Path -LiteralPath $script:patchDirPath) { Remove-Item -LiteralPath $script:patchDirPath -Recurse -Force }
if (Test-Path -LiteralPath $script:backupPath) { Remove-Item -LiteralPath $script:backupPath -Force }

# ================================================================ 用例 13：Kaede 运行门禁
$fakeKaedeProc = $null
$fakeDir = Join-Path $workDir 'fake-kaede'
try {
    if (-not (Test-Path -LiteralPath $fakeDir)) { New-Item -ItemType Directory -Path $fakeDir -Force | Out-Null }
    $fakeKaede = Join-Path $fakeDir 'Kaede.exe'
    Copy-Item -LiteralPath $env:ComSpec -Destination $fakeKaede -Force
    Write-Host ''
    Write-Host '-- 启动假 Kaede 进程用于验证「游戏运行中拒绝操作」门禁（测试后立即按 PID 结束）'
    $fakeKaedeProc = Start-Process -FilePath $fakeKaede -ArgumentList '/c', 'ping -n 6 127.0.0.1 >nul' -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 500

    Run-Case -Name 'install 游戏运行中应拒绝' -ExePath $script:binExe -Arguments @('--install', $testGame) -ExpectedExit 2 -Verify {
        param($out)
        Assert-Match '错误提示游戏正在运行' '游戏正在运行' $out
        $sha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
        Assert-Equal '拒绝时未修改 index.html' $script:expectedSha $sha
        Assert-True '拒绝时未复制补丁目录' (-not (Test-Path -LiteralPath $script:patchDirPath))
    }
}
finally {
    if ($fakeKaedeProc) {
        try {
            if (-not $fakeKaedeProc.HasExited) { Stop-Process -Id $fakeKaedeProc.Id -Force -ErrorAction SilentlyContinue }
            $fakeKaedeProc.WaitForExit(3000) | Out-Null
        }
        catch { }
        Write-Host ('-- 已结束假 Kaede 进程（PID ' + $fakeKaedeProc.Id + '）')
    }
}

# ================================================================ 用例 14：非法参数 / 版本 / 帮助
Run-Case -Name '非法参数应报错' -ExePath $script:binExe -Arguments @('--bogus') -ExpectedExit 2 -Verify {
    param($out)
    Assert-Match '错误提示无法识别的参数' '无法识别的参数' $out
}
Run-Case -Name '--version' -ExePath $script:binExe -Arguments @('--version') -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出 EXE 版本 0.1.0' 'EXE 版本：0\.1\.0' $out
    Assert-Match '输出补丁版本 0.1.0' '补丁版本：0\.1\.0' $out
}
Run-Case -Name '--help' -ExePath $script:binExe -Arguments @('--help') -ExpectedExit 0 -Verify {
    param($out)
    Assert-Match '输出用法说明' '用法：' $out
    Assert-Match '说明退出码' '退出码' $out
}

# ================================================================ 收尾校验
Write-Host ''
Write-Host '-- 收尾校验'
$finalSha = (Get-FileHash -LiteralPath $script:indexPath -Algorithm SHA256).Hash
$finalPristine = ($finalSha -eq $expectedSha)
Write-Host ('   测试副本最终 index.html SHA256 = ' + $finalSha)
$realGameShaAfter = $null
if (Test-Path -LiteralPath $realGameIndex) {
    $realGameShaAfter = (Get-FileHash -LiteralPath $realGameIndex -Algorithm SHA256).Hash
}

# ================================================================ 汇总
$total = $script:cases.Count
$passed = @($script:cases | Where-Object { $_.passed }).Count
$failed = $total - $passed
$result = if ($failed -eq 0) { 'PASS' } else { 'FAIL' }

$exeInfo = Get-Item -LiteralPath $releaseExe
$exeSha = (Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash
$evidence = [ordered]@{
    generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ssK')
    tool        = 'src/installer-gui/selftest.ps1'
    host        = [ordered]@{
        psVersion = $PSVersionTable.PSVersion.ToString()
        os        = [System.Environment]::OSVersion.VersionString
        csc       = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    }
    exe         = [ordered]@{
        path    = $releaseExe
        size    = $exeInfo.Length
        sha256  = $exeSha
        version = '0.1.0'
    }
    patchSource = [ordered]@{
        dir       = $script:binPatchDir
        from      = $patchSourceDir
        fileCount = $patchFileCount
        version   = '0.1.0'
    }
    testCopy    = [ordered]@{
        gameDir             = $testGame
        appDir              = $script:appDir
        originalIndexSha256 = $expectedSha
        finalIndexSha256    = $finalSha
        finalPristine       = $finalPristine
    }
    realGame    = [ordered]@{
        path             = $realGame
        indexSha256Before = $script:realGameShaBefore
        indexSha256After  = $realGameShaAfter
        untouched         = ($script:realGameShaBefore -eq $realGameShaAfter)
    }
    cases       = @($script:cases)
    summary     = [ordered]@{
        total  = $total
        passed = $passed
        failed = $failed
        result = $result
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidencePath = Join-Path $evidenceDir ('installer-gui-selftest-' + $timestamp + '.json')
$json = $evidence | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($evidencePath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '============================================================'
Write-Host ('结果：' + $result + '   用例 ' + $passed + '/' + $total + ' 通过')
if ($failed -gt 0) {
    Write-Host '失败用例：'
    foreach ($case in @($script:cases | Where-Object { -not $_.passed })) {
        Write-Host ('  - ' + $case.name + '（exit=' + $case.exitCode + '）')
        foreach ($assertion in @($case.assertions | Where-Object { -not $_.pass })) {
            Write-Host ('      [FAIL] ' + $assertion.name + ' 期望=' + $assertion.expected + ' 实际=' + $assertion.actual)
        }
    }
}
if (-not $finalPristine) { Write-Host '警告：测试副本最终未恢复原始状态。' }
if ($script:realGameShaBefore -ne $realGameShaAfter) {
    Write-Host '警告：真实游戏目录的 index.html 发生了变化（自测本不应触碰它）。'
}
Write-Host ('证据文件：' + $evidencePath)
Write-Host '============================================================'

if ($failed -gt 0) { exit 1 }
exit 0
