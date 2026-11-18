@echo off
setlocal
set "APP_DIR=%~dp0bloom-main"
cd /d "%APP_DIR%"

taskkill /F /IM "STARK-07.exe" /T >nul 2>&1
taskkill /F /IM "bloom.exe" /T >nul 2>&1

set "RELEASE_APP=%APP_DIR%\STARK-07.exe"
if not exist "%RELEASE_APP%" set "RELEASE_APP=%APP_DIR%\current\STARK-07.exe"

if exist "%RELEASE_APP%" (
  echo Starting STARK-07 OS...
  start "" "%RELEASE_APP%"
  ping 127.0.0.1 -n 2 >nul
  exit /b 0
)

if not exist "node_modules\@tauri-apps\cli" (
  echo STARK-07 dependencies are missing. Run npm install --ignore-scripts in the bloom-main folder first.
  pause
  exit /b 1
)
npm run tauri -- dev
endlocal
