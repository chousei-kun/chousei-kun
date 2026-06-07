@echo off
cd /d "%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "%NODE_EXE%" (
  "%NODE_EXE%" server.mjs
) else (
  node server.mjs
)
