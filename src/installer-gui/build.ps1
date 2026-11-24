#Requires -Version 5.1
<#
.SYNOPSIS
    编译《游郭惊梦》无障碍补丁安装器（单文件 WinForms EXE，无需 .NET 运行时安装）。

.DESCRIPTION
    使用 Windows 自带 .NET Framework 4.8 的 csc.exe 编译，产出单个 EXE 到
    out\release\gui-staging\install-youguo-a11y.exe。
    * 源码文件统一转为 UTF-8 with BOM（老 csc 在中文系统默认 GBK 代码页，BOM 最稳）；
    * 编译加 /codepage:65001（与 BOM 双保险）；
    * 仅 C# 5 语法（csc.exe v4.0.30319 不支持 C# 6+）。

.PARAMETER OutputPath
    可选输出 EXE 路径，默认 out\release\gui-staging\install-youguo-a11y.exe。

.EXAMPLE
    pwsh -File src\installer-gui\build.ps1
#>
[CmdletBinding()]
param(
    [string]$OutputPath = '',
    [switch]$NoBomFix
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path

# ---------------------------------------------------------------- 1) csc.exe
$cscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) {
    throw '找不到 csc.exe。请确认系统已安装 .NET Framework 4.x（Win10/11 自带）。尝试路径：' + ($cscCandidates -join '; ')
}

# ---------------------------------------------------------------- 2) 源码
$sources = @(Get-ChildItem -LiteralPath $scriptDir -Filter '*.cs' -File | Sort-Object Name)
if ($sources.Count -eq 0) { throw "找不到 .cs 源码：$scriptDir" }

# ---------------------------------------------------------------- 3) 确保 UTF-8 BOM
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if (-not $NoBomFix) {
    foreach ($file in $sources) {
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
        if (-not $hasBom) {
            $text = [System.IO.File]::ReadAllText($file.FullName, $utf8NoBom)
            [System.IO.File]::WriteAllText($file.FullName, $text, $utf8Bom)
            Write-Host "  [BOM] $($file.Name)"
        }
    }
}

# ---------------------------------------------------------------- 4) 输出路径
if (-not $OutputPath) {
    $OutputPath = Join-Path $projectRoot 'out\release\gui-staging\install-youguo-a11y.exe'
}
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

# ---------------------------------------------------------------- 5) 编译
$refArgs = @(
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll'
)
$cscArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/codepage:65001',
    '/optimize+',
    '/warn:4',
    ('/out:' + $OutputPath)
) + $refArgs + @($sources | ForEach-Object { $_.FullName })

Write-Host '编译命令：'
Write-Host ('  "' + $csc + '" ' + ($cscArgs -join ' '))
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "编译失败，csc 退出码 $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $OutputPath)) { throw "编译未生成 EXE：$OutputPath" }

$info = Get-Item -LiteralPath $OutputPath
$hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
Write-Host ''
Write-Host '编译成功：'
Write-Host ('  EXE   : ' + $info.FullName)
Write-Host ('  大小  : ' + $info.Length + ' 字节 (' + [math]::Round($info.Length / 1KB, 1) + ' KB)')
Write-Host ('  SHA256: ' + $hash)
