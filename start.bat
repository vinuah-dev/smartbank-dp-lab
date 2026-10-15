@echo off
title SmartBank Server
cd /d "%~dp0"
echo.
echo   SmartBank - Design Patterns Lab Project
echo   ---------------------------------------
where python >nul 2>nul
if errorlevel 1 (
  echo   Python nahi mila. Website browser storage mode me khul rahi hai.
  echo   Asli SQLite database ke liye Python 3 install karo.
  start "" "%~dp0index.html"
  pause
  exit /b
)
python server.py %*
pause
