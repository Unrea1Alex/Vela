$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$evidence=Get-Content (Join-Path $PSScriptRoot 'validation.json') -Raw | ConvertFrom-Json
$names=@('fielddesk.exe','vela-gui.dll','assets/settings.json')
$expected=@($evidence.executable_sha256,$evidence.adapter_sha256,$evidence.resource_sha256)
for($i=0;$i -lt $names.Count;$i++){
    $actual=(Get-FileHash (Join-Path $PSScriptRoot "bin/$($names[$i])") -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne $expected[$i]){throw "Unverified binary: $($names[$i])"}
}
$stage=Join-Path $root "build/fielddesk-package-$([Guid]::NewGuid().ToString('N'))"
$app=Join-Path $stage 'FieldDesk'
New-Item -ItemType Directory -Force "$app/bin/assets","$app/docs/contracts" | Out-Null
foreach($name in $names){Copy-Item (Join-Path $PSScriptRoot "bin/$name") "$app/bin/$name"}
foreach($name in @('README.md','CONTRACT.md','FEATURES.md','REVIEW.md','demo.json','demo.ndjson','demo-report.html','preview.jpg','validation.json','network-validation.json','ui-tooling-validation.json')){
    Copy-Item (Join-Path $PSScriptRoot $name) "$app/$name"
}
Copy-Item (Join-Path $root 'LICENSE') "$app/LICENSE"
Copy-Item (Join-Path $root 'docs/contracts/GUI-NETWORK.md') "$app/docs/contracts/GUI-NETWORK.md"
foreach($document in 'README.md','CONTRACT.md'){
    $file=Join-Path $app $document
    [IO.File]::WriteAllText($file,[IO.File]::ReadAllText($file).Replace('../../docs/contracts/','docs/contracts/'))
}
$files=@(Get-ChildItem $stage -File -Recurse)
$manifest=@{}
foreach($file in $files){$relative=[IO.Path]::GetRelativePath($stage,$file.FullName).Replace('\','/');$manifest[$relative]=(Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
$dist=Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$archive=Join-Path $dist 'fielddesk-1.0-vela-0.11.0-windows-x64.zip'
$pending="$archive.$([Guid]::NewGuid().ToString('N')).pending"
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$pending)
$zip=[IO.Compression.ZipFile]::OpenRead($pending)
try{
    $entries=@($zip.Entries | Where-Object { $_.Name -ne '' })
    if($entries.Count -ne $manifest.Count){throw 'Archive file count differs'}
    foreach($entry in $entries){
        $stream=$entry.Open()
        try{$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()}finally{$stream.Dispose()}
        if($hash -ne $manifest[$entry.FullName]){throw "Archive mismatch: $($entry.FullName)"}
    }
}finally{$zip.Dispose()}
Move-Item -LiteralPath $pending -Destination $archive -Force
$sha=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$sha  $([IO.Path]::GetFileName($archive))" | Set-Content "$archive.sha256" -Encoding ascii
@{archive=$archive;sha256=$sha;files=$manifest.Count;bytes=(Get-Item $archive).Length} | ConvertTo-Json
