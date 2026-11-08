# Standard-library evolution contract (1.2.1a)

The 1.2 families are implemented and verified in their assigned stages; the
generated API index and family contracts describe exact shipped interfaces.
Accepted before implementation on 2026-11-07, this contract also proposes the
later opt-in Text/Path/Config work in 1.3; that work remains planned and is not
part of 1.2.

## Compatibility and baseline

The 1.1 baseline is commit 106890ecb19566a91b4b59ca5d942efd614a7a08.
Freeze the authored sources/build interfaces of tree-index, log-summary and
http-collector, the public catalog/source inventory and independent old-API
execution/rejection fixtures in `tests/library12/frozen/manifest.json`.
The frozen generated interface inventory is a compatibility change detector,
cross-checked against source hashes; it is not an oracle for new semantics.
Golden outputs and rejection codes are independent literal expectations.
[Current public API/effects/ownership map](../STDLIB-MAP-1.2.md) covers every
existing module and identifies the three application migration seams.
Application measurements count source bytes, nonblank lines, function headings
and control-flow lines. They measure handwritten source, not runtime performance.

Old public fields/variants, signatures/effects, ordering, error categories,
project/lock 1, FFI ABI 1 and runtime ABI 2 remain valid. Adding required fields
or variants to old types is prohibited. New public operations live in new opt-in
modules where necessary to avoid wildcard-import name collisions. In particular,
`result.vela` keeps map_error/explain; new combinators use result_ops/option.
`collections.vela` keeps its public surface and delegates its old sorts to
algorithms. No old application/benchmark artifact is rewritten as a baseline.
Old String-error lines and open Text/Path/Config records keep working.

All mutable collections retain the existing tracing GC and state effect.
Copies of records are ordinary value copies; embedded List/Dict/cell handles
remain shared. No new borrowing, references, uniqueness, thread safety or proof
system is introduced. Bounds/constructors are runtime checks. Callback effects
are propagated through generic effect parameters; collection storage adds state.
Results preserve typed causes rather than stringifying errors implicitly.

## Result and Option — 1.2.4a

Accepted result_ops functions (implemented in 1.2.4a): map, and_then, unwrap_or, unwrap_or_else,
with_context; option functions: map, and_then, unwrap_or, unwrap_or_else.
The existing result::map_error is reused for error transformations.
with_context returns a new Context<E> with the unchanged cause and message.
No payload is deep-copied and no callback is retained after the synchronous call.

| Operation | Positive expected example | Negative/alternate example | Calls/cost |
|---|---|---|---|
| Result map | map(Ok(2), add_one) = Ok(3) | map(Err(code), spy) preserves code; spy=0; wrong result type rejects | callback once for Ok, zero for Err; O(1) plus callback |
| Result and_then | Ok(2) -> checked -> Err(code) | Err(first) skips later callback; incompatible error type rejects | zero/one call; O(1) |
| Result unwrap_or | Ok(2), eager_default() -> 2 | default still evaluated once on Ok, by ordinary left-to-right call evaluation | no deferred call; O(1) |
| Result unwrap_or_else | Err(7), recover -> recover(7) | Ok(2) skips recovery; omitted io/state effect rejects | zero/one call; O(1) |
| with_context | Err(7), load -> Err(Context(7,load)) | Ok keeps value; cause type remains Int, never String | no callback; one wrapper |
| Option map | Some(2), add_one -> Some(3) | None skips callback; wrong argument type rejects | zero/one call; O(1) |
| Option and_then | Some(2), choose -> None | None skips callback | zero/one call; O(1) |
| Option unwrap_or | Some(2), eager_default() -> 2 | eager default still evaluates | no delayed evaluation; O(1) |
| Option unwrap_or_else | None, produce -> produced value | Some skips producer; callback effects must be declared | zero/one call; O(1) |

Tests use visible counters and ordered traces, including typed errors and nested
short-circuit chains. Pure and effectful callbacks are both exercised.

## Algorithms — 1.2.5 and 1.2.5a

New module algorithms provides stable sort, map/filter/fold/find/any/all and
try_map/try_filter/try_fold/try_find/try_any/try_all. These are eager list
operations, not lazy pipelines. Element traversal is a shallow snapshot taken
before the first callback. Mutating the source list through an alias does not
change this traversal. Nested shared payloads remain shared and may be mutated
by an explicitly stateful callback. Result list storage is independent.
No callback is retained after return. Checked arithmetic and GC roots remain.

sort accepts fn(T,T)->Int with propagated effects, returning a new List<T>.
Comparator sign determines order; a strict weak ordering is needed for sorted
order guarantees. Use bottom-up stable merging: compare left/right once per
merge decision, take left on zero. An inconsistent comparator still terminates
because every merge decision advances an index; sortedness is not promised.
Comparisons are at most n*ceil(log2(n)) for n>1, with O(n) extra slots, no recursive
merge stack. Source values are copied before comparator calls. Empty/singleton
inputs perform zero comparisons. The callback may mutate aliases without changing
the snapshot. Other nested aliases are not frozen or deep-copied.

The old sort_ints/floats/strings signatures stay unchanged. Int order is numeric;
Float64 NaNs are last and stable, signed zeros compare equal and retain input
order. Strings use unsigned UTF-8 byte order, including arbitrary byte strings.
No comparator is called for old wrappers with new mandatory effects.

1.2.5 application seam: current tree-index/log-summary already delegate to
collections::sort_strings (the application merge sorts were removed in 1.1).
There is no remaining handwritten sort in authored apps/prototypes/examples.
Do not rewrite frozen pilot sources to manufacture a migration: these current
calls receive the new O(n log n) implementation through compatible wrappers,
and a record-sorting recipe demonstrates the generic comparator directly.
Rerun unchanged 26/46/44 app oracles to verify the ordering commitment.

| Operation | Positive expectation | Negative / boundary expectation | Calls/cost excluding callback |
|---|---|---|---|
| sort | records with equal key retain input order | non-Int comparator/effects reject; reverse/adversarial input satisfies comparison budget | O(n log n), O(n) slots |
| map | [1,2] -> [2,3] in order | empty -> []; source alias changed in callback still visits original 1,2 | n calls, O(n) slots |
| filter | [1,2,3] -> [1,3] in source order | non-Bool predicate rejects; source storage independent | n calls, O(n) slots |
| fold | initial=10, [1,2] -> 13 | empty returns initial with zero calls; wrong accumulator type rejects | n calls; snapshot O(n), accumulator ordinary value |
| find | first matching value as Some | no match -> None; later callbacks skipped after first match | up to n calls; snapshot O(n) |
| any | first true -> true | empty=false, later callbacks skipped | up to n calls; snapshot O(n) |
| all | first false -> false | empty=true, later callbacks skipped | up to n calls; snapshot O(n) |
| try_map | success list in order | first Err(E) stops immediately, no partial result published | up to n calls, O(n) slots |
| try_filter | typed predicate preserves chosen values | Err at element 2 skips element 3 | up to n calls, O(n) slots |
| try_fold | accumulator on all successes | Err preserves E and stops | up to n calls, O(n) snapshot |
| try_find | Some first match | Err before match returns Err; none -> Ok(None) | up to n calls, O(n) snapshot |
| try_any | Ok(true) short-circuits | Err before true wins; empty Ok(false) | up to n calls, O(n) snapshot |
| try_all | Ok(false) short-circuits | Err before false wins; empty Ok(true) | up to n calls, O(n) snapshot |

Even short-circuit operations create the eager shallow snapshot: zero callback
calls does not imply zero allocation. Fallible callbacks preserve their exact E.
Two acceptance examples must replace handwritten loops with these operations.
These synchronous algorithms do not acquire or close native resources and do
not add resource-specific rollback/destructors. In particular, try_map discards
its unpublished partial managed list on Err; callbacks remain responsible for
resources they create. Ordinary aliases/explicit close still apply to payloads.

## Set — 1.2.5b

New opaque set::Set<K> uses current Dict plus an insertion-order key list.
Supported keys are Int/Bool/String and distinct primitives over those types;
Float64, distinct Float64, Int32, enum and record keys remain rejected by Dict.
create/from_list, contains, insert, remove, values, union, intersection and
difference require state. Copies of a Set share identity. values returns fresh
list storage. size also requires state and returns the membership count.
insert returns true only for a new key; remove returns true only when present.
Set-operation results have independent storage: union preserves
left insertion order then previously absent right keys; intersection/difference
preserve left order. Removing and reinserting puts a key at the end.

Positive examples: inserting x twice yields one key; removing absent=false;
union([a,b],[b,c])=[a,b,c]; intersection=[b]; difference=[a]. Unicode, empty and
Int extrema have ordinary Dict equality. Negative examples: record/Float64 keys
or missing state reject; mutating values() does not mutate the Set, while changing
a copied Set does. Dict operations are expected hash costs, not worst-case O(1).
Remove and values may scan O(n), with O(n) copy/storage. Binary set operations
are expected O(n+m) hash work and O(n+m) storage; callback count is zero.

## Cell — 1.2.5c

New opaque cell::Cell<T> exposes create/get/set only, all with state. It may use
one private List element. Copies and closure captures share identity; independent
create calls do not. get/set use ordinary value/alias semantics and O(1) container
work; get does not deep-copy a nested List. No public operation exposes or clears
the internal list. Positive: two aliases observe set(42); a captured cell retains
a generic value during forced GC. Negative: foreign construction/field access or
missing state reject. This is not an atomic, reference or worker-transfer API.

## Synchronous I/O and typed lines — 1.2.6a

New io Reader/Writer interfaces use typed errors and explicit shared handles.
read(requested)>0 returns Data(nonempty Bytes of at most requested) or End;
Data(empty) is NoProgress, not EOF. A short read is legal. write(nonempty Bytes)
returns a positive accepted count no larger than input; zero is NoProgress.
An empty write is a no-op. Native file failures may occur after irreversible
partial output: errors do not promise rollback or automatic retry. Memory and
file adapters expose the same state/io interface, and close is shared/idempotent
at library level. Use after close returns Closed, not an unchecked foreign call.

The old stream_open and lines APIs retain 256 MiB limits. A new opt-in
stream_open_large(path,total_limit) accepts an explicit positive Int64 total bound.
It uses the old read-stream ownership and stream_next/close protocol. New
stream_create, stream_write and stream_write_close primitives own file writers,
return existing StreamResult/IntResult/WriteResult ABI classes and declare io/state
in builtins.def with since=1.2. Runtime implements OS/storage only. Writer handles
are rooted, owner-tagged, rejected by unrelated FFI/read operations, explicitly
retired even if close fails, and closed at process shutdown as a fallback.
The shared file-stream handle budget is 128. Explicit close remains required.

Memory adapters own a shared cursor and immutable source bytes / bounded sink.
Reader/Writer copies share progress and close. buffer, record and total limits
are distinct: buffer 1..65536 bytes, line/record 1..1048576 bytes, total positive
Int64. Input-owned storage is reported separately from working buffers.
Buffered adapters never accumulate the entire file. copy borrows both ends;
copy_owned closes both on success, failure or early return, preserving operation
and every cleanup cause. A failed writer is sticky and does not retry unknown
partially accepted output. Closing after failure still retires resources.

New stream_lines reader returns typed category, absolute byte offset, 1-based
line number and original cause. It accepts split UTF-8/CRLF/BOM across chunks,
strips BOM only at input start and CR only immediately before LF. Invalid UTF-8,
record overflow, total overflow, adapter failure, zero progress and close errors
are distinct. It retains bounded current-record parts, one joined record during
assembly and bounded boundary chunks (see the exact IO-1.2 contract),
not prior lines. Old lines::reader/next/from_string String errors stay unchanged.

Positive tests include one-byte memory chunks, short writes, empty EOF, no-final-LF,
and file copy/line iteration above 256 MiB on Windows/Linux. Negative tests inject
oversized chunks, zero progress, failure mid-record, invalid UTF-8, each limit and
close errors. A 10x larger input must keep the same declared live working-buffer
budget. Read/write counters and managed peaks are recorded; normal GC and a
bounded forced-GC probe are separate checks. No parallel/backpressure claim.

## Later checked values — 1.3.1a/b, design only

checked_text introduces an opaque immutable validated UTF-8 value: create(Bytes),
bytes, length and checked slice. Construct once, validate boundaries on slices,
never revalidate the entire unchanged source on safe reads. Returned Strings are
immutable backing views, not mutable borrowed pointers. Malformed/split codepoint
inputs reject with offset; foreign construction/access rejects. Construction is
O(bytes), safe views O(1) excluding explicit copying; retain backing storage.

checked_path create(String) validates UTF-8, nonempty/NUL policy once. value and
conversion to old path::Path are safe views. join/parent validate newly composed
data while retaining UNC/drive/absolute-path semantics. A checked path does not
prove existence, canonical identity or sandbox containment. Empty/NUL/malformed,
Unicode/UNC and aliases have independent tests. No widening of OS trust.

checked_config introduces an opaque snapshot with a field index. create(Value)
validates and clones the bounded graph, including nested mutable collections;
cycles/duplicate names/invalid text/limits reject. Preserve field order and typed
errors. find/required/typed getters do not rebuild seen or validate the whole
object. Values exposed to callers are detached bounded copies, so source or
returned-value mutation cannot corrupt the snapshot. Construction is O(nodes+
bytes) expected hash work, lookup O(key) plus returned subtree copying; storage is
O(nodes+bytes). Positive nested lookup remains correct after external mutations;
negative cycles and invalid data retain precise errors. Validation/copy counters
and old Config compatibility are required in 1.3, not claimed by this contract.

## Verification boundary

At 1.2.1a execute only current-API fixtures and source/contract/link/inventory
checks, followed by its mandatory full native verify. New-family examples above
are explicit future acceptance cases; they are not counted as executed now.
Every implementation stage adds its positive/rejection/effect/alias tests,
updates executable recipes and runs its own verify before the next stage.
Final 1.2.9 repeats frozen compatibility, three app suites, package/client gates
and the separately specified same-version full/compact A/B experiment.
