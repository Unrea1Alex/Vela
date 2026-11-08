# Historical agent guidance through Vela 1.1

Historical version-by-version notes, preserved by 1.2.1. This is migration
material, not the installed startup instruction. For current behavior use
[quickstart](AGENT-QUICKSTART.md), [capabilities](CAPABILITIES.md) and
[the 1.0 migration](MIGRATING-1.0.md).

## Former skill

---
name: vela-app
description: Write, check and fix applications in the Vela programming language using the installed native toolchain and its matching language help. Use for Vela source or project work, not compiler development.
---

For Vela 1.1, the stable 1.0 baseline API index is `docs/contracts/STABLE-1.0.md` in the
native installation. Use version-matched help and platform capabilities; public
FFI ABI 1 is separate from internal runtime ABI 2.
Use the native `vela`/`velac` CLI or MCP tools. The historical Python 0.2
implementation and entry point are no longer shipped in the current source tree.
Match-expression arms accept expressions. For early return or a block of statements,
use a match statement rather than placing a block in a match expression.
When updating a 0.11 app, read `docs/MIGRATING-1.0.md`: server Response now needs
content_type and HTTP Error has additional variants. Preserve unrelated project
configuration; compatibility and deprecation rules are in `docs/COMPATIBILITY.md`.

The 0.10 development compiler supports `pub opaque struct`: use a factory
from its defining module; client code cannot construct it or access its fields.
Use this syntax when the toolchain context reports 0.10 or later.
Starting with 0.10.0-dev.3, methods are declared in the type owner's `impl`
block with an explicit first parameter `self: Owner`. Use dot calls or
`Owner::method(receiver, ...)`; the receiver is passed by value.
Starting with 0.10.0-dev.4, use `impl Interface for Type` in the module defining
Type. Call through the interface with `Interface::operation(receiver, ...)`.
The interface signature determines the effects of that call.
Starting with 0.10.0-dev.5, use `fn(Int) -> Int effects { io }` for callable
parameters and `fn [offset](value: Int) -> Int { return value + offset; }`
for closures. List every capture, including `[]` for an empty capture list.
Use `effect E` on a generic function to propagate the effects of its callbacks.
Starting with 0.10.0-dev.6, accept `reader: dyn Reader` for a service chosen at
runtime. Pack an implementation explicitly with `dyn Reader(store)`. A
generic parameter with a `T: Reader` bound accepts concrete implementations.
Starting with 0.10.0-dev.7, the standard services module provides OS and
in-memory implementations. Read help topic stdlib before using these APIs.
Choose dependencies explicitly and close a file stream on every structured exit.
Starting with 0.10.0-dev.8, the replay module records typed service responses.
Use `finish` to check that the test consumed the full transcript.
Starting with 0.10.0-dev.9, read help topic ffi before registering a native
callback. Cancel its registration before closing the owner.

Vela 0.9.0 and later support Float64 with explicit conversions and `:display`
formatting. Int/Float64 cannot be mixed; float dictionary keys and `%` are rejected.
Read the matching language/builtin help; released 0.6 archives do not have floats.
Use `float_sqrt` and `float_to_fixed` with their documented result enums.
Display interpolation keeps its format. Read language help for current syntax.

Call vela_get_help(topic="stdlib") before writing JSON,
UTF-8, path, file-update, CLI or process helpers. Setup installs matching ordinary
modules in vela-stdlib/. Import explicitly; keep vendored modules under the MCP
workspace root. Review edits and refresh dependency locks. New modules return
Result<T, module::Error>; do not confuse those with legacy builtin result enums.
Use `json::decode`, `field` and `item` for typed JSON paths. Select Exact or Round
when reading a number. `with_path` keeps the original typed cause.
Use the bounded builder for repeated appends and `finish_text` for UTF-8 validation.
Use help topic testing for named test declarations, assertions and Case<I,O>
tables. Native vela test FILE/PROJECT --json has report schema 2. Check test-only
files normally; run them through test, since build/run require main. Keep claims
about executed tests separate from a successful check. MCP execution availability
must come from capabilities, not from the presence of test syntax.

Start with vela_get_context. Retrieve relevant sections with vela_get_help;
builtin signatures come from topic builtins, not remembered APIs from other
languages. If MCP is unavailable, read the installed docs/AGENT-QUICKSTART.md,
docs/PROJECTS.md and vela/builtins.def from the chosen toolchain.

Confirm that these are tools in the current client session. A configured server
or successful external probe does not prove client discovery. If they are missing,
use the installed MCP setup/doctor and start a new client in the application workspace;
report any fallback explicitly. Do not change global settings or compatibility hashes
as an implicit repair.

Write a small compilable step, then call vela_check. Preserve returned diagnostic
codes and source locations when correcting errors. Use vela_format for a proposed
text replacement, vela_symbols for declared interfaces and vela_query for
definitions, references, calls, types and effects. Use vela_plan with the
query's snapshot ID and revision to preview a rename or formatting edit.
Verify that the source is still current before applying any preview.
If context advertises execution, use vela_build and
vela_test with source/manifest path and optional text/overlay_path. Pass the issued
artifact_id to vela_run; it accepts args, timeout_ms and optional output names.
Artifacts expire and reject changed workspace/toolchain: build again after edits.
To export a report, request its name in outputs and have the app write it to
../export/NAME. After an exit-zero run, read the output_id with vela_read_output,
check SHA-256 and explicitly save the bytes to the user-selected path. An
artifact_id still refers to an executable. Native DLLs require a host SHA-256 allowlist.
If execution tools are absent, report execution_reason and use the authorized
native CLI when appropriate. Record actual results and unperformed checks.

For a manifest project, pass the manifest to check/symbols. Plain-file checks do not
load dependency aliases from an adjacent manifest. Keep entry/test paths within the
project, with sibling dependencies beneath the configured workspace. Formatting is a
source edit too: after reviewing an accepted dependency change, explicitly refresh
its lock and check/build the project again.

Use enums for finite states that benefit from exhaustive handling and distinct IDs
when scalar identifiers represent different entities. Use your own generics when
they remove real duplication. Consult the installed agent-idioms example through
vela_get_help(topic="idioms"); do not force every feature into every application.

Keep effects explicit. The collector reclaims unreachable managed data.
Use scope/defer for structured cleanup and match close errors explicitly.
Use triple-quoted raw strings for static multiline text. They preserve
indentation, backslashes and braces, with no escape or interpolation processing.
For synchronous Windows x64
FFI, read vela_get_help(topic="ffi"): only trusted ABI 1 adapters and the documented
types are supported. Int32 is a checked carrier, ForeignHandle requires explicit
close, and borrowed String data cannot escape a call. Handle retention roots
metadata only. Use local modules and
manifest dependencies; update lock only after reviewing dependency changes.

The HTTP/GUI samples under prototypes/windows are bounded Windows integration
experiments, not standard-library APIs. Keep their local-HTTP and synchronous
polling limitations explicit when using them as examples.

For Vela 0.11.0, read the stdlib topic before using `event_loop`.
For Windows HTTP and HTTPS, read the HTTP and TLS contract linked from the
quickstart and `HTTP-API.md`. From 1.0.0-dev.4 use `from_url`, `with_method` and
`with_headers` for validated URLs, GET/HEAD/POST/PUT/DELETE and bounded uploads.
Headers are snapshotted; auth/framing overrides reject. Server Response requires
`content_type`; its GET/HEAD API still rejects request bodies. No connection pool.
Configure a trusted curl executable explicitly and release
each exchange after it reaches a terminal state. Use the scripted
transport for deterministic tests. The loopback server requires its
Winsock DLL beside the built application.
Inspect `scope.excluded_test_roots` in query and rename previews before
applying an edit. Run the declared project tests after changing shared
declarations. For repeated local checks, see the project topic for the
optional trusted cache. From 1.0.0-dev.2, `--cache DIR` creates the final directory
when its parent exists. Add `--cache-report` and inspect stderr JSON Lines for a
check-v1/c-v1 hit before reporting warm reuse. Directory/write failures warn and
fall back safely; stdout remains the requested output. The stable 0.11 compiler
requires a pre-existing directory and has no cache-report flag. Large CLI indexes support query pages.
Use a direct `panic(message)` for fatal test helpers that need a generic
return type. For errors callers can handle, return a typed Result.
Read the debugging contract before using source traces or profiles.
Use a manifest resource and `path::resource_base()` for packaged data.
For Windows forms on 1.0.0-dev.3 use `gui.vela` with the trusted `vela-gui.dll`.
Copy application configuration, not a Win32 adapter. `open(Config)` owns its
callback and 64-event queue; `pump` returns event IDs, `snapshot` returns bounded
UTF-8 text, and `close` is shared and idempotent. Drain app tasks before close.
The GUI library contract documents logical dimensions and DPI handling.
Use local CLI execution for projects with declared resources. Check the
platform contract before choosing a GUI, FFI or network feature.
Use explicit continuations and drive cancellation through a terminal outcome.
`process::schedule` uses Windows job supervision. In 0.11.0, use
`tasks::submit`, `async fn` and explicit `await` on Windows. Check the
stdlib and language topics for suspension rules. Cancel and drain each
owned loop before closing a GUI owner.

In released 0.11 HTTP exchanges are not directly awaitable. Drive their process
loop and poll them from the host; release only terminal exchanges. An async
wrapper that calls the blocking HTTP polling/storage path is not a supported
shortcut. Use `match` for payload enums and exhaustive branching. From 1.0.0-dev.5,
`==` and `!=` accept two values of the same nominal enum only if every variant has
zero fields. Scalar bounds and Dict keys are unchanged; there is no enum ordering
or deep equality. Older toolchains require match for all enum comparisons.

For 1.0.0-dev.1, read the task-group contract linked from stdlib help.
Use `task_group::create`/`spawn` with an async callable receiving a `Scope`,
then await `async_io::fetch` or `async_io::run_process`. The host drives one
group, calls shutdown and ticks until idle. Task outcomes wait for child cleanup;
inspect typed operation/cleanup errors. This does not permit arbitrary blocking
calls in async bodies. Keep released 0.11 examples on their older explicit loop API.

With the 1.1 SDK, use the installed directory module for enumeration. entries_bounded returns typed metadata and closes automatically; open/next/close permits incremental processing. Always close on early return. OS order is unspecified and links are reported without traversal. Binary content belongs in fs::read_bytes, not read_text.

For recursive traversal use directory::walk with explicit Limits(depth, entries). WalkEntry.relative has slash separators, depth starts at one for direct children, and links are never followed. Sort output explicitly. The tree-index example re-enumerates/re-reads every repetition and publishes once with fs::write_atomic.

For selective JSON/NDJSON with large ignored numbers or nesting beyond 128, use the 1.1 json_stream module. create takes Limits(bytes, depth, nodes); next exposes tokens; read_string/read_integer check requested fields; skip_value validates unknown fields without numeric conversion. finish validates any remainder/trailing data. Never ignore malformed unknown data. Number spelling/is_integer distinguishes integer literals from 1.0/1e0; integer/floating report range errors. Reader aliases share progress. Match enumerates every Event variant; underscore may discard a payload, not stand for remaining variants. if and while are statements, not expressions.

For complete-transfer HTTP deadlines in 1.1 use http::curl_transfer; the older curl factory retains the 1.0 combined launch/transfer deadline. Request timeout is unchanged in curl --max-time, and the helper receives a separate bounded 1000 ms overhead allowance. Acquire a slot before Transport.start. Always drive cancellation to terminal and release; cleanup errors are Storage and can be retried after resolving the cause.

New builtin functions added since 1.1 do not reserve old application declaration names. Own declarations and visible imports take precedence; use the directory module normally even if the application already has a function named directory_open. Existing 1.0 builtin-name reservations remain unchanged.

## Former quickstart

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
