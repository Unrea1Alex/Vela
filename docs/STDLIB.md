# Vela standard modules

The generated `api-index.json` is the signature/effects index, obtained from
checked public interfaces by `tools/help.vela`. Use [recipes](RECIPES.md) and
[capabilities](CAPABILITIES.md) for purpose, ownership and platform limits;
this guide explains behavior rather than defining a second signature catalog.
The [1.2 evolution contract](contracts/STDLIB-EVOLUTION-1.2.md) specifies future
opt-in modules and the separate later checked-value work; proposed APIs are not
available until their implementation stage is verified. Frozen 1.1 fixtures
preserve old aliases, callbacks, sorts, String line errors and public records.

`io` supplies opaque shared Reader/Writer handles, memory/file adapters and
bounded copy. `Chunk::End` alone means EOF; empty Data/zero writes are typed
NoProgress. Operational errors are sticky. `copy` borrows; `copy_owned` closes
both endpoints and preserves operation plus both cleanup errors. All I/O uses
the common state/io ceiling, including memory callbacks. File creation truncates
at open; partial failures do not roll back output. Explicit close is required.
The new stream_open_large/native writers share the old 128-handle budget.
`stream_lines` adds typed UTF-8/category/absolute-byte/line errors, strips initial
BOM and CR before LF, and retains bounded current-record/chunk storage. Buffer,
record and total limits are separate. Legacy `lines` retains its String errors,
CR behavior and 256 MiB total cap. See the exact [I/O contract](contracts/IO-1.2.md)
and [stream recipe](../examples/recipes/streams.vela).

`parallel` maps a bounded list through async callbacks with ordered typed
results. It reuses task_group and async_io: each item owns a Scope, and its slot
is reused only after child operations finish cleanup. Collect continues after
item errors; FailFast, cancellation and the overall deadline stop admission and
drain siblings. The host calls tick without a hidden sleep, keeps pumping GUI,
and waits for outcome before closing external resources. Completion reports
NotStarted items, independent cleanup causes and actual counters. Concurrency
is 1..128, input <=65536; fibers/host bridges require Windows. Linux supports
construction/empty mapping and reports driver failure for nonempty work.
[Contract](contracts/PARALLEL-1.2.md), [recipe](../examples/recipes/parallel.vela).

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
| algorithms | stable sort; map/filter/fold/find/any/all and try_ variants; state plus callback effects |
| set | opaque Set<K>, create/from_list/size/contains/insert/remove/values/union/intersection/difference |
| cell | opaque Cell<T>; create/get/set, explicit shared identity and state |
| json | Value/Member/Error; parse/stringify; typed cursor access; parse_with_limits and as_bool from dev.7 |
| json_stream (1.1) | Reader/Limits/Event/Token/Number/Error; create/next/skip_value/finish/read_string/read_integer; spelling/is_integer/integer/floating |
| json_decode (1.2) | opaque Decoder<T>/Fields; primitives/array/nullable/object; typed required/optional/defaulted and exact error coordinates |
| cli | Spec/Arguments/Error; parse/current |
| cli_schema | Opaque typed descriptors/schema/arguments; defaults, ranges, relations and help |
| config | Config/Error; parse/from_value/find/required/string/integer/number/boolean/allow_only |
| testing | Case<I,O>; equal/close/is_ok/is_err; для test-деклараций и обычного Vela-кода |
| result | map_error/explain from 0.10.0-dev.5 |
| result_ops / option | map/and_then/unwrap_or/unwrap_or_else; result_ops adds typed Context<E>/with_context |
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

Sorts return fresh outer lists. algorithms::sort uses stable bottom-up merging,
at most n*ceil(log2(n)) comparisons and O(n) extra slots; it snapshots elements
before the first comparator call and retains no callback. Compare sign orders
elements; zero takes the left item. Comparator effects add to state. Nested
payload aliases remain shared; inconsistent comparison still terminates but
sortedness requires a strict weak ordering. Empty/singleton inputs compare zero
times. collections::sort_ints/floats/strings use this common algorithm with their
old signatures/order: unsigned lexicographic string bytes, NaNs last, stable
equal values and signed zeros. [Contract](contracts/STDLIB-EVOLUTION-1.2.md),
[record example](../examples/recipes/sort.vela).

map/filter/fold/find/any/all and try_map/try_filter/try_fold/try_find/try_any/try_all
operate eagerly on a detached shallow snapshot taken before callbacks. Traversal
is in source order; find/any/all short-circuit. Fallible operations return the
first unchanged typed error and stop; no partial list is published. All callbacks
run at most once per visited element; map/filter/fold visit every element unless
a fallible callback fails. Empty any=false, all=true, find=None and fold returns
its initial value. Even a first-element short circuit creates the O(n) snapshot;
these are not lazy pipelines. Output outer lists are fresh, nested aliases stay
shared. Native resources created inside callbacks still require explicit caller
cleanup: discarding a partial managed list adds no destructor/rollback.

set::Set<K> uses Dict membership plus a private insertion-order list. Keys are
Int/Bool/String and distinct types over those; the Scalar bound alone is not
sufficient for Float64, and the existing Dict key check rejects it. Int32, enums
and records are not supported keys. Every operation requires state. Copies share
identity; values() returns fresh list storage. insert/remove report whether a key
was added/removed. Reinserting a removed key appends it. Binary operations return
independent sets: union lists left keys then absent right keys; intersection and
difference retain left order. Membership/insert use expected hash costs, not a
worst-case O(1) promise; removal scans O(n) and binary operations have expected
O(n+m) work/storage. No resource/lifetime or thread-safety model is added.
[Contract](contracts/STDLIB-EVOLUTION-1.2.md), [example](../examples/recipes/set.vela).

cell::Cell<T> gives explicit shared storage through create/get/set, all requiring
state. Copies and closure captures see the same slot; separate create calls stay
independent. get returns an ordinary value copy, so nested mutable payloads keep
their aliases. Setting a payload replaces the slot; clearing a returned List
payload does not clear internal storage. The one-element List is private and
cannot be constructed/accessed externally. Container work is O(1); Cell adds no
atomics, references, unique ownership, implicit close or worker-transfer promise.
[Contract](contracts/STDLIB-EVOLUTION-1.2.md), [example](../examples/recipes/cell.vela).

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
The opt-in [cli_schema](contracts/CLI-SCHEMA-1.2.md) validates descriptors before
argument access, resolves required/default values and inclusive Int bounds, and
checks named min<=max relations. Typed getters return Results. Inspect is_help
before reading values; help does not perform I/O. The three library acceptance
apps use this schema, print --help to stdout/exit 0 and errors to stderr/exit 2.
Configuration lookups have no coercion; integer 1 is not Float64 1.0. find returns
Option for optional fields; callers choose defaults and use allow_only to reject
unknown fields.

json_decode describes typed records with object(names, Unknown policy, builder),
whose builder calls required/optional/defaulted with typed Decoder<T> values.
decode first validates all syntax/UTF-8/duplicates with json_stream, including
unknown data, before callbacks. Ignore skips unknown conversion; Reject reports
the first unknown key before the builder. Missing, null and a default differ:
defaulted only substitutes absence, optional only makes absence optional, and
nullable explicitly accepts null. integer checks lexical signed Int64 and bounds;
number converts a finite Float64 with ordinary rounding and bounds. Arrays keep
source order and typed failures stop further element callbacks.

Outer errors carry root-relative JSON path and UTF-8 byte offset; an optional
json_stream cause is unchanged and uses its local span coordinates. Missing fields
point to the containing object. Syntax/input maxima remain 16 MiB/depth 4096/nodes
1000000; selected decoder nesting is separately 128, array count <=65536, fields
<=256, declared key <=1024 bytes and outer path <=65536 bytes. This is eager
in-memory decoding; span views retain backing input. Builders have state only;
failure does not undo their explicit captured state. Old json/json_stream remain
unchanged. [Contract](contracts/JSON-DECODE-1.2.md),
[record recipe](../examples/recipes/json-schema.vela).

Opt-in result_ops and option combinators call callbacks only for the matching
variant (zero or one call) and propagate their declared effects. unwrap_or takes
an eagerly evaluated default; unwrap_or_else delays its callback until Err/None.
and_then short-circuits, preserving the first typed error/None. with_context uses
the existing result::map_error to attach a message while retaining cause:E in
Context<E>; it does not implicitly stringify errors. Payload aliases are ordinary
values and callbacks are not retained. [Contract](contracts/STDLIB-EVOLUTION-1.2.md).

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
