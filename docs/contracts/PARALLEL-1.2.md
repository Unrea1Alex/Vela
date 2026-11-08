# Bounded ordered async mapping — 1.2.7

Accepted contract before implementation. `std/parallel.vela` composes the existing
task_group/async_io ownership protocol; no threads, new scheduler or blocking
async escape. Host-driven Job copies share progress/cancellation. `create` takes
an input List, concurrency 1..128, monotonic initial time, overall timeout
1..2147483647, Collect/FailFast policy, and an async stateful callback
`(task_group::Scope,T,index)->Result<U,E>`. It snapshots the outer list before any
callback; nested aliases remain ordinary. At most 65536 inputs. The absolute
deadline must fit the group's documented host clock range.

`tick(job,now)` advances at most one group turn and never sleeps. It starts at
most concurrency item tasks; each has its own Scope. A slot is reusable only
after that task and all owned child operations settle. The group's operation
limit also equals concurrency, even if one callback posts several children.
This bounds active callbacks/host operations separately, not arbitrary external
resources or work a callback deliberately detaches outside its supplied Scope.
Callbacks must post owned work through the supplied Scope and cooperate with
the existing await/defers/cancellation contract. Arbitrary blocking IO remains
rejected by E241. No callback retry. Admission proceeds in input order and begins
on tick, not create. Newly free slots are admitted after the next group turn,
which also retires completed task metadata; no fixed-size batch barrier.

Collect records each typed error and continues. FailFast stops admission on the
first observed item error; completed items survive. Terminals observed in one
turn are inspected in admission/index order, not an invented wall-clock order.
Driver failure always stops admission. `cancel` requests group cancellation;
timeout includes queue time and is checked before admission. Cancellation wins
over an unobserved deadline. Active siblings are cancelled and drained; never
admitted items stay NotStarted. In-flight cancellation due to the job deadline
is reported as TimedOut. An item that already finished retains its outcome.

`outcome` stays None until every owned task/operation is terminal and the group
is idle. Completion contains input-ordered Value/Error/Cancelled/TimedOut/
Driver/NotStarted items, finish reason, admissions/actual callback starts,
task/operation peaks, scheduling failure and all
group cleanup errors. Each read returns detached outer result/error lists;
payload aliases remain ordinary. Cleanup failure never becomes success and
does not overwrite typed item errors. Complete means traversal exhausted, not
that every item succeeded; cleanup errors change Complete to Cleanup. Cancellation
is idempotent and returns false once stopping/ready; tick is
non-reentrant; invalid/backwards clocks cause no work. Create uses state; host
tick uses state/io/process. Async actions use state with approved host bridges.
Fibers and HTTP/process bridges remain Windows-only; Linux verifies construction,
empty mapping, clock/limit rejection and explicit driver failure for nonempty
jobs rather than claiming fiber support.

Storage O(n+concurrency+retained cleanup causes) plus user payload/callback state; snapshot/results are
eager. Tick scans at most concurrency tasks plus task_group's bounded queue.
The caller must keep ticking after cancellation until completion before closing
GUI/server/resources. No hidden host_sleep, global scheduler or automatic drain
on dropping a managed Job. Resource handles retire through existing group
cleanup, not GC. HTTP collector replaces its slots/poll/release code with this
algorithm and async_io.fetch. A host tick loop is still needed to drive time.

Acceptance: independent callback/admission/order/error/cancel/deadline/cleanup
fixtures including abandoned child operations; actual HTTP request counts and
concurrency; no ready-made application slots loop; GUI pumping during pending
work; normal and bounded forced GC; native fixed points and aggregate suite.
