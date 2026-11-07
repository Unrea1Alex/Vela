# Lexical resource cleanup

Contract for 0.8.4. The roadmap records implementation and verification.

`scope { ... }` introduces a lexical block. Existing function bodies, branches,
match arms and each loop iteration also have lexical blocks. `defer { ... }`
registers a block in its enclosing lexical block when execution reaches it.
The body uses the bindings visible at the declaration. It reads their values
when it runs, so a captured `var` can have changed since registration. The
deferred body has its own local scope and uses the enclosing effect set.

Deferred blocks run once in reverse registration order on fallthrough, return,
early propagation with `?`, break and continue. The last two run only the
cleanups of the scopes exited by the loop transfer. Evaluate the return value
first, then clean up, then check the postconditions. The saved return value
remains rooted across cleanup and postconditions. Direct return, break,
continue, `?`, a direct panic statement and nested defer are rejected inside
a deferred block with E229.
An ordinary function called from cleanup can use its own control flow.

Runtime panic, failed contracts, explicit `exit` and OS termination do not
unwind Vela blocks. A panic during cleanup stops subsequent cleanup. Cleanup
does not infer a destructor or ignore a returned error. Use `match` on the
explicit close result when cleanup can fail. Native resources are not finalized
by GC, and the process teardown path does not synthesize calls to `ffi_close`.

The checker resolves cleanup bodies before lowering. The backend emits them
at each structured exit while their local roots are still valid. The first
implementation does not allocate closures or retain a deferred body in C.
