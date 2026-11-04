# Tests

The active runner is `tools/test.vela`; run `vela-dev.cmd verify` or `vela-dev.cmd test`.
It builds native executables, asserts outputs/exit codes/diagnostic codes, and has
no Python dependency. Missing toolchains and failed builds are failures, not skips.

`cases/cases.tsv` has five pipe-delimited columns:
`name|check or run|exit code|diagnostic code|stderr substring`.
Each row references `name.vela`. Run cases additionally use `name.out` (exact
stdout bytes after CRLF normalization) and `name.args` (one escaped argument per
line, including empty lines). An empty args file means zero arguments. Supported
escapes: backslash, quote, newline, CR, tab and NUL. Unicode is stored literally.
`@ROOT@` and `@TMP@` are replaced by absolute paths. Empty stderr expectation means
stderr must be empty; a nonempty expectation must occur as a substring.

The original 0.2 tests were migrated into 123 explicit fixtures; dynamic loops
became individual cases. CLI, source positions, deterministic C, failed builds,
source-file protection, Unicode/BOM, process quoting/redirect/timeouts and
standalone operation are checked directly by the native runner. `helper.vela`
replaces the old Python child process in subprocess tests. The `v03_*` fixtures
cover new language and collection semantics. Test counts therefore differ from
the 97 original unittest methods (many methods already had multiple cases).

In 0.4 every fixture is checked in its original form and after formatting;
syntax/lexer/depth failures must remain rejections. Formatted successful inputs
must be idempotent and retain the same execution/rejection expectations.
The native runner also checks mixed/invalid compiler IDs, structured/human
diagnostics, Unicode coordinates, formatter modes, source preservation and
idempotence of all authored compiler modules. Frozen 0.5.0 release total: 626 checks.
Current workspace after the TimeLog application review: 688 checks, including
58 application checks and four generic-return formatter regressions.

The `v05g_*`, `v05e_*`, `v05c_*` and `v05f_*` fixtures cover generic inference,
constraints and expansion limits; Option/Result/match/propagation; loop scopes,
range extrema and snapshot mutation; interpolation formats, Unicode, nesting and
evaluation order. Release 0.5 runs the whole suite with stage1 and stage3 compilers.
Native distribution must include `helper.vela` as well as the complete cases folder.
The current runner additionally requires `apps/timelog/main.vela`: it builds the
real application before and after formatting and checks totals, Unicode, escaping,
input rejection, limits, I/O failures and preservation of existing files. Keep that
source in future compiler distributions; the frozen 0.5.0 archive has its older runner.

Failure files are retained in a unique directory under `build/native/`; the
machine-readable report is `build/native/tests.json`. The dev driver installs
new binaries only after successful fixed points and, for verify, successful tests.

The `test_*.py` files remain an optional historical 0.2 reference suite. They do
not cover 0.3–0.5 syntax and are not invoked by native verify. To run the reference:
`VELA_REQUIRE_NATIVE=1 python -m unittest discover -s tests -v` in an environment
with Python and a C toolchain. They still check both builtin-catalog compatibility
and the original language behavior; the native suite is the default gate.
