# AST, HIR and ID contract

Memory descriptions of the original version are historical. In 0.8,
[the tracing heap](../MEMORY.md) governs managed values.

Status: implemented and verified in 0.4.2, 2026-11-04. Native verify: 231/231.

## Identity and storage

- AstExprId and AstStmtId address syntax-expression and syntax-statement tables.
- ExprId and StmtId address checked-expression and checked-statement tables.
- TypeId addresses canonical types; SymbolId addresses definitions/bindings.
- All are distinct Int wrappers. Cross-category passing is a compile-time error.
- Zero means absent, is tested explicitly, and is never a valid table read.
- Positive IDs are table index + 1. Only the table API unwraps/constructs them.
- Table reads reject zero, negative and out-of-range IDs as an internal error,
  with exit 70; they must not silently read another table or the context header.
- IDs cannot be persisted or compared between compiler invocations/contexts.
  This is an internal API, not stable IDs for future semantic queries.

## Phase boundaries

Parser builds syntax records, retaining normalized UTF-8 byte spans and written
argument order. Type spelling is canonicalized as before. Source text remains
available independently of the AST, including comments for a future formatter.
Checker resolves names/types/fields/effects and creates new HIR records. Syntax
records remain unmodified. Each checked expression has a TypeId; calls and field
access have resolved SymbolId. No backend type inference or syntax traversal.
Backend takes checked records and semantic definitions only, emits temporaries
in source order, retains short-circuit branches and checked Int arithmetic.

## Migration map from 0.3

| Old slots/tags | New representation |
|---|---|
| Header slots 0/1, 14, 23 | Token cursor, analysis depth and previous span in Control |
| Header 2/3 | Lists of syntax type/function declarations |
| Header 4/5/7 | Type/symbol tables and scope stack |
| Header 6/12, 8/9 | Checked functions, current function, return type/effects |
| Header 10/13 | Symbol identities and emitter temporary counter |
| Header 22/32 | Definition order and canonical collection types |
| Slots 1/2/3 | Span(start,end), text/name |
| Tags 1–8 | SyntaxExpr with named operands/arguments/type arguments |
| Tags 30–38 | SyntaxStmt with expression/target/blocks/match arms |
| Tags 20–26 | Named syntax declarations, fields, parameters, variants |
| Tags 50–54 | Token(kind, text, span) |
| Tags 60/61/71–73 | Scope lists and Symbol records |
| Tags 70/75–77 | TypeInfo records and canonical TypeId |
| Tags 80/101–112/130–138 | CheckedFunction, CheckedExpr and CheckedStmt |
| Slot 8 / tag 90 links | Typed List<T> in written order |
| Slot 9 / slot 10 | TypeId / SymbolId |
| Slot 11 / slot 15 | Named flags, effects, tag / returns |
| Slots 4–7,12–14 | Named fields of the corresponding record, no numeric access |

## Validation and resource constraints

Baseline: explicit fixture corpus plus native driver suite, hashed before migration;
three local check measurements on compiler source, recording elapsed time and peak
working set. See [baseline](../stage04-baseline.json) and [comparison](../stage04-migration-measurements.json). Measurements describe this machine,
not a cross-platform performance guarantee. Investigate a >3x time or memory
regression on this corpus before accepting the migration.

Acceptance: all baseline outputs/exit codes/rejection codes unchanged, source spans
including Unicode preserved, compile-time mixed-ID rejection, runtime invalid-ID
checks, syntax/HIR separation, full native verify and C/bundler fixed points.
Generated C bytes may change after replacing compiler internals; byte identity is
required between new bootstrap generations, not between different versions.

Context owns tables for one process-region compilation. Future tracing GC needs
roots for Context, active records/temporaries and nested Lists/Dicts; descriptors
must distinguish string/handle fields from numeric IDs, trace active enum arms,
and preserve cycles through collections. No free/borrowing/GC is introduced here.
