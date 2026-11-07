# Vela 1.0.0 acceptance

2026-11-07. Compiler/runtime/application acceptance is complete. Native Windows
and optional MCP delivery are verified after relocation and checksum inventory;
exact final archive receipts are recorded outside the archives.
The [public contract](contracts/STABLE-1.0.md), [policy](COMPATIBILITY.md) and
[migration](MIGRATING-1.0.md) were verified in order before this gate.

| Stage | Compiler | Native checks |
|---|---|---|
| 1.0.2 API freeze | 1.0.0-rc.1 | 1212/1212 |
| 1.0.3 compatibility/migration | 1.0.0-rc.2 | 1212/1212 |
| 1.0.4 release compiler | 1.0.0 | 1214/1214 |

Each compiler gate builds three generations, compares emitted C and the bundler
fixed point, and runs the native suite without skips. The 84-file stable contract
snapshot was explicitly refreshed for the documented AppContainer correctness fix.
The migration example prints its declared output;
the old server Response constructor rejects with E210.

Windows: MSVC x64 full target. Linux: fresh isolated Alpine 3.22.8 WSL2 with
GCC 14.2/musl, compiler and console target only. Existing broken WSL registrations
were preserved; acceptance uses the separately imported VelaRelease100 environment.

Confirmed: GC 200/1600 compilations, identical peak managed heap 1,139,506
bytes; FieldDesk 1000 repeated analyses; LSP base/method/interface 200-request
checks and callable rename/hover; actual PulseDeck demo 6/6 with 3 healthy,
and close during active/queued work preserving one completed result, cancelling
the other two, draining curl and leaving only report.json.

MSVC C recovery produces identical emitted C. A separately staged tree installs
the C-recovered compiler before rebuilding its driver, then completes three native
generations, both fixed points and 1214/1214 checks, without Python.

Application regressions: PulseDeck 11 named and 21 HTTP/TLS; FieldDesk 17 named,
19 CLI and 8 network; Notes 2 named. Real Notes Unicode/Ctrl+A/save/load and
FieldDesk Analyze were checked. HTTP API fixtures: 19 client and 16 server cases.

MCP: five SDK test groups, 1000 sequential requests and 25 cancellations; execution
26, isolation 26 and fault 11 checks. The first fault run exposed AppContainer
DOS-path canonicalization failure for an allowed native DLL. A normalized handle
NT fallback fixes it while preserving same-object, containment and isolation checks.
All dependent native/recovery/execution gates were repeated after the correction.
The execution cache's exclusive lease was respected by running hosts serially.

The independent new-client scenario performs native help/check/build/test/run,
including a deliberate E201 and three named application tests on the final compiler. Direct skill-file
reading is denied by the client's policy; use of automatically supplied skill
instructions is self-reported, not evidence of a successful file read.

Linux archive: C recovery, emitted C fixed point, resources/lock, named test,
payloadless enum behavior, Unicode relocation and unpacked checksum verification.
It includes the standalone compiler source and Linux-specific recovery instructions.

Delivery checksums and exact archive inventory are recorded externally in
`dist/RELEASE-1.0.0.json` and `dist/SHA256SUMS-1.0.0.txt` to avoid a circular archive hash.
Machine stage results: [1.0.2](stage1020-evidence.json), [1.0.3](stage1030-evidence.json),
[1.0.4](stage1040-evidence.json), [new client](stage1040-agent-evidence.json).

Scope retained from the contract: Windows GUI/DLL/process/fibers/network adapters;
Linux console only. HTTP connection pooling remains after 1.0. Physical monitor
transitions, fresh Windows OS install and other platforms are unperformed.
No public GitHub publishing is part of this local acceptance.
