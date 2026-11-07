@echo off
setlocal
set "APP_DIR=%~dp0bloom-main"
set "RELEASE_APP=%APP_DIR%\current\STARK-07.exe"
if not exist "%RELEASE_APP%" set "RELEASE_APP=%APP_DIR%\STARK-07.exe"
if exist "%RELEASE_APP%" (
  start "" "%RELEASE_APP%"
  exit /b 0
)
cd /d "%APP_DIR%"
if not exist "node_modules\@tauri-apps\cli" (
  echo STARK-07 dependencies are missing. Run npm install --ignore-scripts in the bloom-main folder first.
  pause
  exit /b 1
)
npm run tauri -- dev
endlocal
