# Vela memory model

## Cooperative work in 0.11

Explicit loop continuations are ordinary typed callables held in managed task
records. The loop retains pending tasks and their captures across ticks.
On termination it replaces the pending record with the typed outcome and
removes its queue entry. A separately retained task still owns its outcome.

Windows process jobs use owner-tagged ForeignHandle metadata with explicit
close. The runtime roots a live handle until it closes. Cancellation waits
for the Job to become empty before closing it. The native Job and process
handles are also released at runtime teardown. A child uses its own address
space and inherits only the explicit standard handles. See
[the operation contract](contracts/ASYNC-CANCELLATION.md).

Typed tasks in dev.2 use a Windows stack per suspended task on the same
Vela thread. The collector walks saved precise roots on inactive stacks
and the suspended host stack. A native launch worker holds its own UTF-16
buffers. It cannot access the managed heap. Cancellation and Job drain
complete before the corresponding owner releases its resources.

## Tracing heap in 0.8

Programs generated with the ABI 2 root protocol use a single-threaded,
nonmoving, precise mark/sweep collector. Value copies, shared identity of
collections, immutable strings and `state` effects for collection reads and
writes keep their existing semantics. Removed entries and obsolete storage
become eligible for reclamation once unreachable. Cycles do not keep themselves
alive. A slice keeps its backing allocation alive.

Generated C registers typed roots for parameters, lexical variables, operands,
and snapshots. A collection can run before evaluation of a checked temporary.
The runtime does not collect inside a native operation. Visitor functions read
only active enum payloads and live collection entries. Allocation pressure starts
collection at one MiB of managed storage and then at twice the last retained
size, with a one MiB minimum. This threshold is a trigger rather than a cap.
`VELA_GC_STRESS=1` collects at every generated safepoint. `VELA_GC_REPORT=1`
prints collection count, peak managed bytes and bytes before teardown to stderr.
These counts include heap headers and exclude native stack and OS allocations.

The [internal ABI](contracts/GC-RUNTIME-ABI.md) keeps uninstrumented bootstrap
output on region semantics. Collection does not close native handles. Synchronous
FFI arguments are valid through the call, with DLL ABI 1 and process-lifetime
library loading. Native code cannot retain borrowed byte pointers.
Use [lexical cleanup](contracts/RESOURCES.md) for explicit close on structured
exits. Destructors are never called by the collector.

## Closure environments in 0.10.5

A nonempty capture list allocates one immutable traced environment. Capture
slots contain shallow copies of the source values. Each invocation roots its
own parameters and local values. Copies of a callable share its environment.
Function names and empty capture lists use a null environment. The descriptor
marks captured collections and nested environments, including cycles. Captured
handle metadata can outlive an explicit close through any alias.
See [the callable contract](contracts/CALLABLES-EFFECTS.md).

## Dynamic interfaces in 0.10.6

Explicit packing allocates one traced box holding a shallow copy of the
concrete value. The wrapper keeps the box reachable. Copying a wrapper shares
the box and invoking an operation copies the receiver out of the box. The box
descriptor traces private fields through the same visitors used for concrete
values. The operation table is immutable and lives for the process.
See [the interface contract](contracts/INTERFACES.md).

## File streams in 0.10.7

An open stream retains its handle metadata. The owner tag keeps it separate
from foreign DLL resources. Aliases share position and close state. Explicit
close removes the native root and invalidates all aliases. The collector
does not close a stream. See [the stream contract](contracts/SERVICES.md).

## Callback registrations in 0.10.9

An active registration is a native root for the owner metadata and callable
environment. Canceling it drops both roots and keeps the descriptor token
closed. Registry descriptors have stable addresses until process exit.
See [the callback contract](contracts/CALLBACKS.md).

## Historical process region through 0.7

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

Task-group ownership (1.0.0-dev.1): typed tickets retain results without retaining
host work callbacks after completion. Captured scopes/queue entries can form
managed cycles and remain under the existing precise collector. Native resources
remain explicitly owned by operation adapters; cancellation acknowledgement and
cleanup precede result publication. No GC finalizer or shared-memory threading
is added. See [task-group contract](contracts/TASK-GROUPS.md).

GUI ownership (1.0.0-dev.3): opaque Window copies share a ForeignHandle,
callback, bounded event list and closed flag. Explicit close cancels the callback
before native release; native storage owns controls/font/snapshot, managed storage
owns queued Int events. Dropping a Window is not an automatic resource close.
Applications drain their tasks first. [GUI lifetime](contracts/GUI-LIBRARY.md).

Directory ownership (1.1): each open directory has a distinct runtime owner and an explicit root until directory_close. Maximum 128 handles. Native storage contains only OS metadata, no Vela pointers; Windows reserves 64 KiB per handle (under 8.1 MiB total), Linux owns a DIR buffer. Close frees storage and drops the root even when OS close reports failure. FFI retain/release/close and callbacks cannot take ownership. Scan aliases share close state; GC does not close resources. Collectors close on success, read failure and entry limits. See [library contract](contracts/LIBRARY-1.1.md).

JSON pull reader (1.1.4): Reader copies share cursor, frame stack, node counter and sticky error through existing managed collections. Frames keep individual path segments and duplicate-key dictionaries; skipped values do not allocate complete token paths. No input-dependent native recursion, OS handles, borrowed references or finalizers are introduced. Number spelling is an immutable slice retaining its backing input even after Reader becomes unreachable; ordinary precise visitors trace all fields. Limits bound input bytes, depth and values. Tested maximum depth 4096 with normal GC; bounded depth-64 stress collects before every operation and retains a dynamically allocated Number after Reader lifetime.
