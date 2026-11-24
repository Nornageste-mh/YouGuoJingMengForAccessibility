# 启动《游郭惊梦》并开启 CDP 调试端口（供开发/验证；不改游戏文件）
# 关键点：宿主 shell 继承的 ELECTRON_RUN_AS_NODE=1 必须清除，否则 Kaede.exe 以 Node 模式运行并以 exit 9 退出。
# 用法：
#   pwsh -File launch-game.ps1                        # 启动测试副本，端口 9335
#   pwsh -File launch-game.ps1 -GameRoot 'D:\Steam\steamapps\common\游郭惊梦' -Port 9333
#   pwsh -File launch-game.ps1 -Kill                  # 先杀掉本脚本上次拉起、同端口的进程
[CmdletBinding()]
param(
    [string]$GameRoot    = (Join-Path $PSScriptRoot '..\..\tmp\game-test'),
    [int]$Port           = 9335,
    [string]$UserDataDir = (Join-Path $PSScriptRoot '..\..\tmp\profile-launch'),
    [int]$TimeoutSec     = 40,
    [switch]$Kill
)

$ErrorActionPreference = 'Stop'
$GameRoot    = [System.IO.Path]::GetFullPath($GameRoot)
$UserDataDir = [System.IO.Path]::GetFullPath($UserDataDir)

if (-not (Test-Path (Join-Path $GameRoot 'Kaede.exe'))) {
    throw "找不到 Kaede.exe：$GameRoot（先用 make-test-copy.ps1 生成测试副本）"
}

$pidFile = Join-Path $env:TEMP "kaede-a11y-$Port.pid"
if ($Kill -and (Test-Path $pidFile)) {
    $oldPid = (Get-Content $pidFile -Raw).Trim()
    if ($oldPid -match '^\d+$') {
        Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
        Write-Host "已停止旧进程 PID=$oldPid"
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null

# 清除会给 Electron 造成 Node 模式的环境变量
$env:ELECTRON_RUN_AS_NODE = $null
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$procArgs = @(
    "--remote-debugging-port=$Port",
    '--force-renderer-accessibility',
    "--user-data-dir=$UserDataDir"
)
# 注意：本机 PowerShell 7 的 Start-Process -PassThru 启动 Kaede.exe 会无限期挂起
# （ShellExecuteEx 路径不返回；2026-11-23 verifier 实机定位，Lead 复现）。
# 用 .NET Process.Start 虽然返回快，但子进程会继承调用者可继承的 stdout/stderr 管道句柄，
# 调用方以 `pwsh -File launch-game.ps1 ... | ...` 捕获输出时会一直等 EOF（表现为脚本不返回）。
# 因此统一用 WMI Win32_Process.Create 分离启动：不继承调用者句柄表，也不带 ELECTRON_RUN_AS_NODE。
$argLine = '--remote-debugging-port=' + $Port + ' --force-renderer-accessibility --user-data-dir="' + $UserDataDir + '"'
$exePath = Join-Path $GameRoot 'Kaede.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw "找不到游戏可执行文件：$exePath" }
$wmiCmdLine = '"' + $exePath + '" ' + $argLine
$wmiResult = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = $wmiCmdLine
    CurrentDirectory = $GameRoot
}
if ($wmiResult.ReturnValue -ne 0) {
    throw "WMI 启动失败（ReturnValue=$($wmiResult.ReturnValue)）；可改用副本内手动启动"
}
$procId = [int]$wmiResult.ProcessId
Set-Content -Path $pidFile -Value $procId -Encoding ascii
Write-Host "已启动 PID=$procId，等待 CDP 端口 $Port ..."

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ready = $false
$ver = $null
while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
        throw "游戏进程已退出（PID=$procId）；检查游戏日志或启动参数"
    }
    try {
        $ver = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
        $ready = $true
        break
    }
    catch { Start-Sleep -Milliseconds 400 }
}

if (-not $ready) { throw "CDP 端口 $Port 在 $TimeoutSec 秒内未就绪（PID=$procId）" }

Write-Host "CDP 就绪：$($ver.Browser)"
$targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 5
$targets | ForEach-Object { Write-Host ("  [{0}] {1}  {2}" -f $_.type, $_.title, $_.url) }
Write-Host "PID=$procId（已写入 $pidFile）"
