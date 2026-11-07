---
name: vela-app
description: Write, check and fix applications in the Vela programming language using the installed native toolchain and its matching language help. Use for Vela source or project work, not compiler development.
---

For Vela 1.0, the stable API index is `docs/contracts/STABLE-1.0.md` in the
native installation. Use version-matched help and platform capabilities; public
FFI ABI 1 is separate from internal runtime ABI 2.
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
