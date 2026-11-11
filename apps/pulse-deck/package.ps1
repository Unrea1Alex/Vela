param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $appRoot '../..'))
$stageRoot = Join-Path $appRoot ('work/package-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path (Join-Path $stageRoot 'assets') -Force
foreach ($name in @('pulse-deck.exe', 'vela-gui.dll', 'vela-http-server.dll', 'vela-http.dll')) {
    Copy-Item -LiteralPath (Join-Path $appRoot ('bin/' + $name)) -Destination (Join-Path $stageRoot $name)
}
Copy-Item -LiteralPath (Join-Path $appRoot 'bin/assets/demo.json') -Destination (Join-Path $stageRoot 'assets/demo.json')
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $stageRoot 'LICENSE')
& (Join-Path $repoRoot 'scripts/stage-http-package.ps1') -Destination $stageRoot
$guide = @'
PulseDeck 1.0 with Vela HTTP multi — Windows x64

Run pulse-deck.exe to open the local demo (no internet needed).
Three healthy and three intentionally failing probes are expected.
Run checks: repeat; Cancel: cancel pending work; Save JSON: save again.
Close drains requests before exiting. Each completed run saves report.json.
The report location is shown in the window and printed to stdout.

Requires Windows 10+ x64. Keep the three DLLs and assets/demo.json beside the executable.
No Vela, Node, Python or C compiler required to run the package.

CLI: pulse-deck.exe --headless [--config FILE] [--output EXISTING_DIRECTORY]
Optional: --cancel-after MS
Exit codes: 0 healthy, 1 failed probes, 2 app error, 3 cancelled.
The default headless demo intentionally returns 1.
Output: unique subdirectory of TEMP or --output, containing report.json.
Edit a copy of assets/demo.json for your own HTTP/HTTPS endpoints.
TLS verification is mandatory. Optional ca_file is absolute. Omit curl for native
HTTP, or explicitly select a trusted legacy curl executable using an absolute path.
For external endpoints set demo=false and use a nonzero port.
'@
[IO.File]::WriteAllText((Join-Path $stageRoot 'RUNME.txt'), $guide)
$dist = Join-Path $repoRoot 'dist'
$null = New-Item -ItemType Directory -Path $dist -Force
$archive = $ArchivePath
if (!$archive) { $archive = Join-Path $dist 'pulsedeck-1.0-http-multi-windows-x64.zip' }
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archive -Force
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($archive + '.sha256'), "$hash  $([IO.Path]::GetFileName($archive))`n")
Write-Output $archive
Write-Output $hash
