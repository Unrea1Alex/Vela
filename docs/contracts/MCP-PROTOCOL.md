# Local MCP contract 1 (0.6.6)

Status: implemented analysis contract; 0.7 adds optional execution under
[MCP-EXECUTION](MCP-EXECUTION.md). The pinned native compiler remains the
only parser/checker/formatter/symbol provider. The optional TypeScript host uses
official @modelcontextprotocol/server 2.4.0 with stdio. Intended wire revisions:
2025-11-25 (legacy handshake) and 2026-07-28 through SDK serveStdio. Actual client
versions and tested capabilities belong in compatibility.json and evidence.

Configuration file (explicit --config absolute-path): schema_version=1,
toolchain=absolute native delivery root, workspace=one absolute allowed root,
aliases=map from ASCII names to relative source/manifest paths. No network access,
toolchain selection, executable paths or extra argv are supplied by tool calls.
Dependency aliases remain the native manifest's responsibility. Use a common
workspace ancestor when dependencies are siblings. Paths must stay under this
root; symlinks/junctions, hardlinks, device paths, ADS and traversal are refused.

Optional execution configuration: execution={manifest:absolute-path,
sha256:manifest-file-hash,native_allowlist:[reviewed-DLL-hashes]}. No native hash
is allowed by default. Only a passing startup backend adds build/test/run tools.
Context always exposes execution, execution_reason and execution_limits. Execution
responses retain schema 1 and place execution_toolchain_id, artifact_id, native
test report and encoded stdout/stderr inside data. See MCP-EXECUTION for limits.
artifact_id identifies executable code, not an output-file download. A generated
file retrieval/saving protocol is planned for roadmap 0.9.9 and is absent in 0.7.0.

Tools and input schemas (all objects reject unknown fields):
- vela_get_context {}: short quickstart, version, executable SHA-256, capabilities,
  limits, configured aliases and help topics.
- vela_get_help {topic}: enum quickstart/language/projects/modules/memory/builtins/idioms/numbers/stdlib/testing/ffi.
  Returns the corresponding version-matched text. The same topics are resources
  at vela://help/TOPIC; clients need not auto-load them.
- vela_check {path}: source/manifest, native check --json.
- vela_symbols {path}: source/manifest, native symbols --json.
- vela_format {path}: source file only, native fmt; returns text, never writes back.

Acceptance refinement in 0.6.8: these three analysis tools also accept optional
text (unsaved source, <=2 MiB UTF-8). It replaces/adds that path only in the
snapshot after validating the unchanged base inventory. Manifest overlays and
excluded paths are rejected; effective content determines snapshot_id.
Optional overlay_path selects that source when path is a project manifest;
without it, text replaces path. overlay_path without text is invalid.
This supports clients whose file-writing tools are unavailable, as observed in the
first Codex acceptance run. Wire line size remains the stricter transport bound.

Output schema 1: status enum ok/rejected/toolchain_error/invalid_input/
source_changed/cancelled/timeout/limit/incompatible; compiler_id string,
snapshot_id string (empty for requests with no snapshot), data object,
message string. Both structuredContent and equivalent JSON text are returned.
Native JSON is nested in data without losing codes/spans/details; only source
path fields are mapped from private snapshot paths to original paths. Coordinates
remain 1-based normalized Unicode code points. Unrecognized methods/invalid JSON
are MCP protocol errors; invalid tool inputs are SDK schema errors.

Each analysis snapshots the entire bounded workspace as bytes, excluding .git,
.codex, node_modules, build, bin, dist, and work directories. This avoids a second
language parser in the adapter. File paths are sorted. Identity/size/time and a
second content inventory must match after copying, otherwise source_changed.
Snapshot SHA-256 covers relative paths, raw file hashes and compiler fingerprint.
Unrelated files therefore affect the snapshot ID. No live originals are compiled.
Native VELA_SOURCE_ROOT confines reads to the link-free materialized snapshot;
relative imports/manifest aliases cannot escape it. Source changes after capture
do not alter the result: the returned ID identifies the bytes that were checked.

Limits fixed before implementation: 256 files, 16 MiB total, 2 MiB per file,
path length 1024; 2 active analysis requests, no pending queue (busy => limit);
30 seconds per request including copying; 4 MiB combined child output; 1 MiB
incoming protocol line. A separate native process per analysis bounds process
region lifetime. Child is spawned with argv, no shell, no VELA_CC override.
Compiler analysis does not spawn grandchildren; cancel/timeout/disconnect kills
the owned compiler, awaits close and removes its unique temporary directory.
No user program or C compiler is executed by these five tools. Logs use stderr.

Compatibility manifest pins native executable, docs, builtin catalog and runtime
digests. Startup and requests reject mismatches, including same-version rebuilds.
Updating means installing matching native/MCP deliveries, not bypassing hashes.

Gate: input/output schemas, CLI equivalence, Unicode, bad UTF-8, roots/aliases/
links/escapes, changed sources, spawn failure, parallelism, timeout/output/input
limits, repeated cancellation and disconnect. At least 1000 sequential analysis
requests after warmup and 25 cancellations. Thresholds: no child/temp residue;
post-warmup RSS growth <=64 MiB, handle growth <=16; count terminal handles and
temp directories, record timing and compiler/client versions. Clean npm ci and
reconnect with Codex and MCP Inspector. Five cold-start tasks use docs/check;
an independent harness compiles/runs with literal expected outputs and records
all attempts, invented APIs, model/client and failures.

Execution tools wait for MCP-EXECUTION in 0.7; semantic edits/IDs wait for 0.9.
Sources: [SDK stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html),
[SDK tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html).
