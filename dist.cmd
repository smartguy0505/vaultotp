@echo off
setlocal
set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found in .tools\node
  echo Install Node.js LTS from https://nodejs.org then run: npm run dist
  exit /b 1
)
if not exist "%~dp0node_modules\electron-builder" (
  echo Installing dependencies...
  call npm install
)
call npm run dist
