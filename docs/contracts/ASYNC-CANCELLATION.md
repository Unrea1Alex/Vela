# Cooperative loop implementation contract, 0.11.1

This is the first implementation block of [EVENT-LOOP](EVENT-LOOP.md).
It defines the continuation protocol before adding the surface language and
OS adapters. All callbacks and changes to managed state run on the loop thread.

- A loop owns up to 128 live tasks of one result type. A task handle may outlive
  the loop after shutdown; its terminal result remains readable. The loop
  rejects new tasks after shutdown, requests cancellation of all live tasks
  and must be driven until idle. The caller supplies nonnegative monotonic
  milliseconds. Each task gets one positive timeout from the loop's current
  time, with the allowed delay and timeout bounded by 2,147,483,647 ms.
- A continuation returns success, failure or a nonnegative delay before it
  can run again. On each turn the loop dispatches at most one task. The earliest
  scheduled event wins; events with the same time are visited in queue order.
  A due deadline supersedes an unprocessed resume of the same task, including
  a first callback that missed its start time. An already executing callback
  is atomic with respect to the loop. Failure and invalid delay follow the
  stop protocol before publishing the error.
- A cancellation request supersedes an unprocessed resume. Cancellation before
  the first callback skips both continuation and stop callback. Once started,
  the stop callback is polled until it acknowledges that the operation has
  stopped. A negative acknowledgment requeues it after one millisecond and
  permits dispatch of unrelated tasks. Cancellation is idempotent and cannot
  replace a terminal result or a deadline already being acknowledged.
- A terminal outcome is installed after cleanup. The cleanup callable runs
  once for every accepted task, including cancellation before launch. It is
  synchronous. It may use ordinary lexical defer internally. Once the outcome
  is installed, the task releases its resume, stop and cleanup captures.
  The loop keeps live callbacks and their captured values reachable by GC.
- Callbacks may observe outcomes and request cancellation through task
  handles. Reentrant tick, submission and shutdown on the same loop are
  rejected. A callback may not throw a runtime panic expecting loop cleanup;
  normal language panic/exit semantics apply. This block uses explicit
  continuation callables. The compiler enforcement of blocking and
  suspension restrictions is a separate 0.11.1 implementation block.

Focused acceptance: FIFO at equal readiness, clock rollback and input bounds,
cancel before launch and after terminal, one cleanup per task, deadline at a
tie, delayed stop acknowledgment with independent progress, reentrancy,
shutdown and GC retention/release.

## Process adapter

The Windows process adapter starts an absolute executable with an argv list,
an explicit working directory, NUL stdin and two distinct output files.
Only the three standard handles are inherited. Before resuming the initial
thread, the adapter assigns it to a private kill-on-close Job. Output files
are for the process, separate from the application's publication target.
Output may be created even if the launch fails.
The runtime bounds the process table at 128 live Jobs. A launch accepts at
most 1024 argv entries and 32767 total UTF-8 argument bytes. Windows also
applies its native limit to the quoted command line.

### Launch worker

Submission validates bounded UTF-8 and copies a UTF-16 command and paths to
native storage. Opening the executable and output files and creating the
process run on a Windows launch worker. A successful submission returns an
operation handle immediately. Validation and thread-creation failures are
reported by spawn. OS launch failures are reported by poll. The worker never
accesses managed memory. The loop reads the worker's result after its thread
has signalled completion.

Cancellation during launch sets an interlocked request and asks Windows to
cancel pending synchronous I/O on the worker. Close reports that launch is
still in progress until the worker exits. If a child was created, the
private Job owns it from creation, including while the initial thread is
suspended. A pending cancellation prevents resume when observed before it.
Otherwise the loop terminates and drains the Job after launch acknowledges.
An OS call may take time to return after cancellation. During this time
other tasks remain dispatchable and native storage stays owned by the
operation. These guarantees require Windows 10 or later.

Polling observes the entire Job. An exit code is available only once the last
process has exited and the leader process handle signals exit.
Cancellation requests termination of the Job and waits for the same
acknowledgment before releasing its output files. Closing a live Job
through the public process API fails. Process teardown closes retained Jobs.
At process teardown an unacknowledged launcher is signalled and its storage
remains live until OS teardown. No managed values are shared with the child.
The kernel may take time to acknowledge termination and the loop remains
dispatchable meanwhile.

The runtime exposes a separate monotonic clock. Use loop-relative deadlines,
not wall time or separate per-poll timeouts. The process adapter uses a
five-millisecond poll delay. Its initial implementation is Windows-only.
The non-Windows primitive returns a typed unsupported error.

## Typed suspension

`async fn` declares a suspending function, closure or callable type. A call
to it requires an explicit `await` in an async body, outside contracts and
defer. A synchronous callable cannot convert to a suspending callable.
`await sleep_ms(ms)` waits for a bounded nonnegative delay with effect
`state`. `await routine(args)` composes typed async calls on one task.
Use parentheses before applying result propagation to the awaited value.

The initial Windows lowering uses a single-threaded stackful continuation.
Suspended stacks are retained by their owners. Their precise root chains
and captured environments remain visible to GC. The only switch points
are checked awaits. Cancellation resumes a suspended stack with a flag.
Checked await exits then run active lexical cleanup in LIFO order while
propagating cancellation through the async call chain. The scheduler
discards a cancelled call's return carrier and publishes cancellation only
after unwinding. Postconditions apply to successful returns.

The checker traverses the resolved call graph of each suspending body.
Synchronous OS effects, foreign calls, dynamic interface dispatch and
unknown synchronous callables are rejected there. All suspending callable
targets are checked individually. The initial scheduler accepts callbacks
with an `io, state, process` effect ceiling. A caller captures any required
command-line values before launching a task. Timers and composed async
calls are the first await operations. Process jobs continue to use the
explicit nonblocking process adapter.
