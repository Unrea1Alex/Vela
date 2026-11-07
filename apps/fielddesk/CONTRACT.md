# FieldDesk application contract

Historical application acceptance for the released Vela 0.10.0. The current
network behavior is specified by [GUI-NETWORK](../../docs/contracts/GUI-NETWORK.md).
This contract did not add language
semantics or start implementation of 0.11.

FieldDesk analyzes NDJSON measurements, applies calibration, groups stations and
publishes a self-contained HTML report. A native Windows editor offers Analyze
and Export actions. The compiler, algorithms, validation and HTML generation are
Vela. The C adapter owns Win32 controls, transports callbacks and provides the OS
executable path. Optional loopback HTTP reuses the existing 0.7 Windows prototype.

Input records have exactly `station` (1..96 UTF-8 bytes, no control characters),
`value` (finite, absolute value <= 1,000,000), and `accepted` (boolean).
Configuration has exactly `title`, `limit`, `gain`, `offset`. Title is 1..160 bytes,
limit is 0..100,000,000, absolute gain <= 100 and absolute offset <= 1,000,000.
Calibration is `value * gain + offset`. An alert is strictly above the limit.
Rejected records count as excluded and never enter statistics. Empty active data
is an error. Population standard deviation uses a two-pass calculation.

Limits are 512 KiB input, 4096 bytes per physical line, 2048 records, 32 active
stations and 1 MiB report. UTF-8 BOM, CRLF and a final unterminated line are accepted.
Errors preserve physical line and JSON path when available. Station summaries use
name byte order; the record table preserves input order. HTML escapes all user
text. Report publication is atomic; failures before publication preserve old output.
Input/config/output/log paths must be distinct, including existing hard links.

The normal batch path reads a native file stream. Replay mode snapshots input
through FileStore, records file reads, clock, entropy, report publication and a
child verification command, then reruns the same application pipeline from the
transcript without repeating external actions. Replay is in memory only. The
child verifies the published report envelope; it does not independently recompute
statistics. CLI success is 0, usage/data/service failure is 2, `--fail-on-alert`
returns 3 only after successful publication. GUI is synchronous and bounded to
4096 input bytes, with a 64-event queue. The GUI has no network or background tasks.
Callback cancellation precedes owner close on every structured exit.

Optional `--demo OUTPUT --local-port PORT [--http-path /measurements]` fetches
NDJSON from numeric loopback using the existing synchronous HTTP prototype.
Only HTTP 200 is accepted; native body limit is 4096 bytes and each phase has a
200 ms timeout, not a whole-request deadline. No TLS, redirects, auth or proxy.
The returned body becomes the replay file snapshot; HTTP transport itself is not
recorded. Close the response on every structured success/error exit. Validate
200/404/oversize/timeout/refused/invalid-port behavior with a local fixture.

Acceptance before completion

- Build project with reviewed dependency/native lock; run named behavior tests.
- Verify known statistics, calibration, exclusion, exact-threshold behavior,
  malformed/oversized data, UTF-8/CRLF chunk boundaries and HTML escaping.
- Compare stream and memory results. Record/replay exact bytes and reject
  changed requests, incomplete transcripts and service failures.
- Exercise CLI and real native GUI, including edit/analyze/export/error/close.
- Run repeated analysis under forced GC and execute a relocated native package.
- Record feature coverage and unperformed checks; assess roadmap changes from
  observed problems, without claiming every builtin is used.
