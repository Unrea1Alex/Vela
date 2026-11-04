# For loops, ranges and loop exits (0.5.4)

Status: verified in 0.5.4: 582 native checks and both fixed points.

`for value in items { ... }` accepts List<T>, IntList and StringList and requires
state. The collection expression evaluates once. At entry, a shallow value copy
of its elements is captured in order; the body iterates that snapshot. Mutating,
clearing, appending to or reassigning the original collection does not alter the
iteration. Nested reference fields still share their original objects. Snapshot
storage uses the existing process region and remains allocated until process exit;
cost is O(n) space/time per loop entry. No implicit ownership or GC is introduced.

`for i in start..end` visits Int values in a half-open increasing interval;
`start..=end` includes the endpoint. Bounds evaluate once, left to right. Reversed
ranges are empty. Ranges are loop syntax in 0.5, not first-class values. Increment
never performs unchecked signed overflow, including an inclusive INT64_MAX end.
Range iteration itself requires no state effect.

The binding is immutable and local to the body. Nested loops may shadow it.
`break;` exits the nearest loop; `continue;` advances that loop, including ranges.
They work inside match arms and conditionals. Outside a loop they are E219.
Statements after an unconditional return/break/continue are unreachable (E212).
Loop completion is conservatively possible; infinite loops do not prove a return.
`?` and return leave the entire function and execute runtime postconditions.

Acceptance: empty/reversed/inclusive ranges and Int extrema; one-time ordered bound
evaluation; nested loops, match-arm break/continue, scopes and illegal exits;
mutation through aliases, shallow snapshot semantics and missing state; propagation
and return from the body. Migrate compiler/tool traversals, then verify both stages.
