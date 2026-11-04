param([switch]$StageOnly,[switch]$ArchiveOnly)
$ErrorActionPreference='Stop'
$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$NativeDelivery=Join-Path $RepoRoot 'work/native-0.7.0-delivery'
$McpDelivery=Join-Path $RepoRoot 'work/mcp-0.7.0-delivery'
function Copy-TreeFiles([string]$Source,[string]$Target) {
    if(Test-Path -LiteralPath $Source -PathType Leaf){
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target)|Out-Null
        Copy-Item -LiteralPath $Source -Destination $Target -Force
        return
    }
    $Source=[IO.Path]::GetFullPath($Source).TrimEnd('\','/')
    foreach($File in Get-ChildItem -LiteralPath $Source -Recurse -File){
        if($File.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Delivery refuses links'}
        $Relative=$File.FullName.Substring($Source.Length+1)
        $Destination=Join-Path $Target $Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination)|Out-Null
        Copy-Item -LiteralPath $File.FullName -Destination $Destination -Force
    }
}
if(-not $ArchiveOnly){
    if(-not (Test-Path -LiteralPath $NativeDelivery)){
        & (Join-Path $PSScriptRoot 'stage-native.ps1') -Destination $NativeDelivery
    }
    # Refresh only release-owned inputs after validation; no build output in archives.
    foreach($Entry in @('README.md','AGENTS.md','docs','bootstrap','integrations/agent','integrations/mcp/README.md','bin/build-manifest.json','dist/timelog-windows-x64.zip')){
        Copy-TreeFiles (Join-Path $RepoRoot $Entry) (Join-Path $NativeDelivery $Entry)
    }
    foreach($Entry in @('package.json','package-lock.json','README.md','compatibility.json','dist','src','native','scripts','test','tsconfig.json')){
        Copy-TreeFiles (Join-Path $RepoRoot ('integrations/mcp/'+$Entry)) (Join-Path $McpDelivery $Entry)
    }
    Copy-TreeFiles (Join-Path $RepoRoot 'integrations/agent') (Join-Path $McpDelivery 'agent')
    Copy-TreeFiles (Join-Path $RepoRoot 'docs') (Join-Path $McpDelivery 'docs')
    # Preserve relative links in the shipped documentation, including explicitly
    # historical reports. These sources are reference material; setup still pins
    # and reads the separately installed native toolchain.
    foreach($Entry in @('examples/agent-idioms','selfhost/README.md','selfhost/formatter.vela','bootstrap/README.md','prototypes/windows','vela/ffi.h','apps/timelog','apps/config-report','std','tools/test.vela','bin/build-manifest.json','dist/timelog-windows-x64.zip')){
        Copy-TreeFiles (Join-Path $RepoRoot $Entry) (Join-Path $McpDelivery $Entry)
    }
    $Readme=Join-Path $McpDelivery 'README.md'
    [IO.File]::WriteAllText($Readme,([IO.File]::ReadAllText($Readme).Replace('../../docs/contracts/MCP-EXECUTION.md','docs/contracts/MCP-EXECUTION.md')),[Text.UTF8Encoding]::new($false))
}
foreach($Delivery in @($NativeDelivery,$McpDelivery)){
    $Files=[ordered]@{}
    foreach($File in Get-ChildItem -LiteralPath $Delivery -Recurse -File|Sort-Object FullName){
        $Relative=$File.FullName.Substring($Delivery.Length+1).Replace('\','/')
        if($Relative -eq 'delivery-manifest.json'){continue}
        if($Relative.StartsWith('node_modules/') -and $Delivery -eq $McpDelivery){continue}
        if($Relative -match '^(build|node_modules)/'){throw 'Generated build/dependencies in native delivery'}
        if($Delivery -eq $NativeDelivery -and ($File.Extension -in @('.py','.pyc') -or $File.Name -eq 'node.exe')){throw 'Native delivery unexpectedly requires scripting runtime'}
        $Files[$Relative]=(Get-FileHash -LiteralPath $File.FullName).Hash.ToLowerInvariant()
    }
    [IO.File]::WriteAllText((Join-Path $Delivery 'delivery-manifest.json'),([ordered]@{schema_version=1;version='0.7.0';files=$Files}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}
if($StageOnly){return}
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'dist')|Out-Null
foreach($Pair in @(@($NativeDelivery,'vela-0.7.0-windows-x64.zip'),@($McpDelivery,'vela-mcp-0.7.0.zip'))){
    $Archive=Join-Path $RepoRoot ('dist/'+$Pair[1])
    if(Test-Path -LiteralPath $Archive){throw 'Archive exists; preserve it and choose a new release version'}
    $Zip=[IO.Compression.ZipFile]::Open($Archive,[IO.Compression.ZipArchiveMode]::Create)
    try{foreach($File in Get-ChildItem -LiteralPath $Pair[0] -Recurse -File){
        $Relative=$File.FullName.Substring($Pair[0].Length+1).Replace('\','/')
        if($Relative.StartsWith('node_modules/')){continue}
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Zip,$File.FullName,$Relative,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
    }}finally{$Zip.Dispose()}
    Get-FileHash -LiteralPath $Archive
}
