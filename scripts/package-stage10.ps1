$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Version = '0.10.0'
$Native = Join-Path $Root "work/native-$Version-delivery"
$Mcp = Join-Path $Root "work/mcp-$Version-delivery"
$Dist = Join-Path $Root 'dist'
$NativeName = "vela-$Version-windows-x64.zip"
$McpName = "vela-mcp-$Version.zip"
$Utf8 = [Text.UTF8Encoding]::new($false)
foreach ($Name in $NativeName,$McpName) {
    foreach ($Target in $Name,($Name + '.pending')) {
        if (Test-Path -LiteralPath (Join-Path $Dist $Target)) { throw "Archive path already exists: $Target" }
    }
}
if ((Test-Path -LiteralPath $Native) -or (Test-Path -LiteralPath $Mcp)) { throw 'Use fresh 0.10 delivery directories' }

& (Join-Path $PSScriptRoot 'stage-native.ps1') -Destination $Native
$NotesBin = Join-Path $Native 'apps/gui-notes/bin'
$MeasureLabBin = Join-Path $Native 'apps/measurelab/bin'
New-Item -ItemType Directory -Force -Path $NotesBin,$MeasureLabBin,$Mcp | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'build/gui-notes/notes.exe'),(Join-Path $Root 'build/gui-notes/vela-notes.dll') -Destination $NotesBin
Copy-Item -LiteralPath (Join-Path $Root 'build/stage1011/measurelab.exe') -Destination $MeasureLabBin
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
[IO.File]::WriteAllText($Readme,[IO.File]::ReadAllText($Readme).Replace('../../docs/contracts/','docs/contracts/'),$Utf8)

function Manifest([string]$Directory) {
    $Files = [ordered]@{}
    foreach ($File in Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName) {
        if ($File.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Delivery refuses links' }
        $Relative = $File.FullName.Substring($Directory.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, [char]'/')
        if ($Relative -match '(^|/)(build|node_modules|\.codex|\.git)/') { throw "Unexpected local state: $Relative" }
        if ($Directory -eq $Native -and $File.Extension -in '.py','.pyc') { throw "Unexpected Python file: $Relative" }
        $Files[$Relative] = (Get-FileHash -LiteralPath $File.FullName).Hash.ToLowerInvariant()
    }
    $Data = [ordered]@{schema_version=1;version=$Version;files=$Files}
    $Path = Join-Path $Directory 'delivery-manifest.json'
    [IO.File]::WriteAllText($Path,($Data | ConvertTo-Json -Depth 5) + "`n",$Utf8)
    $Files['delivery-manifest.json'] = (Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant()
    return $Files
}
$NativeFiles = Manifest $Native
$McpFiles = Manifest $Mcp
$Pins = Get-Content -LiteralPath (Join-Path $Mcp 'compatibility.json') -Raw | ConvertFrom-Json -AsHashtable
if ($Pins.version -cne $Version) { throw 'MCP compiler version differs from release version' }
foreach ($Path in $Pins.files.Keys) {
    if ($NativeFiles[$Path] -cne $Pins.files[$Path]) { throw "MCP fingerprint mismatch: $Path" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
function Archive([string]$Directory, [string]$Name, $Files) {
    $Pending = Join-Path $Dist ($Name + '.pending')
    $Zip = [IO.Compression.ZipFile]::Open($Pending,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($Path in $Files.Keys) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Zip,(Join-Path $Directory $Path),
                $Path,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $Zip.Dispose() }
    $Zip = [IO.Compression.ZipFile]::OpenRead($Pending)
    try {
        if ($Zip.Entries.Count -ne $Files.Count) { throw "Unexpected archive count: $Name" }
        foreach ($Path in $Files.Keys) {
            $Entry = $Zip.GetEntry($Path)
            if ($null -eq $Entry) { throw "Missing archive file: $Path" }
            $Stream = $Entry.Open()
            try {
                if ((Get-FileHash -InputStream $Stream).Hash.ToLowerInvariant() -cne $Files[$Path]) {
                    throw "Archive content mismatch: $Path"
                }
            } finally { $Stream.Dispose() }
        }
    } finally { $Zip.Dispose() }
}
Archive $Native $NativeName $NativeFiles
Archive $Mcp $McpName $McpFiles
$Hashes = foreach ($Name in $NativeName,$McpName) {
    $Target = Join-Path $Dist $Name
    Move-Item -LiteralPath ($Target + '.pending') -Destination $Target
    (Get-FileHash -LiteralPath $Target).Hash.ToLowerInvariant() + '  ' + $Name
}
[IO.File]::WriteAllLines((Join-Path $Dist "SHA256SUMS-$Version.txt"),$Hashes,$Utf8)
$Hashes
