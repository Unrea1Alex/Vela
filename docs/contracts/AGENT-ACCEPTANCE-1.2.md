# 1.2.9 release and agent acceptance protocol

Fixed before trials on 2026-11-08. Six fresh sessions, three per variant, same
default model/reasoning settings, frozen 1.2.0 compiler/std/API, task and limits.
No prior conversation, sibling solution, ready application or private oracle is
supplied. Assigned workspaces are separate. Neither variant may change the SDK.
Both may request the same installed API/help and inspect std on demand.

Full reference: current LANGUAGE, STDLIB, TOOLING and PROJECTS, read completely
before implementation, split into bounded files only to avoid tool truncation.
Compact reference: current installed agent skill and AGENT-START, read completely;
remaining help is on demand. Both receive the identical task and CLI fallback
instructions. This compares these delivery workflows, including documentation
retrieval; it does not isolate syntax, model quality or all possible prompting.
Each first task message begins with a distinct fixed-length random nonce to
prevent shared task/material prefixes from favoring one variant's prompt cache.
Preassigned order: full-1, compact-1, full-2, compact-2, full-3, compact-3, in
two batches of three. Limits: 20 minutes, 80 tool invocations per trial. The
same host may have concurrent release checks; report wall time without a speed
causal claim. No private-oracle feedback is sent before a session finishes.

## Identical task: TeamTotals

Build a native Vela CLI project with main.vela and at least one named test.
Usage: `app INPUT OUTPUT [--minimum N]`; minimum defaults to 0, range
0..2,000,000,000. `--help` alone exits 0 and does not read/write files. Other
invalid flags/arity/values exit 2. Use std/cli_schema and std/algorithms::sort.

INPUT is UTF-8 TSV, at most 262144 bytes and 4096 nonempty rows. Ignore empty
lines; accept LF/CRLF and a final line without newline. Each nonempty row is
exactly TEAM TAB AMOUNT. TEAM matches `[A-Za-z][A-Za-z0-9_]{0,15}`; AMOUNT is
one or more ASCII decimal digits, value 0..1000000. Leading zeros are allowed.
No whitespace trimming. Any malformed/over-limit input or a group total over
2000000000 exits 2. No output file may be created or changed on these errors.
I/O errors exit 2. Valid input exits 0 with no stdout output. Aggregate all rows
by exact case-sensitive team. Retain groups whose sum is at least minimum.
Sort by sum descending, ties by unsigned ASCII team ascending. OUTPUT is JSON:
`{"groups":[{"team":"A","count":2,"sum":7}],"rows":2}`. Rows is the total
number of valid nonempty input rows, before group filtering. JSON whitespace and
object key order are free; array order and numeric values are exact. Empty input
produces empty groups and rows 0. Preserve output on validation/CLI failure.

Implement, check, build app.exe, run named tests and your own behavior checks.
Do not implement another language's parser or invoke another language for the
application logic. Only own workspace and supplied SDK/reference paths are
available to the trial; compiler implementation/other apps/oracles are excluded.

## Recorded acceptance

Parent runs a fixed independent black-box oracle after each final result;
3/3 trials per variant must pass every case. Record provider input, cached input,
output, actual uncached=input-cached, elapsed time, help accesses and compiler
correction cycles. Read only each trial's own numeric usage/tool event records;
do not publish private reasoning. Success requires compact median uncached input
at least 25% lower than full. A miss leaves 1.2.9 open; preserve failed trials
and declare any revised protocol before a new six-session run.

Separate release gates: original application oracles 26/46/44 on staged SDK;
all executable recipes, frozen 1.1 surface/fixtures, stable/docs/MCP startup;
full SDK and execution/isolation/fault/output gates; new packaged setup does
check/build/test/run through its allowed execution manifest; clean Windows C
recovery/full verify and Linux C recovery/fixed point; archive inventory hashes,
Unicode relocation, stripped environment and packaged client handshake.
Every stage gate remains required; full VelaBench remains in 1.4.6.
