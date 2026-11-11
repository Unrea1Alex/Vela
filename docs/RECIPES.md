# Executable SDK recipes

Choose a recipe before reading the full language reference. Import paths below
are relative to the shipped examples; application setup installs `vela-stdlib/`.
Signatures/effects are generated in `api-index.json` by native `vela api`, not
duplicated in this index. Examples and their golden outputs are release-checked.

| Purpose | Source | API IDs | Expected result |
|---|---|---|---|
| Reuse validated UTF-8 and lexical paths | [checked-values](../examples/recipes/checked-values.vela) | std/text:validate, std/text:checked_slice, std/path:validate, std/path:checked_parent | я:/data |
| Indexed immutable configuration snapshot | [config-snapshot](../examples/recipes/config-snapshot.vela) | std/config_snapshot:parse, std/config_snapshot:keys, std/config_snapshot:integer | port=8080 |
| Bounded ordered async mapping | [parallel](../examples/recipes/parallel.vela) | std/parallel:create, std/parallel:tick, std/parallel:outcome | parallel=2 (Windows); explicit unsupported driver on Linux |
| Bounded byte copy / typed streaming lines | [streams](../examples/recipes/streams.vela) | std/io:copy_owned, std/io:memory_reader, std/stream_lines:reader | copied=8 |
| Typed JSON records, defaults and ignored huge numbers | [json-schema](../examples/recipes/json-schema.vela) | std/json_decode:object, std/json_decode:required, std/json_decode:decode | record=demo:3 |
| Shared mutable closure state | [cell](../examples/recipes/cell.vela) | std/cell:create, std/cell:get, std/cell:set | cell=42 |
| Ordered typed set / shared identity | [set](../examples/recipes/set.vela) | std/set:create, std/set:insert, std/set:values | set=b,a |
| Eager transforms, short circuit and typed failures | [traversals](../examples/recipes/traversals.vela) | std/algorithms:map, std/algorithms:filter, std/algorithms:fold, std/algorithms:try_map | total=8,error=6 |
| Stable record sorting | [sort](../examples/recipes/sort.vela) | std/algorithms:sort | stable=B,A,C |
| Typed CLI, bounded integers and help | [cli](../examples/recipes/cli.vela) | std/cli_schema:create, std/cli_schema:current | repeat=3 (or supplied --repeat); --help exits 0 |
| First native program, collections / fold | [basics](../examples/recipes/basics.vela) | builtin:list_new, builtin:list_push, std/algorithms:fold | total=42 |
| Enumerate files / directory metadata | [directory](../examples/recipes/directory.vela) | std/directory:entries_bounded | example.txt in the supplied fixture |
| Validate and skip JSON / huge ignored numbers | [json](../examples/recipes/json.vela) | std/json_stream:create, std/json_stream:skip_value | valid JSON |
| Read binary bytes, including NUL | [bytes](../examples/recipes/bytes.vela) | std/fs:read_bytes | bytes=3 |
| Publish bytes and report cleanup separately | [file-publish](../examples/recipes/file-publish.vela) | std/fs:write_atomic_detailed, std/fs:describe_failure | published=5 for the supplied destination |
| Preserve typed errors with context / lazy defaults | [result](../examples/recipes/result.vela) | std/result_ops:with_context, std/option:unwrap_or_else | code=7 |
| Generic callback effects | [callable](../examples/recipes/callable.vela) | builtin:print | 42 |
| Validated HTTP request configuration | [http](../examples/recipes/http.vela) | std/http:from_url | request prepared |
| Reuse a native HTTP owner | [http-multi](../examples/recipes/http-multi.vela) | std/http:curl_multi, std/http:poll, std/http:close_multi | two status lines for the supplied URL; sibling adapter required on Windows x64 |

Compile/run with the installed CLI when execution=false. For the directory and
bytes recipes pass the fixture path after `--`; see the example comments.
For `file-publish`, pass a destination in an existing directory after `--`.
The HTTP configuration example is deterministic. For `http-multi`, supply a
local HTTP URL after `--` and stage the DLL beside the executable. See the
[native adapter build](contracts/HTTP-MULTI-1.3.md) and the
[HTTP request contract](contracts/HTTP-API.md). For complete applications see
[tree-index](../apps/tree-index/README.md), [log-summary](../apps/log-summary/README.md)
and [http-collector](../apps/http-collector/README.md).
