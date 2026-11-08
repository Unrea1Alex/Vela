# Compiler audit 1.2

The [audit contract](contracts/COMPILER-AUDIT-1.2.md) fixes scope and validation.
This inventory concerns authored compiler modules, independently of std tests.

| Modules | Role and invariant | Decision |
|---|---|---|
| model, core | Typed arenas, Control, errors, primitive utilities; context-local IDs and shared Lists | Keep nominal ID wrappers and checked table reads; no runtime ownership stamp claimed |
| source, lexer, parser | Normalized source spans, tokens, immutable syntax | Preserve per-unit parsing, written evaluation order and UTF-8 positions |
| modules | Import graph, bindings, canonical private names, bound copies | Never mutate user AST to implement binding |
| artifacts, projects, project_cli | Metadata, lock, resources/native payloads, atomic outputs | One manifest parser; native boundary policy remains authoritative |
| incremental | Trusted local cache with hash/integrity/compatibility checks | Not incremental semantic analysis; cache miss must recheck |
| types, generics | Canonical types, instance maps and work queue | Early canonical registration permits recursive types; per-instance symbols/HIR |
| interfaces, dynamic | Bound validation, implementations, dynamic dispatch | Symbolic validation records are truncated before concrete generation |
| callables, suspension | Captures, callback type/effects, suspension graph | Captures retain existing alias semantics and GC roots; checked async calls only |
| semantic, errors, control | Type/effect checking, checked expressions/statements, flow | Finish all instance bodies before generate_entry |
| emitter, intrinsics | Checked HIR to C; checked arithmetic, source-order temporaries, roots | No AST access/type inference in backend; keep shared low-level emit helpers |
| formatter | Token/comment-preserving formatting with reparse | Independent of semantic validity |
| query, repairs | Bound uses, revision/overlay plans, fail-fast diagnostic previews | Same native frontend rechecks proposed edits; no partial HIR emission |
| help, scaffold | Checked public API, native exclusive project creation | SDK orchestrates, does not parse/check Vela |
| driver | Command dispatch, phase ordering, C invocation, publication | Generate only after successful frontend; protect inputs/metadata |
| tools/bundle, tools/dev | sources.list/catalog/runtime embedding; seed and three generations | Generated compiler/embedded files are outputs; byte fixed points required |

New libraries are useful for application-level sorting, schema decoding,
streams and parallel jobs. Compiler core retains bootstrap-compatible low-level
List/StringList helpers: importing every new std abstraction would enlarge the
recovery dependency graph without evidence of improved correctness. The duplicate
small split/JSON-escape helpers in standalone bootstrap tools remain deliberate;
their inputs and seed subset differ. Consolidation requires measurement, not a
mechanical rewrite. Existing collection-sort wrappers already delegate to the
new stable algorithm; the compiler's separate dependency ordering is a graph
operation, not an ordinary list sort.

The numeric kind domains are separate: tokens 50–58 (including comments,
interpolation, Float64 and raw strings), syntax expression/statement
kinds, type kinds (primitive/record/enum/distinct/collection/template/callable/
dynamic), symbol kinds, and checked expression/statement kinds. They are named
record fields, not offsets into a universal arena. `check_expr` translates syntax
to fresh checked records; `emit_expr` reads only `checked_expr` and rejects an
unknown checked kind with internal exit 70. Public enum payload tags are a
different domain, selected by resolved variant symbols. Replacing tags is a
future representation choice, not evidence of a language defect.

Context construction/copy inventory: source graph construction creates the main
arena; per-module parser and interpolation copies detach tokens/control but keep
syntax arenas; interface-bound scratch analysis shares arenas and truncates its
temporary records; formatter creates isolated contexts and compares token text,
not IDs; repairs detaches lexical tokens and uses the original source metadata;
project diagnostics create a source-only context. Query/project formatting
returns text edits to the original graph, not IDs from the formatting arena.

| ID | Kind / impact | Evidence and decision |
|---|---|---|
| A01 | Audited caller invariant: cross-context IDs | Temporary Context sites retain shared arenas or exchange text/spans only. Interface scratch disables query recording, owns instance caches/control and truncates temporary tables. No foreign arena ID transfer found; no runtime owner stamp claimed |
| A02 | Confirmed and fixed in 1.2.8b: import fix for a known type qualifier | Int::answer plus Int.vela incorrectly produced a validated import. Restrict E200 candidates to Unknown type; Unknown enum remains explanation-only. Independent builtin and generic-parameter regressions cover this distinction |
| A03 | Confirmed, fixed in 1.2.8: Windows temporary directory collision | Concurrent LSP staging failure and injected-rival C regression; bounded exclusive retry preserves rival data |
| A04 | Confirmed, fixed in 1.2.8: init --help writes | Native CLI parses help before filesystem work; plain/JSON no-write tests |
| A05 | Maintenance: refactor test targeted historical source names | Replaced with owned two-file project; preview, apply, check and cleanup no longer edit repository sources |
| A06 | Proposal: replace numeric kind tags with enums | Not a correctness defect by itself; keep current bootstrap-compatible representation, audit dispatch completeness in 1.2.8b |
| A07 | Fixed and verified in 1.2.9 | stage-native includes tests/library12 and 1.2 release scripts. Isolated delivered-tree C recovery/full verify passed 1401/1401, including the native C collision fixture; Windows delivery inventories and original application oracles passed |

Independent fixtures assert left-to-right argument effects and skipped RHS,
nominal mismatch, missing effects, Unicode byte/UTF-16 positions and imported
diagnostic ownership. Existing typed-table tests assert 18 invalid reads exit
70 and six mixed-category programs fail E201. Profiles and exact source hashes
are recorded in the stage receipt; cold/warm/edit timings are local microprofiles,
not a claim about large-project incremental compilation. Seed transition uses
the mandatory full native gate, independently for 1.2.8a and 1.2.8b.

## Frontend inspection, 1.2.8b

| Boundary | Inspected invariant | Focused oracle |
|---|---|---|
| source → lexer/parser | UTF-8 validated, BOM/CRLF normalized; each unit has its own EOF; interpolation shares syntax arenas and detaches cursor/tokens | Existing literal/UTF-8/depth corpus plus independent imported unclosed function: E100 at that unit's EOF |
| syntax → module binding | New bound field/variant/parameter lists; canonical names and visibility retain original spans | Opaque constructor/read/write/leak and nominal mismatch reject before C emission |
| types/generics | Canonical instance inserted before field resolution, distinct nominal TypeIds, bounded depth/work queue, per-instance parameters and mapping | Generic arity/depth rejection; positive nested opaque value through generic factory and captured callback |
| interface scratch → concrete analysis | Shared arenas, detached instance cache/control, no query-use recording; temporary types/symbols/HIR/functions truncated before concrete IDs are allocated | Bound/transitive/signature/effect rejection and concrete interface dispatch after scratch |
| callable/suspension checking | Explicit captures, separate result/effect/scope control restored after closure, no implicit async or effect widening | Callback effect, wrong dynamic interface, FFI callable and sync-to-async rejection; forced-GC factory result |
| checked HIR → backend | Resolved TypeId/SymbolId and checked operand lists; no syntax accessor, parser/checker/type-resolution call in emitter/intrinsics | 19 independent literal-code rejection probes produce no C file; existing 25 typed-table checks and evaluation-order fixture |
| native diagnostics → clients | Original code, revision, owner, byte/UTF-16 range and explanation retained | Imported Unicode E201 compared across CLI, framed LSP and real MCP; known-type namespace fix remains explanation-only |

The focused positive program prints `7:checked`; it combines opaque generic
payloads, a returned captured generic closure and interface dispatch across
modules. Forced-GC observes 51 collections, managed peak 650 bytes. This is a
bounded lifetime probe, not forced-GC compilation of the entire compiler.
The only reproduced frontend-adjacent violation in this audit is A02; its two
independent regressions are in the native aggregate suite. A06 remains a
representation proposal. Source inspection and finite fixtures do not establish
formal correctness of every compiler path. The aggregate gate and client parity
results are recorded separately in the 1.2.8b receipt after they finish.
