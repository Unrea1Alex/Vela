# Option, Result and expression matching (0.5.3)

Memory descriptions of the original version are historical. In 0.8,
[the tracing heap](../MEMORY.md) governs managed values.

Status: verified in 0.5.3: 539 native checks and both fixed points.

The catalog declares nominal prelude enums `Option<T> { Some(T), None }` and
`Result<T,E> { Ok(T), Err(E) }`. Constructors use explicit generic arguments.
Legacy IntResult, StringResult and WriteResult builtin signatures remain unchanged.
Adapters explicitly match legacy values into the new enums; no implicit conversion.
Values retain process-region semantics; no exception machinery or hidden ownership.

`match value { Enum::Variant(binding) => expression, ... }` is an expression.
The existing statement form with block arms remains supported. The scrutinee is
evaluated once; exactly the selected expression runs. Every arm is checked and all
results have exactly the same type. Patterns are exhaustive, nonduplicated and
introduce immutable bindings scoped to that arm. No wildcard arm or implicit Unit.
Parentheses permit expression matching in statement position if its result is Unit.

Postfix `value?` evaluates value once and extracts Some/Ok. None returns None from
an enclosing Option function; Err returns Err from an enclosing Result function.
Success payload types may differ between operand and enclosing return type; Result
error types must be identical. Only these two prelude enums implement propagation,
not same-shaped user or legacy enums. `?` is forbidden in requires/ensures and in
functions returning a different family (E218/E201). It adds no effect of its own.

Propagation exits the whole function, including nested loops/match expressions.
The enclosing function's runtime postconditions run on the propagated return value,
exactly as for an explicit return. Skipped operands and later side effects do not
run. It is not an exception, panic catcher or implicit cleanup mechanism. Resource
cleanup remains explicit; defer belongs to 0.8.

Acceptance: every success/failure branch, nested matching/propagation, distinct
error mismatch, wrong target family, legacy rejection, contract prohibition,
exhaustiveness/types/scopes, argument and short-circuit order, postcondition success
and failure on early return. Migrate compiler and native tools after a bootstrap
bridge, then verify both compiler generations and aggregate fixed points.
