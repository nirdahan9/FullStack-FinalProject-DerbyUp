@echo off
rem DerbyUp - one-command local run (Windows).
rem
rem   run.bat
rem
rem Needs Node.js 20+ and the .env.local file provided with the submission,
rem placed next to this script. Installs, builds once, then serves the
rem production build at http://localhost:3000.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 20+ from https://nodejs.org and re-run.
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo Your Node.js is too old - this project needs Node 20 or newer.
  exit /b 1
)

if not exist .env.local (
  echo .env.local is missing.
  echo Copy the .env.local file provided with the submission into this folder.
  echo ^(In Explorer, enable View ^> Show ^> Hidden items to see it.^)
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies - one time, a minute or two...
  call npm ci
  if errorlevel 1 exit /b 1
)

if not exist .next\BUILD_ID (
  echo Building the production bundle - a minute or two...
  call npm run build
  if errorlevel 1 exit /b 1
) else (
  echo Using the existing build. Delete the .next folder to force a rebuild.
)

echo Starting DerbyUp at http://localhost:3000  (Ctrl+C stops the server)
start "" cmd /c "timeout /t 5 /nobreak >nul & start "" http://localhost:3000"
call npm start
