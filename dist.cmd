@echo off
setlocal
call "%~dp0env.cmd"
if errorlevel 1 exit /b 1
if not exist "%~dp0node_modules\electron-builder" (
  echo Installing dependencies...
  call npm install
)
call npm run dist
