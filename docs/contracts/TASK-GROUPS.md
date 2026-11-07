# Task groups and awaited host operations — 1.0.1a

Implementation contract, accepted before implementation. This adds library
composition without weakening E241 or introducing shared-memory threads.

`task_group` owns one typed-fiber scheduler and a heterogeneous queue of host
operations. `create(now, limit)` accepts 1..128 active operations; at most 256
pending/active operations and 128 live language tasks belong to one group.
Language tasks do not consume operation slots, so awaiting a queued child cannot
deadlock a saturated group. The host calls `tick` with nondecreasing monotonic
milliseconds. One tick advances at most one fiber and each admitted operation once.

`spawn` accepts an async callable with its own `Scope`. Operations posted through
that scope belong to that task. Posting only captures values and queues callbacks;
the host invokes OS/dynamic callbacks later. This is allowed by the existing
async graph checker. `async_io.fetch` and `async_io.run_process` use this bridge and
can be awaited; arbitrary blocking I/O remains rejected inside async bodies.

An operation has an absolute deadline measured from posting, including queue time.
Cancellation wins over an unobserved deadline, matching the existing loop. A
queued cancellation/deadline does not start the adapter. Once started, stop is
polled until acknowledgement. Cleanup executes once; a typed completion retains
both its primary outcome and a separate `Result<Bool,String>` cleanup result.
No terminal completion is published before cleanup. Failed cleanup is observable
through the operation and the group's retained cleanup-error list.

When a language task returns, fails, times out or is cancelled, its scope closes
and all outstanding child operations are cancelled. Its public outcome remains
pending until its child count reaches zero. Its lexical defers retain existing
LIFO semantics. Terminal task results and completed children are not overwritten
by later group cancellation. Group shutdown closes root and task scopes, requests
cancellation and must be ticked until `idle`; GUI destruction follows drain.
Reentrant tick/shutdown/spawn is rejected. Posting from an executing fiber is
allowed; new operations may be admitted after that fiber yields. Counters and
captures remain on the single loop thread under precise GC.

The HTTP adapter owns a private process loop and exchange. It releases staging
after worker acknowledgement, preserving HTTP errors separately from queue,
cancellation, deadline and cleanup errors. The process adapter preserves argv,
output alias and Job supervision rules. Output files requested by callers remain
caller-owned; HTTP staging is adapter-owned. These operations remain Windows-only.

Acceptance: heterogeneous async results, bounded actual requests, delayed/queued
cancellation, task-scope cancellation, deadlines including queue time, cleanup
failure visibility and exactly-once cleanup, GC retention, forbidden blocking
calls, and PulseDeck with one group plus GUI/server pumping. Build/verify the
compiler and run real HTTP/TLS and GUI regressions before closing the stage.
