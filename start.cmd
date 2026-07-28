@echo off
setlocal
set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install Node.js LTS from https://nodejs.org then run:
  echo   npm install
  echo   npm start
  exit /b 1
)
if not exist "%~dp0node_modules\electron" (
  echo Installing dependencies...
  call npm install
)
call npm start
