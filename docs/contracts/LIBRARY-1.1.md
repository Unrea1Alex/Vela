# Library 1.1 contracts

Accepted design for stages 1.1.1–1.1.6, 2026-11-07. Implemented status and
measured results live in the roadmap and per-stage evidence, not in this design.
Language, project/lock formats, FFI ABI 1 and runtime ABI 2 remain compatible.
Existing public enums and required record fields are unchanged.

## Prelude compatibility

1.1.5 compatibility audit reproduced E202 for a valid 1.0 program declaring
`directory_open`; the archived 1.0 compiler accepts it. Post-1.0 builtin function
names must therefore be fallbacks, not new reserved declarations. The catalog's
existing `since` column (>=1.1) controls this rule, without a second name list.
Own declarations and visible imported declarations take precedence; code without
such a declaration resolves the new primitive normally. Existing 1.0 reservations,
type/effect checks, duplicate/ambiguous-import errors and source spans are unchanged.
Root declarations that shadow a new primitive receive an internal module-qualified
identity before semantic checking. Backends still consume checked symbols only.
The internal root prefix is removed from public symbol names/displayed types.
Validate local functions/callable values/types, qualified/unqualified imports,
unchanged old-name rejections and bootstrap/native fixed points before release.

## Directories (Windows x64 and Linux console)

`std/directory.vela` provides new `Kind`, `Entry`, `Error`, `Scan`, `Limits`
and `WalkEntry` types. An Entry contains the unnormalized UTF-8 name, joined
path, no-follow kind, byte size (regular files only; zero for other kinds) and
mtime in whole Unix seconds. OS order is unspecified. Dot-prefixed names are
included; `.` and `..` are excluded. Invalid UTF-8 names fail, never get replaced.
Windows reparse points and POSIX symlinks are Links and are never descended.

Catalog primitives `directory_open(String)->StreamResult`,
`directory_next(ForeignHandle)->ReadResult`, and
`directory_close(ForeignHandle)->WriteResult` require io/state. The existing
result types are reused without variant changes. Next returns empty bytes at
EOF, otherwise an OS metadata envelope: kind (`f/d/l/o`), tab, nonnegative
size, tab, signed Unix mtime, tab, UTF-8 name. The first three tabs delimit
metadata; tabs/newlines inside names are preserved. No parsing or traversal
algorithm is implemented in C. Invalid/deleted entries fail with a reason.
Library errors attach the directory/entry path and operation to the reason.

Handles have a distinct owner, at most 128 live, are explicitly rooted until
close, and reject wrong-owner/use-after-close operations. Close consumes the
handle even if OS close reports an error; an error must be observable. Explicit
close is required on EOF, failure and early exit. Process shutdown is a fallback,
not a GC destructor. `Scan` aliases share the close state; close is idempotent
at the library level. Failed next does not implicitly consume the scan.
Enumeration is not a snapshot; concurrent changes may be observed or fail.
Traversal fails rather than returning partial successful results after an error.
`entries_bounded(path, limit)` collects at most 0..1000000 entries, closing on
every path. `entries(path)` uses the 1000000-entry bound. These collectors return
no partial list on exhaustion. Low-level Scan allows incremental consumption.

`walk(root, Limits(depth, entries))` is iterative Vela code; root has depth zero,
direct children depth one. Maximum configured depth is 1024; entries 1..1000000.
Every encountered entry counts, including directories and links. No directory
handles remain open while processing a child. Results contain relative `/`
paths; root spelling and Unicode normalization are preserved. Default link
policy is no-follow, including rejecting a link root. Concurrent replacement
with a link must not cause descent (OS open is no-follow). This is not a
hostile-filesystem sandbox. Limits return a path and reason, not partial data.

The index app re-enumerates and reads Bytes every repetition, filters by exact
substring and suffix, sorts UTF-8 lexicographically (equivalent to scalar order
for valid UTF-8), counts LF plus an unterminated final line, and publishes with
fs::write_atomic only after all iterations succeed. No shell at runtime.

## Opt-in JSON reader

`std/json_stream.vela` consumes a bounded UTF-8 buffer incrementally, without
building json::Value trees. It is a pull/token reader, not an unbounded file
stream. `Limits(bytes, depth, nodes)` explicitly bounds input and work; allowed
maxima are 16 MiB, depth 4096, nodes 1000000. Parsing uses an explicit stack;
no input-dependent native recursion. Skipping validates the complete grammar,
escapes, surrogate pairs and UTF-8; even an ignored malformed member fails.
Duplicate keys are rejected. Errors carry byte offset, JSON path and reason.

Number tokens preserve their original spelling. Lexical integer (no fraction
or exponent), Float64 conversion and range failure are separate operations.
An arbitrarily large ignored numeric token is valid JSON within byte limits;
it is not converted. Requested Int conversion checks signed 64-bit range and
rejects `1.0`, `1e0`, true and null. Float conversion rejects overflow/nonfinite.
Trailing data, byte/depth/node limits and truncated structures fail explicitly.
The existing json::Value, Error, Limits and parse APIs retain their behavior,
including their documented depth/range limits.

The concrete pull API is `create(data, Limits)`, `next(Reader) ->
Result<Option<Token>, Error>`, `skip_value`, `finish`, `read_string` and
`read_integer`. Event variants are ObjectStart/ObjectEnd/ArrayStart/ArrayEnd,
Key(String), StringValue(String), NumberLiteral(Number), Boolean(Bool), Null.
Token contains event, zero-based UTF-8 byte offset and JSON path. Number is opaque; `spelling`,
`is_integer`, `integer` and `floating` expose checked views. Error contains
offset/path/kind/message; kinds distinguish syntax, encoding, budgets, type
and range. Paths use `$["key"][index]`; malformed keys use their parent path,
UTF-8 validation errors use `$` with the exact byte offset.

Reader aliases share mutable progress (`state`), and syntax failure is sticky.
`finish` validates/drains the remainder and trailing whitespace, and is required
when a caller stops consuming events early. `skip_value` validates one complete
value and its boundary; at root it also rejects trailing data. Numeric conversion
errors do not invalidate an otherwise valid token stream. Immutable spelling
slices retain their backing input under the existing precise tracing model.
Frame storage keeps path segments, not quadratic copies of ancestor paths;
skipping creates no per-token path strings unless an error is reported.

## HTTP (opt-in Windows curl transfer deadline)

Compatibility refinement for 1.1.5: the owning 1.0 NETWORK-TLS contract explicitly
gives `curl` a common launch/transfer supervisor budget. Preserve that factory's
documented behavior. Add `curl_transfer(executable, ca_file) -> Result<Curl, Error>`
as an opt-in factory on the existing opaque type/Transport interface. No public
enum/required record field/effect/ABI change. This prevents a silent reinterpretation
of valid 1.0 callers while fixing new transfer-deadline applications in standard SDK.

In `curl_transfer`, request timeout remains 1..120000 ms. It covers the complete transfer through
receipt of the body; curl enforces it with --max-time. Time waiting for an
application concurrency slot is outside the request timeout. Helper startup
and bounded final process drain are supervision overhead, not extra transfer
time. The supervisor must not discard a completed transfer solely because its
wall timer started before curl's transfer timer. A separate bounded helper
budget is allowed only while curl still receives the exact original timeout.
Cancellation remains distinct from timeout, transport, body limit and cleanup
failure. No automatic retry, redirect, relaxed TLS trust or pooling is added.
Do not publish partial bodies. Release is legal only after terminal process
drain and must report removal failures; retrying release may finish cleanup.
The helper supervisor gets request timeout +1000 ms, bounded at 121000 ms; the
curl argument remains exactly the original timeout. Verify this with a completed
real transfer polled at the former supervisor boundary, an unchanged `--max-time`,
slow headers/body and a helper that does not finish. This is launch/drain overhead,
not an extra second of HTTP transfer. Legacy `curl` remains a negative control.
Cleanup failure is Storage; a caller may retry release after resolving the cause.

## Validation matrix

1.1.1 freezes task/oracle/toolchain/artifact hashes and native regressions for
old JSON (huge ignored number and depth >128), directory API absence and the
shared process/transfer timer race, with negative controls.
1.1.2 covers empty/nested/Unicode/dot names, missing/file/denied/deleted paths,
early close/wrong owner/close failure, handle stress and GC on both platforms.
1.1.3 uses frozen index oracle: 12 baseline + 14 additional =26 maintenance.
1.1.4 uses frozen logs oracle: 30 baseline +16 additional =46 maintenance,
plus exact numeric categories, malformed skipped fields and explicit limits.
1.1.5 uses frozen HTTP oracle: 29 baseline +15 additional =44 maintenance,
50 ms, 128 URLs/concurrency 8, slow headers/body, queue/cancel/cleanup and TLS.
1.1.6 requires all three apps, three fresh independent index creators, six
sequential compiler verify gates, C recovery, relocated Windows/Linux packages,
matching MCP/skill fingerprints and old 1.0 project/lock/FFI smoke. Historical
VelaBench is read-only. Node test harnesses are optional integration tooling,
never a native compiler/build/test or application runtime dependency.
