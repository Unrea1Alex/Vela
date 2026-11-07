# Vela 1.0 public contract

Frozen by roadmap 1.0.2, after acceptance of 1.0.1a–e. Release candidates and
the final 1.0.0 use this same contract. Implementation verification and delivery
are separate gates; this document alone does not declare a release accepted.

| Surface | Version and normative specification |
|---|---|
| Source language | 1.0, [LANGUAGE](../LANGUAGE.md), [memory](../MEMORY.md), [builtin catalog](../../vela/builtins.def) |
| Standard library | Source API in the modules below, [STDLIB](../STDLIB.md) and linked contracts |
| Project and lock | `vela-project\|1`, `vela-lock\|1`, [project format](PROJECT-FORMAT.md), [packaging](PACKAGING.md) |
| Public C FFI | ABI 1, [FFI](FFI.md), [callbacks](CALLBACKS.md), [roots](FFI-ROOTS.md), [header](../../vela/ffi.h) |
| Compiler tools | [TOOLING](../TOOLING.md), native diagnostic/symbol JSON v1, query/plan v1, named-test JSON v2; fields and limits follow their linked contracts |
| Local MCP | [protocol](MCP-PROTOCOL.md), config v1, response envelope v1, output artifacts v1, [execution](MCP-EXECUTION.md); official SDK 2.4.0, wire revisions in compatibility.json |
| LSP | [LSP](LSP.md), stdio JSON-RPC, supported methods/capabilities as documented; no claim of all optional LSP features |

The core library is: text, path, collections, json, cli, config, fs, process,
testing, result, lines, services, replay, event_loop, tasks, task_group, async_io,
gui, http and http_server. Public declarations and their effects, nominal types,
error variants, budgets, ownership and cleanup rules form the API. Private helpers
and compiler tables are implementation details. Source imports use relative paths;
there is no implicit registry or package resolution.

Platform scope is [PLATFORM-SUPPORT](PLATFORM-SUPPORT.md): Windows x64/MSVC for the
full target; Linux x86-64/GCC+musl for compiler and console programs. Windows GUI,
FFI DLLs, process workers/fibers and network adapters are Windows-only. HTTP uses
an explicitly trusted curl 8.4+; server is IPv4 loopback GET/HEAD, one exchange per
connection. No redirects, authentication API, pooling or server TLS is promised.
GUI is the bounded shared Windows forms API, with synthetic DPI acceptance
distinguished from physical monitor tests. See [HTTP API](HTTP-API.md),
[GUI](GUI-LIBRARY.md) and [task groups](TASK-GROUPS.md).

Runtime ABI 2, checked IR, generated C identifiers/layouts, compiler cache records,
profiling internals and executable bytes are internal and independently versioned.
Rebuild generated programs/native caches with their matching toolchain. Public
FFI ABI 1 is not runtime ABI 2. Effects describe operations, not a security sandbox.
Runtime contracts are checks, not static proofs.

[stable-1.0.json](../stable-1.0.json) is a conservative review guard: SHA-256 of the
normative files, all core modules and ABI header/catalog. It intentionally catches
private implementation edits too; a hash difference alone is not an API break.
`scripts/check-stable.ps1` checks the snapshot and its negative self-test. Updating
the snapshot requires an explicit compatibility assessment and changelog entry;
it is not an end-user repair for mismatched MCP fingerprints. Binary and MCP
delivery fingerprints remain separate from this source contract snapshot.

Acceptance: all referenced specifications exist, the snapshot covers every shipped
core module and surface, tampering/missing files are rejected, compiler rebuild
and native verify pass. Compatibility/deprecation/migration policy follows in 1.0.3.
