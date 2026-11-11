# Reachability in C emission

The input is the fully checked and lowered program. Every concrete body is
checked, including bodies with no path from the executable entry. Vela
diagnostics, symbol indexes and checked type order are independent of the
backend's selection.

Each executable has one root, `main` or the selected test. The backend follows
resolved calls, instantiated generic functions, named function addresses,
closure constructors and every operation of a dynamic box. It examines
contracts, matches and cleanup blocks along with ordinary statements. Every
possible constructor in the remaining checked code contributes an edge even
when the eventual indirect call or dynamic operation cannot be identified.
Callable values are created only by Vela's checked named-function and closure
constructors. Dynamic values come from checked boxes. FFI and fiber primitives
can retain or invoke those values, but cannot introduce a Vela code pointer
from outside this graph.

Checked return, parameter, capture, binding and expression types contribute
layout dependencies. The graph closes over record and enum payload fields,
distinct bases, and callable and collection type arguments. A retained managed
layout keeps its trace visitor. A retained closure keeps its environment and
visitor if needed. Layouts and function definitions retain their checked order.

The C entry, embedded runtime and fixed prelude conversion helpers with their
result layouts remain present. Vela program functions have static linkage in
generated C. Public Vela module declarations and imported C symbols do not
constitute additional C entry points. There is no new command or flag.
`--no-ir-simplify` still controls checked scalar simplification. Reachability
follows the checked code available in either mode.

BuildLens must emit at most 426 function definitions from the 502 recorded in
[1.3.4i](../acceptance/1.3.4i-msvc.json), measured with the frozen counter on
each toolchain. Track type and trace counts, emitted C, native compile/link
wall, executable and package bytes independently. Keep the runtime and build
budgets in the [optimization contract](C-OPTIMIZATION-1.3.md). Exercise
unreachable diagnostics, test-specific roots, recursion, generic and indirect
calls, closure captures, dynamic tables and FFI callbacks. Verify source
locations, Windows and Linux autonomous C recovery and this stage's own native
suite and fixed points.
