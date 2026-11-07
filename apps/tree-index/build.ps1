param([string]$OutDir = 'bin')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
& (Join-Path $PSScriptRoot '../../vela.cmd') build (Join-Path $PSScriptRoot 'main.vela') -o (Join-Path $OutDir 'app.exe')
if ($LASTEXITCODE -ne 0) { throw 'Tree index build failed' }
