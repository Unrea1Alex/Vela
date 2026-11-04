param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$SourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PackageRoot = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $PackageRoot) { throw 'Use a new destination for staging.' }
New-Item -ItemType Directory -Path $PackageRoot | Out-Null
$Entries = @('README.md','AGENTS.md','vela.cmd','velac.cmd','vela-dev.cmd','selfhost','tools','std','tests/cases','tests/stdlib','tests/ffi','tests/helper.vela','tests/README.md','examples','apps/timelog','apps/config-report','prototypes/windows','docs','bootstrap','integrations/agent','integrations/mcp/README.md','bin/build-manifest.json','dist/timelog-windows-x64.zip')
foreach ($Entry in $Entries) {
    $Target = Join-Path $PackageRoot $Entry
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot $Entry) -Destination $Target -Recurse
}
New-Item -ItemType Directory -Force -Path (Join-Path $PackageRoot 'bin'),(Join-Path $PackageRoot 'vela/backends') | Out-Null
foreach ($Binary in @('velac.exe','vela-dev.exe','vela-bundle.exe','vela-test.exe')) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot "bin/$Binary") -Destination (Join-Path $PackageRoot "bin/$Binary")
}
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/builtins.def') -Destination (Join-Path $PackageRoot 'vela/builtins.def')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/backends/runtime.h') -Destination (Join-Path $PackageRoot 'vela/backends/runtime.h')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/ffi.h') -Destination (Join-Path $PackageRoot 'vela/ffi.h')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'build/native/stage3.c') -Destination (Join-Path $PackageRoot 'bootstrap/velac.c')
Write-Output "Native staging: $PackageRoot"
