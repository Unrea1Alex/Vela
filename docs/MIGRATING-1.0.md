# Migrating 0.11 / 1.0-dev applications to 1.0

Use matching native/MCP packages and keep an application checkpoint. Run project
check/tests before and after migration; inspect query/rename scope for test roots.
Ordinary Int/Float64, modules, generics, callables/effects, interfaces, JSON and
project/lock version 1 keep their documented behavior. No automatic source or
lock conversion runs on opening a project. [Compatibility policy](COMPATIBILITY.md).

1. `http_server::Response(status: ..., body: ...)` now requires `content_type`,
   e.g. `"application/octet-stream"` or `"text/plain; charset=utf-8"`. Request adds
   `method` (Get/Head). HEAD handlers return the same representation; the server
   suppresses its body. Other request methods/bodies still reject.
2. Exhaustive `http::Error` matches must add `InvalidHeaders` and `InvalidBody`.
   Legacy `http::get` plus start/poll/cancel/release still works. `from_url` accepts
   bounded ASCII absolute URLs; with_method and with_headers validate immutable
   request configuration. GET/HEAD bodies, auth/framing overrides and redirects
   remain unsupported. Read [HTTP API](contracts/HTTP-API.md).
3. To await HTTP/process, adopt task_group Scope and async_io adapters, drive one
   group from the host and drain shutdown before releasing UI/transport owners.
   Inspect both operation and cleanup outcomes. Existing explicit event loops
   remain supported; a synchronous polling wrapper inside async still fails E241.
   See [task groups](contracts/TASK-GROUPS.md) and [PulseDeck](../apps/pulse-deck/engine.vela).
4. Replace copied per-app Win32 wrappers with std/gui.vela and trusted vela-gui.dll.
   Update the project's explicit native row and regenerate its lock after reviewing
   the DLL. Keep callbacks alive until Window.close after child operations drain.
   Read [GUI](contracts/GUI-LIBRARY.md); use the examples' build scripts.
5. `--cache DIR` now creates the final component when its parent exists. Add
   `--cache-report` to observe JSON Lines on stderr. Do not parse these as normal
   stdout or infer a hit from timing. Directory/write errors warn and fall back.
6. Use `==`/`!=` for two values of the same enum only when all variants have no
   fields. Payload enums still use match. Scalar constraints and Dict keys do not
   gain enum support. Existing exhaustive matches continue to work.

[Executable migration example](../examples/migrate-1.0/main.vela) exercises URL,
headers, method/body, Response content type and enum equality without network I/O.
Its explicit expected output is `migration checks passed` and exit code 0.

For MCP: stop the old client, install matching packages, use setup in a fresh
application folder or review/relocate its owned generated files before rerunning
setup. Preserve unrelated .codex configuration. Start a new trusted project session,
read vela_get_context and the installed skill, then check/build/test/run. Rebuild
the optional execution cache with prepare-execution.ps1 for a new compiler.
Do not edit fingerprints, grant new trust automatically, or assume an existing
chat loaded newly installed tools. Native programs do not require Node or MCP.
