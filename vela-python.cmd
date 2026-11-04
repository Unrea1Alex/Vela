@echo off
setlocal
set "PYTHONPATH=%~dp0;%PYTHONPATH%"
python -m vela %*
exit /b %errorlevel%
