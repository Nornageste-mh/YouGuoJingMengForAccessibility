@echo off
rem Youguo Jingmeng accessibility patch - player uninstaller (ASCII wrapper; Chinese UI is in the PowerShell script)
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-player.ps1" -Uninstall %*
if errorlevel 1 (
  echo.
  echo Uninstallation failed. See the message above.
  pause
) else (
  echo.
  pause
)
