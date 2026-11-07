param([string]$VelaRoot = (Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference = 'Stop'
$VelaRoot = (Resolve-Path -LiteralPath $VelaRoot).Path
$Project = Join-Path $PSScriptRoot 'vela.project'
$Build = Join-Path $PSScriptRoot 'build'
$Output = Join-Path $Build 'program'
$Bin = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force -Path $Output,$Bin | Out-Null
$Vela = Join-Path $VelaRoot 'vela.cmd'
& $Vela lock $Project
if ($LASTEXITCODE -ne 0) { throw 'Project lock failed' }
$Executable = Join-Path $Output 'measurelab.exe'
& $Vela build $Project -o $Executable
if ($LASTEXITCODE -ne 0) { throw 'Vela build failed' }
Copy-Item -LiteralPath $Executable -Destination (Join-Path $Bin 'measurelab.exe') -Force
[IO.File]::WriteAllText((Join-Path $Build 'current.txt'), $Output, [Text.UTF8Encoding]::new($false))
Write-Output $Executable
