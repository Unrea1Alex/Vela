# Vela: explicit process-region memory model

This decision is made before introducing dynamic storage.

All dynamically allocated strings and collection objects belong to one process
region. They stay valid until process exit; runtime teardown frees the region.
There is no per-object free, garbage collector, borrowing or reference counting.
In 0.5, collection `for` loops allocate a shallow element snapshot in this same
region (O(n) storage per loop entry). Nested handles retain their shared identity.
Range loops do not allocate a snapshot. String interpolation may allocate private
assembly storage and its immutable output in the region. These conveniences do
not add object reclamation; use indexed/range traversal when snapshot cost matters.
Memory use can grow throughout a long-running process. This model is intended for
batch tools including the compiler; it is not yet appropriate for an unbounded
server loop. Roadmap 0.8 plans an explicit migration to a tracing-GC/resource
model; that model is not implemented by the current 0.7.0 runtime.

String is an immutable byte sequence. Literals use UTF-8; byte access and slicing
are explicitly byte-oriented and can produce arbitrary bytes. Slices borrow their
immutable backing storage, whose process lifetime guarantees validity. Concatenation
and integer formatting allocate new storage. String equality compares bytes.

IntList and StringList are reference types with shared identity. Assignment,
parameters and enum fields copy the handle, not the contents. List creation,
reading and mutation require the state effect, so contracts cannot observe mutable
list state. Bounds are checked and negative indices are rejected. List growth uses
geometric capacity; previous backing buffers are also reclaimed at process exit.

Allocator activity is not a user-visible effect for immutable strings, just as
stack allocation was not an effect in 0.1. Allocation failure is a fatal runtime
error (exit 70), not a recoverable application result. Size arithmetic is checked.

File operations use explicit io effects and StringResult/WriteResult values.
Process execution uses process and state effects and an argument list, never a
shell command. Child processes inherit the environment and standard streams.
Runtime facilities implement storage and OS access only; they do not tokenize,
parse, type-check or generate code for Vela.

## 0.3 extension (same region, no implicit ownership change)

Structs and distinct primitive IDs are values: assignment copies their fields.
Float64 is an 8-byte value. The 0.7 Bytes/Text/Path library wrappers copy the
legacy immutable byte-string handle; they do not introduce ownership or borrowing.
Bounded reads use temporary native scratch storage freed before returning a
process-region byte string; the byte limit is checked while reading. Atomic file
updates and process calls close their OS handles before returning. Cleanup errors
are observable, and successful publication is distinct from successful cleanup.

The [FFI/GC transition contract](contracts/FFI.md), accepted in 0.7.4 and implemented
in 0.7.5, specifies synchronous
borrowed arguments, shared invalidation of opaque handle aliases, explicit native
destructors, process-lifetime library loading and future GC roots/resource scopes.
It does not enable GC or retained callbacks in the current runtime.
ForeignHandle copies share region-owned metadata, owner-library identity and a
closed flag. ffi_close invokes a declared native destructor once; libraries remain
loaded through process exit. The foreign code must not retain or modify borrowed
String storage. Int32 is an independent 4-byte value, widened before arithmetic.
Nested collection fields copy a shared handle. `List<T>` and `Dict<K,V>` are
shared mutable handles; all operations, including reads, require `state`.
Values are copied into/out of collections; pointers into their backing storage
are never exposed to Vela. This permits recursive types through collections,
while direct by-value cycles remain illegal. Dictionary keys are immutable
primitive values (Int, Bool, String) or distinct wrappers of those values.

Generic list storage grows geometrically. Dictionaries use open addressing with
tombstones and a maximum 70 percent occupied load; rehash preserves key/value
copies. Removed entries and old buffers stay in the process region until exit.
Thus removal is a logical operation, not immediate memory reclamation.
Missing dictionary lookup and invalid list bounds are runtime errors (70);
`dict_has` and `dict_get_or` support explicit fallback. The fallback expression
is evaluated eagerly, in normal left-to-right call order.

## 0.4 compiler/tooling migration

The compiler now stores typed AST/HIR/symbol/type records in separate List<T>
tables. These still use the same process region. Numeric IDs are indexes within
one compilation, not owning references or cross-context identities. The formatter's
second parsing context also lives until process exit. No garbage collector, new
lifetime rule or per-object reclamation was introduced. OS file-identity queries
close handles before returning; exact stdout writes restore the Windows CRT mode.
