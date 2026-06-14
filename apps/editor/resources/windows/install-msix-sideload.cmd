@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-msix-sideload.ps1"
if errorlevel 1 (
  echo.
  echo Install failed.
  pause
  exit /b 1
)
pause
