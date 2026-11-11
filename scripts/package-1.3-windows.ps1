# Run in an x64 MSVC developer shell after the native verify and MCP build.
param(
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][string]$Output,
    [string]$HttpAdapter,
    [string]$HttpDependencies,
    [switch]$ReuseStage
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Stage = [IO.Path]::GetFullPath($Stage)
$Output = [IO.Path]::GetFullPath($Output)
$Native = Join-Path $Stage 'native'
$Mcp = Join-Path $Stage 'mcp'
$Version = '1.3.0'
$WindowsName = "vela-$Version-windows-x64.zip"
$McpName = "vela-mcp-$Version.zip"

function Digest([string]$File) {
    return (Get-FileHash -LiteralPath $File).Hash.ToLowerInvariant()
}

function Copy-SdkEntry([string]$Entry) {
    $target = Join-Path $Native $Entry
    New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $Root $Entry) -Destination $target -Recurse -Force
}

function Run-Compiler([string[]]$Arguments) {
    & (Join-Path $Native 'bin/velac.exe') @Arguments
    if ($LASTEXITCODE) { throw "Staged compiler failed: $Arguments" }
}

if (!$ReuseStage) {
    if (Test-Path -LiteralPath $Stage) { throw 'Use a fresh staging directory' }
    if (!$HttpAdapter -or !$HttpDependencies) { throw 'Specify the verified HTTP DLL and its dependency metadata' }
    $accepted = Get-Content (Join-Path $Root 'docs/acceptance/1.3.3.json') -Raw | ConvertFrom-Json
    if ((Digest $HttpAdapter) -cne $accepted.adapter.sha256) { throw 'HTTP adapter differs from 1.3.3' }
    New-Item -ItemType Directory -Force $Stage,$Mcp | Out-Null
    & (Join-Path $PSScriptRoot 'stage-native.ps1') -Destination $Native
    foreach ($entry in 'bootstrap/velac.c','tests/library13','native/http-client',
        'scripts/package-1.3-windows.ps1','scripts/package-1.3-linux.sh','scripts/verify-1.3-recovery.ps1',
        'scripts/stage-http-package.ps1','scripts/build-http-multi-deps.ps1') {
        Copy-SdkEntry $entry
    }
    foreach ($file in 'README.md','CONTRACT.md','main.vela','cli.vela','model.vela','report.vela','unit.vela',
        'vela.project','vela.project.lock','demo.jsonl','preview.png','demo-report.html','demo-report.json',
        'validation.json','validation-html.json','validation-native.json','token-usage.json','verify.ps1','verify-html.mjs') {
        Copy-SdkEntry "apps/build-lens/$file"
    }
    if ((Run-Compiler @('--version')) -cne "Vela $Version (self-hosted)") { throw 'Wrong native version' }
    foreach ($name in 'fielddesk','pulse-deck','http-collector') {
        $appBin = Join-Path $Native "apps/$name/bin"
        New-Item -ItemType Directory -Force $appBin | Out-Null
        Copy-Item -LiteralPath $HttpAdapter -Destination (Join-Path $appBin 'vela-http.dll') -Force
        & (Join-Path $PSScriptRoot 'stage-http-package.ps1') -Destination $appBin -Dependencies $HttpDependencies
    }
    foreach ($name in 'fielddesk','pulse-deck','build-lens') {
        $app = Join-Path $Native "apps/$name"
        $project = Join-Path $app 'vela.project'
        New-Item -ItemType Directory -Force (Join-Path $app 'bin') | Out-Null
        Run-Compiler @('lock',$project)
        Run-Compiler @('build',$project,'-o',(Join-Path $app "bin/$name.exe"))
    }
    foreach ($name in 'tree-index','log-summary','http-collector','gui-notes') {
        $app = Join-Path $Native "apps/$name"
        New-Item -ItemType Directory -Force (Join-Path $app 'bin') | Out-Null
        $file = if ($name -eq 'gui-notes') { 'notes.exe' } else { 'app.exe' }
        Run-Compiler @('build',(Join-Path $app 'main.vela'),'-o',(Join-Path $app "bin/$file"))
    }

    foreach ($entry in 'README.md','package.json','package-lock.json','compatibility.json','tsconfig.json',
        'src','dist','scripts','test','native') {
        Copy-Item -LiteralPath (Join-Path $Root "integrations/mcp/$entry") -Destination $Mcp -Recurse
    }
    Copy-Item -LiteralPath (Join-Path $Root 'LICENSE') -Destination $Mcp
    Copy-Item -LiteralPath (Join-Path $Root 'integrations/agent') -Destination (Join-Path $Mcp 'agent') -Recurse
    $contracts = Join-Path $Mcp 'docs/contracts'
    New-Item -ItemType Directory -Force $contracts | Out-Null
    foreach ($name in 'MCP-EXECUTION','MCP-PROTOCOL','MCP-OUTPUT-ARTIFACTS','SEMANTIC-QUERIES','REFACTORING',
        'INCREMENTAL-BUILD','LIBRARY-1.1','API-SEARCH-1.2','AGENT-ENTRY-1.2','DIAGNOSTIC-PLANS-1.2',
        'NATIVE-PGO-1.3','NATIVE-LTO-1.3','SEMANTIC-CACHE-1.3','C-OPTIMIZATION-1.3') {
        Copy-Item -LiteralPath (Join-Path $Root "docs/contracts/$name.md") -Destination $contracts
    }
    $readme = Join-Path $Mcp 'README.md'
    [IO.File]::WriteAllText($readme,[IO.File]::ReadAllText($readme).Replace('../../docs/','docs/'))
}

function Write-Archive([string]$Directory,[string]$Name,[string]$Target) {
    $archive = Join-Path $Output $Name
    $pending = $archive + '.pending'
    if ((Test-Path -LiteralPath $archive) -or (Test-Path -LiteralPath $pending)) { throw "Archive exists: $Name" }
    $manifestName = 'delivery-manifest.json'
    $manifestPath = Join-Path $Directory $manifestName
    $files = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName) {
        $relative = [IO.Path]::GetRelativePath($Directory,$file.FullName).Replace('\','/')
        if ($relative -eq $manifestName) { continue }
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $relative -match '(^|/)(build|node_modules|\.git|\.codex)/|\.pending$') {
            throw "Unexpected delivery entry: $relative"
        }
        $files[$relative] = [ordered]@{sha256=(Digest $file.FullName);bytes=$file.Length}
    }
    $manifest = [ordered]@{schema_version=1;version=$Version;target=$Target;license='MIT';files=$files}
    [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 7) + "`n")
    $files[$manifestName] = @{sha256=(Digest $manifestPath);bytes=(Get-Item -LiteralPath $manifestPath).Length}
    $zip = [IO.Compression.ZipFile]::Open($pending,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files.Keys) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $Directory $file),$file,
                [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose() }
    $zip = [IO.Compression.ZipFile]::OpenRead($pending)
    try {
        if ($zip.Entries.Count -ne $files.Count) { throw "Wrong archive entry count: $Name" }
        foreach ($file in $files.Keys) {
            $entry = $zip.GetEntry($file)
            if (!$entry -or $entry.Length -ne $files[$file].bytes) { throw "Wrong archive size: $file" }
            $stream = $entry.Open()
            try {
                if ((Get-FileHash -InputStream $stream).Hash.ToLowerInvariant() -cne $files[$file].sha256) {
                    throw "Wrong archive hash: $file"
                }
            } finally { $stream.Dispose() }
        }
    } finally { $zip.Dispose() }
    [IO.File]::Move($pending,$archive)
    [ordered]@{file=$archive;bytes=(Get-Item -LiteralPath $archive).Length;sha256=(Digest $archive);entries=$files.Count} |
        ConvertTo-Json -Compress
}

$pins = Get-Content -LiteralPath (Join-Path $Mcp 'compatibility.json') -Raw | ConvertFrom-Json -AsHashtable
$package = Get-Content -LiteralPath (Join-Path $Mcp 'package.json') -Raw | ConvertFrom-Json
if ($pins.version -cne $Version -or $package.version -cne $Version) { throw 'Wrong MCP version' }
foreach ($file in $pins.files.Keys) {
    if ((Digest (Join-Path $Native $file)) -cne $pins.files[$file]) { throw "MCP fingerprint mismatch: $file" }
}
New-Item -ItemType Directory -Force $Output | Out-Null
Write-Archive $Native $WindowsName 'windows-x64-msvc'
Write-Archive $Mcp $McpName 'node-24-windows-x64'
