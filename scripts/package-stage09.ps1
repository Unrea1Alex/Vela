$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Native = Join-Path $Root 'work/native-0.9.0-delivery'
$Mcp = Join-Path $Root 'work/mcp-0.9.0-delivery'
$Dist = Join-Path $Root 'dist'
$NativeName = 'vela-0.9.0-windows-x64.zip'
$McpName = 'vela-mcp-0.9.0.zip'
$Utf8 = [Text.UTF8Encoding]::new($false)
foreach ($Name in $NativeName,$McpName) {
    if (Test-Path -LiteralPath (Join-Path $Dist $Name)) {
        throw "Release archive already exists: $Name"
    }
}
if ((Test-Path -LiteralPath $Native) -or (Test-Path -LiteralPath $Mcp)) {
    throw 'Use fresh 0.9 delivery directories'
}
& (Join-Path $PSScriptRoot 'stage-native.ps1') -Destination $Native
$DemoBin = Join-Path $Native 'apps/measurelab/bin'
New-Item -ItemType Directory -Force -Path $DemoBin,$Mcp | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'apps/measurelab/bin/measurelab.exe') -Destination $DemoBin

foreach ($Entry in 'README.md','package.json','package-lock.json','compatibility.json','src',
    'dist','scripts','test','native','tsconfig.json') {
    Copy-Item -LiteralPath (Join-Path $Root "integrations/mcp/$Entry") -Destination $Mcp -Recurse
}
Copy-Item -LiteralPath (Join-Path $Root 'LICENSE') -Destination $Mcp
Copy-Item -LiteralPath (Join-Path $Root 'integrations/agent') -Destination (Join-Path $Mcp 'agent') -Recurse
$Contracts = Join-Path $Mcp 'docs/contracts'
New-Item -ItemType Directory -Path $Contracts -Force | Out-Null
foreach ($File in 'MCP-EXECUTION.md','MCP-PROTOCOL.md','MCP-OUTPUT-ARTIFACTS.md','SEMANTIC-QUERIES.md','REFACTORING.md') {
    Copy-Item -LiteralPath (Join-Path $Root "docs/contracts/$File") -Destination $Contracts
}
$Readme = Join-Path $Mcp 'README.md'
$ReadmeText = [IO.File]::ReadAllText($Readme)
$ReadmeText = $ReadmeText.Replace('../../docs/contracts/','docs/contracts/')
[IO.File]::WriteAllText($Readme,$ReadmeText,$Utf8)

function Write-DeliveryManifest([string]$Directory) {
    $Files = [ordered]@{}
    foreach ($File in Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName) {
        if ($File.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Delivery refuses links' }
        $Relative = $File.FullName.Substring($Directory.Length + 1).Replace('\','/')
        if ($Relative -match '(^|/)(build|node_modules|\.codex|\.git)/') {
            throw "Unexpected local state in delivery: $Relative"
        }
        if ($Directory -eq $Native -and $File.Extension -in '.py','.pyc') {
            throw "Unexpected Python file in native delivery: $Relative"
        }
        $Files[$Relative] = (Get-FileHash -LiteralPath $File.FullName).Hash.ToLowerInvariant()
    }
    $Manifest = [ordered]@{schema_version=1;version='0.9.0';files=$Files}
    [IO.File]::WriteAllText((Join-Path $Directory 'delivery-manifest.json'),
        ($Manifest | ConvertTo-Json -Depth 5) + "`n", $Utf8)
}
Write-DeliveryManifest $Native
Write-DeliveryManifest $Mcp

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
function Write-Archive([string]$Directory, [string]$Name) {
    $Target = Join-Path $Dist $Name
    $Pending = $Target + '.pending'
    if (Test-Path -LiteralPath $Pending) { throw "Archive staging already exists: $Pending" }
    $Zip = [IO.Compression.ZipFile]::Open($Pending,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($File in Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName) {
            $Relative = $File.FullName.Substring($Directory.Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $Zip,$File.FullName,$Relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $Zip.Dispose() }
    Move-Item -LiteralPath $Pending -Destination $Target
    return ((Get-FileHash -LiteralPath $Target).Hash.ToLowerInvariant() + '  ' + $Name)
}
$Hashes = @((Write-Archive $Native $NativeName),(Write-Archive $Mcp $McpName))
[IO.File]::WriteAllLines((Join-Path $Dist 'SHA256SUMS-0.9.0.txt'),$Hashes,$Utf8)
$Hashes
