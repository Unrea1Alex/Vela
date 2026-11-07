# Generics, callable types and effect parameters

Historical design note from the 0.5–0.10.1 planning stages. Statements about planned
syntax below describe that period. The implemented 1.0 behavior is specified by
[generics](../contracts/GENERICS.md), [callables/effects](../contracts/CALLABLES-EFFECTS.md)
and the [stable API index](../contracts/STABLE-1.0.md).

Status: accepted for the implemented 0.5 generic subset; callable design is
specified by the 0.10.1 contract, implementation remains planned for 0.10.5.
The callable implementation is now roadmap 0.10.5 (formerly 0.10.1).
[RFC 0004](0004-abstractions-effects.md) links the encapsulation, methods and
interface contracts before dependent libraries/GUI; none are enabled by this update.

Use nominal monomorphization to keep checked HIR concrete and reuse the C backend.
Argument-local inference keeps failures local and deterministic. Initial bounds
are a small closed vocabulary, without traits, specialization or implicit calls.
See the [generic contract](../contracts/GENERICS.md) for the implementable subset.

The [CALLABLES-EFFECTS contract](../contracts/CALLABLES-EFFECTS.md) fixes ordered
parameter/result types, effect-set widening, explicit capture lists and finite
effect parameters. Its `fn(Int) -> Int effects E` is future grammar, not syntax
accepted by 0.9. Inference uses callable arguments, never ambient effects or the
return context. Implementations may not silently widen public signatures.

The contract defines shallow capture copies, immutable shared environments,
precise roots, escaping/reentrant calls and resource invalidation. No stack
borrowing or implicit close is added. Retained C callback registration remains
0.10.9 and needs its own contract before implementation. Generic parameters in
the current compiler still cannot be invoked as functions; no callable/dynamic
dispatch support is claimed by this design. Existing effect names/masks stay stable.

Migration uses a compiler bridge: implement generic support in the old source
subset, verify it, then use generics in authored compiler/tools and verify again.
During that migration, the historical Python compiler read the same catalog for
its 0.2 subset. That frontend has since been removed from the current tree;
the native catalog reader and bundler retain the shared format. Runtime remains storage/OS only.
