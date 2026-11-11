# Checked Int range proofs

Stage 1.3.4i derives closed Int intervals after checking and scalar
simplification. Literal values and dominating immutable scalar bindings can
carry intervals. A match value joins all arm intervals by taking the lowest
lower bound and the highest upper bound. An unknown arm makes the joined
result unknown. Branch-local facts use distinct checked binding IDs and never
become facts about mutable storage at a join.

An Int range loop with known endpoints binds its immutable index between the
start's lower bound and the end's upper bound. An exclusive end subtracts one
only when that subtraction is representable. Unknown endpoints and list
element values stay unknown. The backend can increment its private induction
counter directly on a taken back edge. The loop condition and the inclusive
end equality guard establish that the current counter is below `Int.MAX`.
The user's loop binding is a separate value.

For an expression, endpoint addition and subtraction must both be representable.
Multiplication checks all four endpoint products. Negation checks the input's
lower bound against `Int.MIN`. A proof flag applies to that exact checked
operation. Only those operations lower to direct signed C. Division, remainder,
conversions, shifts in native runtime helpers, contracts and unknown arithmetic
keep their established checks. The analysis takes no facts from requires or
ensures. GC, source positions, evaluation order and errors keep their contract.

The [accepted numeric fixture](../acceptance/1.3.4h-msvc.json) emits 13 arithmetic
helper calls. The [fixed target](C-OPTIMIZATION-1.3.md) requires at most 10 on
both toolchains. Compare the known and unknown range functions separately.
Verify `Int.MIN`/`Int.MAX`, exact trap diagnostics, matched bounds, range joins,
mutable and unknown cases, contracts, C undefined-behavior checks and C recovery.
Measure the cost of the proof pass separately before the native gate.
