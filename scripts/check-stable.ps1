param([string]$Root = (Split-Path -Parent $PSScriptRoot), [switch]$Record, [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$manifestPath = Join-Path $Root 'docs/stable-1.0.json'
$required = @('docs/LANGUAGE.md','docs/MEMORY.md','docs/BUILTINS.md','docs/STDLIB.md',
    'docs/PROJECTS.md','docs/TOOLING.md','vela/builtins.def','vela/ffi.h')
$required += Get-ChildItem -LiteralPath (Join-Path $Root 'docs/contracts') -Filter '*.md' -File |
    Sort-Object Name | ForEach-Object { 'docs/contracts/' + $_.Name }
$required += Get-ChildItem -LiteralPath (Join-Path $Root 'std') -Filter '*.vela' -File |
    Sort-Object Name | ForEach-Object { 'std/' + $_.Name }
if ($Record) {
    $files = [ordered]@{}
    foreach ($file in $required) { $files[$file] = (Get-FileHash -LiteralPath (Join-Path $Root $file)).Hash.ToLowerInvariant() }
    [ordered]@{schema_version=1;language='1.0';project=1;lock=1;ffi_abi=1;runtime_abi=2;files=$files} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
if ($manifest.schema_version -ne 1 -or $manifest.language -cne '1.0' -or
    $manifest.project -ne 1 -or $manifest.lock -ne 1 -or $manifest.ffi_abi -ne 1 -or $manifest.runtime_abi -ne 2) {
    throw 'Invalid stable contract versions'
}
if ($manifest.files.Count -ne $required.Count) { throw 'Stable surface inventory differs' }
function CheckFile([string]$File, [string]$Expected) {
    if (!(Test-Path -LiteralPath $File -PathType Leaf) -or (Get-FileHash -LiteralPath $File).Hash.ToLowerInvariant() -cne $Expected) {
        throw 'Stable contract file missing or changed'
    }
}
foreach ($file in $required) { CheckFile (Join-Path $Root $file) $manifest.files[$file] }
if ($SelfTest) {
    $probe = Join-Path ([IO.Path]::GetTempPath()) ('vela-stable-' + [Guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($probe,'changed')
        $rejected = $false
        try { CheckFile $probe $manifest.files['vela/ffi.h'] } catch { $rejected = $true }
        if (!$rejected) { throw 'Tampered file accepted' }
        Remove-Item -LiteralPath $probe
        $rejected = $false
        try { CheckFile $probe $manifest.files['vela/ffi.h'] } catch { $rejected = $true }
        if (!$rejected) { throw 'Missing file accepted' }
    } finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe } }
}
[ordered]@{schema_version=1;status='passed';files=$required.Count;negative_checks=2 * [int]$SelfTest.IsPresent} | ConvertTo-Json -Compress
