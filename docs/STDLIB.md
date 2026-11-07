# Vela standard modules

Implementation: [std](../std/). The native compiler remains dependency-free;
these are ordinary Vela modules with explicit imports. The MCP setup copies the
matching modules into the application's `vela-stdlib/` folder. For example:

```text
import "vela-stdlib/json.vela" as json;
fn main() -> Int effects { state, io } {
    match json::parse("{\"n\":1.25}") {
        Result::Ok(value) => {
            match json::stringify(value) {
                Result::Ok(data) => { print(data); }
                Result::Err(_) => { return 2; }
            }
        }
        Result::Err(_) => { return 1; }
    }
    return 0;
}
```

Alternatively declare a local manifest dependency, e.g.
`dep|json|vela-stdlib/json.vela`, import `"@json"`, then review and run
`vela lock vela.project`. There is no registry or implicit std import.
MCP snapshots require dependencies to be inside the configured workspace.

| Module | Public API |
|---|---|
| text | Bytes/Text records; checked/decode/encode/slice/codepoint/invalid_offset; trim/split/html/pad_zero |
| path | Path; checked/absolute/parent/join |
| fs | read_bytes/read_text/write_atomic/write_text_atomic |
| directory (1.1) | Kind/Entry/Error/Scan; open/next/close, entries/entries_bounded; Limits/WalkEntry/walk; Windows/Linux no-follow metadata |
| process | run(argv, cwd, stdout, stderr, timeout_ms); schedule with a cooperative loop on Windows from 0.11.0-dev.1 |
| event_loop | create/submit/tick/cancel/outcome/shutdown for explicit continuations from 0.11.0-dev.1 |
| tasks | submit typed async callables on Windows and wait_for a loop task from 0.11.0-dev.2 |
| collections | copy/reverse/sort_ints/sort_floats/sort_strings/compare |
| json | Value/Member/Error; parse/stringify; typed cursor access; parse_with_limits and as_bool from dev.7 |
| json_stream (1.1) | Reader/Limits/Event/Token/Number/Error; create/next/skip_value/finish/read_string/read_integer; spelling/is_integer/integer/floating |
| cli | Spec/Arguments/Error; parse/current |
| config | Config/Error; parse/from_value/find/required/string/integer/number/boolean/allow_only |
| testing | Case<I,O>; equal/close/is_ok/is_err; для test-деклараций и обычного Vela-кода |
| result | map_error/explain from 0.10.0-dev.5 |
| lines | reader/next/from_string for bounded chunked line processing from dev.7 |
| services | FileStore, Processes, Clock, Entropy and OS or scripted implementations from dev.7 |
| replay | record/transcript/start/next/finish for typed service transcripts from dev.8 |

Fallible operations return typed errors in generic Result. Use qualified names to
avoid collisions. Collection operations require state; file operations io;
process.run requires state/io/process; cli.current additionally args. Check the
authored module signatures before calling unfamiliar APIs.

`directory::walk(root, directory::Limits(depth: 1024, entries: 1000000))`
returns entries with relative `/` paths and explicit depths. Root is depth zero;
all encountered entries count, including directories and links. The traversal
uses a Vela work list, closes each parent scan before opening children, and never
follows links. OS order is unspecified; sort the result when order matters.
For a complete Bytes/atomic-output example, see [tree-index](../apps/tree-index/README.md).

`result::map_error(value, transform)` passes an Ok payload through unchanged
and calls the typed transform once on Err. The function signature propagates
the transform's effects. `result::explain(value, message)` replaces any Err
payload with the supplied String. Use a transform when the report needs the
original cause or source path.

`json::parse_with_limits` distinguishes byte, depth and node exhaustion.
`json::as_bool` preserves the cursor path on a type mismatch. The original
parse function keeps its default limits and Error type.
For selective parsing with large ignored numbers or deeper JSON, use the opt-in
`json_stream` module. It reads a bounded UTF-8 buffer without constructing Value
trees, validates skipped structures/escapes/duplicates, and preserves number
spellings. `integer` accepts only an integer literal in Int range; `1.0` and `1e0`
are different lexical categories. `floating` converts only on request and reports
range errors. `Limits(bytes, depth, nodes)` allows at most 16 MiB /4096 /1000000.
Offsets are zero-based UTF-8 bytes; paths use `$["key"][index]`.

Consume events through `next`, or `skip_value` for one whole value. Call `finish`
when stopping early to validate the remainder and reject trailing data. Reader
aliases share progress, syntax errors are sticky, and conversion errors leave
the stream valid. No file handle is owned by this in-memory reader. The existing
json API retains its depth/numeric behavior. See the [1.1 contract](contracts/LIBRARY-1.1.md)
and the working [log-summary](../apps/log-summary/README.md).
Use [the service contract](contracts/SERVICES.md) for bounds, file stream
ownership and injected services.
`replay` records the request and typed response from an explicit service
and can replay a snapshot using only `state`. See [the replay contract](contracts/REPLAY.md).

Create a loop with `event_loop::create<T>(now)`, submit a continuation with a
timeout and call `tick` with monotonic milliseconds. `Turn::Waiting(time)`
provides the next absolute wake time in the same clock domain. A host loop
can wait for input or that deadline. Cancellation is a request. Keep ticking
until the stop callback confirms completion and `outcome` is available.
`shutdown` requests cancellation of all tasks. Drive it to `Turn::Idle`
before releasing owners of resources used by callbacks.
`tasks::submit` takes an async callable and returns an ordinary
`event_loop::Task<T>`. A typed task can use `await tasks::wait_for(other)`
while the host drives the other task's loop. Cancelling the waiter leaves
the other task owned by its original loop. Shut down both owners when
closing a window that owns both. [Typed task fixture](../tests/stdlib/tasks.vela).
[Contract](contracts/ASYNC-CANCELLATION.md).
[Executable tests](../tests/stdlib/event-loop.vela).

Text/Bytes/Path are ordinary nominal records during the compatibility migration.
Text.data must be UTF-8, Path.value must be nonempty UTF-8 without NUL. Checked
operations validate even forged record fields. String and old str_* still use
raw bytes; indexing/slicing is in bytes. Text.slice rejects split code points.
Trim removes ASCII space/tab/CR/LF; split preserves empty fields and rejects an
empty separator. pad_zero uses total minimum width including a minus sign,
bounded to 4096; it never truncates. HTML escapes &, <, >, quotes and apostrophes.
Path parent/join are lexical, recognize Windows drive/UNC roots, and confer no
filesystem permission. Absolute children replace the base in join.

read_bytes/read_text accept a byte limit in 0..256 MiB, stop once exceeded and
return a typed Limit; read_text also validates UTF-8. Atomic writes create a
private sibling temporary, close the file and rename, then remove the directory.
Before rename succeeds the destination is unchanged. Cleanup(path, committed)
reports whether publication already succeeded; inspect that flag before retrying.
Metadata preservation, power-loss durability and concurrent conflict detection
are not promised. The OS may deny replacing an open file.

process.run uses an argv list without a shell, an explicit child cwd, two output
files resolved relative to the caller, and timeout 1..2147483647 ms. It returns
Completed(code) for every actual exit, including 124. TimedOut and Launch are
distinct errors. Output files are overwritten as requested, even if launching
fails. Existing output aliases and invalid UTF-8/NUL arguments are rejected.
This module is not an OS sandbox. Windows owns a Job for redirected children;
MCP execution has its separate isolation contract.

`http::get` or `http::from_url` constructs a bounded request. `with_method` accepts
Get/Head/Post/Put/Delete and immutable `text::Bytes` (upload <=1 MiB).
`with_headers` snapshots up to 32 validated headers; framing/auth headers reject.
InvalidHeaders and InvalidBody are new Error variants; update exhaustive matches.
Start it with an explicit
`dyn http::Transport`, tick the process event loop, and poll the exchange.
Use `http::curl_transfer` in 1.1 with an absolute path to a trusted curl 8.4+ executable
for a complete-transfer timeout and separately bounded helper startup/drain.
`http::curl` retains the 1.0 combined launch/transfer deadline. Configure either,
or `http::scripted` for a test. Check the status separately from transport
errors. Cancel and drive the loop while `http::pending` is true.
`http::release` removes output and upload files after drain.
`http_server` accepts one GET or HEAD per connection on Windows IPv4 loopback.
Request adds `method`; Response constructors now require `content_type`, for example
`"application/octet-stream"` or `"text/plain; charset=utf-8"`. HEAD has no body.
Build and place the [Winsock adapter](../native/http-server/adapter.c) beside
the executable. Drive `poll` with a monotonic clock and call `close` when done.
See [HTTP API and migration](contracts/HTTP-API.md), [HTTP and TLS](contracts/NETWORK-TLS.md) and the
[network fixtures](../tests/network/http-client.vela).

`path::executable()` and `path::resource_base()` return checked OS paths
with the `io` effect and typed host or path validation errors. Join the base
with a declared `assets/` path to open packaged data independently of cwd.
See [packaging](contracts/PACKAGING.md).

Sorts return copies and are stable insertion sorts, O(n²), intended for bounded
collections. String order is lexicographic unsigned bytes. Float NaNs sort last;
equal values retain order, including signed zeros. No callback comparators yet.

JSON Value variants: Null, Boolean(Bool), Integer(Int), Number(Float64),
StringValue(String), Array(List<Value>), Object(List<Member>). Member has name
and value. Parse and stringify enforce UTF-8, finite floats, unique object keys,
16 MiB input/output, depth 128, 65536 values and 4096-byte numeric input tokens.
Surrogate pairs decode correctly; lone surrogates and raw controls are errors.
Integer spellings fitting Int remain Integer; other finite numbers are Number.
Stringify preserves member order and emits Number with a dot or exponent.
Integer spelling -0 becomes Integer(0); Number(-0.0) preserves its sign.
Forged cyclic value graphs fail the depth bound during serialization.

CLI specs are long option names with takes_value. Supports --name=value,
--name value, flags and -- terminator; unknown/duplicate/missing options fail.
A value beginning -- must use =. Other arguments, including -2, are positional.
Configuration lookups have no coercion; integer 1 is not Float64 1.0. find returns
Option for optional fields; callers choose defaults and use allow_only to reject
unknown fields.

Working application: [config-report](../apps/config-report/README.md).
The [PulseDeck](../apps/pulse-deck/README.md) example combines typed async
warm-up tasks, the HTTP client, a loopback server, cancellation and packaged
JSON settings. Its current source uses awaitable HTTP in task-owned scopes
(1.0.0-dev.1). The archived 0.11 application used separate host-polled exchanges.

Another application, [MeasureLab](../apps/measurelab/README.md), uses
`float_sqrt`, `float_to_fixed`, typed JSON paths and a bounded text builder.
`json::decode` produces a cursor. Use `json::field` and `json::item` to navigate it,
then `as_object`, `as_array`, `as_string`, `as_int` or `as_number` to read the
type. Choose `IntegerMode::Exact` or `Round` when reading a number.
`json::with_path` preserves the original typed cause in `At<E>`.
`config.number` keeps its Number-only behavior. See [typed JSON](contracts/JSON-DECODE-ERRORS.md).

`text::builder` takes a byte limit. Append `Bytes` using `text::append`,
finish with `finish_bytes` or UTF-8-checking `finish_text`, and reuse the
builder with `reset`. Copies share fragments and accounting. Finished
values remain independent. See [builder rules](contracts/TEXT-BUILDER.md).
Tests: `vela test tests/stdlib/declarations.vela --json` in the compiler repository.
In an application, import vela-stdlib/testing.vela. Tables are Lists of Case<I,O>;
iterate explicitly and pass each case's name to assertions. equal uses scalar
equality (NaN is unequal); close accepts finite Float64 and nonnegative finite
absolute tolerance. Assertions abort only their current test process.
Contracts: [STDLIB](contracts/STDLIB.md), [TEXT-BYTES-PATH](contracts/TEXT-BYTES-PATH.md),
[NUMBERS](contracts/NUMBERS.md). Current OS validation is Windows x64/MSVC.

## Task groups (1.0.0-dev.1)

`task_group.vela` provides one owner for heterogeneous typed async tasks and
bounded host operations. `spawn(group, timeout, async fn(scope: Scope) -> T)`
returns `Task<T>`. `task_outcome` stays pending until all children have drained.
`shutdown` requests cancellation; the host keeps calling `tick` until it returns
true. Inspect `cleanup_errors` for failures separate from the primary result.

Inside the task, await `async_io::fetch(scope, transport, request, directory,
timeout)` or `async_io::run_process(scope, argv, cwd, stdout, stderr, timeout)`.
Their typed error distinguishes queue, operation, timeout, cancellation and
cleanup. Timeouts include time queued for a slot. Host callbacks perform the
OS work; async bodies still reject blocking calls. See [contract](contracts/TASK-GROUPS.md)
and the migrated [PulseDeck](../apps/pulse-deck/README.md).

## GUI forms (1.0.0-dev.3)

`gui.vela` provides `open(Config)`, `pump(window, wait_ms)`, `set_text`, `status`,
`enabled`, `snapshot` and idempotent `close`. Config contains title/caption,
logical client dimensions, read_only, text_limit, a List<Button>, close_id and
changed_id (zero disables changes). Pump returns ordered event IDs in a copied
list; callbacks only enqueue. Close application tasks before closing the window.
The opaque Window shares ownership across copies. Windows 10+ x64 requires the
trusted ABI 1 `vela-gui.dll`, built from `native/gui/adapter.c`, beside the exe.
Notes, FieldDesk and PulseDeck use this same layer. It handles per-monitor DPI,
Unicode text and native scrolling. See [GUI library](contracts/GUI-LIBRARY.md).
