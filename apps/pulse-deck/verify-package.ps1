param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $appRoot '../..'))
$archive = $ArchivePath
if (!$archive) { $archive = Join-Path $repoRoot 'dist/pulsedeck-1.0-http-multi-windows-x64.zip' }
$testRoot = Join-Path $repoRoot ('build/pulsedeck-delivery-' + [Guid]::NewGuid().ToString('N'))
$unpacked = Join-Path $testRoot 'Проверка поставки с пробелами'
$null = New-Item -ItemType Directory -Path $testRoot
Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
$hashes = @{}
foreach ($name in @('pulse-deck.exe','vela-gui.dll','vela-http-server.dll','vela-http.dll','assets/demo.json')) {
    $source = (Get-FileHash -LiteralPath (Join-Path $appRoot ('bin/' + $name)) -Algorithm SHA256).Hash
    $copy = (Get-FileHash -LiteralPath (Join-Path $unpacked $name) -Algorithm SHA256).Hash
    if ($source -ne $copy) { throw "Packaged bytes differ: $name" }
    $hashes[$name] = $copy.ToLowerInvariant()
}
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = Join-Path $unpacked 'pulse-deck.exe'
$startInfo.WorkingDirectory = $testRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Environment['PATH'] = Join-Path $env:SystemRoot 'System32'
$startInfo.ArgumentList.Add('--headless')
$startInfo.ArgumentList.Add('--output')
$startInfo.ArgumentList.Add($testRoot)
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$null = $process.Start()
$outTask = $process.StandardOutput.ReadToEndAsync()
$errTask = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit(20000)) { $process.Kill($true); throw 'Packaged app timed out' }
$stdout = $outTask.GetAwaiter().GetResult()
$stderr = $errTask.GetAwaiter().GetResult()
if ($process.ExitCode -ne 1 -or $stderr -ne '') { throw "Unexpected demo result: $($process.ExitCode) $stdout $stderr" }
$match = [regex]::Match($stdout, 'REPORT=([^\r\n]+)')
if (-not $match.Success) { throw 'No report emitted' }
$reportPath = $match.Groups[1].Value
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$states = @($report.results | ForEach-Object state)
if (($states -join ',') -ne 'healthy,healthy,http-error,http-error,error,healthy') { throw 'Unexpected default results' }
if ($report.timer_cleanups -ne 6) { throw 'Async cleanup mismatch' }
$files = @(Get-ChildItem -LiteralPath (Split-Path -Parent $reportPath))
if ($files.Count -ne 1 -or $files[0].Name -ne 'report.json') { throw 'Transport staging leaked' }
$result = [ordered]@{
    schema=1; passed=5; failed=0
    checks=@('archive byte parity','Unicode and spaces in executable path','different cwd and System32-only PATH','expected demo status and async cleanup','only report remains')
    archive=[IO.Path]::GetFileName($archive)
    archive_sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    archive_bytes=(Get-Item -LiteralPath $archive).Length
    files=$hashes
    report=$report
}
$json = $result | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $testRoot 'delivery-validation.json'), $json + "`n")
Write-Output $json
