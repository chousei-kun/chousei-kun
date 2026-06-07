@echo off
cd /d "%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "APP_URL=http://127.0.0.1:4173"

if not exist "%NODE_EXE%" (
  echo Node.js が見つかりません: %NODE_EXE%
  echo Node.js をインストールするか、start-local.cmd から node server.mjs を実行してください。
  pause
  exit /b 1
)

start "Slotwise local server" cmd /k ""%NODE_EXE%" server.mjs"

echo Slotwise を起動しています...
for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
  if not errorlevel 1 (
    start "" "%APP_URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo サーバーに接続できませんでした。
echo 開いた "Slotwise local server" ウィンドウにエラーが出ていないか確認してください。
pause
exit /b 1
