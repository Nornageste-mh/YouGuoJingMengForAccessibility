#Requires -Version 5.1
<#
    提交前安全闸门：
      1. 确认暂存区里没有任何游戏版权内容、发布产物或第三方二进制；
      2. 确认暂存的 .ps1 都带 UTF-8 BOM。

    背景一：本仓库的分析输入（游戏脚本、界面文案、警告画面文字、引擎源码）
    属于游戏著作权人的资产，一旦提交并推送即构成再分发。补丁里为了朗读
    开场 WARNINGS 而收录的四条免责声明文字，是游戏内公开显示的提示文本，
    已在 README 的「致 做完散伙制作组」一节说明；除此之外不得再提交任何
    游戏文本或资源。

    背景二：Windows PowerShell 5.1 读取**无 BOM** 的 .ps1 时按系统 ANSI
    代码页（这里是 GBK）解码，中文注释会变乱码并直接导致语法错误，
    脚本整个跑不起来。而不少编辑器/工具保存 UTF-8 时不写 BOM ——
    本项目的安装脚本就这样坏过一次。所以在这里挡住。

    用法：
        .\tools\check-staged.ps1          # 检查
        git commit ...                    # 通过后再提交
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    # core.quotepath=false：否则 git 会把中文文件名输出成 \345\215\270 这样的
    # 八进制转义，反斜杠在 Windows 路径里非法，GetExtension 会直接抛异常
    $staged = @(git -c core.quotepath=false diff --cached --name-only)
    if ($staged.Count -eq 0) {
        Write-Host "暂存区为空，没有要检查的内容。" -ForegroundColor Yellow
        exit 0
    }

    # 禁止出现的路径片段
    $forbidden = @(
        'extracted/',
        'decompiled/',
        'verify/',
        'textassets/',
        '/out/',
        '/tmp/',
        'addressable_ids.txt',
        'game-test',
        'profile-'
    )
    # 禁止出现的文件扩展名
    $forbiddenExt = @('.dll', '.zip', '.exe', '.pdb', '.sav')

    $violations = @()
    foreach ($f in $staged) {
        $norm = '/' + ($f -replace '\\', '/')
        foreach ($bad in $forbidden) {
            if ($norm -like "*$bad*") { $violations += "$f   (命中禁用路径: $bad)"; break }
        }
        try { $ext = [System.IO.Path]::GetExtension($f).ToLower() } catch { $ext = "" }
        if ($ext -and ($forbiddenExt -contains $ext)) {
            $violations += "$f   (禁用扩展名: $ext)"
        }
    }

    # .ps1 必须 UTF-8 BOM
    $ps1 = $staged | Where-Object { $_ -like '*.ps1' }
    foreach ($f in $ps1) {
        if (-not (Test-Path -LiteralPath (Join-Path $root $f))) { continue }
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $f))
        if ($bytes.Length -lt 3 -or $bytes[0] -ne 0xEF -or $bytes[1] -ne 0xBB -or $bytes[2] -ne 0xBF) {
            $violations += "$f   (缺少 UTF-8 BOM：Windows PowerShell 5.1 会按 GBK 解码中文并报语法错误)"
        }
    }

    if ($violations.Count -gt 0) {
        Write-Host "`n暂存区检查未通过：`n" -ForegroundColor Red
        $violations | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host "`n请先移除违规文件或补上 BOM，再重新暂存提交。" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ("暂存区检查通过（{0} 个文件，无游戏版权内容、无发布产物、.ps1 均带 BOM）。" -f $staged.Count) -ForegroundColor Green
}
finally {
    Pop-Location
}
