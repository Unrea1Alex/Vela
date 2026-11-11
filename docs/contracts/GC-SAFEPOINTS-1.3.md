# Collection checkpoints in generated C

Stage 1.3.4g omits the poll before a temporary when the C operation cannot
allocate managed storage, invoke Vela or suspend. Evaluated operands already
have their roots. Eligible operations include literals, local and field copies,
zero initialization, comparisons and checked integer arithmetic. Arithmetic
guards and source spans remain in place. An effect-free call can still allocate
or fail, so direct and indirect calls keep their existing poll.

Keep a poll before generated allocations such as a closure environment, dynamic
box or copied list snapshot. Keep native and builtin call boundaries because
they can allocate, invoke a callback or change scheduling. The caller retains
roots for live arguments when polling. New allocations are described and rooted
before the next collection opportunity. Suspension keeps its original root
chain and cancellation path. Every taken loop back edge reaches a poll after
restoring the loop's root mark. Exits before the back edge follow the existing
cleanup sequence.

The pressure threshold and tracing layout stay unchanged. Between retained
polls, the omitted operations add zero managed allocation. A long numeric loop
has a poll within one iteration, and allocating operations keep their own
boundary. This is a bound in program operations. `VELA_GC_STRESS=1` collects at
each retained poll. Counter builds measure total and maximum collector pause,
executed polls, number of collections and retained bytes separately from timing.

The accepted 1.3.4f numeric fixture emits 62 polls. The [fixed goal](C-OPTIMIZATION-1.3.md)
requires at least 40% fewer, which allows at most 37. Test the frozen numeric,
scalar and mixed corpus, GC stress across calls and loops, FFI callbacks,
await/cancel and GUI drain. Peak managed storage, runtime and build budgets use
the existing thresholds. Recover C on MSVC and GCC and run the complete native
gate after focused checks.
