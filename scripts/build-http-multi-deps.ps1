param(
    [string]$WorkDirectory = (Join-Path $PSScriptRoot '../build/stage13/transport-deps'),
    [string]$Make = 'nmake.exe'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $WorkDirectory | Out-Null
$work = (Resolve-Path -LiteralPath $WorkDirectory).Path
$prefix = Join-Path $work 'install'
$releases = @(
    @{ name='c-ares-1.34.8'; archive='c-ares-1.34.8.tar.gz';
       url='https://github.com/c-ares/c-ares/releases/download/v1.34.8/c-ares-1.34.8.tar.gz';
       sha256='c222b6d681096f9444d2c4863d2c1174019e27cacca0a4a5c114d36dd7d7bf78' },
    @{ name='curl-8.23.0'; archive='curl-8.23.0.tar.xz';
       url='https://curl.se/download/curl-8.23.0.tar.xz';
       sha256='8dadd7d2536a314f982ad05a651b713f426bf7d02cc2c76cffb9796f2218e6c5' },
    @{ name='openssl-3.5.9'; archive='openssl-3.5.9.tar.gz';
       url='https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz';
       sha256='603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a' },
    @{ name='strawberry-perl-5.42.3.1'; archive='strawberry-perl-5.42.3.1-64bit-portable.zip';
       url='https://github.com/StrawberryPerl/Perl-Dist-Strawberry/releases/download/SP_54231_64bit/strawberry-perl-5.42.3.1-64bit-portable.zip';
       sha256='6a081a811781c30aca51dbc036afd93092af91e3297901f02c17043795a10690' }
)
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit $LASTEXITCODE" }
}
function Unpack([hashtable]$Release, [string]$Destination) {
    $file = Join-Path $work $release.archive
    if (!(Test-Path -LiteralPath $file)) {
        $pending = $file + '.' + [guid]::NewGuid().ToString('N') + '.download'
        try {
            Invoke-Checked "$env:SystemRoot/System32/curl.exe" @('--fail', '--location', '--silent', '--show-error', '--output', $pending, $release.url)
            if ((Get-FileHash -LiteralPath $pending).Hash.ToLowerInvariant() -ne $release.sha256) {
                throw "SHA-256 mismatch for $($release.archive)"
            }
            Move-Item -LiteralPath $pending -Destination $file
        } finally {
            if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending }
        }
    }
    if ((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $release.sha256) {
        throw "SHA-256 mismatch for $($release.archive)"
    }
    Invoke-Checked 'tar.exe' @('-xf', $file, '-C', $Destination)
}
foreach ($release in $releases[0..2]) { Unpack $release $work }
$perlRoot = Join-Path $work $releases[3].name
New-Item -ItemType Directory -Force -Path $perlRoot | Out-Null
Unpack $releases[3] $perlRoot
$perl = Join-Path $perlRoot 'perl/bin/perl.exe'
$sslSource = Join-Path $work $releases[2].name
$sslBuild = Join-Path $work 'openssl-build'
New-Item -ItemType Directory -Force -Path $sslBuild | Out-Null
$sslPrefix = Join-Path $work 'openssl-install'
Push-Location $sslBuild
try {
    Invoke-Checked $perl @((Join-Path $sslSource 'Configure'), 'VC-WIN64A', 'no-shared', 'no-asm',
        'no-tests', 'no-docs', 'no-module', 'no-engine', 'no-legacy', 'no-autoload-config', '-MT',
        "--prefix=$sslPrefix", "--openssldir=$sslPrefix")
    Invoke-Checked $Make @('install_dev')
} finally { Pop-Location }
$generator = @('-G', 'Visual Studio 17 2022', '-A', 'x64')
$caresBuild = Join-Path $work 'cares-build'
Invoke-Checked 'cmake' (@('-S', (Join-Path $work $releases[0].name), '-B', $caresBuild) + $generator + @(
    "-DCMAKE_INSTALL_PREFIX=$prefix", '-DCARES_MSVC_STATIC_RUNTIME=ON',
    '-DCARES_STATIC=ON', '-DCARES_SHARED=OFF', '-DCARES_BUILD_TESTS=OFF', '-DCARES_BUILD_TOOLS=OFF'))
Invoke-Checked 'cmake' @('--build', $caresBuild, '--config', 'Release', '--target', 'INSTALL', '--parallel', '8')

$curlBuild = Join-Path $work 'curl-build'
$disabled = @('ALTSVC','COOKIES','DICT','DOH','FILE','FTP','GOPHER','HSTS','HTTP_AUTH','IMAP','LDAP','LDAPS',
    'MIME','MQTT','NETRC','POP3','PROXY','RTSP','SMTP','TELNET','TFTP','WEBSOCKETS')
Invoke-Checked 'cmake' (@('-S', (Join-Path $work $releases[1].name), '-B', $curlBuild) + $generator + @(
    "-DCMAKE_INSTALL_PREFIX=$prefix", "-DCMAKE_PREFIX_PATH=$prefix", '-DCURL_STATIC_CRT=ON',
    '-DBUILD_CURL_EXE=OFF', '-DBUILD_SHARED_LIBS=OFF', '-DBUILD_STATIC_LIBS=ON',
    '-DBUILD_TESTING=OFF', '-DBUILD_LIBCURL_DOCS=OFF', '-DBUILD_MISC_DOCS=OFF',
    '-DENABLE_ARES=ON', '-DCARES_USE_STATIC_LIBS=ON', '-DENABLE_THREADED_RESOLVER=OFF',
    '-DCURL_USE_SCHANNEL=OFF', '-DCURL_USE_OPENSSL=ON', '-DCURL_USE_LIBPSL=OFF',
    "-DOPENSSL_ROOT_DIR=$sslPrefix", '-DOPENSSL_USE_STATIC_LIBS=ON', '-DOPENSSL_MSVC_STATIC_RT=TRUE',
    '-DCURL_CA_BUNDLE=none', '-DCURL_CA_PATH=none', '-DCURL_CA_NATIVE=OFF',
    '-DCURL_ZLIB=OFF', '-DCURL_BROTLI=OFF', '-DCURL_ZSTD=OFF', '-DUSE_LIBIDN2=OFF',
    '-DUSE_NGHTTP2=OFF', '-DCURL_USE_LIBSSH2=OFF', '-DCURL_USE_CMAKECONFIG=ON') +
    @($disabled | ForEach-Object { "-DCURL_DISABLE_${_}=ON" }))
Invoke-Checked 'cmake' @('--build', $curlBuild, '--config', 'Release', '--target', 'INSTALL', '--parallel', '8')

$licenses = Join-Path $prefix 'licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
Copy-Item -LiteralPath (Join-Path $work 'curl-8.23.0/COPYING') -Destination (Join-Path $licenses 'curl.txt')
Copy-Item -LiteralPath (Join-Path $work 'c-ares-1.34.8/LICENSE.md') -Destination (Join-Path $licenses 'c-ares.txt')
Copy-Item -LiteralPath (Join-Path $sslSource 'LICENSE.txt') -Destination (Join-Path $licenses 'openssl.txt')
[ordered]@{curl='8.23.0';tls='OpenSSL 3.5.9';resolver='c-ares 1.34.8';target='windows-x64';crt='static';releases=$releases} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $prefix 'vela-http-dependencies.json') -Encoding utf8
