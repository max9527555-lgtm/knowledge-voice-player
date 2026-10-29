@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "KVP_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "KVP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist dist\index.html "%KVP_NODE%" build.mjs
"%KVP_NODE%" server.mjs --dist
pause
