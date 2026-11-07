param([string]$Root = (Split-Path -Parent $PSScriptRoot), [switch]$CleanVerify)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$output = Join-Path $Root 'build/recovery-1.0'
New-Item -ItemType Directory -Force $output | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'MSVC is required for Windows recovery acceptance' }
$recovery = Join-Path $output 'recovery.exe'
$tail = if ($CleanVerify) {
@"
copy /y "$recovery" bin\velac.exe >nul
if errorlevel 1 exit /b 2
"$recovery" build tools/dev.vela -o bin/vela-dev.exe
if errorlevel 1 exit /b 2
call vela-dev.cmd verify
exit /b %errorlevel%
"@
} else {
@"
"$recovery" emit-c selfhost/vela.project -o "$output/recovered.c"
if errorlevel 1 exit /b 2
"$recovery" check examples/agent-idioms/main.vela
exit /b %errorlevel%
"@
}
$command = @"
@echo off
call "$vs/VC/Auxiliary/Build/vcvars64.bat" >nul
if errorlevel 1 exit /b 2
cd /d "$Root"
set VELA_CC=cl.exe
set VELA_CC_KIND=msvc
cl /nologo /TC /std:c11 /utf-8 /O2 /fp:strict /MT /Fo"$output/recovery.obj" /Fe"$recovery" bootstrap/velac.c
if errorlevel 1 exit /b 2
$tail
"@
$script = Join-Path $output 'recover.cmd'
[IO.File]::WriteAllText($script,$command,[Text.UTF8Encoding]::new($false))
& $env:ComSpec /d /c $script
if ($LASTEXITCODE -ne 0) { throw 'C recovery failed' }
if ((& $recovery --version) -cne 'Vela 1.0.0 (self-hosted)') { throw 'Recovery seed version mismatch' }
if (!$CleanVerify -and (Get-FileHash (Join-Path $Root 'build/native/stage3.c')).Hash -cne
    (Get-FileHash (Join-Path $output 'recovered.c')).Hash) { throw 'Recovery emitted C differs' }
[ordered]@{recovered_from_c=$true;version='1.0.0';clean_verify=$CleanVerify.IsPresent;emitted_c_fixed_point=$true;seed_output_compared=(!$CleanVerify)} | ConvertTo-Json -Compress
