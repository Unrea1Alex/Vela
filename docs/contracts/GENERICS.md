# Generic types and functions

Memory descriptions of the original version are historical. In 0.8,
[the tracing heap](../MEMORY.md) governs managed values.

Initial acceptance: 0.5.2 (498 native checks); retained by 0.5.3 (539).
Later numeric and equality extensions are described below and in the language spec.

Declarations use `fn identity<T>(value: T) -> T`, `struct Box<T> { value: T }`
and `enum Maybe<T> { Some(T), None }`. Parameters are distinct names, optionally
bounded by `Any` (default), `Scalar` (Int, Float64, Bool, String and their distinct wrappers),
or `Number` (Int, Float64). Unknown bounds and duplicate or reserved parameter names fail.
Payloadless enum equality from 1.0.0-dev.5 does not add enums to Scalar or Dict keys.
Ordinary generic bodies are checked for each concrete instance: an eligible enum
can use equality, an instance with payloads rejects. See [enum equality](ENUM-EQUALITY.md).
Parameters may shadow user type names; primitive/prelude constructor names are
reserved. The prelude's E parameter therefore does not conflict with a user enum E.
Distinct declarations themselves are not generic in this version.

Functions accept a complete explicit argument list (`identity<Int>(1)`) or infer
all parameters by unifying positional argument types. Inference is local to the
call: no return-context inference, implicit conversion, overload or partial list.
Constructors require explicit arguments: `Box<Int>(value: 1)`,
`Maybe<Int>::Some(1)`, `Maybe<Int>::None`. Match patterns use the template name
(`Maybe::Some(value)`); their concrete payload types come from the scrutinee.

Identity is nominal declaration plus ordered concrete type arguments. Equal
instances share one TypeId/signature in a compilation. Nested instances and
collections compose; different arguments do not coerce. Arguments evaluate once,
left to right. Records retain source field evaluation order.

The compiler monomorphizes before C emission. Every non-generic function and every
reachable generic instance is fully checked, including all branches, contracts,
effects and fields. An unused template is parsed and its parameter declarations
validated, but its body is not semantically checked until instantiated. This is a
deliberate initial limitation, not a claim of universal template-body proof.
Constraints are checked for both explicit and inferred arguments; they do not
provide methods or change the existing operators. Effects remain concrete sets.

Instances are cached before checking their dependencies. Recursion with unchanged
arguments is permitted; direct value-layout cycles remain E204. Collection edges
break layout cycles; their managed values follow the current tracing heap. Expansion
is bounded by 32 active generic type instantiations, 512 concrete generic types,
and 512 generic function instances per compilation. A chain of newly instantiated
function dependencies is limited to 32 (cached recursion does not extend it).
Excess is E217, before C. The chain limit prevents deeply nested collection
arguments from exhausting the general syntax/type traversal guard first.
Malformed/undeducible type arguments or violated bounds are E210.

Validation: identity, explicit/inferred and nested calls, mutual recursion,
generic records/enums and collection recursion; conflicting inference, bounds,
arity, missing arguments, nominal mismatch, body type/effect errors, direct layout
cycles and growing recursion. Run original and formatted fixtures with the first
and final compiler generations, plus the compiler/bundler fixed points.

Callable/effect parameters were proposed in [RFC 0002](../rfcs/0002-generics-callables.md)
and are implemented from 0.10.5; current rules are in [CALLABLES-EFFECTS](CALLABLES-EFFECTS.md).
