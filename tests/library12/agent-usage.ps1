param([Parameter(Mandatory=$true)][string]$Experiment)
$ErrorActionPreference='Stop'
$Protocol=Get-Content -LiteralPath (Join-Path $Experiment 'protocol.json') -Raw|ConvertFrom-Json
$Expected=@{};foreach($trial in $Protocol.trials){$Expected['/root/'+$trial.agent_task]=$trial}
$Reports=@()
foreach($file in Get-ChildItem -LiteralPath 'C:/Users/user/.codex/sessions/2026/11/08' -Filter '*.jsonl' -File){
    $stream=[IO.FileStream]::new($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $reader=[IO.StreamReader]::new($stream)
    try{
        $first=$reader.ReadLine()|ConvertFrom-Json
        $spawn=$first.payload.source.subagent.thread_spawn
        if(!$spawn -or $spawn.parent_thread_id -ne '01a1b667-ab47-7920-b569-3b939a0bd990' -or !$Expected.ContainsKey($spawn.agent_path)){continue}
        $trial=$Expected[$spawn.agent_path];$usage=$null;$calls=@();$outputs=@{};$last=$first.timestamp;$complete=$false
        while(!$reader.EndOfStream){
            $line=$reader.ReadLine();if(!$line){continue}
            try{$item=$line|ConvertFrom-Json -ErrorAction Stop}catch{continue}
            if($item.timestamp){$last=$item.timestamp}
            if($item.type -eq 'event_msg' -and $item.payload.type -eq 'token_count'){$usage=$item.payload.info.total_token_usage}
            if($item.type -eq 'event_msg' -and $item.payload.type -eq 'task_complete'){$complete=$true}
            if($item.type -eq 'response_item' -and $item.payload.type -eq 'custom_tool_call'){
                $calls+=[ordered]@{id=$item.payload.call_id;name=$item.payload.name;input=[string]$item.payload.input;time=$item.timestamp}
            }
            if($item.type -eq 'response_item' -and $item.payload.type -eq 'custom_tool_call_output'){
                $outputs[$item.payload.call_id]=$item.payload.output|ConvertTo-Json -Depth 30 -Compress
            }
        }
        $help=@();$corrections=@();$referenceReads=@()
        foreach($call in $calls){
            $inputText=$call.input;$resultText=$outputs[$call.id]
            if($inputText -match '(?i)(Get-Content|ReadAllText|readFile|\brg\b|\bcat\b|\bapi\b|--help)' -and $inputText -match '(?i)(reference|sdk.{0,80}(docs|std)|\bapi\b|--help)'){$help+=$call.id}
            if($resultText -match 'exit_code.{0,6}:\s*1' -and $resultText -match '\bE[0-9]{3}\b'){
                $corrections+=[ordered]@{call_id=$call.id;codes=@([regex]::Matches($resultText,'\bE[0-9]{3}\b')|ForEach-Object Value|Sort-Object -Unique)}
            }
            if($inputText -match 'reference'){$referenceReads+=[ordered]@{call_id=$call.id;truncated=($resultText -match 'truncated|exceeded.{0,30}token');input=$inputText}}
        }
        $Reports+=[ordered]@{id=$trial.id;variant=$trial.variant;session_id=$first.payload.id;session_file=$file.FullName;agent_path=$spawn.agent_path;started=$first.timestamp;last_event=$last;wall_seconds=[Math]::Round((([DateTimeOffset]$last)-([DateTimeOffset]$first.timestamp)).TotalSeconds,3);complete=$complete;input=$usage.input_tokens;cached=$usage.cached_input_tokens;uncached=($usage.input_tokens-$usage.cached_input_tokens);output=$usage.output_tokens;reasoning_output=$usage.reasoning_output_tokens;tool_invocations=$calls.Count;help_tool_invocations=$help.Count;help_call_ids=$help;compiler_error_results=$corrections.Count;compiler_errors=$corrections;reference_reads=$referenceReads}
    }finally{$reader.Dispose();$stream.Dispose()}
}
$Report=[ordered]@{schema_version=1;experiment=$Experiment;usage_source='provider cumulative token_count, own fresh subagent sessions only';help_metric='tool invocations requesting API/help or reading assigned reference/SDK docs/std; call IDs retained';correction_metric='tool results with exit code 1 and native E-code, one result per observed compiler correction cycle';trials=$Reports}
$Report|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $Experiment 'usage.json') -Encoding utf8
$Reports|ForEach-Object {[pscustomobject]$_}|Select-Object id,input,cached,uncached,output,wall_seconds,tool_invocations,help_tool_invocations,compiler_error_results,complete|ConvertTo-Json -Compress
