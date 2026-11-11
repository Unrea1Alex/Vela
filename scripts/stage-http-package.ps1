param(
    [Parameter(Mandatory)][string]$Destination,
    [string]$Dependencies = (Join-Path $PSScriptRoot '../build/stage13/transport-deps/install')
)
$ErrorActionPreference = 'Stop'
$manifest = Join-Path $Dependencies 'vela-http-dependencies.json'
$metadata = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($metadata.curl -ne '8.23.0' -or $metadata.tls -ne 'OpenSSL 3.5.9' -or
    $metadata.resolver -ne 'c-ares 1.34.8' -or $metadata.target -ne 'windows-x64' -or
    $metadata.crt -ne 'static') {
    throw 'HTTP dependency metadata does not match the pinned adapter.'
}
$licenses = Join-Path $Destination 'licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
foreach ($name in 'curl.txt', 'openssl.txt', 'c-ares.txt') {
    Copy-Item -LiteralPath (Join-Path $Dependencies "licenses/$name") -Destination $licenses
}
Copy-Item -LiteralPath $manifest -Destination $Destination
