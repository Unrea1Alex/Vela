# Compiler audit of effects and ownership

Stage 1.3.4c continues the [compiler inventory](../COMPILER-AUDIT-1.2.md).
The audited paths are callable effects and captures, dynamic receiver roots,
foreign argument and callback metadata, suspended fibers, and cleanup on
normal, early, failed and cancelled exits. Fixes require a reproduction and
an independent expected result. Existing public ownership and ABI 1 remain.

Live native owners retain their tag. Closing a resource retires every alias
before another operation can enter C. A genuine null returned by a foreign
function remains a valid null argument. Generic FFI boundaries check the
closed flag independently of the pointer because some runtime owners clear
the pointer when releasing storage.

Validation uses explicit callback counts, GC stress across captured managed
values and suspended fibers, effect and capture rejections before emission,
closed alias rejection before calling the DLL, and observable defer and
cancel/drain. The supported installed seed, three authored compiler
generations, both fixed points and recovered C are verified separately.
