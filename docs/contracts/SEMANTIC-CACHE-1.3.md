# Incremental semantic checks in 1.3

`check ROOT --cache DIRECTORY` can reuse the success of semantic validation.
`--cache-report` reports the layers used and the number of modules whose
declarations and bodies were rechecked. The command's normal exit status,
diagnostics, spans and stdout are independent of cache selection. The cache
is opt-in and belongs to a trusted local directory.

## Scope and inputs

Resolve the source graph, aliases and file identities from current inputs
and validate the current project lock before consulting successful checks.
Try the exact source-byte `check-v1` record first. On an exact miss, try a
separate `semantic-modules-v1` record. Its scope binds the compiler source
fingerprint, the selected entry path and source name, project manifest and
verified lock, ordered module paths and names, and resolved import edges
with aliases. Edge positions belong to the exact cache and diagnostic
output. The semantic scope excludes positions. Entry and declared test
roots have separate identities.

The semantic record contains one row per resolved module, in graph order.
Each row contains a hash of the normalized source bytes and a hash of the
ordered lexer tokens. Hash an unambiguous length-delimited representation
of each token's exact spelling, excluding trivia. Keep whole string and
interpolation token spellings. A raw source hash match reuses that row's
token hash. Lex changed sources using the normal lexer. If the token hashes
for the entire graph match a prior successful check, reuse the success,
including in graphs that use generics, interfaces or async functions.

For a token change, mixed reuse is limited to graphs of synchronous,
non-generic functions with primitive value types and no shared body-created
types or instances. Use an explicit syntax allowlist for this scope. In
particular, graph-wide type instantiation, closures, interfaces, methods,
FFI and suspension analysis require a full pass on token changes. The
scope permits ordinary direct calls, local control flow, explicit function
effects and scalar printing. Public signatures fingerprint exported names,
parameter names and types, return types and declared effects. Body changes
recheck their own module. A changed public signature also rechecks its
transitive importers, including import cycles. Independent successful
bodies with the same tokens and imported interfaces can be reused. Bind and
validate all current declarations before checking any selected body. A
scope that cannot prove mixed reuse uses the full analyzer.

Only publish semantic records after successful validation. A missing,
unreadable, malformed, oversized, stale or checksum-invalid record falls
back to ordinary analysis. Publish atomically within the existing cache
envelope. Different processes can replace a successful record for the
same graph scope. Each reader validates it against its own graph.

## Tooling boundaries

Successful check records contain no compiler arena, executable C, old
diagnostic, or old source coordinates. `emit-c` and `build` retain their
exact byte-sensitive C cache. On a C miss, lower the full checked graph.
Queries, repairs and LSP editor requests analyze current overlays in full
so they can produce current symbols and locations. MCP analysis keeps its
isolated per-request source snapshot and uses full validation. An unsaved
snapshot never writes successful local CLI records. `test` analyzes and
builds its selected test roots through the existing driver.

When reporting, emit `phase: "analysis"`, `layer: "semantic-modules-v1"`,
`status: "complete"` and a reason for exact reuse, token reuse, mixed
validation or full validation. Include `modules`, `declarations_checked`,
`bodies_checked` and `reused_modules`. Count actual source modules, not
cached records, functions or tokens. `bodies_checked` counts modules with
at least one checked function body. `reused_modules` counts modules whose
prior successful validation supplied this check. An error can terminate
analysis before the completion event.

## Acceptance

Compare cold, warm, comment, body and public-signature changes with an
independent uncached run. Cover removed and renamed files, selected test
roots, imported generic changes, effect changes, project lock and native
input changes, cache corruption, concurrent publication and unsaved
overlay diagnostics through the CLI, LSP and MCP. Compare exit statuses,
diagnostic codes and spans, query results and emitted C bytes. Verify that
an error publishes no successful semantic record.

Freeze a copy of authored selfhost at the accepted 1.3.4l source and
append the comment from the 1.3.1 protocol to `driver.vela`. Compare
1.3.4l and the candidate on those same bytes with separate cold caches,
one warmup and five alternating runs. Preserve the 20% median wall target
for the edited check and the existing memory budget. Report distinct
modules checked and reused, raw timings, CPU and whole-process-tree peak.
Exercise actual mixed reuse on a separate multi-module graph. Run this
stage's own `vela-dev.cmd verify` after the focused checks.
