param([switch]$SkipNamedTests, [string]$Compiler, [string]$EvidencePath)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$output = Join-Path $root 'build/fielddesk-validation'
if (!$Compiler) { $Compiler = Join-Path $root 'vela.cmd' }
if (!$EvidencePath) { $EvidencePath = Join-Path $output 'validation.json' }
New-Item -ItemType Directory -Force $output | Out-Null
$exe = Join-Path $PSScriptRoot 'bin/fielddesk.exe'
$asset = Join-Path $PSScriptRoot 'bin/assets/settings.json'
$httpAdapter = Join-Path $PSScriptRoot 'bin/vela-http.dll'
$config = Join-Path $PSScriptRoot 'demo.json'
$data = Join-Path $PSScriptRoot 'demo.ndjson'
$checks = [Collections.Generic.List[object]]::new()
function Ensure([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Check([string]$Name, [scriptblock]$Body) { & $Body; $checks.Add(@{name=$Name;status='passed'}); Write-Host "PASS $Name" }
function Run([string[]]$Arguments, [int]$Expected = 0, [string]$Binary = $exe) {
    $info = [Diagnostics.ProcessStartInfo]::new($Binary)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $output
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $proc = [Diagnostics.Process]::Start($info)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    if (!$proc.WaitForExit(30000)) { $proc.Kill($true); throw 'Application timeout' }
    $stdout = $outTask.GetAwaiter().GetResult()
    $stderr = $errTask.GetAwaiter().GetResult()
    $code = $proc.ExitCode
    $proc.Dispose()
    Ensure ($code -eq $Expected) "Exit $code expected $Expected for $Arguments`n$stdout`n$stderr"
    return @{stdout=$stdout;stderr=$stderr;code=$code}
}
function Text([string]$File, [string]$Value) { [IO.File]::WriteAllText($File,$Value,[Text.UTF8Encoding]::new($false)) }
Push-Location $root
try {
    if (!$SkipNamedTests) {
        & $Compiler test apps/fielddesk/vela.project --json > "$output/named-tests.log"
        Ensure ($LASTEXITCODE -eq 0) 'Named tests failed'
    }
    $named = Get-Content "$output/named-tests.log" | Where-Object { $_.StartsWith('{"schema_version":2') } | Select-Object -Last 1 | ConvertFrom-Json
    Ensure ($named.ok -and $named.failed -eq 0) 'No successful named test evidence'
    Check 'streaming real files and child verifier' {
        $run = Run @($config,$data,"$output/stream.html")
        Ensure ($run.stdout.Contains('Accepted 9 | excluded 1 | alerts 2 | mean 20.67')) 'Wrong summary'
        Ensure ((Get-Content "$output/stream.html.worker.out" -Raw).StartsWith('fielddesk-report-ok ')) 'Verifier did not run'
        $html = Get-Content "$output/stream.html" -Raw
        Ensure ($html.Contains('<strong>6.39</strong>') -and $html.Contains('Лесная 🌲')) 'Wrong numeric or Unicode report'
    }
    Check 'replay real file workflow' {
        $run = Run @($config,$data,"$output/replay.html",'--replay-check')
        Ensure ($run.stdout.Contains('Replay verified')) 'Replay missing'
        $a = (Get-Content "$output/stream.html" -Raw) -replace 'Run \d+ · Unix ms \d+', 'METADATA'
        $b = (Get-Content "$output/replay.html" -Raw) -replace 'Run \d+ · Unix ms \d+', 'METADATA'
        Ensure ($a -ceq $b) 'Stream and snapshot changed report'
    }
    Check 'embedded demo without source files' { $null = Run @('--demo',"$output/demo.html",'--replay-check') }
    Check 'alert exit code after publication' { $null = Run @('--demo',"$output/alert.html",'--fail-on-alert') 3; Ensure (Test-Path "$output/alert.html") 'No published report' }
    Check 'exact threshold does not alert' { Text "$output/exact.ndjson" '{"station":"A","value":25,"accepted":true}'; $null = Run @($config,"$output/exact.ndjson","$output/exact.html",'--fail-on-alert') }
    Check 'bad data preserves previous report' {
        Text "$output/bad.ndjson" "`n{`"station`":`"A`",`"value`":`"bad`",`"accepted`":true}"
        Text "$output/preserved.html" 'sentinel'
        $run = Run @($config,"$output/bad.ndjson","$output/preserved.html") 2
        Ensure ($run.stderr.Contains('line 2: $.value')) 'Error location missing'
        Ensure ((Get-Content "$output/preserved.html" -Raw) -ceq 'sentinel') 'Output overwritten on failure'
    }
    Check 'bad config preserves previous report' { Text "$output/bad.json" '{}'; $null = Run @("$output/bad.json",$data,"$output/preserved.html") 2; Ensure ((Get-Content "$output/preserved.html" -Raw) -ceq 'sentinel') 'Output overwritten' }
    Check 'input output alias rejected' { $hash=(Get-FileHash $data).Hash; $null=Run @($config,$data,$data) 2; Ensure ((Get-FileHash $data).Hash -eq $hash) 'Input changed' }
    Check 'hard link alias rejected' {
        $link = "$output/alias-$([Guid]::NewGuid().ToString('N')).html"
        $null = New-Item -ItemType HardLink -Path $link -Target $data
        $hash=(Get-FileHash $data).Hash
        $null=Run @($config,$data,$link) 2
        Ensure ((Get-FileHash $data).Hash -eq $hash) 'Hard linked input changed'
    }
    Check 'worker logs cannot overwrite input' { Copy-Item $data "$output/alias-log.html.worker.out"; $hash=(Get-FileHash "$output/alias-log.html.worker.out").Hash; $null=Run @($config,"$output/alias-log.html.worker.out","$output/alias-log.html") 2; Ensure ((Get-FileHash "$output/alias-log.html.worker.out").Hash -eq $hash) 'Log alias changed input' }
    Check 'cannot overwrite executable or adapter' {
        $null=Run @('--demo',$exe) 2
        $null=Run @('--gui',(Join-Path $PSScriptRoot 'bin/vela-gui.dll')) 2
        $null=Run @('--gui',$httpAdapter) 2
    }
    Check 'missing input' { $null=Run @($config,"$output/missing.ndjson","$output/missing.html") 2 }
    Check 'oversized file' { Text "$output/large.ndjson" (' ' * 524289); $null=Run @($config,"$output/large.ndjson","$output/large.html") 2 }
    Check 'invalid UTF8' { [IO.File]::WriteAllBytes("$output/invalid.ndjson",[byte[]]@(255,10)); $null=Run @($config,"$output/invalid.ndjson","$output/invalid.html") 2 }
    Check 'invalid CLI flags' { $null=Run @('--unknown') 2; $null=Run @('--demo','--gui') 2; $null=Run @('--demo','--demo',"$output/duplicate.html") 2 }
    Check 'publication into missing directory' { $null=Run @('--demo',"$output/not-created/report.html") 2 }
    Check 'worker rejects incomplete envelope' { Text "$output/truncated.html" '<!doctype html>'; $null=Run @('--verify-report',"$output/truncated.html") 2 }
    Check 'relocated path with spaces and Unicode on system PATH' {
        $relocated = Join-Path $output 'Перенос FieldDesk'
        New-Item -ItemType Directory -Force $relocated | Out-Null
        Copy-Item $exe,$httpAdapter,$(Join-Path $PSScriptRoot 'bin/vela-gui.dll') $relocated -Force
        $assets = Join-Path $relocated 'assets'
        New-Item -ItemType Directory -Force $assets | Out-Null
        Copy-Item -LiteralPath $asset -Destination $assets -Force
        Ensure ((Get-FileHash -LiteralPath (Join-Path $assets 'settings.json')).Hash -eq (Get-FileHash -LiteralPath $config).Hash) 'Packaged settings hash differs'
        $oldPath=$env:PATH
        try { $env:PATH="$env:SystemRoot\System32;$env:SystemRoot"; $null=Run @('--demo',"$relocated/report.html",'--replay-check') 0 "$relocated/fielddesk.exe" }
        finally { $env:PATH=$oldPath }
    }
    Check 'forced GC repeated analysis' {
        & $Compiler build apps/fielddesk/soak.vela -o "$output/soak.exe"
        Ensure ($LASTEXITCODE -eq 0) 'Soak build failed'
        $oldStress=$env:VELA_GC_STRESS; $oldReport=$env:VELA_GC_REPORT
        try {
            $env:VELA_GC_STRESS='1'; $env:VELA_GC_REPORT='1'
            $short=Run @('5') 0 "$output/soak.exe"
            $long=Run @('40') 0 "$output/soak.exe"
            Text "$output/gc-short.log" $short.stderr
            Text "$output/gc-long.log" $long.stderr
            Ensure ($long.stdout.Contains('soak-ok 40')) 'Soak incomplete'
        } finally { $env:VELA_GC_STRESS=$oldStress; $env:VELA_GC_REPORT=$oldReport }
    }
    $evidence = @{schema_version=1;compiler=((& $Compiler --version) -replace '^Vela (\S+) \(self-hosted\)$','$1');named_tests=@{passed=$named.passed;failed=$named.failed};cli_checks=$checks;executable_sha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLower();adapter_sha256=(Get-FileHash (Join-Path $PSScriptRoot 'bin/vela-gui.dll') -Algorithm SHA256).Hash.ToLower();http_adapter_sha256=(Get-FileHash -LiteralPath $httpAdapter).Hash.ToLowerInvariant();resource_sha256=(Get-FileHash -LiteralPath $asset).Hash.ToLowerInvariant();gc_short=(Get-Content "$output/gc-short.log" -Raw);gc_long=(Get-Content "$output/gc-long.log" -Raw)}
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8NoBOM
    Write-Host "$($named.passed) named tests; $($checks.Count) CLI checks passed"
} finally { Pop-Location }
