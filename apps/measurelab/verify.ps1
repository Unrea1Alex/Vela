param([string]$VelaRoot=(Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference='Stop'
$VelaRoot=(Resolve-Path -LiteralPath $VelaRoot).Path
$Output=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'build/current.txt'))
$Executable=Join-Path $Output 'measurelab.exe'
$Work=Join-Path $PSScriptRoot ('build/validation-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Work | Out-Null
$Utf8=[Text.UTF8Encoding]::new($false)
$Checks=[Collections.Generic.List[string]]::new()
function Require([bool]$Condition,[string]$Name){if(-not $Condition){throw "Failed: $Name"}}
function Put([string]$Name,[string]$Value){$Path=Join-Path $Work $Name;[IO.File]::WriteAllText($Path,$Value,$Utf8);return $Path}
function Quote-Argument([string]$Value){
    return '"'+[regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}
function Invoke-App([string[]]$Arguments,[int]$Expected,[string]$Program=$Executable){
    $Start=[Diagnostics.ProcessStartInfo]::new()
    $Start.FileName=$Program
    $Start.Arguments=($Arguments|ForEach-Object {Quote-Argument $_}) -join ' '
    $Start.WorkingDirectory=$Work
    $Start.UseShellExecute=$false
    $Start.CreateNoWindow=$true
    $Start.RedirectStandardOutput=$true
    $Start.RedirectStandardError=$true
    $Start.StandardOutputEncoding=$Utf8
    $Start.StandardErrorEncoding=$Utf8
    $Start.EnvironmentVariables['PATH']="$env:SystemRoot\System32;$env:SystemRoot"
    $Process=[Diagnostics.Process]::new();$Process.StartInfo=$Start
    [void]$Process.Start()
    $OutTask=$Process.StandardOutput.ReadToEndAsync();$ErrTask=$Process.StandardError.ReadToEndAsync()
    if(-not $Process.WaitForExit(15000)){$Process.Kill();throw 'Application timeout'}
    $Text=$OutTask.GetAwaiter().GetResult();$ErrorText=$ErrTask.GetAwaiter().GetResult()
    $Code=$Process.ExitCode;$Process.Dispose()
    Require ($Code -eq $Expected) "exit $Code, expected $Expected; $ErrorText"
    return @{code=$Code;stdout=$Text;stderr=$ErrorText}
}
function Reject([string]$Name,[string]$Content){
    $InputFile=Put ($Name+'.json') $Content
    $Target=Put ($Name+'.html') 'previous report'
    $Hash=(Get-FileHash -LiteralPath $InputFile).Hash
    $Run=Invoke-App @($InputFile,$Target) 2
    Require ($Run.stderr.Length -gt 0) "$Name diagnostic"
    Require ([IO.File]::ReadAllText($Target) -eq 'previous report') "$Name output preserved"
    Require ((Get-FileHash -LiteralPath $InputFile).Hash -eq $Hash) "$Name input preserved"
    $Checks.Add($Name)
}
$Sample=Join-Path $PSScriptRoot 'sample.json'
$Target=Join-Path $Work 'demo.html'
$Run=Invoke-App @($Sample,$Target) 0
$Expected="scenarios=3 samples=60 over_budget=1`r`nРазбор JSON · 128 КБ: mean=4.04 p95=4.30 sigma=0.19 мс`r`nПостроение поискового индекса: mean=13.68 p95=22.10 sigma=3.35 мс`r`nЭкспорт отчёта в HTML: mean=6.63 p95=7.10 sigma=0.31 мс`r`n"
Require ($Run.stdout.EndsWith($Expected) -and $Run.stderr -eq '') 'exact demo statistics'
$Html=[IO.File]::ReadAllText($Target)
Require (($Html|Select-String -AllMatches '<article ').Matches.Count -eq 3) 'three scenarios'
Require (($Html|Select-String -AllMatches '<circle ').Matches.Count -eq 60) 'all measurements plotted'
Require (-not ($Html -match '(?i)<script|https?://|src=')) 'offline document'
$Checks.Add('demo exact output and HTML structure')
$Run=Invoke-App @($Sample,$Target,'--fail-on-budget') 3
Require ($Run.stdout.Contains('Saved:')) 'budget failure publishes report'
$Checks.Add('budget threshold exit 3 after publication')
$Good='{"title":"Known","scenarios":[{"name":"A","unit":"ms","baseline":5,"budget":9,"samples":[2,4,4,4,5,5,7,9]}]}'
$Known=Put 'known.json' $Good
$Run=Invoke-App @($Known,$Target,'--fail-on-budget') 0
Require ($Run.stdout.Contains('mean=5.00 p95=9.00 sigma=2.00 ms')) 'known population output'
$Checks.Add('known statistics and exact-budget pass')
$MaxCases=@(1..12|ForEach-Object {[ordered]@{name="Scenario $_";unit='ms';baseline=100;budget=300;samples=@(1..256)}})
$MaxInput=Put 'maximum.json' ([ordered]@{title='Maximum supported input';scenarios=$MaxCases}|ConvertTo-Json -Depth 5 -Compress)
$Run=Invoke-App @($MaxInput,$Target) 0
Require ($Run.stdout.Contains('scenarios=12 samples=3072 over_budget=0')) 'maximum input summary'
Require (([IO.File]::ReadAllText($Target)|Select-String -AllMatches '<circle ').Matches.Count -eq 3072) 'maximum chart samples'
$Checks.Add('maximum 12 by 256 dataset')
Reject 'malformed JSON' '{'
Reject 'unknown root field' ($Good.Replace('"title":','"extra":1,"title":'))
Reject 'duplicate field' ($Good.Replace('"title":','"title":"duplicate","title":'))
Reject 'unknown scenario field' ($Good.Replace('"name":','"extra":1,"name":'))
Reject 'zero baseline' ($Good.Replace('"baseline":5','"baseline":0'))
Reject 'negative budget' ($Good.Replace('"budget":9','"budget":-1'))
Reject 'empty samples' ($Good.Replace('[2,4,4,4,5,5,7,9]','[]'))
Reject 'negative sample' ($Good.Replace('[2,4,4,4,5,5,7,9]','[-0.01]'))
Reject 'string sample' ($Good.Replace('[2,4,4,4,5,5,7,9]','["2"]'))
Reject 'too many samples' ($Good.Replace('[2,4,4,4,5,5,7,9]',('['+((1..257) -join ',')+']')))
Reject 'nonfinite JSON number' ($Good.Replace('[2,4,4,4,5,5,7,9]','[1e999]'))
$Duplicate=('{"title":"X","scenarios":['+((($Good|ConvertFrom-Json).scenarios[0]|ConvertTo-Json -Compress))+','+((($Good|ConvertFrom-Json).scenarios[0]|ConvertTo-Json -Compress))+']}')
Reject 'duplicate scenario names' $Duplicate
Reject 'too many scenarios' ('{"title":"X","scenarios":['+((1..13|ForEach-Object {'{"name":"s'+$_+'","unit":"ms","baseline":1,"budget":1,"samples":[1]}'}) -join ',')+']}')
Reject 'control character in title' ($Good.Replace('Known','bad\u0000title'))
Reject 'oversized input' (' '*262145)
$BadUtf8=Join-Path $Work 'invalid-utf8.json';[IO.File]::WriteAllBytes($BadUtf8,[byte[]]@(255,254,255))
$Prior=[IO.File]::ReadAllText($Target)
$Run=Invoke-App @($BadUtf8,$Target) 2
Require ([IO.File]::ReadAllText($Target) -eq $Prior) 'UTF8 output preserved'
$Checks.Add('invalid UTF8')
$Original=(Get-FileHash -LiteralPath $Known).Hash
$Run=Invoke-App @($Known,$Known) 2
Require ((Get-FileHash -LiteralPath $Known).Hash -eq $Original) 'same-file input preserved'
$Checks.Add('input-output alias')
$HardLink=Join-Path $Work 'hardlink.html';New-Item -ItemType HardLink -Path $HardLink -Target $Known|Out-Null
$Run=Invoke-App @($Known,$HardLink) 2
Require ((Get-FileHash -LiteralPath $Known).Hash -eq $Original) 'hardlinked input preserved'
$Checks.Add('hardlink input-output alias')
$Unicode=Put 'данные с пробелом 😀.json' $Good
$Run=Invoke-App @($Unicode,(Join-Path $Work 'отчёт с пробелом 😀.html')) 0
$Checks.Add('Unicode and spaces in paths')
$Escaped=Put 'escaping.json' ($Good.Replace('Known','<script>alert(1)</script> & \"quote\"'))
$Run=Invoke-App @($Escaped,$Target) 0
$Html=[IO.File]::ReadAllText($Target)
Require ($Html.Contains('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;')) 'HTML escaping'
Require (-not $Html.Contains('<script>')) 'no injected element'
$Checks.Add('HTML injection escaped')
$Run=Invoke-App @('--help') 0
Require ($Run.stdout.Contains('Usage:')) 'help'
$Checks.Add('help without input')
$Run=Invoke-App @($Known,$Target,'--unknown') 2
$Checks.Add('unknown CLI option')
$Run=Invoke-App @($Known,(Join-Path $Work 'missing/report.html')) 2
$Checks.Add('missing output directory')
$NoDll=Join-Path $Work 'without-dll';New-Item -ItemType Directory -Path $NoDll|Out-Null
Copy-Item -LiteralPath $Executable -Destination (Join-Path $NoDll 'measurelab.exe')
$Prior=[IO.File]::ReadAllText($Target)
$Run=Invoke-App @($Known,$Target) 2 (Join-Path $NoDll 'measurelab.exe')
Require ($Run.stderr.Contains('Cannot load math adapter:')) 'recoverable FFI error'
Require ([IO.File]::ReadAllText($Target) -eq $Prior) 'FFI error preserves report'
$Checks.Add('missing native DLL fails before publication')
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'cli-tests.json'),([ordered]@{passed=$Checks.Count;failed=0;checks=@($Checks);workspace=$Work;path_without_node_python=$true}|ConvertTo-Json -Depth 4),$Utf8)
Write-Output "CLI checks: $($Checks.Count) passed"
