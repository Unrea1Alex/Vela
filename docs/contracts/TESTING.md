# Test declarations and assertions — 0.7.3 contract

Status: included in Vela 0.7.0, verified on Windows x64/MSVC. Stage 0.7.3 verify:
939/939, no failures/skips, both fixed points. A later focused runner gate passed
11/11 including C compiler launch failure and a named table failure. Report JSON
was independently parsed and its schema/field values checked. POSIX unverified.
Final release acceptance: [Vela 0.7.0](../VALIDATION-0.7.md), aggregate 974/974.

Syntax: `test "descriptive name" effects { state, io } { ... }` at module scope.
`test` is contextual at module scope; existing local bindings named test remain valid.
The effects clause is optional, meaning no effects, exactly as for fn. Names must
be nonempty, NUL-free, <=256 UTF-8 bytes and unique within the module. Tests are
private, parameterless, return Unit and cannot be generic or exported. They have
ordinary local scope, explicit effects and the same type/control-flow checks.
At most 256 declarations per module. Invalid/duplicate/exported names use E227.
All test bodies are checked even in an ordinary build. There is no hidden mutable
test context in application code. Generated implementation names are reserved.

`assert_true(condition, message)` is a located builtin. Success does nothing;
failure prints an assertion failure with the Vela source span and exits 70, like
a failed runtime contract. It requires no effect, as with existing panic checks.
Assertions are runtime checks, never static proof. Comparison assertions and
table cases live in std/testing.vela; tables are ordinary Lists of named records
iterated by a test, with the case name passed in the assertion message. No macros
or implicit parameter expansion.

`vela test FILE` discovers tests in that entry module; imported module tests are
checked but not automatically run. `vela test PROJECT` keeps explicit manifest
test entries and their dependency/lock semantics. A legacy test entry containing
only main still runs once. For files with declarations, each declaration runs
in its own fresh process, in source order. Tests do not call application main.
One failing assertion/process does not prevent subsequent declarations running.
`check` accepts a test-only entry module; `build`/`run` require main and explain
that test-only files use the test command. A malformed/type-invalid test fails
before compilation, with the normal diagnostic schema.

Test execution is ordinary authorized native execution, not an OS sandbox.
The runner uses a private cwd per test and a 30-second process deadline; it owns
and terminates redirected child trees under the existing runtime process rules.
Source/workspace permissions remain those of the invoking user. MCP test later
requires 0.7.7 OS isolation. Build errors are distinct from assertion/timeout
failures. Inputs and module source files are never rewritten by the runner.
The runner removes its executable and capture files. If tests create additional
files, their private directory is retained and reported as artifact_dir; it does
not recursively delete unknown test-created contents. Users can inspect/remove
those artifacts explicitly. This policy is superseded by isolated MCP retention
and cleanup rules in 0.7.7, not treated as indefinite hidden storage.

JSON report schema_version=2: ok, passed, failed and tests array. Each record has
name, source, source span, status (passed/failed/timeout/build_error), exit_code,
stdout, stderr. No durations or timestamps are needed for deterministic structure.
stdout_encoding/stderr_encoding are utf8 for valid UTF-8 captures, otherwise hex
and the corresponding field contains lowercase hexadecimal bytes. Capture reading
is limited to 4 MiB per stream; exceeding it fails that test. Native execution does
not impose an OS disk quota while the child writes; MCP execution adds that bound.
An artifact_dir string is empty after complete cleanup, otherwise identifies the
retained private directory. Test-created output is not copied into the project.
Command exit: 0 all pass, 1 failures, 2 infrastructure failure. Compiler rejection
keeps its existing exit 1 and diagnostic JSON. Existing consumers must check the
schema version; the 0.6 project runner's schema 1 is historical.

Acceptance: pass/fail and continued execution, source location, effect/type and
duplicate-name rejection, test-only check versus build, application main exclusion,
manifest dependencies/locks, table cases and named failure, cwd/child/timeout
behavior, report fields and deterministic test order. Migrate suitable stdlib
checks to the new declarations, rebuild the compiler and run full native verify.
