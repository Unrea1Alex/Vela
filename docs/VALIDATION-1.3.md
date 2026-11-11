# Vela 1.3 validation

Vela 1.3.0 passed the [release contract](contracts/RELEASE-1.3.md) on 2026-11-11.
The [roadmap](ROADMAP.md) records stage dependencies and the individual criteria.
Compiler audit and optimization measurements are in the [audit report](COMPILER-AUDIT-1.3.md)
and [performance report](PERFORMANCE-1.3.md).

Each stage has its own `vela-dev.cmd verify` with three generations, a
byte-for-byte emitted C fixed point, a bundler fixed point and the full native
suite. These counts exclude optional Node, platform and performance checks,
which the linked stage receipts record separately.

| Stage | Scope | Native passed |
| --- | --- | ---: |
| [1.3.1](acceptance/1.3.1.json) | Frozen ordinary workloads and budgets | 1401 |
| [1.3.1a](acceptance/1.3.1a.json) | Checked Text and Path | 1411 |
| [1.3.1b](acceptance/1.3.1b.json) | Typed Config snapshots and bounds | 1417 |
| [1.3.2](acceptance/1.3.2.json) | HTTP transport prototype and contract | 1417 |
| [1.3.3](acceptance/1.3.3.json) | Native HTTP, applications and soak | 1423 |
| [1.3.4](acceptance/1.3.4.json) | JSON decoder performance | 1423 |
| [1.3.4a](acceptance/1.3.4a.json) | Shared JSON lexical layer | 1425 |
| [1.3.4b](acceptance/1.3.4b.json) | File publication and cleanup errors | 1427 |
| [1.3.4c](acceptance/1.3.4c.json) | Compiler ownership audit | 1428 |
| [1.3.4d](acceptance/1.3.4d.json) | Checked C lowering audit | 1430 |
| [1.3.4e](acceptance/1.3.4e.json) | Fixed code generation baseline and budgets | 1430 |
| [1.3.4f](acceptance/1.3.4f.json) | Precise roots for scalar aggregates | 1432 |
| [1.3.4g](acceptance/1.3.4g.json) | GC safepoints | 1434 |
| [1.3.4h](acceptance/1.3.4h.json) | Conservative checked IR simplification | 1439 |
| [1.3.4i](acceptance/1.3.4i.json) | Signed range proofs | 1444 |
| [1.3.4j](acceptance/1.3.4j.json) | C reachability | 1449 |
| [1.3.4k](acceptance/1.3.4k.json) | Opt-in PGO | 1450 |
| [1.3.4l](acceptance/1.3.4l.json) | Opt-in LTO and combined profiles | 1450 |
| [1.3.5](acceptance/1.3.5.json) | Semantic check cache | 1451 |
| [1.3.5a](acceptance/1.3.5a.json) | Cache dependencies and compiler cost audit | 1451 |
| [1.3.6](acceptance/1.3.6.json) | Release 1.3.0 | 1451 |

## Ordinary release workloads

The Windows x64/MSVC 19.44.35222 series repeats [1.3.1](acceptance/1.3.1-baseline.json)
with one warm-up and five measured runs per group. All 36 workload groups passed
their output oracles. It also records 15 cold, warm and edit checks and five
BuildLens builds. Timed programs run without profiling. Function and allocation
counters come from separate executions. The Windows Job meter records CPU and
peak private commit for the process tree.
[Full series with ranges and samples](acceptance/1.3.6-ordinary.json).

| Paired workload | Wall median, ms | CPU median, ms | Peak Job commit median, MiB |
| --- | ---: | ---: | ---: |
| [Checked Text, 2,000 reads](acceptance/1.3.6-text-path.json) | 34.42 → 23.03 | 15.63 → 31.25 | 2.47 → 2.48 |
| [Checked Path, 2,000 reads](acceptance/1.3.6-text-path.json) | 72.91 → 22.87 | 62.50 → 15.63 | 2.48 → 2.48 |
| [Config snapshot, 64 keys](acceptance/1.3.6-config.json) | 52.89 → 22.83 | 46.88 → 15.63 | 3.93 → 2.51 |
| [Typed JSON, 64 keys](acceptance/1.3.6-json.json) | 206.33 → 62.80 | 218.75 → 62.50 | 3.91 → 3.87 |
| [Ten sequential HTTP GETs](acceptance/1.3.6-http.json) | 866.28 → 628.13 | 234.38 → 15.63 | 5.97 → 4.05 |
| [Comment edit in fixed selfhost](acceptance/1.3.6-cache.json) | 1515.38 → 124.66 | 1484.38 → 109.38 | 105.54 → 6.70 |

The selected wall-time improvements exceed 20%. HTTP improves by 27.5% in the
paired series and 20.4% against the 789.53 ms historical median. The server
sees one connection for ten requests with the native transport and ten with
the legacy helper. The short Text CPU median differs by one 15.625 ms
accounting tick. The Config table uses parse-once and repeated reads; snapshot
copy is also recorded. The comment test reuses all 32 modules on the fixed
graph. The ordinary BuildLens build median is 2.230 s and its executable is
638,976 bytes.

The 30-minute HTTP run completes 20,678 success and live-cancel cycles, sends
zero queued-cancel requests and leaves zero open sockets. The server sees at
most one socket at a time. Wall time is 1,800.19 s, CPU time is 31.50 s and
peak Job commit is 5,419,008 bytes. The meter records 1,783 samples. The warmed
5–10 and final 25–30 minute windows contain 297 samples each, with median
private commit of 4,837,376 and 4,800,512 bytes. Both windows meet the
2 MiB bound for retained commit.
[Soak data](acceptance/1.3.6-soak.json).

## Compatibility and delivered modes

The verified 1.3.0 Windows compiler rebuilds the 1.0 FieldDesk project with
its original lock and executes its replay. The original ABI 1 callback
fixture links and runs with the new compiler. All 372 frozen public API
entries match. The relocated TreeIndex, LogSummary and HTTP Collector pass
26, 46 and 44 checks. The 1.2 HTTP Collector source rebuilt against the
current stdlib passes the same 44 cases with the legacy curl transport.

The relocated Windows SDK passes FieldDesk's 17 named, 19 CLI and eight
network checks, PulseDeck's 11 named tests and 21 HTTP/TLS scenarios per
transport, and BuildLens's ten named tests. Both native windows accept
controls during transfers and close every socket. The native TLS probe
covers trust policy, DNS and connect deadlines, reuse and ownership cleanup.

The delivered default is O2. The extracted compilers build and execute
BuildLens and the compiler workload in O2, PGO, LTO and PGO+LTO with fixed
independent oracles. On both hosts, LTO and combined compilers including
the instrumented combined build reproduce both fixed points and canonical
C recovery. Windows exercises ABI 1 callbacks with the packaged DLL under
GC stress. The five Windows debug checks and 88 checked IR and lowering
cases also pass. The independent native-mode timing series remain in
1.3.4k and 1.3.4l.
[MSVC workloads](acceptance/1.3.6-modes-msvc.json) ·
[MSVC compilers](acceptance/1.3.6-compiler-msvc.json) ·
[GCC workloads](acceptance/1.3.6-modes-gcc.json) ·
[GCC compilers](acceptance/1.3.6-compiler-gcc.json).

The matching Node.js 24 MCP adapter passes the real packaged stdio client
gate with nine checks. Source gates pass eight SDK groups with 1,000
requests, 36 execution, 26 isolation, 11 fault and 22 file output checks.
Release verification exposed and corrected the 1.3.0 manifest allowlist
and Unicode handling when building the isolated supervisor. The wire
fixture cancels after sending a request, and the execution fixture checks
recovery while the cancelled program would still be running without the
abort. Desktop IDE discovery was outside the packaged SDK test.

## C generation and native build comparison

The same-session comparisons pair the exact 1.3.4d reference compilers with
1.3.0 and use the fixed authored selfhost source tree. The workload corpus
contains 30 Windows and 28 Linux groups with one warm-up and five pairs each.
The raw series retain timing ranges, allocation/GC counters from separate
runs, and the generated C inventory. The comparison also keeps historical
1.3.4d medians. Windows measures Job private commit and Linux samples peak
RSS across the process tree.

| Target | Build | Wall, s | CPU, s | Peak tree, MiB | C, bytes | EXE, bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| MSVC | buildlens | 3.188 → 2.278 | 10.172 → 5.922 | 310.31 → 228.57 | 1,908,870 → 1,305,871 | 920,064 → 638,976 |
| MSVC | fielddesk | 9.761 → 8.182 | 17.375 → 12.375 | 300.80 → 233.79 | 2,748,960 → 2,080,426 | 1,261,056 → 870,912 |
| MSVC | compiler | 38.135 → 23.364 | 133.109 → 77.844 | 778.11 → 551.16 | 6,624,365 → 6,039,352 | 4,188,672 → 3,038,720 |
| GCC | buildlens | 11.109 → 5.743 | 10.852 → 5.502 | 392.12 → 282.18 | 2,069,182 → 1,416,595 | 1,159,000 → 547,640 |
| GCC | fielddesk | 15.596 → 8.428 | 15.193 → 8.044 | 421.96 → 397.44 | 2,956,984 → 2,229,762 | 1,484,168 → 711,952 |
| GCC | compiler | 58.808 → 26.843 | 58.145 → 26.116 | 596.96 → 495.26 | 6,859,065 → 6,262,232 | 5,869,864 → 2,767,096 |

[MSVC series](acceptance/1.3.6-fixed-msvc.json) ·
[MSVC comparison](acceptance/1.3.6-compare-msvc.json) ·
[GCC series](acceptance/1.3.6-fixed-gcc.json) ·
[GCC comparison](acceptance/1.3.6-compare-gcc.json).

For each build the raw reports split the checked frontend, emission,
separate C compile/link and end-to-end build. The compiler binaries in the
table are builds of the fixed workload. The installed 1.3.0 compiler is
3,419,648 bytes on Windows and
3,505,016 bytes on Linux.

### Runtime repeats

The repeat series sample cases where the first series exceeds a 10% budget
against either reference. Each repeat checks the executable fingerprints,
runs the same output oracle and alternates execution order for 21 pairs.
[MSVC same-session reference](acceptance/1.3.6-recheck-msvc-previous.json) ·
[MSVC original reference](acceptance/1.3.6-recheck-msvc-fixed.json) ·
[GCC same-session reference](acceptance/1.3.6-recheck-gcc-previous.json) ·
[GCC original reference](acceptance/1.3.6-recheck-gcc-fixed.json).

All repeated wall, CPU and process-tree medians are within budget. The MSVC
short aggregate and small typed JSON CPU medians match the same-session
reference at 15.625 ms. The original MSVC FieldDesk reference repeats at
40.805 ms and the candidate at 40.666 ms. In the largest GCC dynamic
dispatch case the repeated peak RSS rises by 7.87% while wall time falls
by 20.17%. The checked outputs remain identical throughout.

## Delivery and dependency inventory

The root checkout and a clean Windows recovery both pass 1,451 checks with
zero failures or skips. The Windows and Alpine compilers generate identical
canonical C recovery bytes. Windows installs in a Unicode/space path with a
System32-only runtime PATH. The static Linux x86-64 console SDK has no dynamic
section. The extracted Linux SDK checks resource relocation and stale locks,
initializes and tests a new project, and runs TreeIndex, LogSummary and BuildLens.

The native Windows compiler imports KERNEL32. The Windows applications ship
their ABI 1 GUI, HTTP client and server companions as applicable. Native HTTP
uses libcurl 8.23.0, OpenSSL 3.5.9 and c-ares 1.34.8 in a single DLL with the
three dependency licenses and manifest. The explicit legacy route requires
curl 8.4+. Native application builds use the local C toolchain. The separate
MCP SDK requires Node.js 24 and the matching Windows SDK. The extracted
archive was installed with its lock and checked using the official stdio client.

The measured Windows candidate ZIP is 14,685,069
bytes, compared with 8,432,006 for 1.2.0. Three
sibling copies of the self-contained HTTP adapter account for
5,993,304 compressed bytes. This is
the accepted package-size exception. The remaining 8,691,765 bytes
fit the 10% budget. The Linux candidate is 4,868,425
bytes and MCP is 189,242 bytes. The final packages
refresh acceptance documents and verify the preserved runtime payload.
Exact final archive byte counts and SHA-256 digests are in the external
`dist/RELEASE-1.3.0.json` and `dist/SHA256SUMS-1.3.0.txt`.

## Reproducing the release gates

Run the native verify from an x64 MSVC developer shell. Generate the C seed
with `emit-c selfhost/compiler.vela --source-name compiler.vela`. Run the
native `tools/help.vela` API index generator and verify the stable inventory
before refreshing the MCP compatibility pins and running `npm run build`.

`scripts/package-1.3-windows.ps1` takes a fresh `-Stage`, an `-Output`,
the verified `-HttpAdapter` and the installed `-HttpDependencies` metadata.
`-ReuseStage` archives the staging tree after acceptance document updates.
Run `scripts/verify-1.3-recovery.ps1` against a disposable extraction.
For MCP, install the adapter's locked dependencies in its own extraction
and set up a new workspace using the matching native SDK.

On Alpine, run `sh scripts/package-1.3-linux.sh ABSOLUTE_ROOT ABSOLUTE_ARCHIVE`.
The script checks canonical C, archive inventory, project resources and the
console applications from the extracted SDK.
