$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stage=Join-Path $repo ('build/buildlens-package-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$files=@('README.md','CONTRACT.md','demo.jsonl','demo-report.html','demo-report.json','validation.json','validation-html.json','validation-native.json','token-usage.json')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/buildlens.exe') -Destination (Join-Path $stage 'buildlens.exe')
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination (Join-Path $stage 'LICENSE')
foreach($name in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $stage $name) }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'preview.png') -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'preview-mobile.png') -Destination $stage
$manifest=[ordered]@{name='BuildLens';version='0.1.0';language='Vela 1.2.0';target='windows-x64';files=@(Get-ChildItem -LiteralPath $stage -File | Sort-Object Name | ForEach-Object { [ordered]@{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLower()} })}
$manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding utf8
$archive=Join-Path $repo 'dist/BuildLens-0.1.0-windows-x64.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
$installed=Join-Path $stage 'проверка установки 🌿'
Expand-Archive -LiteralPath $archive -DestinationPath $installed
foreach($file in $manifest.files) {
    $path=Join-Path $installed $file.name
    if((Get-Item -LiteralPath $path).Length -ne $file.bytes -or (Get-FileHash -LiteralPath $path).Hash.ToLower() -ne $file.sha256) { throw "Archive mismatch: $($file.name)" }
}
$oldPath=$env:PATH
$oldDirectory=Get-Location
try {
    $env:PATH=Join-Path $env:SystemRoot 'System32'
    Set-Location $installed
    $json=& .\buildlens.exe .\demo.jsonl
    if($LASTEXITCODE -ne 0) {throw 'Packaged executable failed'}
    $data=($json -join "`n")|ConvertFrom-Json
    if($data.summary.total_ms -ne 18860 -or $data.summary.tests -ne 11) {throw 'Packaged oracle mismatch'}
} finally { $env:PATH=$oldPath; Set-Location $oldDirectory }
$receipt=[ordered]@{archive=$archive;bytes=(Get-Item -LiteralPath $archive).Length;sha256=(Get-FileHash -LiteralPath $archive).Hash.ToLower();inventory_files=$manifest.files.Count;relocation_unicode_spaces=$true;stripped_path=$true;literal_demo_check=$true}
$receipt|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'validation-package.json') -Encoding utf8
$receipt|ConvertTo-Json -Depth 5
