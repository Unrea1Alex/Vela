@echo off
"%~dp0bin\measurelab.exe" "%~dp0sample.json" "%~dp0report.html"
if errorlevel 1 goto failed
start "" "%~dp0report.html"
exit /b 0
:failed
echo MeasureLab failed. See the diagnostic above.
pause
exit /b 2
