# Existing public API and migration seams

Inventory for 1.2.1a, not a list of newly implemented features. All 372 current
public declarations, signatures and effects are in the frozen native-generated
`tests/library12/frozen/api-baseline.json`; source hashes are in its manifest.
This table describes ownership/error boundaries that signatures alone cannot.
Detailed contracts linked from [stdlib](STDLIB.md) remain authoritative.

| Existing module | Effects / errors | Copies, aliases, resources and repeated application work |
|---|---|---|
| text | validation pure; builders state; text::Error | Open Text/Bytes wrap immutable String; builders share mutable storage; consumers revalidate forged Text. Repeated UTF-8 scans are a future profile subject. |
| path | pure operations; executable/resource location io; Error/LocateError | Open Path is an immutable String value inside a public record; consumers validate it. Validation is not canonical identity or sandbox permission. |
| fs | io; fs::Error includes typed path/encoding/limit/I/O/cleanup | Bounded reads return immutable bytes; atomic publication owns temporary files and reports cleanup. No caller-owned long-lived stream from this API. |
| directory | io/state; Error(path,operation,reason) | Scan copies share close/progress; explicit close on early exit; bounded walk closes parents, reports links without descent. Application filters/sorts repeat manually. |
| json | state for tree construction; Error/ParseError/DecodeError | Value Array/Object embed shared List handles. Parse creates a fresh graph; stringify validates bounded graphs. Number policy is explicit. |
| json_stream | state; Error(offset,path,kind,message) | Reader aliases share a cursor. Numbers keep spelling/backing input; skip validates without conversion. Applications repeat key/required/type checks. |
| lines | state + callback effect; legacy String errors | Reader/pull copies share cursor, failures are sticky, callbacks are guarded against reentrancy. Legacy CR and total/line/chunk limits remain. |
| cli | state; current adds args; cli::Error | Parsed options/positionals are mutable public Dict/List values. Parse does not mutate source arguments. The frozen 1.1 apps hand-code bounds; 1.2.4 migrates current apps to cli_schema. |
| config | state; config::Error | Public members share JSON graph aliases. Lookup defensively validates public mutable data. This is intentional protection, not an established defect. |
| result | callback effect; typed Result cause | map_error transforms Err only; explain deliberately replaces the cause with String. Payload aliases remain ordinary values. |
| collections | state; no new recoverable error enum | copy/reverse/sorts return new outer storage, share nested payload handles. The frozen 1.1 sorts use insertion; 1.2.5 delegates to algorithms::sort with O(n log n) comparisons and the same byte/NaN/zero order. |
| testing | declared test/callback effects; assertions fail observably | Case values use ordinary copies/aliases. Expected outputs and rejection codes must be specified independently of compiler output. |
| services | explicit interface effects (state/io/process); service-specific typed errors | OS and memory implementations are selected explicitly. Memory stores share Dict/List state; service interfaces do not imply immutable snapshots. |
| replay | state and underlying service effects; replay errors | Typed transcripts/cursors have explicit record/replay consumption. finish checks exhaustion; an event trace is not ambient OS replay. |
| process | state/io/process; process::Error | Requests snapshot relevant argv; supervised workers own jobs/files. Copies share progress, cancellation must drain and release. Windows OS adapter only. |
| event_loop | state plus driven operation effects; typed status | Queues/continuations are shared managed state; callbacks stay owned until completion. Bounded host-driven scheduling, not native worker threads. |
| tasks | state; task outcome/error | Task copies share identity and suspension state. Windows fibers require the explicit host lifecycle. Logical result and terminal cleanup differ. |
| task_group | state plus host tick/shutdown effects; typed outcomes | Scope owns child hierarchy; shutdown cancels and drains before final outcomes. Captured mutable values retain ordinary aliases. |
| async_io | state in async bodies; Error<E> preserves operation/cleanup | HTTP/process adapters await existing supervised operations; cancel does not skip terminal release. Blocking arbitrary io in async code remains rejected. |
| http | interface state/io/process; http::Error | Requests snapshot headers; Exchange copies share curl/process/temp ownership. curl and curl_transfer have different explicit deadlines. Each terminal exchange requires release. |
| http_server | state/io/process; server errors | Windows DLL owns listener/queue/callback state; user handlers run through the documented bounded host. Response fields/variants remain frozen. |
| gui | state/process/io at boundary; GUI errors | Opaque Window copies share idempotent close and native callback/queue ownership. Drain app tasks before closing; Windows trusted DLL only. |

Read access to List/Dict is state, even when an algorithm does not mutate its
source. Snapshotting an outer list does not detach nested mutable payloads.
No modernization may silently strengthen effects, hide old public fields,
change enumeration/error meaning, or claim unique ownership from opaque alone.

## Three frozen application seams

Implemented opt-in additions: cli_schema (1.2.4) snapshots validated descriptors,
keeps parsed values private, adds state (current adds args), preserves cli::Error
causes, and performs no I/O. [Contract](contracts/CLI-SCHEMA-1.2.md).
result_ops/option (1.2.4a) propagate callback effects, preserve ordinary payload
aliases, and retain no callbacks. Context<E> keeps the typed cause; old result
map_error/explain are reused unchanged. Eager/lazy defaults are distinct.
algorithms::sort (1.2.5) adds state and comparator effects, snapshots outer
elements before callbacks and uses O(n) slots. Old collection sort callers receive
the common stable merge mechanism; no application-owned merge sort remains.
algorithms traversals (1.2.5a) add state plus callback effects; typed failures
preserve their cause. All traversals eagerly allocate an outer snapshot, including
short circuits, and never close payload resources. Basics/log-summary replace
manual sum/output traversal with fold/try_fold.
set (1.2.5b) requires state, shares Dict/order-list identity across copies and
enumerates insertion order. values/algebra results detach storage. Hash costs are
expected, deletion scans; the existing Dict domain rejects Float/unsupported keys.
cell (1.2.5c) hides a one-slot List and requires state for create/get/set. Copies
and captures share identity, while nested payload aliases follow ordinary values.
It adds no native resource ownership, atomics or cross-thread transfer.
json_decode (1.2.6) reuses json_stream validation, keeps raw span maps private,
and runs typed stateful builders after structural validation. Error causes stay
typed; outer coordinates refer to the root input. Arrays/fields are bounded,
String views retain backing data, and user callback side effects are not rolled
back. HTTP config/log records use declared schemas instead of manual event chains.
io/stream_lines (1.2.6a) add state/io byte callbacks with shared explicit close,
sticky typed errors and bounded working storage. Memory input/output are owned
separately; short writes finish before another chunk is read. Typed lines retain
only current parts/chunks, strip initial BOM/CRLF and report physical byte offsets.
Legacy streams/lines remain unchanged. No parallelism or backpressure claim.
parallel (1.2.7) uses shared Cell control, a shallow outer input snapshot and
per-item task_group scopes. Active callback/operation limits and output order are
explicit; cancellation/deadline/fail-fast stop admission and drain all children.
Completion detaches outer lists while retaining ordinary payload aliases and
all group cleanup causes. HTTP collector removes its slots/poll/release code.

| Application | Baseline nonblank lines / functions / control-flow lines | Work to replace in 1.2 |
|---|---|---|
| tree-index | 95 / 9 / 20 | argument bounds, filtering/sorting, repeated independent tree/file reads |
| log-summary | 274 / 13 / 30 | argument bounds/relations, required JSON keys and numeric policy, grouping/sorting |
| http-collector | 437 / 16 / 48 | arguments, typed configuration, slots/poll/release and cancellation/drain loop |

The exact UTF-8 bytes and lexical counter definition live in the frozen manifest.
These numbers do not establish a defect, speedup or maintainability score.
The original functional oracles and literal old-API fixtures constrain changes;
the later A/B experiment measures documentation packaging on the same compiler.
[Proposed APIs and cost model](contracts/STDLIB-EVOLUTION-1.2.md).
