param([Parameter(Mandatory=$true)][string]$NativeRoot)
$ErrorActionPreference='Stop'
$NativeRoot=(Resolve-Path -LiteralPath $NativeRoot).Path
$output=Join-Path $NativeRoot 'build/mcp-test-fixture'
New-Item -ItemType Directory -Force $output | Out-Null
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'MSVC is required for the optional execution fault fixture'}
$source=Join-Path $NativeRoot 'tests/ffi/adapter.c'
$script=Join-Path $output 'build.cmd'
$command=@"
@echo off
call "$vs\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 2
cl /nologo /std:c11 /LD /MT /O2 /utf-8 /Fo"$output/fixture.obj" /Fe"$output/fixture.dll" "$source" /link /IMPLIB:"$output/fixture.lib"
exit /b %errorlevel%
"@
[IO.File]::WriteAllText($script,$command,[Text.UTF8Encoding]::new($false))
& $env:ComSpec /d /c $script
if($LASTEXITCODE -ne 0){throw 'Execution test fixture build failed'}
Write-Output (Join-Path $output 'fixture.dll')
