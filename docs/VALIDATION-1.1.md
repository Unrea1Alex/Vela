# Vela 1.1.0 acceptance

2026-11-07. Library 1.1.0 is implemented and verified. Stages 1.1.1–1.1.6
passed independently and in order, including the release gate. Delivery is local;
no remote publication, tag or source commit is part of this acceptance.

| Stage | Native checks | Focused acceptance |
|---|---|---|
| 1.1.1 contracts/regressions | 1218/1218 | Frozen pilot hashes, old JSON limits, shared supervisor boundary |
| 1.1.2 directory entries | 1222/1222 | Windows/Linux metadata, errors, ownership, GC, MCP installation |
| 1.1.3 walk/index | 1224/1224 | 12/12 and 26/26 Windows/Linux; ext4 depth 160; live repeat mutation |
| 1.1.4 JSON reader/logs | 1228/1228 | 30/30 and 46/46 Windows/Linux, 11 extra cases each, depth 4096 |
| 1.1.5 HTTP/compatibility | 1240/1240 | 29/29 and 44/44; deadlines/queue/cancel/cleanup; 19+19 TLS; 16 server |
| 1.1.6 release | 1240/1240 | Three independent agents; clean C recovery; relocated Windows/Linux and matching MCP |

Every gate rebuilds three compiler generations, verifies identical emitted C,
the bundler fixed point and the native suite without skips. Stage 1.1.5 includes
an additional bounded compiler compatibility fix: post-1.0 builtin functions are
fallbacks, preserving older user declarations. The archived 1.0 compiler accepts
the regression source; new symbols are byte-identical and query definitions /
references match. The original `curl` deadline remains unchanged; `curl_transfer`
is the compatible opt-in with an exact transfer timeout and bounded helper overhead.

The three new applications are [tree-index](../apps/tree-index/README.md),
[log-summary](../apps/log-summary/README.md), and
[http-collector](../apps/http-collector/README.md). They use standard modules
without SDK forks. Node is optional independent integration tooling, not an
application/compiler/native-verify dependency.

The final Windows compiler and a separate tree bootstrapped from the shipped C
seed each passed 1240/1240 checks, with no failures or skips and both fixed points.
C recovery in the source tree emits exactly the verified stage-3 C. Separate
trees embed different absolute source paths; the fixed point compares generations
within each tree. Compiler GC at 200/1600 repeated compilations had the same peak
managed heap of 1,157,430 bytes.

Three fresh agents independently implemented the indexer from the original
public initial task, then received the original maintenance task. Each passed
12/12 initial and 26/26 combined maintenance checks. They had their own workspace
and supplied SDK instructions, without sibling solutions or private oracle
feedback. SDK fingerprints and vendored modules remained unchanged. Delegated
sessions lacked Vela MCP tools and used the documented native CLI fallback.
[Independent receipts](stage1116-agent-evidence.json).

MCP passed five SDK groups, including 1000 sequential requests and 25
cancellations; execution 29, isolation 26, fault 11 and output 22 checks. The new
directory primitive enumerates the isolated snapshot and rejects an external
host directory. Packaged setup passed a real handshake after Unicode relocation.
LSP passed 200 requests in each of base, method and interface modes, preserving
source bytes, UTF-16 positions and stale-version checks.

The archived 1.0 MeasureLab project builds, passes its 12 named tests and produces
its report without relocking. A public FFI client and DLL compiled against the
archived 1.0 header run with ABI 1. The historical pilot's 1260 frozen hashes
were checked again and remained unchanged. FieldDesk/PulseDeck network regressions
passed 8/21 cases during 1.1.5; relocated packaged applications also ran.

Windows ZIP inventory checks every entry's size and SHA-256; relocated binaries
run with a stripped PATH. The three packaged applications pass 26/26, 46/46 and
44/44. Linux packaging recovers from C, checks the emitted-C fixed point,
resources/lock/stale-lock rejection, named tests, binary indexing and selective
JSON, then verifies unpacked checksums and runs after Unicode relocation with
an empty environment. Exact archive hashes are kept outside the archives in
`dist/RELEASE-1.1.0.json` and `dist/SHA256SUMS-1.1.0.txt`.

Scope: Windows x64/MSVC; Linux x86-64/GCC/musl compiler and console filesystem /
JSON programs. Windows-only HTTP, GUI, DLL, fiber and process adapters are not new
Linux capabilities. Maximum JSON depth 4096 passed normal GC on both platforms.
Forced collection before every operation uses a separate depth-64 probe; the
depth-4096 forced-GC run was stopped for excessive runtime, not counted as passed.

Stage evidence: [1.1.1](stage1111-evidence.json), [1.1.2](stage1112-evidence.json),
[1.1.3](stage1113-evidence.json), [1.1.4](stage1114-evidence.json),
[1.1.5](stage1115-evidence.json), [1.1.6 release](stage1116-evidence.json).
Historical VelaBench and 1.0 release
archives are preserved; the full independent VelaBench remains scheduled in 1.4.6.
Fresh Windows installation, other architectures and physical-monitor GUI
transitions were not repeated. The next planned stage is 1.2.1.
