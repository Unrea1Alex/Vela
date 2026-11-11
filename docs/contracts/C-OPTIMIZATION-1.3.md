# Optimization contract for generated C

Stage 1.3.4e fixes the accepted [1.3.4d generator](../acceptance/1.3.4d.json)
as the reference for stages 1.3.4f–l. The existing
[1.3.1 performance series](PERFORMANCE-1.3.md) remains a separate baseline.

## Boundary and equivalence

Semantic analysis finishes every body, including unused code. An optimization
may read resolved checked expressions, statements, symbols and types. It
preserves the semantics of the entry and every reachable call, including
effects, diagnostic source spans, short circuit, traps, return values, match
selection, defer, suspension and cancellation. Precise root registration
continues to cover every managed value across a possible collection. Runtime
contracts run with their original behavior. Signed C arithmetic requires a
proof that the specific operation stays representable. Float64 uses its normal
rounding and contraction policy.

The archived 1.3.4d compiler supplies reference output for timing comparisons.
The planned pass bypass must run the same semantic checks and emit through the
reference lowering path. It will be exercised separately from normal O2 and
use independent cache identity wherever the selection can alter an artifact.
The release continues to verify the installed seed, three native generations,
the autonomous C recovery and the bundler. Debug locations and the runtime C
ABI are part of the comparison.

## Corpus and protocol

Use the same versioned inputs and independent oracles for the baseline, previous
accepted stage and candidate. Windows uses MSVC 19.44.35222 for x64. Linux uses
GCC 14.2.0 on Alpine x86-64 with musl. Ordinary builds keep the Vela driver’s
O2 floating-point flags. Separate counter builds instrument copies of emitted C.

| Workload | Sizes | Independent oracle |
|---|---|---|
| Numeric loop, scalar aggregate, mixed aggregate, closure and dynamic receiver | 20,000 / 200,000 / 1,000,000 iterations | Formula for the returned checksum, exactly one result |
| Strings, typed JSON and collection fold | Existing 1.3.1 input generators and small / medium / large sizes | Exact sums and successful records from the 1.3.1 contract |
| BuildLens CLI | 100 / 1,000 / 10,000 deterministic JSONL records | Exact accepted count, unique test count and aggregate duration |
| FieldDesk CLI and Windows GUI | Fixed demo and loopback acceptance inputs | Report data, replay agreement, GUI cancel/close and server-side drain |
| Windows native ABI and asynchronous work | Existing FFI callback and live HTTP fixtures | Callback counts, HTTP request order and connection lifetime from the fixture contracts |
| Compiler and bundler | Authored compiler project and autonomous bundle | Successful analysis, independent 1.3.4d lowering corpus, same-host C and bundler byte fixed points |

Warm each variant once, then alternate execution order in five measured pairs.
Report the full samples, median and range. Repeat the reference against itself
to establish variation before treating runtime changes as a gain. Use the
median absolute relative wall-time difference of the five same-binary pairs as
the noise threshold for the workload. Keep the full range in the evidence.
Take timing
samples without debug instrumentation or GC reporting. Independently collect
allocation count, peak managed bytes, GC count and emitted C counts for roots,
polls, arithmetic guards, temporary declarations, functions and types. Record
CPU, wall, process peak and process-tree peak for execution and builds. Report
frontend, emission and native compile/link separately. Hash inputs, executables,
C, toolchain configuration and packaged payload. Windows Job commit and Linux
RSS are host-specific metrics and comparisons stay within one host.

Windows GUI, DLL FFI and fibers use the Windows runtime. Linux exercises the
compiler and supported console paths per [platform support](PLATFORM-SUPPORT.md).
Any unsupported or unobserved metric must have its reason in the receipt.

## Targets and regression budgets

These targets apply to the preceding accepted stage at equal inputs, on both
supported C toolchains. Report the cumulative comparison against 1.3.4d too.
The primary deterministic C count is measured in the corresponding isolated
source group. For runtime claims, improvement must exceed the measured
same-binary spread for that workload. Any stage-specific refinement to workload
selection and ceilings is recorded before its implementation.

| Stage | Primary workload and target |
|---|---|
| 1.3.4f | Scalar aggregate. Remove at least 25% of its emitted root registrations, while the mixed aggregate retains its managed fields. |
| 1.3.4g | Numeric loop. Remove at least 40% of its emitted polls and preserve a bounded polling interval and managed peak. |
| 1.3.4h | Constant expressions and known branches in the focused checked corpus. Reduce temporary declarations by at least 20%, with the pass bypass as the comparison. |
| 1.3.4i | Numeric loop with provable induction bounds. Remove at least 20% of its arithmetic helper calls. The unknown-range variant keeps the required guards. |
| 1.3.4j | Compiler project and import-heavy BuildLens. Reduce emitted function definitions by at least 15% on BuildLens. Track C build time and code size separately. |
| 1.3.4k | Compiler check and BuildLens JSONL on held-out inputs. Improve median wall by at least 3% and exceed the reference noise threshold on a primary workload per toolchain. Track instrument, training and use separately. |
| 1.3.4l | Compiler and BuildLens executable delivery. Reduce bytes by at least 2% or improve median wall by at least 3% beyond the reference noise threshold on a primary workload per toolchain. Compare LTO and PGO plus LTO with their corresponding O2 and PGO references. |

An ordinary workload regression above 10% median wall or CPU requires an
explicit decision and evidence. The same applies to default build wall time,
managed peak, process-tree peak or package size above 10%. Retain the existing
1.3.1 memory and package budgets. The timing cost of an explicitly chosen
instrumented build or training run is reported separately. All runtime
equivalence and bootstrap checks are required independently of performance.
