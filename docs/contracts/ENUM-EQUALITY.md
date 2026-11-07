# Payloadless enum equality — 1.0.1e

Contract accepted before implementation. `==` and `!=` accept values of the same
nominal enum type only when every variant of that enum has zero fields. The
result is Bool: equal precisely when the declared variants are the same. Both
operands evaluate exactly once, left to right, using the existing binary-expression
evaluation and source-location rules. Short-circuit boolean contexts keep their
existing evaluation behavior.

Type identity includes the declaring module and all generic arguments. A generic
enum with no variant fields is eligible, including inside a function that takes
that known enum type. Different enum types/instantiations reject with E201.
An enum with any payload rejects, even when the two values use empty variants.
Lists, dictionaries, structs, callable/dynamic values and cyclic graphs receive
no equality operation. There is no ordering, implicit integer conversion, new
constraint or deep comparison. Scalar and dictionary-key constraints are unchanged;
ordinary unconstrained generic bodies retain their existing per-instantiation
checking: an eligible concrete enum may be compared, but an ineligible type still
rejects. This is not a promise that every Any type supports equality. Symbolic
interface-bound checks still require an operation permitted by the bound.

Semantic analysis establishes eligibility and records the existing checked binary
operation with Bool result. The C backend receives checked operands, evaluates
them into temporaries, then compares only their `.tag` values. No syntax inspection,
memcmp, payload read, new allocation, lifetime rule or runtime ABI is introduced.
Bootstrap builds the new compiler with the previous compiler before dependent
application code uses the operation.

Migration: `match` remains available for exhaustive branching and payload enums.
Use direct enum equality for simple predicates; keep string labels for presentation
and serialization. PulseDeck's counters and exit-status predicates use State
values rather than presentation strings; its terminal-state match stays exhaustive.

Acceptance: equal/unequal variants, single variant, concrete generic enums and module
identity; incompatible enums/generic instances, payload enum, collections, records,
ordering, Scalar-bound and ineligible generic-instance rejection; exact-once ordered
effects and short circuit; PulseDeck model and real network/cancellation regressions;
three compiler generations, fixed points and complete native verify.
