# Write an application with Vela 1.1

In Vela 0.10 and later, use `pub opaque struct` when only the defining
module should construct or access the fields. Export factories and operations
as ordinary functions. In older 0.9 archives, use the 0.9 help for accepted syntax.

First call vela_get_context, then vela_get_help for the relevant topic. The native
compiler and the shipped builtin catalog are the authority. Run vela_check after
each small change; inspect diagnostic codes, source and spans. Do not guess APIs
from Rust, Python or TypeScript. Read execution capabilities from vela_get_context.

If your editor/agent cannot write files, pass unsaved code as optional `text` to
vela_check, vela_format or vela_symbols along with a relative source `path`.
The adapter overlays this one file only inside its temporary snapshot, including
a new file; it never writes the workspace. Return the checked source to the host
for saving. A text overlay is source code, not a project manifest replacement.
For a project, use `path="vela.project"`, `overlay_path="main.vela"`, and `text`
with the draft source; native dependency aliases and locks remain active.
When execution is enabled, use vela_build/vela_test with the same snapshot inputs,
then vela_run with the returned artifact_id. A changed workspace needs a new build.
Runs have a private working directory and no network access. Otherwise use the
host's authorized native CLI or report that execution was not performed.
The project AGENTS.md template applies to applications, not to
the compiler repository's development process.

```
fn main() -> Int effects { io, state } {
    let values = list_new<Int>();
    list_push(values, 20);
    list_push(values, 22);
    var total = 0;
    for value in values { total = total + value; }
    print(f"total={total:d}");
    return 0;
}
```

Use let for immutable bindings, var for assignment. Parameters and return types
are explicit; statements end in semicolons. Types: Int (checked signed 64-bit),
Bool, String, Unit, nominal struct/enum/distinct types, List<T>, Dict<K,V>,
Option<T>, Result<T,E>. Float64 supports explicit numeric conversions (see NUMBERS).
Synchronous Windows x64 FFI ABI 1 adds Int32 and ForeignHandle; see help topic ffi.
In the 0.10 development compiler from dev.3, declare methods in the type owner's
`impl` block with a first parameter `self: Owner`. Call `value.method(args)`
or `Owner::method(value, args)`. Receiver copies use ordinary value semantics.
Starting with dev.4, use a nominal `interface`, an explicit `impl Interface for Type`
in the type's module and calls such as `Interface::operation(value)`. Generic
bodies with an interface bound are checked even when unused. Calls require the
interface's declared effects.
From dev.5, use `fn(Int) -> Int effects { io }` for a callable type and
`fn [offset](value: Int) -> Int { return value + offset; }` for a closure.
List captured locals explicitly, including `[]` for an empty list. Generic
algorithms can declare `effect E` and propagate it with `effects E`.
See [callable examples and rules](contracts/CALLABLES-EFFECTS.md).
From dev.6, explicitly pack a value with `dyn Reader(store)` and accept it
as `reader: dyn Reader`. The caller can select the implementation at runtime.
Call `reader.read(key)` or `Reader::read(reader, key)` and declare the
interface's effects.
From dev.7, [standard services](contracts/SERVICES.md) provide runtime selection
for files, processes, wall clock and entropy. Pass a service explicitly to
the client. Choose OS or test implementations at the boundary. JSON has typed
boolean decoding and optional byte, depth and node limits.
From dev.8, use [replay](contracts/REPLAY.md) to record typed service responses
and check that a test consumes the entire transcript in order.
From dev.9, register a Vela callable for a trusted C adapter with
`ffi_callback_register`. Pass the returned `CallbackHandle` to an extern
argument and cancel it before closing the owner. Read [the callback contract](contracts/CALLBACKS.md).
See [Notes](../apps/gui-notes/README.md) for a Win32 application that queues
typed events in a native callback and selects a file service explicitly.
From 1.0.0-dev.3, prefer `gui::open(Config)` and `gui::pump` for bounded Windows
forms. The library owns the event callback, queue and idempotent close. Package
the shared `vela-gui.dll`; drain application tasks before closing the window.
See [GUI library](contracts/GUI-LIBRARY.md) and the migrated Notes/FieldDesk/PulseDeck.
In Vela 0.11.0 use the `event_loop` module for explicit continuations and
`process::schedule` on Windows to supervise an independently running child.
Drive cancellation until the task publishes its terminal outcome. Use
`monotonic_millis` for deadlines. See the [continuation contract](contracts/ASYNC-CANCELLATION.md).
Submit an `async fn` callable with `tasks::submit` on
Windows. Use `await sleep_ms(delay)` or await another typed async call.
Check E240 for suspension boundaries and E241 for blocking call graphs.
The host drives the loop and cancels its tasks before closing their owner.
For Windows HTTP or HTTPS use `http` with an explicit curl or scripted
transport. From 1.0.0-dev.4, `from_url` validates absolute ASCII URLs;
`with_method` accepts Get/Head/Post/Put/Delete and bounded Bytes, `with_headers`
snapshots validated headers. GET/HEAD cannot carry a body. See [HTTP API](contracts/HTTP-API.md).
Poll a transfer through the process loop and release it after
drain. For a Windows loopback HTTP server use `http_server` with its
Winsock adapter. See [HTTP and TLS](contracts/NETWORK-TLS.md).
See [FieldDesk](../apps/fielddesk/README.md) for an event-driven window with
an explicit HTTPS endpoint, bounded editor updates and cancellation on close.
Use `check --cache DIR` for repeated checks of a local graph. Inspect
`scope.excluded_test_roots` in query and plan before applying a rename.
Use CLI query pages for large indexes. See [incremental analysis](contracts/INCREMENTAL-BUILD.md).
Use `panic(message)` with the process effect for a fatal path. Use typed
results for errors that the caller should handle. For source traces and
profiling, see [debug export](contracts/DEBUGGING.md).
Declare packaged data with `resource|assets/DESTINATION|SOURCE` and read it
relative to `path::resource_base()`. Check the project's lock before building.
See [packaging](contracts/PACKAGING.md) and [platform support](contracts/PLATFORM-SUPPORT.md).
Functions have named effects:
io, args, process, state. Collection reads and writes both require state.
Strings are immutable bytes; str_len/str_byte/str_slice use UTF-8 byte offsets,
not Unicode character indices. Diagnostics use Unicode code points instead.
Reachable dynamic values are kept by the precise nonmoving collector.
Use `scope { ... }` and `defer { ... }` for explicit resource cleanup.
Contracts are runtime checks.

Records: `struct Point { x: Int, y: Int }`, construct `Point(x: 1, y: 2)`.
Generics: `fn id<T>(x: T) -> T { return x; }`. Containers use free builtins,
e.g. list_push(items, value), dict_set(map, key, value), dict_get_or(map,key,default).
Use match on variants; no arbitrary type casts or nullable references.
Every enum variant needs a branch; `_` may ignore a variant field, but cannot
replace a whole variant. Statement match branches contain blocks. Expression
match branches contain expressions, not blocks with return statements.

```
fn number(text: String) -> Result<Int, String> {
    return match parse_int(text) {
        IntResult::Ok(n) => Result<Int, String>::Ok(n),
        IntResult::Err(message) => Result<Int, String>::Err(message)
    };
}
fn doubled(text: String) -> Result<Int, String> {
    let n = number(text)?;
    return Result<Int, String>::Ok(n * 2);
}
```

read_file/arg return StringResult, write_file returns WriteResult, parse_int
returns IntResult (legacy builtins). Match them explicitly to convert to generic
Result before using `?`; `?` requires compatible Result/Option return context.
`result` is reserved for postconditions and cannot be a local binding name.
print adds newline; write_stdout preserves bytes. Read actual signatures with
vela_get_help(topic="builtins") before using unfamiliar operations.

Imports: `import "math.vela" as math;`, then math::twice(21). Exports require
`pub fn twice(n: Int) -> Int { return n * 2; }`. Imports precede declarations;
open imports are allowed, ambiguity/private API are rejected. Cycles are allowed.
For projects use explicit vela.project: header vela-project|1, name|app,
entry|main.vela; optional test|smoke.vela and dep|math|../math/lib.vela.
Dependency imports use "@math". Run `vela lock vela.project` after reviewing
dependencies. Check/build requires an unchanged lock. Do not invent package
install, registry, filesystem iteration or module auto-discovery commands.

When a manifest exists, check its path, not just main.vela: aliases are only loaded
from the explicitly supplied manifest. E221 on a plain file can mean the manifest
was omitted. Entry/test paths stay inside the project directory; dependencies may
be siblings under the same MCP workspace. Accepted formatting of a dependency changes
its content hash too: review the diff and explicitly refresh the lock.
Check/symbols currently require an application root with main or root-level named
tests. To inspect a library without either, pass the importing application root;
checking the library alone produces E207.

Model finite states with an enum when exhaustive handling prevents forgotten cases;
use distinct IDs when two scalar identifiers must not be interchangeable. Generic
helpers are useful for shared behavior across types; they are not required everywhere.
An executable example combining these choices, Result propagation, contracts and
interpolation is [agent-idioms](../examples/agent-idioms/main.vela), also available
through vela_get_help(topic="idioms").

CLI: `vela check main.vela --json`, `vela build main.vela -o app.exe`,
`vela run main.vela -- args`, `vela fmt main.vela --check`,
`vela test vela.project --json`. `vela_format` returns text for review; it never
overwrites the source. Compiler errors are exit 1; toolchain failures 2; runtime
panic 70. Checked examples are in examples/agent-starter.

Retrieve help topic stdlib before implementing JSON,
text validation, filesystem updates, process calls or command-line parsing.
Setup copies matching modules into vela-stdlib/ inside the application workspace.
Use explicit imports or manifest aliases and locks. New library functions use
Result<T, module::Error>; legacy builtins retain their old result enums.
Float64's precise rules are in help topic numbers; it needs explicit Int conversions.

Use `test "name" effects { state } { ... }`, assert_true and
std/testing.vela (installed into vela-stdlib/testing.vela). Read help topic testing. `vela test FILE --json` runs each
entry-module declaration in its own process and produces report schema 2. The
MCP execution is optional: check capabilities before choosing isolated tools or
the authorized native CLI. Test-only files use vela_test, not vela_build.

For synchronous native integration, read help topic ffi. Vela supports
explicit ABI 1 DLL declarations on Windows x64/MSVC, checked Int32 and opaque
ForeignHandle. Use a trusted adapter and native manifest entries with a reviewed
lock. Borrow String bytes only through the call. `ffi_retain` and `ffi_release`
manage roots for handle metadata. Use explicit close for the native resource.

Limited Windows HTTP/GUI integration probes live in prototypes/windows; see its
README and docs/contracts/NETWORK.md and GUI.md. They use explicit ABI 1 adapters.
Their local HTTP and counter-window checks do not establish remote TLS, async
networking or a supported portable application framework.

Use `float_sqrt` and `float_to_fixed` with their result enums. Float64 display
interpolation retains its existing format. Use JSON cursors for field/index
paths and choose Exact or Round for Int conversion. The text builder accepts
bounded Bytes fragments and validates UTF-8 in `finish_text`.
Use `"""…"""` for static multiline text with quotes and backslashes.
The text includes its indentation and newlines. No escapes or interpolation
are evaluated inside. External packaged files use project `resource|assets/DEST|SOURCE`
rows and `path::resource_base()`; they are distinct from source literals.

Use `vela_query` to find definitions and references and explain types/effects.
Pass its snapshot ID and native revision to `vela_plan` before editing; plans
are previews. Locally the matching commands are `vela query` and `vela plan`.
Queries cover the chosen import graph; inspect `scope.excluded_test_roots` and
run declared tests separately after a shared declaration changes. Generic instances can repeat a source
site; count distinct sites, not raw reference records. A generic template can
have an empty type while its calls have inferred types. Do not infer purity
from an empty template effect list. Builtin call IDs use `builtin:NAME` and
need not have a source definition.

To save a generated report through MCP, pass its file name in `vela_run.outputs`
and tell the application to write to `../export/NAME` from its private cwd.
After a successful exit-zero run, read the returned `output_id` in chunks with
`vela_read_output`, verify the SHA-256, and save the bytes explicitly.
The executable `artifact_id` remains separate. If execution is unavailable,
use the authorized native CLI.

For a complete 0.11 application, see [PulseDeck](../apps/pulse-deck/README.md).
In released 0.11, HTTP exchanges use `start`/`poll`/`cancel`/`release` on the host
loop and are not directly awaitable. In 1.0.0-dev.1, use `task_group::spawn`
with an async callable taking `task_group::Scope`, then `await async_io::fetch`
or `await async_io::run_process` inside it. Drive one group with `tick` on the
host. Its operation limit is independent of the number of waiting language tasks.
`shutdown` requests cancellation; continue ticking until idle before closing
UI owners. See [task groups](contracts/TASK-GROUPS.md). Blocking OS calls remain
rejected in async bodies, including indirect synchronous callable dispatch.
From 1.0.0-dev.2, `--cache DIR --cache-report` creates the final directory and
reports hits/misses and write failures as JSON Lines on stderr. Its parent must
exist; failures preserve ordinary compilation. Stable 0.11 requires an existing
directory and lacks this report. From 1.0.0-dev.5, `==`/`!=` compare values of
the same enum type if every variant has zero fields. Different nominal types,
payload enums and ordering reject. Scalar/Dict bounds are unchanged; use `match`
for payloads and exhaustive branching. Older compilers require match for all enums.
See [enum equality](contracts/ENUM-EQUALITY.md).

For the 1.0 series, [STABLE-1.0](contracts/STABLE-1.0.md) indexes the frozen
language/library, project format, FFI and tooling contracts. Check the actual
toolchain version and platform capabilities before selecting a Windows adapter.
For older applications follow [migration](MIGRATING-1.0.md) and the
[compatibility policy](COMPATIBILITY.md). Regenerate reviewed locks and reconnect
MCP with matching packages; never edit fingerprints to bypass a mismatch.
Match-expression arms contain expressions, not statement blocks. Use a match
statement for a branch that returns from the function or performs several statements.

For directory work with the 1.1 SDK, import directory.vela explicitly. Use directory::entries_bounded(path::Path(value: root), limit) or open/next/close. Entries include name/path/kind/bytes/modified_seconds; order is unspecified. Never infer file content encoding from names: read binary input with fs::read_bytes. Check Result and close incremental scans on early exits. See [standard modules](STDLIB.md).

For recursive indexing use directory::walk(root, directory::Limits(depth: 1024, entries: 1000000)). It returns WalkEntry(entry, relative, depth) and closes parent scans before children. Links are returned but never descended. Sort paths with collections::sort_strings when producing stable output. The working [tree-index](../apps/tree-index/README.md) shows Bytes reads, filters, repetition and atomic publication.

For NDJSON or selectively read JSON in the 1.1 SDK, use json_stream::create with explicit Limits and next/read_string/read_integer/skip_value. Unknown fields still need skip_value; finish validates the remainder and trailing data. Number spellings are preserved, so integer rejects 1.0/1e0 and overflow. Legacy json::parse retains its previous range/depth limits. See [log-summary](../apps/log-summary/README.md). Match must enumerate every Event variant; underscore discards payloads only. if/while are statements.

For 1.1 complete-body HTTP deadlines use http::curl_transfer(executable, ca_file). Start an exchange after acquiring a concurrency slot. Curl still gets the exact Request timeout; only the helper supervisor gets an extra bounded 1000 ms for startup/drain. Existing http::curl retains its 1.0 combined budget. Tick until terminal after cancel, then check release; Storage on cleanup may be resolved and release retried. See [http-collector](../apps/http-collector/README.md).

Post-1.0 builtin additions are fallbacks: your existing function/type declarations keep their names, including directory_open/directory_next/directory_close. Import directory.vela to use its primitives from their defining module even when your own module has such a name. Existing 1.0 reserved builtin names stay reserved.
