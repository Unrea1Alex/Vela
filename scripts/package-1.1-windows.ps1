param([string]$Stage, [switch]$StageOnly)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Version = '1.1.0'
if (!$Stage) { $Stage = Join-Path $Root "build/stage1116/windows-$([Guid]::NewGuid().ToString('N'))" }
$Stage = [IO.Path]::GetFullPath($Stage)
if (Test-Path -LiteralPath $Stage) { throw 'Use a new staging directory' }
$Native = Join-Path $Stage 'native'
$Mcp = Join-Path $Stage 'mcp'
$Dist = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force $Stage,$Mcp,$Dist | Out-Null
& (Join-Path $PSScriptRoot 'stage-native.ps1') -Destination $Native

# Build examples against the staged matching SDK; historical source apps/locks
# and their acceptance receipts stay untouched in the source tree.
foreach ($Name in 'fielddesk','pulse-deck') {
    & (Join-Path $Native 'bin/velac.exe') lock (Join-Path $Native "apps/$Name/vela.project")
    if ($LASTEXITCODE -ne 0) { throw "Staged $Name lock failed" }
    & (Join-Path $Root 'vela.cmd') build (Join-Path $Native "apps/$Name/vela.project") -o (Join-Path $Native "apps/$Name/bin/$Name.exe")
    if ($LASTEXITCODE -ne 0) { throw "Staged $Name build failed" }
}
foreach ($Name in 'tree-index','log-summary','http-collector') {
    $Output = Join-Path $Native "apps/$Name/bin"
    New-Item -ItemType Directory -Force $Output | Out-Null
    & (Join-Path $Root 'vela.cmd') build (Join-Path $Native "apps/$Name/main.vela") -o (Join-Path $Output 'app.exe')
    if ($LASTEXITCODE -ne 0) { throw "Staged $Name build failed" }
}

foreach ($Entry in 'README.md','package.json','package-lock.json','compatibility.json',
    'src','dist','scripts','test','native','tsconfig.json') {
    Copy-Item -LiteralPath (Join-Path $Root "integrations/mcp/$Entry") -Destination $Mcp -Recurse
}
Copy-Item -LiteralPath (Join-Path $Root 'LICENSE') -Destination $Mcp
Copy-Item -LiteralPath (Join-Path $Root 'integrations/agent') -Destination (Join-Path $Mcp 'agent') -Recurse
$Contracts = Join-Path $Mcp 'docs/contracts'
New-Item -ItemType Directory $Contracts | Out-Null
foreach ($File in 'MCP-EXECUTION.md','MCP-PROTOCOL.md','MCP-OUTPUT-ARTIFACTS.md',
    'SEMANTIC-QUERIES.md','REFACTORING.md','INCREMENTAL-BUILD.md','LIBRARY-1.1.md') {
    Copy-Item -LiteralPath (Join-Path $Root "docs/contracts/$File") -Destination $Contracts
}
$Readme = Join-Path $Mcp 'README.md'
[IO.File]::WriteAllText($Readme,[IO.File]::ReadAllText($Readme).Replace('../../docs/contracts/','docs/contracts/'))

function Inventory([string]$Directory, [string]$Target) {
    $files = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName) {
        $relative = [IO.Path]::GetRelativePath($Directory,$file.FullName).Replace('\','/')
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $relative -match '(^|/)(build|node_modules|\.git|\.codex)/') {
            throw "Unexpected delivery entry: $relative"
        }
        $files[$relative] = [ordered]@{sha256=(Get-FileHash -LiteralPath $file.FullName).Hash.ToLowerInvariant();bytes=$file.Length}
    }
    $manifest = [ordered]@{schema_version=1;version=$Version;target=$Target;license='MIT';files=$files}
    $name = 'delivery-manifest.json'
    $manifestPath = Join-Path $Directory $name
    [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 7) + "`n")
    $files[$name] = @{sha256=(Get-FileHash -LiteralPath $manifestPath).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $manifestPath).Length}
    return $files
}
$nativeFiles = Inventory $Native 'windows-x64-msvc'
$mcpFiles = Inventory $Mcp 'node-24-windows-x64'
$pins = Get-Content -LiteralPath (Join-Path $Mcp 'compatibility.json') -Raw | ConvertFrom-Json -AsHashtable
if ($pins.version -cne $Version) { throw 'MCP compiler version differs from the release' }
foreach ($file in $pins.files.Keys) {
    if ($nativeFiles[$file].sha256 -cne $pins.files[$file]) { throw "MCP fingerprint mismatch: $file" }
}
if ($StageOnly) {
    [ordered]@{native=$Native;mcp=$Mcp;version=$Version;fingerprints='matched'} | ConvertTo-Json -Compress
    return
}

function Compress([string]$Directory,[string]$Name,$Files) {
    $target = Join-Path $Dist $Name
    $pending = $target + '.pending'
    if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $pending)) { throw "Archive already exists: $Name" }
    $zip = [IO.Compression.ZipFile]::Open($pending,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $Files.Keys) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $Directory $file),$file,
                [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose() }
    $zip = [IO.Compression.ZipFile]::OpenRead($pending)
    try {
        if ($zip.Entries.Count -ne $Files.Count) { throw "Wrong archive entry count: $Name" }
        foreach ($file in $Files.Keys) {
            $entry = $zip.GetEntry($file)
            if (!$entry -or $entry.Length -ne $Files[$file].bytes) { throw "Wrong archive size: $file" }
            $stream = $entry.Open()
            try {
                if ((Get-FileHash -InputStream $stream).Hash.ToLowerInvariant() -cne $Files[$file].sha256) {
                    throw "Wrong archive hash: $file"
                }
            } finally { $stream.Dispose() }
        }
    } finally { $zip.Dispose() }
    return $pending
}

$nativeName = "vela-$Version-windows-x64.zip"
$mcpName = "vela-mcp-$Version.zip"
$nativePending = Compress $Native $nativeName $nativeFiles
$mcpPending = Compress $Mcp $mcpName $mcpFiles
$moved = Join-Path $Stage 'Поставка Vela с пробелами'
[IO.Compression.ZipFile]::ExtractToDirectory($nativePending,$moved)
$outside = Join-Path $Stage 'outside'
New-Item -ItemType Directory $outside | Out-Null
$oldPath = $env:Path
Push-Location $outside
try {
    $env:Path = "$env:SystemRoot\System32;$env:SystemRoot"
    $compiler = Join-Path $moved 'bin/velac.exe'
    if ((& $compiler --version) -cne "Vela $Version (self-hosted)") { throw 'Relocated compiler version' }
    & $compiler check (Join-Path $moved 'examples/agent-idioms/main.vela')
    if ($LASTEXITCODE -ne 0) { throw 'Relocated check failed' }
    $app = Join-Path $moved 'apps/fielddesk/bin/fielddesk.exe'
    $report = Join-Path $outside 'report.html'
    & $app (Join-Path $moved 'apps/fielddesk/demo.json') (Join-Path $moved 'apps/fielddesk/demo.ndjson') $report
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $report)) { throw 'Relocated FieldDesk failed' }
    $pulse = Join-Path $moved 'apps/pulse-deck/bin/pulse-deck.exe'
    & $pulse --headless --output $outside
    if ($LASTEXITCODE -ne 1) { throw 'Relocated PulseDeck demo must report its intended failed probes' }
} finally {
    $env:Path = $oldPath
    Pop-Location
}
foreach ($Example in @(@('index','tree-index',26),@('logs','log-summary',46),@('http','http-collector',44))) {
    $Receipt = Join-Path $Stage ($Example[0] + '-relocated.json')
    & node (Join-Path $Root 'tests/library11/oracle/validate.mjs') $Example[0] (Join-Path $moved "apps/$($Example[1])/bin/app.exe") (Join-Path $outside $Example[0]) maintenance > $Receipt
    if ($LASTEXITCODE -ne 0) { throw "Relocated $($Example[0]) oracle failed" }
    $Result = Get-Content -LiteralPath $Receipt -Raw | ConvertFrom-Json
    if ($Result.passed -ne $Example[2] -or $Result.failed -ne 0) { throw 'Wrong relocated oracle count' }
}
foreach ($pending in $nativePending,$mcpPending) {
    $target = $pending.Substring(0,$pending.Length - '.pending'.Length)
    [IO.File]::Move($pending,$target)
    [ordered]@{file=$target;bytes=(Get-Item -LiteralPath $target).Length;
        sha256=(Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress
}
