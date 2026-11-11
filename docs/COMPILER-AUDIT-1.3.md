# Compiler audit 1.3

This inventory continues the [1.2 compiler audit](COMPILER-AUDIT-1.2.md).

## Effects and ownership, 1.3.4c

The [audit contract](contracts/COMPILER-OWNERSHIP-1.3.md) defines the existing
ownership boundary and the observable checks for this stage.

| Boundary | Inspected invariant | Focused oracle |
|---|---|---|
| `callables` → checked closure and indirect call | The body uses its declared effect ceiling and scope. Explicit capture bindings retain the resolved types and the enclosing control is restored after checking. | E238 at the unlisted capture and E209 at the indirect effect union and callback ceiling |
| `dynamic` → `emitter` | Packing records the resolved method symbols. Emission roots the operand across boxing, gives the box a typed visitor and retains the dynamic receiver across argument evaluation. | Exact dispatch output from `v106_dynamic` with forced GC |
| `intrinsics` → native FFI | Arguments are evaluated before conversion to the native ABI. Handle lifetime and library ownership are checked before entering C. | Closed alias fails at the original call, while the real null, aliasing and one native destructor checks in `tests/ffi/main.vela` succeed |
| Native callback registry | Active tokens keep their owner and managed environment alive. Thread, depth and in-flight checks guard reentry and close. The floating-point environment is restored across the boundary. | Stored callback counts, GC stress, revoked tokens, reentry and off-thread calls in `tests/ffi/callbacks.vela` |
| `suspension` → native fiber | Checked direct calls are followed transitively. Unknown synchronous calls and OS calls are rejected. A parked stack retains its own roots while the host's root chain remains visible to the collector. | E241 at both direct blocking and unknown callable sites. The parallel factory probe retains managed input and typed error aliases across `await` |
| `emitter`, `task_group`, `async_io` → exit and cancellation | Defer emission uses the active cleanup depth and keeps its live roots. The task scope stops admission before draining children. HTTP cancellation retires the underlying exchange before returning terminal state. | Exact defer output for normal, early and error exits under GC stress. Live HTTP cancellation and GUI shutdown are checked separately |

**B01. Closed runtime handle accepted at the generic FFI boundary.** Fiber
cleanup clears the native pointer, leaving a marked-closed object that aliases
still reference. The old pointer-first checks let `ffi_close` succeed and pass
the same alias to C as null. Both entry points now check `closed` independently
of the pointer. The existing null returned by the foreign library remains
accepted. The regression fixes the diagnostic position and exit 70, and the
fixture asserts the typed error from repeated cleanup before testing the call.
No new resource states or ABI entries are introduced.

The [stage receipt](acceptance/1.3.4c.json) records 1428/1428 native checks,
both fixed points, the MSVC and GCC recovery hashes, the dynamic and defer GC
oracles, and zero remaining sockets after the GUI applications closed.

## Checked IR and C lowering, 1.3.4d

The [lowering contract](contracts/C-LOWERING-1.3.md) defines the independent
arithmetic, effect-order, cleanup and source-location oracles.

| Boundary | Inspected invariant | Focused oracle |
|---|---|---|
| `driver` and `project_cli` → `emitter` | Both normal generation and test entry selection follow `analyze`. Emission reads checked expression, statement, arm, symbol and type records. | Integer shift syntax is rejected before a C file exists. Backend source inventory finds no syntax accessors or frontend type-checking calls in `emitter` or `intrinsics`. |
| `semantic` → numeric emission | Int text is normalized through checked decimal conversion. `INT64_MIN` has its own C spelling. Float64 literal checking happens before C emission. | Leading-zero literals, both Int bounds, Int32 narrowing and Float64 midpoints in `v134d_lowering`. GCC emits its underflow warning for values that correctly round to zero. |
| `emitter` → signed runtime arithmetic | The five checked operations test overflow before arithmetic. Divisor and minimum-dividend guards precede division and remainder. Range induction uses checked addition and stops before incrementing an inclusive endpoint. | Exact exit 70 and original span for 11 arithmetic failures. Inclusive `Int.MAX` terminates. The GCC corpus traps on undefined signed arithmetic or invalid floating conversions. |
| Runtime unsigned words and conversions | SHA-256 rotates 32-bit words by fixed counts in `1..31`. Input bytes widen to unsigned 32-bit values before left shifts. Narrowing follows a range check. | Three independent SHA-256 digests including a two-block vector, Int32 edge tests, and Float64 to Int checks in `v07_float`. |
| Checked call and match operands → C | `emit_arguments` creates temporaries in checked order. Receiver and callee precede their arguments. Named fields are assigned after evaluation in written order. `&&`, `||` and match guard execution explicitly. | Constructor, closure and branch markers in the new fixture. `v103_methods` covers receiver-first order and `?` before later arguments. The imported trace fixture fails before the second argument can execute. |
| Cleanup and source mapping | `emit_cleanups` runs inner scopes first before root restoration. Return values remain rooted across cleanup. Checked spans drive both fatal diagnostics and debug C statements. | Exact normal, return, propagation, continue and break output under forced GC. Debug C preserves the imported failure at line 2, column 12 and records both Vela frames. Windows debug checks also exercise PDB, fibers and callbacks. |

This pass adds focused fixtures. The inspected compiler and runtime algorithms
remain the same as in 1.3.4c. The cross-platform recovery checks use a canonical
source name for the autonomous bundle and compare authored project output
separately on each platform.

The [stage receipt](acceptance/1.3.4d.json) records 1430/1430 native checks,
both fixed points, the GCC and MSVC trap and recovery results, and the known
GCC warning for underflow to zero.

## Compiler costs and build dependencies, 1.3.5a

The [audit contract](contracts/COMPILER-COST-1.3.md) keeps the compiler
workload, measurement boundaries and comparison rules explicit. The
historical 1.2.8a authored-compiler medians were 1,707 ms cold, 230 ms warm
and 1,604 ms after edit. Those three-run microprofiles use the historical
source graph and record wall time and cache events. They contain no
phase, allocation or copy counters. The current paired series use the
same bytes within each comparison.
[Historical baseline](acceptance/1.2.8a.json).

| GCC compiler | Ordinary check wall, ms | Instrumented graph / parse / semantic, ms | Managed allocations | Explicit copy bytes | Executed GC polls |
|---|---:|---:|---:|---:|---:|
| Fixed 1.3.4d | 2,139.40 | 1,021 / 161 / 1,348 | 730,577 | 374,761,617 | 1,054,460,566 |
| 1.3.4f | 2,308.18 | 1,032 / 151 / 1,301 | 730,637 | 374,761,617 | 1,054,460,596 |
| 1.3.4g | 2,638.72 | 828 / 115 / 1,658 | 730,637 | 374,761,616 | 208,800,632 |
| 1.3.5 | 2,698.06 | 826 / 113 / 1,648 | 730,637 | 377,251,472 | 208,800,665 |

**C01. Linux compiler check.** The paired re-run reproduces the main
increase between 1.3.4f and 1.3.4g. Their `semantic`, `types`, `generics`,
`modules`, `core` and `driver` sources match byte for byte. The measured
semantic phase grows by 357 ms under instrumentation, while graph and
parse time decline. All four instrumented variants performed 35 GC
collections. These observations place the increase in the behavior of
the generated native checker and identify its phase. They do not isolate
one native instruction or optimization heuristic as the cause.
[Paired GCC history](acceptance/1.3.5a-gcc-history.json) ·
[Source hashes](acceptance/1.3.5a-source-attribution.json).

**C02. Repeated line-base scans.** The old graph builder re-read 8,299,341
bytes of already collected modules on the fixed workload. The current
authored graph would re-read 11,236,506 bytes. The source unit now retains
the length of its existing line table. The next module starts one byte
after the previous end and advances the line base by the previous line
count. The final concatenated line table and per-module parser keep the
same normalized spans.

**C03. Linear module-name lookup.** Profiling the line-base candidate on
the fixed graph recorded 111,969 calls to `module_declaration` and
1,188,581 µs of inclusive instrumented time there. The parser now records
the first index for each name in its module. Binding retains the ordered
declaration records, including the canonical-name update for prelude
fallbacks. Duplicate checks still cite the earliest declaration.
[Function profile](acceptance/1.3.5a-function-profile.json).

| Ordinary check wall, ms | 1.3.5 | Line base only | Line base and name index |
|---|---:|---:|---:|
| GCC | 2,603.53 | 2,583.76 | 1,337.45 |
| MSVC | 1,069.11 | 1,076.52 | 589.48 |

The GCC fixed reference ran in 2,129.04 ms in the same series. The final
candidate is 37.2% faster than that reference. The earlier isolated line
base experiment reduced GCC wall from 2,643.73 to 2,525.44 ms and its
instrumented graph phase from 837 to 743 ms. The contribution to whole
wall was smaller in the final series. The name index reduced the
instrumented semantic phase from 1,667 to 461 ms on GCC and from 828 to
359 ms on MSVC compared with the line-base variant. Ordinary peak tree
memory changed by +0.6% on GCC and +0.03% on MSVC against 1.3.5.

GCC managed allocations rose from 730,637 to 731,678 with both changes,
while explicit copied bytes changed from 377,251,472 to 377,222,927.
The index uses the compiler's existing `List` and `Dict` storage. The
changes need neither std imports nor a new runtime ownership rule. This
audit leaves broader selfhost library substitutions outside the measured
fixes.
[Line-base GCC series](acceptance/1.3.5a-line-gcc.json) ·
[Line-base MSVC series](acceptance/1.3.5a-line-msvc.json) ·
[Final GCC series](acceptance/1.3.5a-gcc.json) ·
[Final MSVC series](acceptance/1.3.5a-msvc.json).

**C04. Build identity and publication.** A catalog change in an isolated
bundler tree changes the compiler fingerprint. The rebuilt compiler misses
the original semantic and C records and emits the same application C for
the whitespace-only catalog edit. An unchanged rebundle reproduces the
bundle bytes. Normal, debug and simplifier-bypass C match independent full
passes through cache hits and damaged records.

The native build gate verifies the lock before C reuse. After changing a
DLL, a stale lock fails with E226, and a refreshed lock with the old PGO
profile fails with E243. A conflicting existing companion preserves the
prior delivery. A fresh delivery receives the new DLL bytes through a C
hit and runs with the expected result. Both native toolchains revalidate
their effective flags and identity on C hits. Changed plan and profile
digests reject without publishing over the prior output.
[Dependency checks](acceptance/1.3.5a-dependencies.json).
