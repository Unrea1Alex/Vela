param([string]$Executable = (Join-Path $PSScriptRoot 'bin/buildlens.exe'))
$ErrorActionPreference = 'Stop'
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work = Join-Path $repo ('build/buildlens-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$checks = [Collections.Generic.List[string]]::new()
function Assert([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw "FAILED: $Name" }
    $checks.Add($Name)
}
function Run([string[]]$Arguments) {
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $info.StandardErrorEncoding = [Text.Encoding]::UTF8
    foreach ($a in $Arguments) { $info.ArgumentList.Add($a) }
    $process = [Diagnostics.Process]::Start($info)
    $out = $process.StandardOutput.ReadToEndAsync()
    $err = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(60000)) { $process.Kill($true); throw 'BuildLens timeout' }
    $answer = @{code=$process.ExitCode; stdout=$out.GetAwaiter().GetResult(); stderr=$err.GetAwaiter().GetResult()}
    $process.Dispose()
    return $answer
}
function Save([string]$Name, [string]$Content) {
    $file = Join-Path $work $Name
    [IO.File]::WriteAllText($file, $Content, [Text.UTF8Encoding]::new($false))
    return $file
}
function Event([string]$Id, [string]$Suite='core', [string]$Name='test', [string]$Status='passed', [long]$Duration=10) {
    return ([ordered]@{id=$Id; suite=$Suite; name=$Name; status=$Status; duration_ms=$Duration} | ConvertTo-Json -Compress)
}
function Reject([string]$Name, [string]$Content, [string]$ErrorPattern) {
    $file = Save "$Name.jsonl" $Content
    $target = Save 'preserved.json' 'KEEP EXISTING REPORT'
    $r = Run @($file, '--output', $target)
    Assert ($r.code -eq 2 -and $r.stdout -eq '' -and $r.stderr -match $ErrorPattern) $Name
    Assert ([IO.File]::ReadAllText($target) -ceq 'KEEP EXISTING REPORT') "$Name preserves report"
}
$demo = Join-Path $PSScriptRoot 'demo.jsonl'
$r = Run @($demo)
Assert ($r.code -eq 0 -and $r.stderr -eq '') 'demo succeeds'
$data = $r.stdout | ConvertFrom-Json
Assert (($data.summary | ConvertTo-Json -Compress) -ceq '{"events":15,"duplicates":1,"selected":14,"tests":11,"failed":2,"flaky":2,"skipped":1,"total_ms":18860}') 'literal demo summary'
Assert (($data.tests.name -join '|') -ceq 'Возврат платежа|Промокод на первый заказ|Вход через SSO|Экспорт большого каталога|Оплата банковской картой|Загрузка аватара|Восстановление пароля|Поиск по каталогу|Проверка прав доступа|Пустой ответ сервера|Удаление аккаунта') 'literal priority order'
$again = Run @($demo)
Assert ($again.stdout -ceq $r.stdout) 'deterministic JSON'
$r = Run @($demo, '--top', '1')
$data = $r.stdout | ConvertFrom-Json
Assert ($r.code -eq 0 -and $data.tests.Count -eq 1 -and $data.summary.tests -eq 11) 'top keeps whole summary'
$r = Run @($demo, '--suite', 'auth', '--fail-on-problem')
$data = $r.stdout | ConvertFrom-Json
Assert ($r.code -eq 1 -and $data.summary.tests -eq 2 -and $data.summary.selected -eq 3 -and $data.summary.flaky -eq 1 -and $data.summary.total_ms -eq 3700) 'suite filter and flaky CI exit'
$r = Run @($demo, '--suite', 'api', '--fail-on-problem')
Assert ($r.code -eq 0) 'clean suite CI exit'
$target = Join-Path $work 'ci-report.json'
$r = Run @($demo, '--fail-on-problem', '--output', $target)
Assert ($r.code -eq 1 -and (Test-Path -LiteralPath $target) -and $r.stdout -eq '') 'CI failure still publishes report'
$r = Run @('--help')
Assert ($r.code -eq 0 -and $r.stdout.Contains('--max-events')) 'help needs no input'
foreach ($argsList in @(@($demo,'--top','0'), @($demo,'--top','1001'), @($demo,'--top','x'), @($demo,'--wat'), @($demo,'--format','csv'), @($demo,'--top','1','--top','2'), @())) {
    $r = Run $argsList
    Assert ($r.code -eq 2 -and $r.stdout -eq '') ('invalid CLI ' + ($argsList -join ' '))
}
$r = Run @((Join-Path $work 'missing.jsonl'))
Assert ($r.code -eq 2 -and $r.stdout -eq '') 'missing input'
$r = Run @($demo, '--output', (Join-Path $work 'missing/report.json'))
Assert ($r.code -eq 2) 'missing output parent'
$blank = Save 'empty.jsonl' " `t`r`n"
$r = Run @($blank)
Assert ($r.code -eq 0 -and ($r.stdout | ConvertFrom-Json).summary.tests -eq 0) 'blank input'
$one = Event 'a'
$unicode = Save 'вход 🌿 с пробелами.jsonl' ([char]0xfeff + $one + "`r`n`r`n" + (Event 'b' 'набор 🌿' 'имя'))
$r = Run @($unicode)
Assert ($r.code -eq 0 -and ($r.stdout | ConvertFrom-Json).summary.tests -eq 2) 'Unicode path BOM CRLF no final LF'
Reject 'bad-json' ($one + "`n`n{bad") 'line 3:'
Reject 'unknown-field' ($one.TrimEnd('}') + ',"oops":0}') 'unknown'
Reject 'duplicate-key' ($one.TrimEnd('}') + ',"id":"again"}') 'duplicate'
Reject 'missing-field' '{"id":"x"}' 'missing'
Reject 'null-field' ($one.Replace('"name":"test"','"name":null')) 'String'
Reject 'bad-status' (Event 'a' 's' 'n' 'unknown') 'status'
Reject 'negative-duration' (Event 'a' 's' 'n' 'passed' -1) 'range|bounds'
Reject 'large-duration' (Event 'a' 's' 'n' 'passed' 86400001) 'range|bounds'
Reject 'fractional-duration' ($one.Replace('"duration_ms":10','"duration_ms":1.5')) 'integer|Int'
Reject 'empty-id' (Event '') '1..256'
Reject 'long-name' (Event 'a' 's' ('n' * 257)) '1..256'
Reject 'invalid-duplicate' ($one + "`n" + (Event 'a' 's' 'n' 'unknown')) 'line 2:.*status'
Reject 'long-line' (' ' * 65537) 'record limit'
$invalid = Join-Path $work 'invalid-utf8.jsonl'
[IO.File]::WriteAllBytes($invalid, [byte[]](0xc0,0xaf,10))
$r = Run @($invalid)
Assert ($r.code -eq 2 -and $r.stderr -match 'UTF-8') 'malformed UTF-8'
$limit = Save 'limit.jsonl' ($one + "`n" + (Event 'b'))
$r = Run @($limit, '--max-events', '1')
Assert ($r.code -eq 2 -and $r.stderr -match 'event limit') 'event budget'
$copy = Save 'same.jsonl' $one
$hash = (Get-FileHash -LiteralPath $copy).Hash
$r = Run @($copy, '--output', $copy)
Assert ($r.code -eq 2 -and (Get-FileHash -LiteralPath $copy).Hash -eq $hash) 'same file protected'
$hardlink = Join-Path $work 'hardlink.jsonl'
New-Item -ItemType HardLink -Path $hardlink -Target $copy | Out-Null
$r = Run @($copy, '--output', $hardlink)
Assert ($r.code -eq 2 -and (Get-FileHash -LiteralPath $copy).Hash -eq $hash) 'hardlink protected'
$r = Run @($demo, '--output', $work)
Assert ($r.code -eq 2) 'directory output rejected'
$malicious = Save 'html-data.jsonl' (Event 'x' 'a&b' '<script>alert(1)</script>"')
$r = Run @($malicious, '--format', 'html')
Assert ($r.code -eq 0 -and $r.stdout.Contains('&lt;script&gt;alert(1)&lt;/script&gt;&quot;') -and !$r.stdout.Contains('<script>alert(1)</script>')) 'HTML data escaped'
$boundaries = Save 'boundaries.jsonl' ((Event 'x' 'a' 'bc' 'passed' 86400000) + "`n" + (Event 'y' 'ab' 'c' 'passed' 0))
$r = Run @($boundaries)
$data = $r.stdout | ConvertFrom-Json
Assert ($r.code -eq 0 -and $data.summary.tests -eq 2 -and $data.summary.total_ms -eq 86400000) 'duration boundaries and composite-key separation'
$r = Run @($boundaries, '--suite', 'nonexistent')
Assert ($r.code -eq 0 -and ($r.stdout | ConvertFrom-Json).summary.tests -eq 0) 'no selected tests'
$ordered = Save 'ties.jsonl' ((Event '1' 'z' 'a') + "`n" + (Event '2' 'a' 'b') + "`n" + (Event '3' 'a' 'a'))
$r = Run @($ordered)
$data = $r.stdout | ConvertFrom-Json
Assert (($data.tests | ForEach-Object { $_.suite + '/' + $_.name }) -join '|' -ceq 'a/a|a/b|z/a') 'deterministic tie breaks'
$big = Join-Path $work '10000-events.jsonl'
$writer = [IO.StreamWriter]::new($big,$false,[Text.UTF8Encoding]::new($false))
try { for($i=0; $i -lt 10000; $i++) { $writer.WriteLine((Event ([string]$i) 'load' ('test-' + ($i % 100)) 'passed' 10)) } } finally { $writer.Dispose() }
$timer = [Diagnostics.Stopwatch]::StartNew()
$r = Run @($big, '--top', '1000')
$timer.Stop()
$data = $r.stdout | ConvertFrom-Json
Assert ($r.code -eq 0 -and $data.summary.tests -eq 100 -and $data.summary.selected -eq 10000 -and $data.summary.total_ms -eq 100000 -and $data.tests[0].attempts -eq 100) '10000 events across stream chunks'
$receipt = [ordered]@{schema_version=1; passed=$checks.Count; failed=0; checks=@($checks); load_events=10000; load_elapsed_ms=$timer.ElapsedMilliseconds; executable_sha256=(Get-FileHash -LiteralPath $Executable).Hash.ToLower(); platform='Windows x64'; work_directory=$work}
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'validation.json') -Encoding utf8
[pscustomobject]$receipt | Select-Object passed,failed,load_events,load_elapsed_ms | ConvertTo-Json -Compress
