param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$SourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PackageRoot = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $PackageRoot) { throw 'Use a new destination for staging.' }
New-Item -ItemType Directory -Path $PackageRoot | Out-Null
$Entries = @('README.md','README.ru.md','LICENSE','AGENTS.md','vela.cmd','velac.cmd','vela-dev.cmd','selfhost','tools','std','tests/cases','tests/stdlib','tests/ffi','tests/gc-repeat.vela','tests/helper.vela','tests/README.md','scripts/verify-gc.ps1','examples','apps/timelog','apps/config-report','prototypes/windows','docs','bootstrap','integrations/agent','integrations/mcp/README.md','bin/README.md','bin/build-manifest.json','dist/timelog-windows-x64.zip')
$Entries += @('vela-lsp.cmd','scripts/verify-lsp.mjs','integrations/vscode')
$Entries += 'integrations/mcp/compatibility.json'
$Entries += @('README.md','main.vela','route.vela','audit.vela','tests.vela','soak.vela','verify.ps1','validation.json','demo.ndjson','demo-report.tsv') |
    ForEach-Object { 'apps/route-audit/' + $_ }
$MeasureLab = @('README.md','AGENTS.md','VALIDATION.json','main.vela','model.vela',
    'statistics.vela','report.vela','tests.vela','vela.project','vela.project.lock',
    'vela-stdlib','build.ps1','verify.ps1','check-mcp.mjs','sample.json','report.html',
    'preview-card.jpg','run-demo.cmd')
$Entries += $MeasureLab | ForEach-Object { 'apps/measurelab/' + $_ }
$Entries += @('README.md','main.vela','graph.vela','report.vela','tests.vela','vela.project',
    'vela.project.lock','vela-stdlib','demo','build.ps1','verify.mjs','check-tools.mjs',
    'preview.png','report.html','report-mcp.html','validation.json','tooling-validation.json',
    'refactor-evidence.json','documentation-validation.json') |
    ForEach-Object { 'apps/source-lens/' + $_ }
$Entries += @('README.md','main.vela','model.vela','ui.vela','tests.vela','build.vela','async_demo.vela') |
    ForEach-Object { 'apps/gui-notes/' + $_ }
$Entries += @('README.md','CONTRACT.md','REVIEW.md','main.vela','model.vela','engine.vela','ui.vela',
    'tests.vela','build.vela','debug-build.vela','vela.project','vela.project.lock','demo.json',
    'verify.mjs','tooling-check.mjs','package.ps1','verify-package.ps1','validation.json',
    'network-validation.json','tooling-validation.json',
    'bin/pulse-deck.exe','bin/vela-gui.dll','bin/vela-http-server.dll','bin/assets/demo.json') |
    ForEach-Object { 'apps/pulse-deck/' + $_ }
$Entries += @('scripts/check-stable.ps1','scripts/verify-recovery.ps1','scripts/package-1.0-windows.ps1','scripts/package-1.0-linux.sh')
$Entries += @('tests/network','tests/tooling','native/http-server','native/gui',
    'scripts/package-stage11-windows.ps1','scripts/package-stage11-linux.sh')
$Entries += @('README.md','CONTRACT.md','FEATURES.md','REVIEW.md','analyze.vela',
    'build.vela','demo.vela','gui.vela','main.vela','model.vela','network.vela','report.vela',
    'smoke.vela','soak.vela','tests.vela','workflow.vela','demo.json','demo.ndjson',
    'demo-report.html','preview.jpg','vela.project','vela.project.lock','verify.ps1',
    'package.ps1','network-tests.mjs','validation.json','network-validation.json',
    'ui-tooling-validation.json','bin/fielddesk.exe','bin/vela-gui.dll','bin/assets/settings.json') |
    ForEach-Object { 'apps/fielddesk/' + $_ }
foreach ($Entry in $Entries) {
    $Target = Join-Path $PackageRoot $Entry
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot $Entry) -Destination $Target -Recurse
}
New-Item -ItemType Directory -Force -Path (Join-Path $PackageRoot 'bin'),(Join-Path $PackageRoot 'vela/backends') | Out-Null
foreach ($Binary in @('velac.exe','vela-dev.exe','vela-bundle.exe','vela-test.exe','vela-lsp.exe')) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot "bin/$Binary") -Destination (Join-Path $PackageRoot "bin/$Binary")
}
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/builtins.def') -Destination (Join-Path $PackageRoot 'vela/builtins.def')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/backends/runtime.h') -Destination (Join-Path $PackageRoot 'vela/backends/runtime.h')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'vela/ffi.h') -Destination (Join-Path $PackageRoot 'vela/ffi.h')
Copy-Item -LiteralPath (Join-Path $SourceRoot 'build/native/stage3.c') -Destination (Join-Path $PackageRoot 'bootstrap/velac.c')
New-Item -ItemType Directory -Force -Path (Join-Path $PackageRoot 'apps/gui-notes/bin') | Out-Null
foreach ($File in 'notes.exe','vela-gui.dll') {
    Copy-Item -LiteralPath (Join-Path $SourceRoot "build/gui-notes/$File") -Destination (Join-Path $PackageRoot "apps/gui-notes/bin/$File")
}
Write-Output "Native staging: $PackageRoot"
