# Native link-time optimization

```text
vela build ROOT -o OUTPUT --lto
vela pgo-instrument ROOT --profile NEW_DIRECTORY --lto
vela pgo-train DIRECTORY -- APPLICATION_ARGS...
vela build ROOT -o OUTPUT --pgo-profile DIRECTORY --lto
```

Builds without an optimization option retain O2. LTO preserves the emitted
C input, integer checks, source locations, floating-point policy and runtime
ABI. It is selected in the local CLI for both a source file and a project.
`run`, `test` and `emit-c` reject LTO as a build option. Exporting instrumented
debug C remains a separate operation. The MCP execution host explicitly
rejects local optimization modes.

On Windows x64 with MSVC 19.44.35222, compile with `/GL` and link with
`/LTCG /INCREMENTAL:NO`. Keep `/O2 /fp:strict /MT`. Pure LTO also defines
`VELA_LTO_COMPACT` to enable MSVC's size preference in emitted Vela
functions with fewer than 250 emitted lines and no emitted loop. Restore
the command-line optimization policy after each such function. The
runtime, ordinary builds and PGO use their existing optimization policies.
MSVC PGO already uses
`/GL /LTCG`. Explicit PGO plus LTO has identical effective flags and can use
the same validated profile as PGO on the same compiler revision.
[MSVC linker documentation](https://learn.microsoft.com/en-us/cpp/build/reference/ltcg-link-time-code-generation?view=msvc-170).
[MSVC function optimization pragma](https://learn.microsoft.com/en-us/cpp/preprocessor/optimize?view=msvc-170).

On Linux x86-64 Alpine musl with GCC 14.2.0, use `-flto -fuse-linker-plugin`
at compilation and final link with `-O2 -ffp-contract=off`. Validate the
LTO compiler, wrapper and linker-plugin bytes in the toolchain identity.
GCC PGO plus LTO requires instrumenting and applying the same LTO flags.
A non-LTO GCC profile and an LTO GCC profile are incompatible in both
directions. Missing or incompatible inputs fail before publication.
[GCC optimization options](https://gcc.gnu.org/onlinedocs/gcc-14.2.0/gcc/Optimize-Options.html).

Vela emits one C translation unit with its runtime. The linker can
optimize compatible native objects within the executable link. Project DLLs
are loaded through the existing FFI ABI and copied as companions. This
workflow accepts no user-provided LTO objects or static libraries. Deliver
the executable and its usual resources and native companions.

The cache stores generated C. LTO and PGO are native-phase options and
validate their toolchain and profile on each build, including cache hits.
An executable is always built for the selected options. No LTO object,
toolchain intermediate or profile data is part of the deployed artifact.
The reproducibility gate compares byte-identical C and bundler output.
Native artifact hashes record individual builds because compiler and
linker metadata may differ across invocations.

## Acceptance

Use BuildLens and the authored compiler as the primary delivery workloads,
with the frozen 1.3.4k 10,000-record input and 1.3.4e compiler check workload.
Use the separate 1.3.4k training corpora for profiling. Collect warm
alternating five-pair execution and build series for O2, PGO, LTO and
PGO plus LTO. Measure profile preparation separately and reuse each sealed
profile across the final build pairs. Separate native compile and link timing and process-tree
peak from end-to-end build measurements. Report EXE bytes and the
corresponding delivery payload separately. A primary LTO workload on each
toolchain must reduce bytes by at least 2% or wall time by at least 3%
beyond O2 noise. Compare the combined mode against PGO, including MSVC's
effective-flag equivalence. Retain the [common budgets](C-OPTIMIZATION-1.3.md).
When a preliminary timing and the full series disagree about the target,
repeat with 21 alternating pairs using the exact same verified executables
and inputs. Preserve the original samples.

Plain MSVC `/GL /LTCG` missed the held-out target in the initial series and
its 21-pair repeat. A global size preference slowed the compiler on a
separate validation workload. Scope the preference to short loop-free
generated bodies after the FieldDesk and Pulse Deck calibration. The
calibration compared ordinary O2, plain LTO and three function selections.
Keep the primary workloads and thresholds fixed for the refined mode.
[Initial series](../acceptance/1.3.4l-msvc-first-profile.json) ·
[Repeat](../acceptance/1.3.4l-msvc-first-recheck.json) ·
[Function calibration](../acceptance/1.3.4l-msvc-function-calibration.json).

Check cache-mode isolation, unsupported combinations, debug mappings and
diagnostics, FFI callbacks and package execution without toolchain or
training inputs. Run separate compiler and recovery checks for each mode
on each supported host, both fixed points, the applicable native suites and
the stage's own ordinary `vela-dev.cmd verify`.
