# Update acceptance/status documents after the already tested 1.2 archive gate.
# Preserve the tested archive; verify every final entry before atomic replacement.
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Archive=[IO.Path]::GetFullPath((Join-Path $Root 'dist/vela-1.2.0-windows-x64.zip'))
$Pending=$Archive+'.docs.pending'
$Backup=[IO.Path]::GetFullPath((Join-Path $Root 'build/stage12/vela-1.2.0-before-docs.zip'))
foreach($file in @($Archive,$Pending,$Backup)){if(!$file.StartsWith($Root+[IO.Path]::DirectorySeparatorChar)){throw 'Release path escaped workspace'}}
if((Test-Path -LiteralPath $Pending) -or (Test-Path -LiteralPath $Backup)){throw 'Use a fresh release documentation update'}
Copy-Item -LiteralPath $Archive -Destination $Pending
$changed=@('docs/ROADMAP.md','docs/VALIDATION-1.2.md','docs/COMPILER-AUDIT-1.2.md','docs/acceptance/1.2.9.json')
$zip=[IO.Compression.ZipFile]::Open($Pending,[IO.Compression.ZipArchiveMode]::Update)
try{
    $entry=$zip.GetEntry('delivery-manifest.json');$reader=[IO.StreamReader]::new($entry.Open())
    try{$manifest=$reader.ReadToEnd()|ConvertFrom-Json -AsHashtable}finally{$reader.Dispose()}
    if($manifest.version -cne '1.2.0'){throw 'Unexpected release version'}
    foreach($name in $changed){
        $source=Join-Path $Root $name
        $old=$zip.GetEntry($name);if($old){$old.Delete()}
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$source,$name,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
        $manifest.files[$name]=[ordered]@{sha256=(Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $source).Length}
    }
    $entry.Delete();$entry=$zip.CreateEntry('delivery-manifest.json',[IO.Compression.CompressionLevel]::Optimal)
    $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
    try{$writer.Write(($manifest|ConvertTo-Json -Depth 10)+"`n")}finally{$writer.Dispose()}
}finally{$zip.Dispose()}
$zip=[IO.Compression.ZipFile]::OpenRead($Pending)
try{
    if($zip.Entries.Count -ne $manifest.files.Count+1){throw 'Unexpected final archive entries'}
    foreach($name in $manifest.files.Keys){
        $entry=$zip.GetEntry($name);if(!$entry -or $entry.Length -ne $manifest.files[$name].bytes){throw "Wrong final size: $name"}
        $stream=$entry.Open()
        try{if((Get-FileHash -InputStream $stream).Hash.ToLowerInvariant() -cne $manifest.files[$name].sha256){throw "Wrong final hash: $name"}}finally{$stream.Dispose()}
    }
    $pins=Get-Content (Join-Path $Root 'integrations/mcp/compatibility.json') -Raw|ConvertFrom-Json -AsHashtable
    foreach($name in $pins.files.Keys){if($manifest.files[$name].sha256 -cne $pins.files[$name]){throw "Final MCP pin mismatch: $name"}}
}finally{$zip.Dispose()}
[IO.File]::Replace($Pending,$Archive,$Backup)
[ordered]@{version='1.2.0';status='passed';changed_documents=$changed;entries=$manifest.files.Count+1;sha256=(Get-FileHash -LiteralPath $Archive).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $Archive).Length;code='all existing non-document entry digests retained and checked';tested_archive_preserved=$Backup}|ConvertTo-Json -Depth 4
