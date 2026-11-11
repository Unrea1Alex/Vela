param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
if(-not (Test-Path -LiteralPath (Join-Path $Root 'bin/velac.exe') -PathType Leaf)){throw 'Root must be the verified native Vela installation'}
$owned = Join-Path $Root 'build/mcp-execution'
$cache = Join-Path $owned 'toolchain'
if(Test-Path -LiteralPath (Join-Path $owned 'execution.json.lock')){throw 'Execution cache is active or its stale lock needs review'}
if (Test-Path -LiteralPath $owned) {
    if (-not (Test-Path -LiteralPath (Join-Path $owned '.vela-owned'))) { throw 'Existing destination is not owned by this setup' }
} else {
    New-Item -ItemType Directory -Path $owned | Out-Null
    [IO.File]::WriteAllText((Join-Path $owned '.vela-owned'),'Vela MCP execution cache 1')
}
$programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
$vswhere = Join-Path $programFilesX86 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'MSVC x64 toolchain is required' }
$vcVersion = (Get-Content -LiteralPath (Join-Path $vs 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt')).Trim()
$vc = Join-Path $vs "VC/Tools/MSVC/$vcVersion"
$sdk = Join-Path $programFilesX86 'Windows Kits/10'
$sdkVersion = (Get-ChildItem -LiteralPath (Join-Path $sdk 'Include') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'um/Windows.h') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
if (-not $sdkVersion) { throw 'Windows SDK is required' }
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function CopyTree([string]$Source,[string]$Relative) {
    $Source = [IO.Path]::GetFullPath($Source).TrimEnd('\','/')
    $destination = [IO.Path]::GetFullPath((Join-Path $cache $Relative))
    if (-not $destination.StartsWith($cache + [IO.Path]::DirectorySeparatorChar)) { throw 'Cache path escaped root' }
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    foreach($file in Get-ChildItem -LiteralPath $Source -File -Recurse) {
        if($file.Name -eq 'vctip.exe'){continue} # Optional MSVC telemetry is not part of the compiler cache.
        if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Toolchain source contains a link'}
        $relativeFile = $file.FullName.Substring($Source.Length + 1)
        $target = Join-Path $destination $relativeFile
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
}
CopyTree (Join-Path $vc 'bin/Hostx64/x64') 'bin'
CopyTree (Join-Path $vc 'include') 'include/vc'
foreach($part in @('ucrt','shared','um')) { CopyTree (Join-Path $sdk "Include/$sdkVersion/$part") "include/$part" }
CopyTree (Join-Path $vc 'lib/x64') 'lib/vc'
CopyTree (Join-Path $sdk "Lib/$sdkVersion/ucrt/x64") 'lib/ucrt'
New-Item -ItemType Directory -Force -Path (Join-Path $cache 'lib/um') | Out-Null
Copy-Item -LiteralPath (Join-Path $sdk "Lib/$sdkVersion/um/x64/kernel32.lib") -Destination (Join-Path $cache 'lib/um/kernel32.lib') -Force
Copy-Item -LiteralPath (Join-Path $sdk "Lib/$sdkVersion/um/x64/uuid.lib") -Destination (Join-Path $cache 'lib/um/uuid.lib') -Force
Copy-Item -LiteralPath (Join-Path $Root 'bin/velac.exe') -Destination (Join-Path $cache 'velac.exe') -Force
$native = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../native'))
$helper = Join-Path $owned 'vela-sandbox.exe'
$probe = Join-Path $cache 'probe.exe'
$builder = Join-Path $owned 'build-native.cmd'
$cmd = @'
@echo off
call "%VELA_SETUP_VCVARS%" >nul
if errorlevel 1 exit /b 2
cl /nologo /std:c11 /W4 /O2 /MT /utf-8 "%VELA_SETUP_NATIVE%\sandbox.c" /Fo"%VELA_SETUP_OWNED%\sandbox.obj" /Fe"%VELA_SETUP_HELPER%" /link /STACK:16777216 userenv.lib advapi32.lib
if errorlevel 1 exit /b 2
cl /nologo /std:c11 /W4 /O2 /MT /utf-8 "%VELA_SETUP_NATIVE%\probe.c" /Fo"%VELA_SETUP_OWNED%\probe.obj" /Fe"%VELA_SETUP_PROBE%" /link advapi32.lib ws2_32.lib
exit /b %errorlevel%
'@
# cmd reads batch source in the active code page. Pass filesystem paths in
# the child environment so a relocated SDK can keep its Unicode paths.
[IO.File]::WriteAllText($builder,$cmd,[Text.Encoding]::ASCII)
$start = [Diagnostics.ProcessStartInfo]::new($env:ComSpec)
$start.UseShellExecute = $false
$start.Arguments = '/d /v:off /s /c ""%VELA_SETUP_BUILDER%""'
$start.EnvironmentVariables['VELA_SETUP_BUILDER'] = $builder
$start.EnvironmentVariables['VELA_SETUP_VCVARS'] = Join-Path $vs 'VC/Auxiliary/Build/vcvars64.bat'
$start.EnvironmentVariables['VELA_SETUP_NATIVE'] = $native
$start.EnvironmentVariables['VELA_SETUP_OWNED'] = $owned
$start.EnvironmentVariables['VELA_SETUP_HELPER'] = $helper
$start.EnvironmentVariables['VELA_SETUP_PROBE'] = $probe
$process = [Diagnostics.Process]::Start($start)
try {
    $process.WaitForExit()
    if($process.ExitCode -ne 0){throw 'Supervisor/probe build failed'}
} finally {
    $process.Dispose()
}
$files=[ordered]@{}
foreach($file in Get-ChildItem -LiteralPath $cache -File -Recurse | Sort-Object FullName) {
    $files[$file.FullName.Substring($cache.Length + 1).Replace('\','/')] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest=[ordered]@{schema_version=1;platform='windows-x64-lpac';root=$cache;helper=$helper;helper_sha256=(Get-FileHash $helper -Algorithm SHA256).Hash.ToLowerInvariant();c_compiler='bin/cl.exe';msvc=$vcVersion;sdk=$sdkVersion;files=$files}
$manifestPath=Join-Path $owned 'execution.json'
[IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output "Prepared $($files.Count) pinned files: $manifestPath"
