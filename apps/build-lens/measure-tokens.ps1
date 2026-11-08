param([Parameter(Mandatory=$true)][string]$SessionFile,
    [string]$OutputFile=(Join-Path $PSScriptRoot 'token-usage.json'))
$ErrorActionPreference='Stop'
$request='напиши приложение с использованием нового функционала. напиши свои впечатления и посчитай токены потраченные на приложение'
$stream=[IO.FileStream]::new($SessionFile,'Open','Read','ReadWrite')
$reader=[IO.StreamReader]::new($stream)
$last=$null; $baseline=$null; $started=$null
try {
    while(!$reader.EndOfStream) {
        $line=$reader.ReadLine()
        # Read only usage events and this user request; never emit reasoning payloads.
        if($line.Contains('token_count')) {
            $item=$line|ConvertFrom-Json
            if($item.type -eq 'event_msg' -and $item.payload.type -eq 'token_count' -and $item.payload.info) {
                $last=@{timestamp=$item.timestamp; usage=$item.payload.info.total_token_usage}
            }
        }
        if($line.Contains($request)) {
            $item=$line|ConvertFrom-Json
            if($item.type -eq 'response_item' -and $item.payload.type -eq 'message' -and $item.payload.role -eq 'user') {
                $texts=@($item.payload.content | Where-Object type -eq 'input_text' | ForEach-Object { $_.text.Trim() })
                if($texts -contains $request) { $baseline=$last; $started=$item.timestamp }
            }
        }
    }
} finally { $reader.Dispose(); $stream.Dispose() }
if(!$baseline -or !$last) { throw 'Request boundary or provider usage is missing' }
$delta=[ordered]@{}
foreach($name in @('input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens')) {
    $delta[$name]=[long]$last.usage.$name - [long]$baseline.usage.$name
    if($delta[$name] -lt 0) { throw 'Counters reset; cannot subtract safely' }
}
$delta.uncached_input_tokens=$delta.input_tokens-$delta.cached_input_tokens
$delta.uncached_input_plus_output=$delta.uncached_input_tokens+$delta.output_tokens
$report=[ordered]@{schema_version=1; source='Provider cumulative token_count delta for this root session'; request_started=$started; baseline_timestamp=$baseline.timestamp; measured_through=$last.timestamp; scope='BuildLens implementation, documentation, validation and usage accounting in this user turn; previous Vela release work excluded'; excludes='The measurement tool response and subsequent assistant work/final reply'; reasoning_is_subset_of_output=$true; baseline=$baseline.usage; endpoint=$last.usage; usage=$delta}
$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $OutputFile -Encoding utf8
[pscustomobject]$report|Select-Object request_started,measured_through,usage|ConvertTo-Json -Depth 6
