# Compiler audit 1.2: baseline and frontend

## Contract fixed before the audit

1.2.8a inventories authored sources, table ownership, phase boundaries and build
dependencies. It does not change language semantics. 1.2.8b investigates the
registered questions and fixes only reproduced violations with independent
regressions. No blanket tag conversion or new memory model is authorized.

AST/HIR/Type/Symbol IDs are distinct, positive, context-local table indices;
zero is absent. Bounds failures exit 70. Category separation is statically
checked; context ownership is a caller invariant, not a runtime owner stamp.
Context copies share collection arenas. Temporary token/control copies must
retain the owning arenas or avoid transferring IDs. Source spans refer to
normalized UTF-8 source units; public positions additionally use UTF-16.

The backend accepts ExprId/StmtId and resolved definitions after analyze_mode
and the instance queue finish. Rejected sources must fail before C emission,
even with an unavailable C compiler. Contract assertions are runtime checks.

## Fixed validation profiles

`node tests/library12/compiler-audit.mjs .` records authored source hashes,
independent positive/rejection/Unicode/multifile oracles, and three timed samples
per profile. Cold uses a new empty cache; warm checks the identical source with
that cache; edit changes one imported function body in an owned fixture and
checks again. Cache reports and source/compiler hashes accompany timings.
These are local wall times, not a broad performance claim or an incremental
analysis claim. No source repository file is edited by these profiles.

The seed profile is the mandatory `vela-dev verify`: installed seed builds the
autonomous bundle, transition compiler builds authored stages 1–3, stage 2/3 C
bytes and the rebuilt bundler output must match. Record hashes of seed, stages,
C outputs and bundle after each audit gate. Existing mixed-ID and invalid-ID
tests remain mandatory, with independent exit/code expectations.

Frontend acceptance includes names, generics, nominal/opaque types, interfaces,
callables, checked IR and source locations. For every confirmed violation,
add a regression with a literal expected result. CLI/LSP/MCP diagnostics and
plans must preserve the native error and positions. All blockers must be closed
before 1.2.9. Both audit stages run the full native gate independently.
