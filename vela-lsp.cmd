@echo off
setlocal
if "%~1"=="" (
  echo Usage: vela-lsp WORKSPACE [SOURCE_OR_PROJECT] 1>&2
  exit /b 2
)
if "%~2"=="" (
  "%~dp0bin\vela-lsp.exe" "%~dp0bin\velac.exe" "%~1"
) else (
  "%~dp0bin\vela-lsp.exe" "%~dp0bin\velac.exe" "%~1" "%~2"
)
exit /b %errorlevel%
