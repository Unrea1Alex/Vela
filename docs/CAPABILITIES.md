# SDK capabilities

The actual compiler version and SHA-256 come from context. Working-tree 1.3
features are accepted stage by stage in the [roadmap](ROADMAP.md).

| Need | API ID / recipe | Limits and ownership |
|---|---|---|
| Reuse validated UTF-8 and paths | std/text:validate, std/path:validate; checked-values recipe | opaque immutable values; byte boundaries and lexical path rules |
| Repeated checked configuration lookup | std/config_snapshot:parse, std/config_snapshot:integer; config-snapshot recipe | indexed scalar lookup; bounded deep copy and detached aggregate reads |
| Explain diagnostics / checked source corrections | native plan diagnose; MCP vela_plan kind=diagnose; LSP code actions | exact revision/snapshot; no source writes; validated edits only; type choices and unsafe effects require explicit edits |
| Ordered bounded async map / cancel and drain | std/parallel:create, std/parallel:outcome; parallel recipe | Windows fibers; input snapshot, per-item Scope, Collect/FailFast, queue-inclusive deadline; host ticks/pumps until drained |
| Bounded synchronous memory/file streams | std/io:copy_owned, std/stream_lines:reader; streams recipe | shared explicit close; short I/O and typed errors; buffer/record/Int64 total separate; opt-in files >256 MiB |
| Typed JSON record/array schemas | std/json_decode:object, std/json_decode:decode; json-schema recipe | full syntax before callbacks; missing/null/default distinct; typed path/byte errors; eager bounded input |
| Explicit shared value cell | std/cell:create, std/cell:set; cell recipe | copies/captures share identity; get/set require state; no atomics or implicit resource close |
| Typed set membership and algebra | std/set:create, std/set:union; set recipe | existing Dict key types; shared identity; insertion order; values/algebra storage independent |
| Stable generic sorting | std/algorithms:sort; sort recipe | detached outer snapshot; O(n log n) comparisons/O(n) slots; nested aliases shared |
| Eager typed collection algorithms | std/algorithms:map, std/algorithms:try_fold; basics recipe | detached snapshot even for short circuit; first typed error stops; state plus callback effects |
| Typed command-line arguments and help | std/cli_schema:create, std/cli_schema:current; CLI recipe | validated descriptor snapshot; state/args; no library I/O |
| Create a CLI or source-module library | native init NEW_DIRECTORY --kind cli\|library; quickstart | existing parent, new destination; manifest/lock/demo/named test; no overwrite |
| Directory metadata and traversal | std/directory:entries_bounded, std/directory:walk; directory recipe | Windows/Linux; explicit budgets; no link descent; scans close on early exit |
| Selective JSON / ignored huge numbers | std/json_stream:skip_value; json recipe | bounded UTF-8 buffer, no DOM; aliases share cursor; unknown data validated |
| Binary file input / atomic output | std/fs:read_bytes, std/fs:write_atomic; bytes recipe | byte limit; text validation opt-in; atomic publication only after success |
| Atomic publication with cleanup detail | std/fs:write_atomic_detailed, std/fs:copy_atomic, std/io:copy_detailed; file-publish recipe | bounded buffers, typed operation and cleanup errors, explicit commit flag |
| HTTP/HTTPS client and connection reuse | std/http:curl_multi, std/http:close_multi; http-multi recipe | Windows x64 sibling DLL; bounded active/queued requests and bytes, queue-inclusive deadline, explicit drain/release/close |
| Compatibility curl response-body deadline | std/http:curl_transfer; HTTP compatibility contract | Windows trusted curl 8.4+; exact transfer timeout, bounded helper overhead; cancel/drain/release |
| Typed errors / callbacks / defaults | std/result:map_error, std/result_ops:with_context, std/option:unwrap_or_else; result/callable recipes | effects propagate; eager/lazy defaults differ; explicit captures; exhaustive variants |
| GUI / tasks / public FFI | std/gui:open, std/task_group:create | Windows only; ABI 1 adapters; task ownership and shutdown required |
| Compiler / console | native check/build/test/run, api | Windows MSVC and Linux GCC/musl; native algorithms require neither Node nor Python |

Linux HTTP/GUI/DLL/fiber/process adapters, arbitrary runtime reflection and
unbounded memory are not supported. Contracts are runtime checks, not proofs.
The legacy json/curl APIs retain their original limits/deadline semantics.
See [recipes](RECIPES.md), the generated API index `api-index.json`,
[platform contract](contracts/PLATFORM-SUPPORT.md) and [stdlib](STDLIB.md).
