# Incremental analysis and independent builds, 0.11.4 / 1.0.1b

## Cache diagnostics contract (1.0.0-dev.2)

`--cache DIR` creates the final directory when its parent exists. It does not
recursively create ancestors, change permissions or redirect to another cache.
Failure disables this invocation's cache and compilation proceeds normally.
Cache directories remain trusted local inputs, never a trust/security boundary.

`--cache-report` on check/emit-c/build emits JSON Lines to stderr, independent of
`--json` and generated C on stdout. It reports directory readiness, every import
record and the whole-program check/C record: read hit/miss with reason, and write
stored/failed. Each event has schema_version=1, kind="cache", phase, layer, status,
reason, directory, key and message. No timestamps or elapsed-time heuristic.
Missing and unreadable records share reason `read_error` (the file API does not
expose errno); invalid headers/checksums are `corrupt`, oversized records `limit`.
Directory failures and failed publications are emitted even without the reporting
flag. `--cache-report` without a cache reports `disabled`. Reported record hits
mean valid envelopes; a successful check/C hit is emitted only when reused.
Import cache hits also pass structural decoding; malformed import records miss.

Diagnostics do not change exit status or output bytes. Source/lock/output guards
still run before program-cache reuse. Compiler errors may terminate after partial
cache diagnostics; no successful program record is published for a failed check.
Acceptance: cold miss then warm hit, directory creation/failure, corrupted record,
failed atomic write, source invalidation, stdout parity and concurrent publication.

The first cache is opt-in and belongs to a trusted local cache directory.
`check`, `emit-c` and `build` may read and publish cache records. The graph
is always resolved again with current files, identities, dependency paths
and lock verification. Cache hits cannot authorize source or metadata
overwrites. A cache record has a format version and a checksum. A missing,
unreadable, oversized or corrupt record is a miss. Publishing a record uses
a private sibling file and atomic replacement. Concurrent compiler
processes may compute the same entry. A failed compile never stores a
successful check.

Per-module cache entries retain the lexically verified leading imports,
including spans, for identical normalized source. After graph resolution,
the analysis key includes the compiler source fingerprint, ordered paths,
source names, normalized bytes and resolved import edges. An exact
successful check or generated C is reusable. A graph change rechecks the
connected Vela program, including cross-module generics, effects and types.
This design avoids serializing compiler arenas. The target compiler
and toolchain are invoked on each native build. Native dependencies are
verified and staged using the usual project rules. Cache records cannot
be used as executable artifacts.

Parallel builds are independent executable roots. They use isolated
output/log directories and external compiler processes, including their
C compiler children. A bounded Windows Job pool owns cancellation and
drain. A batch reports all results and preserves per-root logs. One root
does not publish over another root's output. Roots may share read-only
sources and the trusted cache. The linked program's Vela modules still
share a single checker and emitter.

`host_sleep(ms)` is a blocking host operation with the `io` effect and a
range of 0..1000 ms. It avoids spinning in the batch's top-level poll.
It returns `WriteResult` and is rejected in suspending call graphs.

Query pages refer to an ordered snapshot of the entry graph. Each page
contains all document records and a slice of definitions, references and
imports in that order. Pages retain all fields of each record, including
specializations. The continuation consists of the revision and next
zero-based offset. A changed revision rejects continuation. A caller may
filter returned rows by kind, role or document. The first version pages
records without server-side filtering. Query and rename report an
entry-only scope with the number of excluded declared test roots.

Measure cold/warm time and peak working set on FieldDesk, SourceLens and
selfhost. Compare generated C bytes with an uncached build. Verify changes
to source, imports, source-name, dependency lock, corrupt records,
simultaneous writes and failures. Join query pages and compare the result
with the unpaged index. Verify the explicit test-root scope on FieldDesk.
