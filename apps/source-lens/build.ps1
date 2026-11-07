param([switch]$Test)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$vela = Join-Path $repo 'vela.cmd'
$project = Join-Path $PSScriptRoot 'vela.project'
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'bin') | Out-Null
& $vela check $project --json
if ($LASTEXITCODE -ne 0) { throw 'SourceLens check failed' }
& $vela build $project -o (Join-Path $PSScriptRoot 'bin/source-lens.exe')
if ($LASTEXITCODE -ne 0) { throw 'SourceLens build failed' }
$query = (& $vela query (Join-Path $PSScriptRoot 'demo/main.vela')) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Demo query failed' }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'demo-query.json'), $query + "`n", [Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'bin/source-lens.exe') (Join-Path $PSScriptRoot 'demo-query.json') (Join-Path $PSScriptRoot 'report.html')
if ($LASTEXITCODE -ne 0) { throw 'Report generation failed' }
if ($Test) {
    & $vela test $project --json
    if ($LASTEXITCODE -ne 0) { throw 'SourceLens named tests failed' }
    node (Join-Path $PSScriptRoot 'verify.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'SourceLens integration checks failed' }
}
