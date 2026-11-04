# Vela standard modules — 0.7.0

Implementation: [std](../std/). The native compiler remains dependency-free;
these are ordinary Vela modules with explicit imports. The MCP setup copies the
matching modules into the application's `vela-stdlib/` folder. For example:

```text
import "vela-stdlib/json.vela" as json;
fn main() -> Int effects { state, io } {
    match json::parse("{\"n\":1.25}") {
        Result::Ok(value) => {
            match json::stringify(value) {
                Result::Ok(data) => { print(data); }
                Result::Err(_) => { return 2; }
            }
        }
        Result::Err(_) => { return 1; }
    }
    return 0;
}
```

Alternatively declare a local manifest dependency, e.g.
`dep|json|vela-stdlib/json.vela`, import `"@json"`, then review and run
`vela lock vela.project`. There is no registry or implicit std import.
MCP snapshots require dependencies to be inside the configured workspace.

| Module | Public API |
|---|---|
| text | Bytes/Text records; checked/decode/encode/slice/codepoint/invalid_offset; trim/split/html/pad_zero |
| path | Path; checked/absolute/parent/join |
| fs | read_bytes/read_text/write_atomic/write_text_atomic |
| process | run(argv, cwd, stdout, stderr, timeout_ms) |
| collections | copy/reverse/sort_ints/sort_floats/sort_strings/compare |
| json | Value/Member/Error; parse/stringify |
| cli | Spec/Arguments/Error; parse/current |
| config | Config/Error; parse/from_value/find/required/string/integer/number/boolean/allow_only |
| testing | Case<I,O>; equal/close/is_ok/is_err; для test-деклараций и обычного Vela-кода |

All modules use their own Error enum and generic Result. Use qualified names to
avoid collisions. Collection operations require state; file operations io;
process.run requires state/io/process; cli.current additionally args. Check the
authored module signatures before calling unfamiliar APIs.

Text/Bytes/Path are ordinary nominal records during the compatibility migration.
Text.data must be UTF-8, Path.value must be nonempty UTF-8 without NUL. Checked
operations validate even forged record fields. String and old str_* still use
raw bytes; indexing/slicing is in bytes. Text.slice rejects split code points.
Trim removes ASCII space/tab/CR/LF; split preserves empty fields and rejects an
empty separator. pad_zero uses total minimum width including a minus sign,
bounded to 4096; it never truncates. HTML escapes &, <, >, quotes and apostrophes.
Path parent/join are lexical, recognize Windows drive/UNC roots, and confer no
filesystem permission. Absolute children replace the base in join.

read_bytes/read_text accept a byte limit in 0..256 MiB, stop once exceeded and
return a typed Limit; read_text also validates UTF-8. Atomic writes create a
private sibling temporary, close the file and rename, then remove the directory.
Before rename succeeds the destination is unchanged. Cleanup(path, committed)
reports whether publication already succeeded; inspect that flag before retrying.
Metadata preservation, power-loss durability and concurrent conflict detection
are not promised. The OS may deny replacing an open file.

process.run uses an argv list without a shell, an explicit child cwd, two output
files resolved relative to the caller, and timeout 1..2147483647 ms. It returns
Completed(code) for every actual exit, including 124. TimedOut and Launch are
distinct errors. Output files are overwritten as requested, even if launching
fails. Existing output aliases and invalid UTF-8/NUL arguments are rejected.
This module is not an OS sandbox. Windows owns a Job for redirected children;
MCP execution has its separate isolation contract.

Sorts return copies and are stable insertion sorts, O(n²), intended for bounded
collections. String order is lexicographic unsigned bytes. Float NaNs sort last;
equal values retain order, including signed zeros. No callback comparators yet.

JSON Value variants: Null, Boolean(Bool), Integer(Int), Number(Float64),
StringValue(String), Array(List<Value>), Object(List<Member>). Member has name
and value. Parse and stringify enforce UTF-8, finite floats, unique object keys,
16 MiB input/output, depth 128, 65536 values and 4096-byte numeric input tokens.
Surrogate pairs decode correctly; lone surrogates and raw controls are errors.
Integer spellings fitting Int remain Integer; other finite numbers are Number.
Stringify preserves member order and emits Number with a dot or exponent.
Integer spelling -0 becomes Integer(0); Number(-0.0) preserves its sign.
Forged cyclic value graphs fail the depth bound. Bounds do not provide GC.

CLI specs are long option names with takes_value. Supports --name=value,
--name value, flags and -- terminator; unknown/duplicate/missing options fail.
A value beginning -- must use =. Other arguments, including -2, are positional.
Configuration lookups have no coercion; integer 1 is not Float64 1.0. find returns
Option for optional fields; callers choose defaults and use allow_only to reject
unknown fields.

Working application: [config-report](../apps/config-report/README.md).
Another verified application, [MeasureLab](../apps/measurelab/README.md), combines
Float64 statistics, JSON, atomic HTML output, tests and synchronous FFI. These are
application examples, not additional standard modules. In 0.7.0 there is no math
module/sqrt, fixed-precision Float64 formatter, generic JSON decoding/path-context
API or reusable text builder. Proposed additions are roadmap 0.8.7–0.8.10.
JSON array/number extraction uses exhaustive match; config.number accepts Number
only. Applications explicitly choose any Int conversion and preserve error causes
when adding field/index context; such a context API is not yet supplied by stdlib.
Tests: `vela test tests/stdlib/declarations.vela --json` in the compiler repository.
In an application, import vela-stdlib/testing.vela. Tables are Lists of Case<I,O>;
iterate explicitly and pass each case's name to assertions. equal uses scalar
equality (NaN is unequal); close accepts finite Float64 and nonnegative finite
absolute tolerance. Assertions abort only their current test process.
Contracts: [STDLIB](contracts/STDLIB.md), [TEXT-BYTES-PATH](contracts/TEXT-BYTES-PATH.md),
[NUMBERS](contracts/NUMBERS.md). Current OS validation is Windows x64/MSVC.
