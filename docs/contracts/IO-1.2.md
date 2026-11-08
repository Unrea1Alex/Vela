# Synchronous byte streams — 1.2.6a

Status: accepted contract; verification is recorded in the stage receipt.
`std/io.vela` uses immutable byte `String` storage (not validated text), the
existing backing of text::Bytes.data. This concretizes the proposed Bytes
notation without adding a second storage type or implying UTF-8 validation.
Opaque Reader/Writer copies share callback state, counters, failure and close.
Callbacks have the common `{state,io}` ceiling, even for memory adapters, run
synchronously and must not reenter the same handle. No threads or borrowed pointers.

`reader(pull,close,total)` and `writer(push,close)` wrap explicit callbacks.
Positive read requests are 1..65536. Data must be nonempty and no larger than
requested; End alone denotes EOF. Positive short writes are accepted; zero is
NoProgress and counts beyond input are Protocol. Empty writes are no-ops.
Invalid request limits do not invoke callbacks. Operational failure is sticky;
later operations return the same error without retrying possibly partial output.
Errors carry category, adapter byte offset and unchanged String cause. Shared
close runs once, retires even on error, caches its outcome and forbids later I/O.
Closing never retries a failed operation. Reentrant operations return Busy;
after the close transition, read/write return Closed even inside its callback.

The memory source owns immutable input, the bounded memory sink owns output
chunks; those resident bytes are separate from working buffers. `memory_reader`
accepts an explicit maximum short-read size. `memory_writer` returns a sink with
`output` and its Writer; output joins only when explicitly requested. The file
reader uses native chunks <=8192, with no hidden tail buffer. `open` requires a
regular file and an explicit positive Int64 total bound; growth is checked on
every read. `create` truncates the destination when opened. Native writer/read
owners share a 128-handle budget, are GC rooted, reject foreign retain/release,
callback registration and the opposite stream operation, and retire on failed
close. Shutdown is fallback cleanup, not the normal ownership protocol.

`copy` borrows both handles, uses a buffer 1..65536, and finishes each chunk's
short writes before reading another. Its largest live payload working buffer is
one source chunk; slices retain that chunk and do not copy it. Statistics count
actual callback calls, accepted bytes and largest observed chunk. Adapter
counters are cumulative; copy counters are local. `copy_owned` always closes
both endpoints, independently, and retains the operation error and both close
errors in Failure; no rollback or automatic retry. Neither helper catches a
language panic. Limits/counter overflow return typed errors before overflow.

`std/stream_lines.vela` wraps a borrowed Reader; explicit `close` closes that
shared source. Limits: buffer 1..65536, record 1..1048576, source total positive
Int64 via Reader. A record excludes LF, CR immediately preceding LF, and an
initial UTF-8 BOM. Other CR/BOM bytes remain. No-final-LF records are returned;
empty input/trailing LF produce no extra record; BOM-only input is one empty
record. Split codepoints/CRLF/BOM work across arbitrary short reads. Validation
occurs after assembling only the current bounded record. Line numbers start at
1; offsets are absolute zero-based physical byte coordinates, including BOM
and newline bytes. Line.offset is the physical record start. Encoding errors
point to the first invalid byte; record overflow points to the first excess
payload byte; adapter errors point to the consumed position and retain the
typed io cause (whose offset may include read-ahead). Number/total overflow is
Limit. Errors are sticky; no partial record escapes. Close errors retain cause.
After a failed record, close/statistics use the last completed-record boundary;
the sticky failure retains its exact offending byte and line, and the io close
cause retains the source's accepted-byte position.

Joining a record temporarily keeps source parts and the joined record. Live
payload work is bounded by 2*(record+4)+2*buffer+3, including boundary chunks
and the three-byte BOM probe; part descriptors are O(record). Observed retained
chunk lengths, joined size and descriptor counts are measured. Memory source
views conservatively count logical chunks here; their backing input is separately
owned. Previous lines are not retained. Strings
returned to callers and caller-owned input/output are excluded from working
storage and reported separately. Tests measure actual largest chunks/records,
read/write counts and managed peaks separately. For 10x input the same buffer
and record bounds apply; this is not a promise of constant total process RSS.
Legacy stream_open/stream_next/lines signatures, 256 MiB cap, CR behavior and
String errors remain unchanged. Four new native builtins are since=1.2 only.
