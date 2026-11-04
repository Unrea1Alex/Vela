---
name: vela-app
description: Write, check and fix applications in the Vela programming language using the installed native toolchain and its matching language help. Use for Vela source or project work, not compiler development.
---

Vela 0.7.0 supports Float64 with explicit conversions and `:display`
formatting. Int/Float64 cannot be mixed; float dictionary keys and `%` are rejected.
Read the matching language/builtin help; released 0.6 archives do not have floats.
Display has no precision parameter; sqrt/std.math, multiline/raw strings and
resource embedding are not implemented in 0.7.0. Future roadmap entries are not APIs.

For 0.7 applications call vela_get_help(topic="stdlib") before writing JSON,
UTF-8, path, file-update, CLI or process helpers. Setup installs matching ordinary
modules in vela-stdlib/. Import explicitly; keep vendored modules under the MCP
workspace root. Review edits and refresh dependency locks. New modules return
Result<T, module::Error>; do not confuse those with legacy builtin result enums.
config.number accepts JSON Number only; accepting Integer needs an explicit
application conversion. Preserve the original error when adding field/index context.
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
text replacement and vela_symbols for declared interfaces. Those tools do not
execute the application. If context advertises execution, use vela_build and
vela_test with source/manifest path and optional text/overlay_path. Pass the issued
artifact_id to vela_run; it accepts args and timeout_ms, never a command or cwd.
Artifacts expire and reject changed workspace/toolchain: build again after edits.
Runs use a private snapshot, bounded resources and no network; generated files are
not exported to the workspace. artifact_id refers to an executable, not an output
file; 0.7.0 has no generated-file retrieval tool. Use the authorized native CLI
when the task requires saving a report. Native DLLs require a host SHA-256 allowlist.
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

Keep effects explicit and respect process-region lifetime. Do not invent GC,
network APIs, methods, closures or package registry. For synchronous Windows x64
FFI, read vela_get_help(topic="ffi"): only trusted ABI 1 adapters and the documented
types are supported. Int32 is a checked carrier, ForeignHandle requires explicit
close, and borrowed String data cannot escape a call. Use local modules and
manifest dependencies; update lock only after reviewing dependency changes.

The HTTP/GUI samples under prototypes/windows are bounded Windows integration
experiments, not standard-library APIs. Keep their local-HTTP and synchronous
polling limitations explicit when using them as examples.
