# Run with PowerShell 7 from a checkout with the application built.
param([string]$Executable = (Join-Path $PSScriptRoot 'bin/route-audit.exe'))
$ErrorActionPreference = 'Stop'
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$Repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Work = Join-Path $Repository ('build/route-audit/verify-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$Utf8 = [Text.UTF8Encoding]::new($false, $true)
$Checks = [Collections.Generic.List[string]]::new()

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Invoke-Audit([string[]]$Arguments, [int]$Code, [switch]$Stress) {
    $start = [Diagnostics.ProcessStartInfo]::new($Executable)
    $start.WorkingDirectory = $Work
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = $Utf8
    $start.StandardErrorEncoding = $Utf8
    $start.Environment['PATH'] = "$env:SystemRoot\System32;$env:SystemRoot"
    [void]$start.Environment.Remove('VELA_GC_STRESS')
    [void]$start.Environment.Remove('VELA_GC_REPORT')
    if ($Stress) {
        $start.Environment['VELA_GC_STRESS'] = '1'
        $start.Environment['VELA_GC_REPORT'] = '1'
    }
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    $child = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $child.StandardOutput.ReadToEndAsync()
        $stderr = $child.StandardError.ReadToEndAsync()
        if (-not $child.WaitForExit(30000)) {
            $child.Kill($true)
            throw 'RouteAudit timed out'
        }
        $output = $stdout.GetAwaiter().GetResult()
        $errors = $stderr.GetAwaiter().GetResult()
        Require ($child.ExitCode -eq $Code) "Expected exit $Code, got $($child.ExitCode). $errors"
        return @{out = $output.Replace("`r`n", "`n"); err = $errors}
    } finally {
        $child.Dispose()
    }
}

$inputFile = Join-Path $Work 'Маршруты с пробелом.ndjson'
$outputFile = Join-Path $Work 'Отчёт 🌳.tsv'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'demo.ndjson') -Destination $inputFile
$expected = "name`tpoints`tlength_m`tmax_step_m`tjumps`n" +
    "Набережная`t3`t10.00`t5.00`t0`nПарк 🌳`t4`t11.41`t10.00`t1`nКороткий контроль`t2`t1.00`t1.00`t0`n"

$demo = Invoke-Audit @($inputFile, $outputFile) 0
Require ($demo.out -eq "routes=3 jumps=1`n" -and $demo.err -eq '') 'Unexpected demo summary'
Require ([IO.File]::ReadAllText($outputFile, $Utf8) -ceq $expected) 'Unexpected demo report'
$Checks.Add('exact TSV and Unicode paths with a system-only PATH')

$gated = Invoke-Audit @($inputFile, $outputFile, '--fail-on-jump') 3
Require ($gated.out -eq $demo.out -and $gated.err -eq '') 'Unexpected jump gate summary'
Require ([IO.File]::ReadAllText($outputFile, $Utf8) -ceq $expected) 'Exit 3 must save the report'
$Checks.Add('jump gate publishes report then returns 3')

$stress = Invoke-Audit @($inputFile, $outputFile) 0 -Stress
Require ($stress.out -eq $demo.out -and $stress.err -match 'collections=([1-9]\d*)') 'Missing GC stress evidence'
$collections = [int]$Matches[1]
Require ([IO.File]::ReadAllText($outputFile, $Utf8) -ceq $expected) 'GC stress changed report bytes'
$Checks.Add('exact report under forced collection')

$before = (Get-FileHash -LiteralPath $outputFile).Hash
$invalid = Join-Path $Work 'invalid.ndjson'
$line = '{"name":"X","jump_limit_m":5,"points":[[0,0],[1,0]]}'
$badLine = '{"name":"X","jump_limit_m":5,"points":[[0,0],[1,null]]}'
[IO.File]::WriteAllText($invalid, "$line`n`n$badLine", $Utf8)
$rejected = Invoke-Audit @($invalid, $outputFile) 2
Require ($rejected.err.Contains('line 3: $.points[1][1]: expected number')) 'Nested error path missing'
Require ((Get-FileHash -LiteralPath $outputFile).Hash -eq $before) 'Validation modified existing report'
$Checks.Add('nested error preserves existing report')

[IO.File]::WriteAllBytes($invalid, [byte[]]@(255))
$rejected = Invoke-Audit @($invalid, $outputFile) 2
Require ($rejected.err.Contains('Invalid UTF-8 at byte 0')) 'Expected encoding rejection'
Require ((Get-FileHash -LiteralPath $outputFile).Hash -eq $before) 'Encoding rejection modified existing report'
$Checks.Add('invalid UTF-8 rejected')

[IO.File]::WriteAllText($invalid, ('x' * 2097153), $Utf8)
$rejected = Invoke-Audit @($invalid, $outputFile) 2
Require ($rejected.err.Contains('2097152 bytes')) 'Expected input bound'
Require ((Get-FileHash -LiteralPath $outputFile).Hash -eq $before) 'Oversize rejection modified existing report'
$Checks.Add('2 MiB read bound')

$inputHash = (Get-FileHash -LiteralPath $inputFile).Hash
$rejected = Invoke-Audit @($inputFile, $inputFile) 2
Require ($rejected.err.Contains('Output aliases input')) 'Expected same-path rejection'
$link = Join-Path $Work 'alias.tsv'
New-Item -ItemType HardLink -Path $link -Target $inputFile | Out-Null
$rejected = Invoke-Audit @($inputFile, $link) 2
Require ($rejected.err.Contains('Output aliases input')) 'Expected hardlink rejection'
Require ((Get-FileHash -LiteralPath $inputFile).Hash -eq $inputHash) 'Alias rejection modified input'
$Checks.Add('same path and hardlink leave input intact')

$badOutput = Join-Path $Work 'missing/route.tsv'
$null = Invoke-Audit @($inputFile, $badOutput) 2
Require (-not (Test-Path -LiteralPath $badOutput)) 'Unexpected output after I/O error'
$Checks.Add('missing destination directory')

[IO.File]::WriteAllText($invalid, ("$line`n" * 4096), $Utf8)
$maximum = Invoke-Audit @($invalid, $outputFile) 0
Require ($maximum.out -eq "routes=4096 jumps=0`n") 'Expected exact maximum batch'
$maximumHash = (Get-FileHash -LiteralPath $outputFile).Hash
[IO.File]::AppendAllText($invalid, "$line`n", $Utf8)
$rejected = Invoke-Audit @($invalid, $outputFile) 2
Require ($rejected.err.Contains('line 4097: expected at most 4096 routes')) 'Expected route count rejection'
Require ((Get-FileHash -LiteralPath $outputFile).Hash -eq $maximumHash) 'Count rejection modified existing report'
$Checks.Add('4096 accepted and 4097 rejected')

$help = Invoke-Audit @('--help') 0
Require ($help.out.StartsWith('Usage: route-audit.exe')) 'Expected help'
$rejected = Invoke-Audit @($inputFile, $outputFile, '--unknown') 2
Require ($rejected.err.Contains('Usage: route-audit.exe')) 'Expected usage on invalid command'
$Checks.Add('help and invalid option')

[ordered]@{passed = $Checks.Count; failed = 0; checks = @($Checks); stress_collections = $collections} |
    ConvertTo-Json -Depth 4
