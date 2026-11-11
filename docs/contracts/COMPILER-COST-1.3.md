# Compiler cost and build dependency audit

The 1.3.5a audit starts from the verified 1.3.5 compiler and the fixed
1.3.4d artifacts. Keep the authored 1.3.4d workload used in 1.3.4e–l.
Compare historical 1.2.8a cold, warm and edit observations with their
recorded corpus and measurement scope. Use current paired measurements
for performance claims on identical sources.

Re-run the ordinary GCC compiler check with the archived compilers from
1.3.4d, 1.3.4f, 1.3.4g and 1.3.5. Measure graph construction, parsing and
semantic analysis separately in disposable instrumented copies. Count
explicit `memcpy` calls and bytes, managed allocations, GC and safepoints
in those copies. Instrumented time is phase attribution. Whole-program
timing uses ordinary executables without the instrumentation. Keep the
raw samples and both compiler and workload hashes.

The source graph currently scans all earlier normalized modules for every
new module to obtain its line base. An independent walk counted 8,299,341
rescanned bytes on the fixed workload and 11,236,506 on the 1.3.5 authored
graph. Test retaining each unit's existing line-table length and deriving
the next byte and line base from the last unit. The line table already
counts one line plus every newline, including the trailing empty line.
The graph inserts one newline between units. The new prefix must produce
the same source positions as the original scans.

The function profile of the first candidate records 111,969 calls to
`module_declaration` on the fixed workload. Try a name-to-first-index map
per module during parsing. Preserve the ordered declaration list, the
first matching definition, and the duplicate diagnostic's order and
related span. Canonical-name rewriting updates the record at that index.
Measure the index separately from the line-base change. Keep other symbol
tables and std dependencies outside this change.

Use the existing checked IR and emitted C oracles for any selected change.
Source coordinates must match exactly for an unchanged input, including
after BOM and CRLF normalization, at module boundaries and in overlays.
Measure the proposed change against 1.3.5 on the fixed compiler workload
and rerun the 1.3.5 cold, warm and comment-edit gate. Preserve the 20%
comment-edit target against the pre-incremental compiler and the existing
memory budget. Report compiler source changes separately from application
C and executable size changes.

Revalidate source-name and overlay identity, import resolution and lock
changes, builtins and bundler fingerprints, C simplification modes, C
toolchain identity, native compile/link flags, and PGO plan and payload
digests. Ordinary, PGO, LTO and combined builds may share checked C. Every
native build runs the selected native mode and validates its current inputs
before publishing. Invalid records must preserve independent full-check
diagnostics, query ranges and emitted C.

Use existing compiler and bootstrap data structures where they satisfy
the measured change. Compare cost and bootstrap before adopting a std
dependency. Finish with independent source and C recovery and this stage's
full `vela-dev.cmd verify`. Benchmark controllers remain outside the
compiler and native build dependency graph.
