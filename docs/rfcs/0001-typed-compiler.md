# 0001: typed compiler tables

Status: accepted, 2026-11-04. Roadmap 0.4.1; implementation follows in 0.4.2.

Replace the 16-Int tagged arena with ordinary Vela records and List<T> tables.
The language already supports these facilities, so bootstrap needs no new syntax
or memory model. Keep syntax, checked expressions/statements, semantic symbols
and types in separate tables. Use nominal AstExprId/AstStmtId, ExprId/StmtId,
TypeId/SymbolId at every phase boundary. Do not retain numeric slot access in
parser, checker or backend. Readable record fields are preferable to hundreds
of wrappers whose only purpose is renaming numeric slots.

Alternative: keep the old arena behind accessors. This minimizes immediate code
changes but retains overloaded slots and makes future GC descriptors less clear.
The selected migration rewrites storage and traversal while retaining language
semantics, diagnostic codes, source spans, left-to-right evaluation and the C ABI.

Lists grow in the existing process region. A returned record is a value copy;
updating a table requires explicit list_set. Shared child lists are compiler-owned.
IDs identify one table entry in one compilation only, never a source revision.

Sequence: contracts/baseline; syntax tables and parser with a parsing harness;
semantic tables and checked HIR; backend and driver; behavior corpus, rejection
tests, ID invariant tests, bootstrap fixed points; then diagnostics and formatter.
Future GC must trace Context's tables and all nested collection handles. IDs are
integers, not raw pointers and not roots. Keep descriptor/root requirements visible
but do not implement GC in this migration.
