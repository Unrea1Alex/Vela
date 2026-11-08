# Vela 1.2.0 acceptance

2026-11-08. Version 1.2.0 is implemented and verified. All 17 roadmap stages
passed in order, including the release gate. Exact archive metadata is recorded
outside the archives
in `dist/RELEASE-1.2.0.json` and `dist/SHA256SUMS-1.2.0.txt`.

Every stage below ran `vela-dev.cmd verify` before its dependent stage: three
compiler generations, identical stage-2/3 C, the bundler fixed point and native
fixtures without skips. Compiler algorithms and the ordinary native build/test
path remain Vela; Node is optional integration/independent acceptance tooling.

| Stage | Native checks | Focus |
|---|---:|---|
| [1.2.1](acceptance/1.2.1.json) | 1244 | Compact entry, checked API, fresh CLI client |
| [1.2.1a](acceptance/1.2.1a.json) | 1248 | Frozen old surface/app fixtures and evolution contract |
| [1.2.2](acceptance/1.2.2.json) | 1255 | Native API search, bounds, pages and fingerprints |
| [1.2.3](acceptance/1.2.3.json) | 1272 | Native exclusive project init and named tests |
| [1.2.4](acceptance/1.2.4.json) | 1278 | Typed CLI schemas and three application migrations |
| [1.2.4a](acceptance/1.2.4a.json) | 1288 | Result/Option callbacks and typed causes |
| [1.2.5](acceptance/1.2.5.json) | 1296 | Stable snapshot merge sort and old-sort compatibility |
| [1.2.5a](acceptance/1.2.5a.json) | 1306 | Eager/fallible traversal and short circuits |
| [1.2.5b](acceptance/1.2.5b.json) | 1324 | Opaque Set, key domain and aliases |
| [1.2.5c](acceptance/1.2.5c.json) | 1336 | Opaque Cell and captured shared identity |
| [1.2.6](acceptance/1.2.6.json) | 1352 | Typed selective JSON/schema validation and budgets |
| [1.2.6a](acceptance/1.2.6a.json) | 1368 | Bounded typed I/O and line streams, file owners |
| [1.2.7](acceptance/1.2.7.json) | 1382 | Ordered bounded parallel jobs and HTTP/GUI lifecycle |
| [1.2.8](acceptance/1.2.8.json) | 1393 | Diagnostic explanations and rechecked no-write previews |
| [1.2.8a](acceptance/1.2.8a.json) | 1397 | Compiler inventory, independent fixtures and profiles |
| [1.2.8b](acceptance/1.2.8b.json) | 1401 | Frontend/arena/tag/span audit and known-type regression |
| [1.2.9](acceptance/1.2.9.json) | 1401 | Clean C recovery, six fresh agents and packaged delivery |

The final 1.2.0 compiler and an isolated Windows tree restored from the delivered
C seed each passed **1401/1401**, both fixed points and zero skips. The seed and
standalone bundle are regenerated from verified authored inputs. The separate
[compiler audit](COMPILER-AUDIT-1.2.md) covers 27 modules/427 functions, boundaries,
context-local IDs, shared scratch state and explicit error paths. Known type
qualifiers cannot receive an import correction. Windows temporary directory
collisions are retried with a bound while preserving another caller's path.

All 15 recipes execute; the generated index describes 32 std modules plus builtins.
The 372 old public declarations and four literal frozen fixtures pass, and the
archived 1.1 application snapshot stays unchanged. New std contracts state
effects, aliases, ownership, work/memory limits, errors and cancellation.
Real Windows/Linux streaming probes copied/decoded 27 and 270 MiB with bounded
working storage. The HTTP collector preserves ordered results, starts a queued
request before a slow neighbor completes, drains cancellation and accepts five
GUI messages with observed response at most 15 ms in that focused run.

CLI/LSP/MCP share native errors, revision and Unicode positions; LSP diagnose
previews are versioned. The final SDK passed eight groups including 1000 requests
and 25 cancellations; the separately staged adapter/SDK passed the same eight
groups. Execution/isolation/fault/output gates passed **29/26/11/22**. A new
Unicode/space installation with a real stdio client passed nine checks including
matching API discovery and isolated native check/build/test/run. Startup is
**1893/2000** tokens (`js-tiktoken@1.0.21`, cl100k_base, compact LF, encoded once);
the full duplicated wire envelope is measured separately at 3538 tokens.

The predeclared [agent protocol](contracts/AGENT-ACCEPTANCE-1.2.md) used the same
compiler/API/task/limits in six fresh sessions, with independent nonces and no
prior conversation, sibling solution or oracle feedback. Both variants had
**3/3 correct solutions**, 63 checks per trial. Median uncached input fell from
**47626 to 32055 tokens (32.69%)**, exceeding the 25% target. Exact provider
input/cached/output, elapsed time, help invocations and compiler corrections are
in [the A/B receipt](acceptance/1.2.9-ab.json). The original static source-pattern
oracle falsely rejected valid manifest aliases in five projects; original reports
are preserved, and native bindings plus exact SDK-byte module hashes establish
the required library calls. Literal behavior expectations and trial programs
were unchanged. This measures these documentation workflows on one small task,
not all models, syntax efficiency or a general speed improvement.

Windows archives verify every entry size/SHA-256; Unicode/space relocation with
stripped PATH runs FieldDesk/PulseDeck and the original application oracles:
**26/26 index, 46/46 logs, 44/44 HTTP**. The final status-document update retains
all tested code digests and rebuilds the delivery inventory.

Linux x86-64/GCC/musl acceptance recovers from C, compares emitted C, exercises
native API lookup/init/check/build/test/run, resources and stale locks, indexes
binary files and decodes JSON. The final archive verifies every checksum and
runs console applications after Unicode relocation in an empty environment.
Windows GUI, DLL FFI, fibers and HTTP adapters retain their documented Windows
scope. No Linux fiber/GUI support is claimed. Forced-GC probes are bounded and
separate from maximum-depth/large-file tests; the full compiler is not forced-GC
stress tested. Fresh physical Windows installation, desktop IDE discovery and
multi-monitor transitions were not repeated. Full VelaBench remains in 1.4.6.
