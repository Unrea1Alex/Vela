# Run in an x64 MSVC developer shell. Root must be a disposable extracted SDK.
param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$output = Join-Path $Root 'build/recovery-1.3'
if (!(Test-Path -LiteralPath (Join-Path $Root 'delivery-manifest.json')) -or
    (Test-Path -LiteralPath $output)) { throw 'Use a fresh extracted SDK' }
New-Item -ItemType Directory -Force $output | Out-Null
Push-Location -LiteralPath $Root
try {
    $recovery = Join-Path $output 'recovery.exe'
    $seed = Join-Path $Root 'bootstrap/velac.c'
    $reemitted = Join-Path $output 'recovered.c'
    & cl.exe /nologo /TC /std:c11 /utf-8 /O2 /fp:strict /MT "/Fo$output/recovery.obj" "/Fe$recovery" $seed
    if ($LASTEXITCODE -or (& $recovery --version) -cne 'Vela 1.3.0 (self-hosted)') { throw 'Recovery build' }
    & $recovery emit-c selfhost/compiler.vela --source-name compiler.vela -o $reemitted
    if ($LASTEXITCODE -or (Get-FileHash -LiteralPath $reemitted).Hash -cne (Get-FileHash -LiteralPath $seed).Hash) {
        throw 'Canonical C differs after recovery'
    }
    Copy-Item -LiteralPath $recovery -Destination 'bin/velac.exe' -Force
    & $recovery build tools/dev.vela -o bin/vela-dev.exe
    if ($LASTEXITCODE) { throw 'Recovery build driver' }
    & .\vela-dev.cmd verify
    if ($LASTEXITCODE) { throw 'Clean recovery verification' }
    [ordered]@{version='1.3.0';recovered_from_c=$true;canonical_c_sha256=(Get-FileHash -LiteralPath $seed).Hash.ToLowerInvariant();
        bootstrap=(Get-Content docs/bootstrap-evidence.json -Raw | ConvertFrom-Json);
        native=(Get-Content docs/test-evidence.json -Raw | ConvertFrom-Json)} | ConvertTo-Json -Depth 5 -Compress
} finally { Pop-Location }
