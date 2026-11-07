# Source debugging and profiling, 0.11.5

The debug C export is explicit: `vela emit-c ROOT --debug -o OUTPUT.c`.
It emits source locations at Vela function and statement entries and
instruments Vela function calls. The host C compiler and debugger own
native debug symbols, optimization and stepping. A C compiler may show
lowered temporaries. The primary Vela runtime error location still points
to the precise failing expression.

In an instrumented program, `VELA_TRACE=1` prints Vela frames with source
locations on a fatal runtime failure. Frames represent functions and
specializations and omit native C frames. Active fibers use independent
frame chains. The host and suspended task chains must never be mixed.
Frame exit follows lexical defers and postconditions on normal return.
Cancellation executes the existing cleanup sequence and pops each frame.

`VELA_PROFILE=1` on an instrumented executable prints structured
per-function call and completion counts and inclusive monotonic time to
standard error at process teardown. Time includes child calls and time
suspended in an async function. Recursive frames contribute separately.
This is instrumentation, so timings include its cost. The regular C export
preserves its existing runtime behavior and does not enter debug frames.

`panic(message)` is a fatal builtin with the `process` effect. A direct
standalone call terminates control flow and satisfies the absence of a
return for any declared result type. Its argument is an ordinary String.
Panic prints the source position and message and exits with 70. It does not
run lexical defers or return across FFI. Runtime process teardown follows
its existing ownership rules. Recoverable failures use typed results.
The builtin has Unit type in an expression and introduces no Never type.
A direct panic statement in a deferred block is rejected. Panic is a
non-waiting terminal operation in a suspending graph and still requires
the declared `process` effect.

Acceptance includes a generic failure helper, unreachable statements,
effect rejection, exact source diagnostics, normal defer and cancellation
behavior, nested trace frames and profile counts. Test source mapping by
building instrumented C with native symbols and inspecting its source names.
