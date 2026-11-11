# Simplification of checked scalar expressions

Stage 1.3.4h runs one pass after the frontend checks every source body. The
pass reads and updates checked expression and statement records. It handles
concrete Int and Bool literals, immutable scalar bindings with a known value,
safe integer arithmetic, scalar comparisons and logical short circuit. A
known `if` or a false `while` retains the original statement span and uses a
lexical block for the selected body. The frontend checks the condition and all
branches before emission can omit an unreachable branch.

Fold only representable integer arithmetic. Overflow, division and remainder
by zero and other traps remain runtime operations at their original span.
The special `Int.MIN % -1` result is zero. Unselected constant conditions
skip their unreachable expressions during simplification. The pass keeps
unknown branches, calls, Float64 operations, reference copies, allocation and
scope cleanup. Assignment targets and runtime requires/ensures are unchanged.

`vela emit-c ROOT --no-ir-simplify` and
`vela build ROOT -o OUTPUT --no-ir-simplify` use the accepted lowering path with
this pass bypassed. The same frontend, C options, range proofs, root elision
and GC checkpoints apply. The C cache
separates the two modes. Ordinary build, run, test and MCP use the checked pass
by default. Debug C keeps the checked source spans of emitted operations and
the original lexical block position.

The [accepted previous generator](../acceptance/1.3.4g-msvc.json) emits 130
temporary declarations for the frozen constant-heavy fixture. The goal is at
most 104 on both hosts, with the candidate's bypass mode as an independent
comparison. Record effective checked changes, C branches and temporaries,
wall/CPU, memory and sizes against both 1.3.4g and 1.3.4d. Test known and
unknown conditions, short circuit, match, argument order, runtime contracts,
Float64 and exact trap locations before the full native gate and C recovery.
