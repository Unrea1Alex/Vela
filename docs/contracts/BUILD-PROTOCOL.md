# Native CLI protocol 1 (0.6.4)

Implemented and verified: 886/886 at 0.6.4, 887/887 at the 0.6 release gate.
`vela` and compatibility alias `velac` run the same native
compiler. The historical Python 0.2 entry point was removed from the current source tree; it is outside the stable native CLI. Native tools require
neither Python nor Node. Input is a source file or explicit manifest; directory
discovery is not implicit. `--version` reports compiler release; an executable
SHA-256 identifies an exact build (version text alone is insufficient).

Commands: check, symbols, emit-c, build (-o required), run (-- program arguments),
lock, test, fmt. check/symbols retain TOOLING JSON schema 1; errors E225/E226 are
manifest/lock failures. Exit 0 success, 1 rejected source/test/format mismatch,
2 usage/environment/toolchain error, 70 runtime panic. run propagates program exit.
Output publication is atomic and must not overwrite sources or metadata.
No incremental cache. Future cache keys must include compiler/runtime digest,
target, flags, normalized manifest, lock and every source/dependency/resource.

Embedding hook `VELA_SOURCE_ROOT` restricts source/manifest/lock reads to a lexical
absolute subtree. It is not a filesystem sandbox or symlink resolver. MCP must
materialize a checked, link-free snapshot first and set this root for its child.

test requires a manifest and at least one explicit test field. Each test is an
independent entry module compiled and executed with a 30 second process-tree
timeout by the native process primitive. Passing means exit zero; test code
contains its assertions. All entries run unless a compilation fails. JSON output
contains each source, exit code, stdout/stderr and aggregate ok; streams are
captured to private temporary files. This is a test runner, not a security sandbox.

fmt SOURCE defaults to text on stdout. fmt PROJECT requires --check or --write:
visit main/test graphs, deduplicate by identity, restrict to manifest directory,
exclude dependency graphs. --check never writes; --write atomically writes each
changed file. A multi-file format is not a transaction. --json does not change
single-file formatting text. Dependency locks are verified before graph work.

symbols additionally reports source/module information for functions and a
modules array. Existing internal canonical names remain compiler-local IDs;
they are not import paths or stable cross-invocation semantic IDs (0.9).

Only MSVC C4102 (unused generated labels) is disabled for generated C. Compiler
errors and all other warnings remain visible on stderr. Linux is not claimed
supported until its separate gate passes.

Validation: every command on plain source/project, test pass/failure/capture,
formatter boundaries/idempotence, output protection, lock invalidation, bootstrap,
clean native installation without Python/Node, actual build and behavioral tests.
