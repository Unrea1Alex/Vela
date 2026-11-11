# Focused verification for Vela 1.3

Run the native `vela-dev.cmd verify` gate after every roadmap item. The
measurement scripts are separate developer tools. They add no dependency to
the compiler, native suite or ordinary Vela programs.

## C generator baseline and paired comparison

The [optimization contract](../../docs/contracts/C-OPTIMIZATION-1.3.md) fixes
the input groups, oracles, targets and budgets for 1.3.4e–l. The controller runs
from the repository root in a Windows x64 Visual Studio Developer Command Prompt.
It uses the existing VelaBench Windows Job meter and a separate GCC-built Linux
meter inside the selected WSL distro.

```bat
node tests/library13/codegen-profile.mjs msvc OUTPUT.json REFERENCE.exe CANDIDATE.exe
node tests/library13/codegen-profile.mjs gcc OUTPUT.json REFERENCE_ELF CANDIDATE_ELF VelaRelease100
```

Pass the same accepted 1.3.4d compiler twice for the reference repeat. The Linux
ELF can be recovered from the same autonomous emitted C with GCC 14.2.0 and
`-std=c11 -O2 -ffp-contract=off -lm`. The controller expects repository inputs
and binaries on a Windows drive mounted under `/mnt` in WSL. For comparisons
between compilers, supply their corresponding authored compiler sources through
`VELA_CODEGEN_REFERENCE_SELFHOST` and `VELA_CODEGEN_CANDIDATE_SELFHOST`.
Set `VELA_CODEGEN_COMPILER_WORKLOAD` to the frozen 1.3.4d authored source directory
for the paired compiler build workload. Both binaries compile that same input.
The bootstrap gate separately builds the current compiler from its own source.

Run host measurements serially on the same machine. The release runs retain
normal compiler flags. Separate copies of emitted C count allocations and
executed GC polls. The separate timing compiler reports frontend and generation
intervals. Its counters and times are distinct from uninstrumented build samples.
On Linux, process and tree RSS are sampled every 5 ms across an isolated session.
This includes compiler children that create a new process group in that session.
A root process that finishes before a usable sample has a null RSS value.
The tree metric includes
the largest single-process RSS reported by `wait4` when it exceeds the observed
sum. Short-lived children can escape a sample and shared pages can appear in
more than one process. The report records these values separately from Windows
peak Job commit. Archive measurements describe the versioned benchmark payloads.

Use `node tests/library13/codegen-compare.mjs BASELINE.json PAIRED.json OUTPUT.json`
for the candidate medians against both the previous compiler in the pair and
the fixed 1.3.4d reference. The output preserves the reference noise by workload.

For 1.3.4h, `node tests/library13/codegen-ir-oracle.mjs COMPILER OUT` emits
both C modes and checks independent numeric, contract and effect oracles under
MSVC and GCC. Run it from the MSVC developer environment. The focused constant
fixture uses `--no-ir-simplify` for the bypass comparison.

## 1.3.1 baseline

Use a Windows x64 Visual Studio Developer Command Prompt with Node.js and the
existing VelaBench `src/meter.exe` built from `src/ProcessMeter.cs`. The meter
uses a Windows Job to count CPU and peak private commit across the measured
process and its children. The profile reads the VelaBench meter only. It writes
all temporary inputs, builds and logs below `build/stage13` in Vela.

```bat
set VELA_CC=cl.exe
set VELA_CC_KIND=msvc
node tests/library13/profile.mjs G:/VelaBench build/stage13/baseline.json
node tests/library13/profile-functions.mjs build/stage13/function-profile.json
```

The first command runs the frozen workload in
[the performance protocol](../../docs/contracts/PERFORMANCE-1.3.md). It also
builds a separately instrumented copy of generated C to collect managed
allocation and explicit copy counts. The second command measures Vela function
counts and inclusive instrumented time. Compare release timings using the first
command's normal samples. Run the two commands sequentially on an idle machine.
The script records the compiler, toolchain, meter and curl versions or hashes.

## 1.3.1a checked values

`node tests/library13/checked-values.mjs G:/VelaBench OUTPUT.json [BASELINE_PROBE.exe]`
checks the three input sizes and the separate debug function counts. With the
original 1.2 probe EXE it alternates legacy and checked runs after warming both.
The report retains both the historical and contemporaneous comparisons. The
checked-value fixture and four rejection fixtures are registered in the native
suite. The positive fixture also runs under forced GC on Windows and Linux.

## 1.3.1b configuration snapshot

`node tests/library13/config-profile.mjs G:/VelaBench OUTPUT.json` rotates the
legacy and two snapshot modes on the same inputs. One lookup captures startup
and construction cost. Two thousand lookups include the same construction cost.
Debug counts verify UTF-8 checks, detached input copies and index construction.
`vela run tests/library13/config-limits.vela` covers exact node and text budgets.

## 1.3.2 HTTP multi prototype

From a VS x64 Developer Command Prompt, build and run the separate probe:

```bat
pwsh -NoProfile -File scripts/build-http-multi-deps.ps1
cmake -S native/http-client -B build/stage13/transport-probe -G "Visual Studio 17 2022" -A x64 -DCMAKE_PREFIX_PATH=G:/Vela/build/stage13/transport-deps/install -DOPENSSL_ROOT_DIR=G:/Vela/build/stage13/transport-deps/openssl-install
cmake --build build/stage13/transport-probe --config Release --parallel 8
node tests/library13/http-multi-probe.mjs
```

The build verifies release archives before unpacking them under the dependency
work directory. Perl is a portable dependency build tool. The loopback stand
uses OpenSSL CLI to generate short-lived test certificates (override its path
with `VELA_TEST_OPENSSL`). Its PEM and key files stay under `build/stage13`.
The prototype measures the transport and test driver. It is separate from the
public Vela API and the migrated application performance gate in 1.3.3.

## 1.3.3 HTTP multi integration

Build `http-live.vela` with the native candidate and copy the freshly built
`vela-http.dll` beside it. Point `VELA_HTTP_TEST_EXE` to the resulting EXE and run
`http-multi-probe.mjs` with the probe, VelaBench directory and output JSON.
The fixture checks real TLS and binary DELETE under both default and forced GC.
The fault probe uses a loopback UDP DNS sink and a reduced upload socket buffer
to isolate connect, TLS and partial upload cancellation. The production DLL has
neither test hook.

Build `http-soak.vela` the same way. Run
`node tests/library13/http-soak.mjs SOAK.exe OUTPUT.json 1800000` for the
30-minute gate. The server counts requests and live sockets. The independent
VelaBench meter samples process-tree private commit once per second.
The test compares the warmed five-minute window at minutes 5–10 to the
final five minutes. Both windows need 250 complete observations. The final
median and maximum each have a 2 MiB allowance for allocator variation.

`node tests/library13/http-profile.mjs LEGACY.exe COLLECTOR.exe OUTPUT.json`
pairs the frozen and current collectors on 1, 4 and 10 sequential GETs. It
compiles a temporary copy of the independent Job meter to expose accounting
and enforce one active process for native HTTP. The legacy control demonstrates
that the process cap actually prevents the helper from sending a request.

Compile `http-gui.c` with MSVC and `user32.lib`, then run
`node tests/library13/http-gui.mjs CONTROLLER.exe FieldDesk.exe PulseDeck.exe OUTPUT.json`
on the interactive Windows desktop. The controller checks the real Win32 controls
and the server observes connection reuse, cancellation and final socket close.

## 1.3.4 typed JSON profile

Build `profile.vela` normally and run
`node tests/library13/json-profile.mjs BASELINE.exe CANDIDATE.exe OUTPUT.json`.
The runner verifies each input hash and the sum of 300 decoded results against
the frozen oracle. Use `--json-typed-only` after the output argument of
`profile.mjs` or `profile-functions.mjs` to isolate allocation, copy and
function counts for this workload in a developer environment.

## 1.3.4a shared JSON lexical rules

The native fixture `v134a_json_lexical` checks literal expectations for tree,
reader and typed access, including every truncated prefix of an object with
escapes or an exponent. Run `vela run tests/library13/json-writer.vela` for
the exact 16 MiB output boundary. Repeat the paired JSON profile with
`G:/VelaBench 1.3.4a` after the output argument. For the retained values and
opaque spans run `tests/library12/json-decode-gc.vela` with forced GC.

## 1.3.4b file publication

The native `v134b_file_publication` fixture uses a private working directory
to test partial staging, failing source close, failed replacement, and
directory cleanup before and after commit. Compile it with its standard
fixture import paths and run under both regular and forced GC. Supply that
executable to `node tests/library13/file-publication.mjs EXE OUTPUT.json`
for the 2/20 MiB digest and memory checks.
`file-legacy-cleanup.vela` uses a copied emitted-C executable with a
test-only `v_remove_dir` failure injected at function entry. Run it in a
new directory for each platform to verify both legacy commit flags.

## 1.3.4k native PGO

Run the focused fixture and performance series from the repository root.
Use the matching stage compiler and the frozen authored workload from
1.3.4e. The runner verifies the workload hashes before taking samples.

```text
node tests/library13/pgo-gate.mjs HOST COMPILER FOCUS_OUT
node tests/library13/pgo-profile.mjs HOST COMPILER PERFORMANCE_JSON FIXED_SELFHOST
node tests/library13/pgo-compare.mjs PERFORMANCE_JSON COMPARISON_JSON FIXED_SELFHOST
node tests/library13/pgo-compiler-gate.mjs PERFORMANCE_JSON COMPILER_GATE_OUT
```

`HOST` is `msvc` or `gcc`. The Windows runner uses the independent VelaBench
Job meter. Give it the pinned MSVC developer environment with a byte-verified
copy of the native tools that excludes `vctip.exe`. An idle telemetry child
would otherwise be part of the measured job. GCC runs in `VelaRelease100`
with the checked-in Linux meter. Build and execution samples use serial
runs on each host. After the mode-specific gates, run the ordinary stage
gate with `vela-dev.cmd verify`. [PGO contract](../../docs/contracts/NATIVE-PGO-1.3.md).

For the Windows native suite with an instrumented compiler, build
`pgo-mode-driver.vela` and pass the launcher as the compiler executable.
Set `VELA_TEST_PROFILE_COMPILER` to the instrumented compiler and set
`VELA_TEST_INSTRUMENTED_COMPILER=1`. The native runner then allows three
minutes for compiler `check` calls. The diagnostic oracles, fixture
deadlines and explicit timeout tests use their existing expectations.
The ordinary verifier uses its default deadlines.

## 1.3.6 release

Use `profile.mjs VELABENCH REPORT --release ARCHIVE_DIRECTORY HTTP_DLL`
with the verified 1.3.0 compiler installed. The report repeats the ordinary
workload matrix with the native HTTP adapter. Run the paired Text/Path, Config,
JSON, HTTP, semantic cache and fixed compiler profiles separately from the
30-minute HTTP soak.

Use `pgo-profile.mjs` with `--release-lto` to exercise O2, PGO, LTO and combined
builds from an extracted SDK. It reuses the fixed training and held-out oracles.
The resulting report feeds `pgo-compiler-gate.mjs` for mode-specific fixed
points, recovery and native callback checks. The independent performance
series for these modes are the 1.3.4k and 1.3.4l receipts.
