@echo off
REM Add local Node.js to PATH for this terminal session.
REM Usage:  call env.cmd
REM Then:   npm start   /   npm run dist
set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Local Node not found at .tools\node
  echo Install Node.js LTS from https://nodejs.org
  echo or re-run setup that populates .tools\node
  exit /b 1
)
echo Node ready: 
node -v
npm -v
