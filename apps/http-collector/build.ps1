param([string]$OutDir = 'bin')
$ErrorActionPreference = 'Stop'
$httpAdapter = $env:VELA_HTTP_ADAPTER
if (-not $httpAdapter) {
    $httpAdapter = Join-Path $PSScriptRoot '../../build/stage13/transport-probe/Release/vela-http.dll'
}
if (-not (Test-Path -LiteralPath $httpAdapter -PathType Leaf)) {
    throw "Missing HTTP adapter at $httpAdapter. Build the pinned native adapter or set VELA_HTTP_ADAPTER."
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
& (Join-Path $PSScriptRoot '../../vela.cmd') build (Join-Path $PSScriptRoot 'main.vela') -o (Join-Path $OutDir 'app.exe')
if ($LASTEXITCODE -ne 0) { throw 'HTTP collector build failed' }
$destination = Join-Path (Resolve-Path -LiteralPath $OutDir).Path 'vela-http.dll'
if ((Resolve-Path -LiteralPath $httpAdapter).Path -ne $destination) {
    Copy-Item -LiteralPath $httpAdapter -Destination $destination
}
