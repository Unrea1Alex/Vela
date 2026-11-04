param([string]$VelaRoot=(Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference='Stop'
$VelaRoot=(Resolve-Path -LiteralPath $VelaRoot).Path
$Native=Join-Path $PSScriptRoot 'native'
$Build=Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force -Path $Build | Out-Null
$VsWhere=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
$VsInstall=& $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $VsInstall){throw 'MSVC x64 build tools are required'}
$Adapter=Join-Path $Native 'measurelab-math.dll'
$Command=@"
@echo off
call "$VsInstall\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 2
cl /nologo /TC /std:c11 /utf-8 /W4 /O2 /fp:strict /MT /LD /I"$VelaRoot\vela" "$Native\math.c" /Fo"$Build\math.obj" /Fe"$Adapter" /link /IMPLIB:"$Build\math.lib"
exit /b %errorlevel%
"@
[IO.File]::WriteAllText((Join-Path $Build 'adapter.cmd'),$Command,[Text.Encoding]::Default)
& $env:ComSpec /d /c (Join-Path $Build 'adapter.cmd')
if($LASTEXITCODE -ne 0){throw 'C adapter build failed'}
# The reviewed source above is the only native dependency. Refresh its lock only
# after a successful build; publish into a content-addressed output directory.
& (Join-Path $VelaRoot 'vela.cmd') lock (Join-Path $PSScriptRoot 'vela.project')
if($LASTEXITCODE -ne 0){throw 'Project lock failed'}
$NativeHash=(Get-FileHash -LiteralPath $Adapter).Hash.ToLowerInvariant()
$Output=Join-Path $Build $NativeHash.Substring(0,16)
New-Item -ItemType Directory -Force -Path $Output | Out-Null
& (Join-Path $VelaRoot 'vela.cmd') build (Join-Path $PSScriptRoot 'vela.project') -o (Join-Path $Output 'measurelab.exe')
if($LASTEXITCODE -ne 0){throw 'Vela build failed'}
[IO.File]::WriteAllText((Join-Path $Build 'current.txt'),$Output,[Text.UTF8Encoding]::new($false))
$Bin=Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Copy-Item -LiteralPath (Join-Path $Output 'measurelab.exe') -Destination (Join-Path $Bin 'measurelab.exe') -Force
Copy-Item -LiteralPath $Adapter -Destination (Join-Path $Bin 'measurelab-math.dll') -Force
Write-Output (Join-Path $Output 'measurelab.exe')
