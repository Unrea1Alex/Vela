@echo off
setlocal
if /i "%~1"=="build" goto toolchain
if /i "%~1"=="run" goto toolchain
if /i "%~1"=="test" goto toolchain
goto ready
:toolchain
if defined VELA_CC goto ready
where cl.exe >nul 2>nul
if not errorlevel 1 goto configured
set "VELA_VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VELA_VSWHERE%" goto unavailable
for /f "usebackq tokens=*" %%i in (`"%VELA_VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VELA_VSINSTALL=%%i"
if not defined VELA_VSINSTALL goto unavailable
call "%VELA_VSINSTALL%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 2
:configured
set "VELA_CC=cl.exe"
set "VELA_CC_KIND=msvc"
:ready
"%~dp0bin\velac.exe" %*
exit /b %errorlevel%
:unavailable
echo Configure VELA_CC and VELA_CC_KIND or install MSVC Build Tools. 1>&2
exit /b 2
