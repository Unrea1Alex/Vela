param([switch]$StageOnly,[switch]$ArchiveOnly)
$ErrorActionPreference='Stop'
$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$VerifiedNative=Join-Path $RepoRoot 'work/native-0.6.0-stage'
$NativeDelivery=Join-Path $RepoRoot 'work/native-0.6.0-delivery'
$McpDelivery=Join-Path $RepoRoot 'work/mcp-0.6.0-delivery'
function Copy-TreeFiles([string]$Source,[string]$Target) {
    if(Test-Path -LiteralPath $Source -PathType Leaf) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Target -Force
        return
    }
    foreach($File in Get-ChildItem -LiteralPath $Source -Recurse -File) {
        $Relative=[IO.Path]::GetRelativePath($Source,$File.FullName)
        $Destination=Join-Path $Target $Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item -LiteralPath $File.FullName -Destination $Destination -Force
    }
}
if(-not $ArchiveOnly) {
New-Item -ItemType Directory -Force -Path $NativeDelivery,(Join-Path $RepoRoot 'dist') | Out-Null
foreach($Entry in @('vela.cmd','velac.cmd','vela-dev.cmd','selfhost','tools','tests','examples','apps/timelog','bootstrap','bin','vela')) {
    Copy-TreeFiles (Join-Path $VerifiedNative $Entry) (Join-Path $NativeDelivery $Entry)
}
foreach($Entry in @('README.md','AGENTS.md','docs','selfhost/README.md','integrations/mcp/README.md','integrations/agent')) {
    Copy-TreeFiles (Join-Path $RepoRoot $Entry) (Join-Path $NativeDelivery $Entry)
}
Copy-TreeFiles (Join-Path $RepoRoot 'docs') (Join-Path $McpDelivery 'docs')
Copy-TreeFiles (Join-Path $RepoRoot 'integrations/agent') (Join-Path $McpDelivery 'agent')
foreach($File in Get-ChildItem -LiteralPath $NativeDelivery -Recurse -File) {
    if($File.Extension -in @('.py','.pyc') -or $File.Name -eq 'node.exe') { throw "Unexpected native dependency: $($File.FullName)" }
}
}
if($StageOnly) { return }
foreach($Pair in @(@($NativeDelivery,'vela-0.6.0-windows-x64.zip'),@($McpDelivery,'vela-mcp-0.6.0.zip'))) {
    $Archive=Join-Path $RepoRoot ('dist/'+$Pair[1])
    # Zip only explicitly selected files. MCP node_modules are installed by npm ci.
    $Zip=[IO.Compression.ZipFile]::Open($Archive,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach($File in Get-ChildItem -LiteralPath $Pair[0] -Recurse -File) {
            $Relative=[IO.Path]::GetRelativePath($Pair[0],$File.FullName).Replace('\','/')
            if($Relative.StartsWith('node_modules/')) { continue }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Zip,$File.FullName,$Relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $Zip.Dispose() }
}
Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'dist') -Filter '*0.6.0*.zip' | Select-Object Name,Length
