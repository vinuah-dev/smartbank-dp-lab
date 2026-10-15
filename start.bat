@echo off
title SmartBank Server
cd /d "%~dp0"
echo.
echo   SmartBank - Design Patterns Lab Project
echo   ---------------------------------------

rem asli Python dhoondo (Windows ka Store wala "python" alias kaam nahi karta, isliye sqlite3 import karke check)
set "PY="
python -c "import sqlite3" >nul 2>nul && set "PY=python"
if not defined PY py -3 -c "import sqlite3" >nul 2>nul && set "PY=py -3"

if not defined PY (
  echo   Python nahi mila. Website browser storage mode me khul rahi hai.
  echo   Asli SQLite database ke liye Python 3 install karo: https://www.python.org
  start "" "%~dp0index.html"
  pause
  exit /b
)

%PY% server.py %*
echo.
echo   Server band ho gaya. Window band karne ke liye koi bhi key dabao.
pause >nul
