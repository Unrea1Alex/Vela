param([string]$Executable = '')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (!$Executable) {
    $Output = Join-Path $Root 'build/gc-verification'
    New-Item -ItemType Directory -Force -Path $Output | Out-Null
    $Executable = Join-Path $Output 'repeat.exe'
    & (Join-Path $Root 'vela.cmd') build (Join-Path $Root 'tests/gc-repeat.vela') -o $Executable
    if ($LASTEXITCODE -ne 0) { throw 'GC workload build failed' }
}
$PreviousReport = $env:VELA_GC_REPORT
try {
    $env:VELA_GC_REPORT = '1'
    $Runs = foreach ($Count in @(200, 1600)) {
        $Clock = [Diagnostics.Stopwatch]::StartNew()
        $PreviousErrorAction = $ErrorActionPreference
        try {
            # Windows PowerShell represents redirected native stderr as error records.
            $ErrorActionPreference = 'Continue'
            $Text = (& $Executable $Count 2>&1) -join "`n"
        } finally {
            $ErrorActionPreference = $PreviousErrorAction
        }
        if ($LASTEXITCODE -ne 0 -or $Text -notmatch "(?m)^compiled=$Count$") {
            throw "GC workload failed at $Count compilations. $Text"
        }
        if ($Text -notmatch 'vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)') {
            throw "Missing GC report. $Text"
        }
        [pscustomobject]@{
            compilations = $Count
            collections = [long]$Matches[1]
            peak_managed_bytes = [long]$Matches[2]
            managed_bytes_before_teardown = [long]$Matches[3]
            elapsed_ms = $Clock.ElapsedMilliseconds
        }
    }
    foreach ($Run in $Runs) {
        if ($Run.collections -lt 1 -or $Run.peak_managed_bytes -gt 16MB) {
            throw 'Managed heap exceeded the declared workload budget'
        }
    }
    if ($Runs[1].peak_managed_bytes -gt ($Runs[0].peak_managed_bytes + 2MB)) {
        throw 'Managed peak grew beyond the declared comparison budget'
    }
    $Runs | ConvertTo-Json
} finally {
    $env:VELA_GC_REPORT = $PreviousReport
}
