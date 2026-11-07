# RFC 0005 — precise collection and the bootstrap transition

Accepted for the implementation plan of 0.8.1. The shipped 0.7 toolchain
continues to use the process region. Implementation status is tracked in
[the roadmap](../ROADMAP.md).

Use a single-threaded, nonmoving mark/sweep heap. Keep existing value copies,
collection aliasing, immutable byte strings and the `state` effect for collection
reads and writes. Allocation remains invisible to the effect system. Resource
destruction is deterministic and separate from reclamation of managed storage.

Generated C provides typed stack roots for parameters, live lexical locals,
temporaries and iteration snapshots. Root scopes end before the underlying C
slots die, including on early return, propagation and loop transfers. The
collector traces the active variant of an enum, the fields of a value, and only
the occupied elements or entries of a collection. Removed elements, tombstones
and obsolete backing arrays are not roots. A string view records the allocation
that owns its bytes. Literal and process-provided static strings have no owner.
The collector uses an explicit worklist for cycles through collections.

Collection can run only at generated safepoints. An expression operand must
be registered before any subsequent safepoint that can observe it. Native
runtime operations finish before the next safepoint, so their internal scratch
allocations and borrowed pointers cannot be swept mid-operation. Synchronous
foreign calls finish under the same rule. Unregistered native retention of
managed storage stays forbidden. Library metadata remains live until teardown.

The internal runtime ABI is distinct from the external DLL ABI. New runtime C
keeps compatibility entry points for bootstrap C emitted by the old compiler.
Collection starts disabled and only a generator that supplies the full root
protocol opts in. The build checks the expected internal ABI in generated C.
Build the bridge using the old compiler, then build subsequent generations
using the bridge and compare their emitted C and rebundled source byte for byte.
Regenerate the standalone recovery seed only after the release gates pass.

Acceptance includes active enum payloads, nested generic collections, aliasing,
cycles, slices, overwritten and removed values, live temporaries and snapshots,
repeated loop and early-exit paths, FFI borrowing and explicit close. Exercise
collection at every generated safepoint on a small corpus and repeat a bounded
workload in one process to distinguish reclamation from process teardown.
