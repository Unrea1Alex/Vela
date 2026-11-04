# Generics, callable types and effect parameters

Status: accepted for the 0.5 generic subset; callable extension planned for 0.10.
The callable implementation is now roadmap 0.10.5 (formerly 0.10.1).
[RFC 0004](0004-abstractions-effects.md) adds planned encapsulation, methods and
interfaces before dependent libraries/GUI; none are enabled by this RFC update.

Use nominal monomorphization to keep checked HIR concrete and reuse the C backend.
Argument-local inference keeps failures local and deterministic. Initial bounds
are a small closed vocabulary, without traits, specialization or implicit calls.
See the [generic contract](../contracts/GENERICS.md) for the implementable subset.

The future callable model must carry an ordered parameter list, result type and
explicit effect set. An illustrative type is `fn(Int) -> Int effects E`; this is
design notation, not implemented grammar. An effect parameter represents a finite
set, inferred from a callable argument or supplied explicitly. Calling it requires
that set to be contained in the caller's allowed effects. Pure callables may be
used where additional effects are allowed, never the reverse. No ambient effect
inference will silently widen a public function's declared contract.

Callable identity, capture layout, ownership and lifetime await the memory and
FFI contracts (0.8 and 0.7 respectively); 0.10 must define copying, mutable captures,
recursive closures and retained foreign callbacks before implementation. Generic
parameters today therefore cannot be called as functions, store closures, or imply
a hidden allocation or dynamic dispatch. Constraints may later admit explicitly
declared callable shapes; today's names and concrete effect masks remain stable.

Migration uses a compiler bridge: implement generic support in the old source
subset, verify it, then use generics in authored compiler/tools and verify again.
The historical Python compiler need not implement 0.5 syntax; catalog readers must
still agree on the shared catalog format. Runtime remains storage/OS only.
