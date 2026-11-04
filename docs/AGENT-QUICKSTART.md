# Write an application in Vela 0.7.0

First call vela_get_context, then vela_get_help for the relevant topic. The native
compiler and the shipped builtin catalog are the authority. Run vela_check after
each small change; inspect diagnostic codes, source and spans. Do not guess APIs
from Rust, Python or TypeScript. Read execution capabilities from vela_get_context.

If your editor/agent cannot write files, pass unsaved code as optional `text` to
vela_check, vela_format or vela_symbols along with a relative source `path`.
The adapter overlays this one file only inside its temporary snapshot, including
a new file; it never writes the workspace. Return the checked source to the host
for saving. A text overlay is source code, not a project manifest replacement.
For a project, use `path="vela.project"`, `overlay_path="main.vela"`, and `text`
with the draft source; native dependency aliases and locks remain active.
When execution is enabled, use vela_build/vela_test with the same snapshot inputs,
then vela_run with the returned artifact_id. A changed workspace needs a new build.
Runs have a private working directory and no network access. Otherwise use the
host's authorized native CLI or report that execution was not performed.
The project AGENTS.md template applies to applications, not to
the compiler repository's development process.

```
fn main() -> Int effects { io, state } {
    let values = list_new<Int>();
    list_push(values, 20);
    list_push(values, 22);
    var total = 0;
    for value in values { total = total + value; }
    print(f"total={total:d}");
    return 0;
}
```

Use let for immutable bindings, var for assignment. Parameters and return types
are explicit; statements end in semicolons. Types: Int (checked signed 64-bit),
Bool, String, Unit, nominal struct/enum/distinct types, List<T>, Dict<K,V>,
Option<T>, Result<T,E>. Float64 supports explicit numeric conversions (see NUMBERS).
Synchronous Windows x64 FFI ABI 1 adds Int32 and ForeignHandle; see help topic ffi.
There are no closures, methods, arrays, GC, async or general network/GUI library.
Functions have named effects:
io, args, process, state. Collection reads and writes both require state.
Strings are immutable bytes; str_len/str_byte/str_slice use UTF-8 byte offsets,
not Unicode character indices. Diagnostics use Unicode code points instead.
All dynamic allocations live to process exit. Never claim long-lived memory
reclamation or static proof of requires/ensures: contracts are runtime checks.

Records: `struct Point { x: Int, y: Int }`, construct `Point(x: 1, y: 2)`.
Generics: `fn id<T>(x: T) -> T { return x; }`. Containers use free builtins,
e.g. list_push(items, value), dict_set(map, key, value), dict_get_or(map,key,default).
Use match on variants; no arbitrary type casts or nullable references.
Every enum variant needs a branch; `_` may ignore a variant field, but cannot
replace a whole variant. Statement match branches contain blocks. Expression
match branches contain expressions, not blocks with return statements.

```
fn number(text: String) -> Result<Int, String> {
    return match parse_int(text) {
        IntResult::Ok(n) => Result<Int, String>::Ok(n),
        IntResult::Err(message) => Result<Int, String>::Err(message)
    };
}
fn doubled(text: String) -> Result<Int, String> {
    let n = number(text)?;
    return Result<Int, String>::Ok(n * 2);
}
```

read_file/arg return StringResult, write_file returns WriteResult, parse_int
returns IntResult (legacy builtins). Match them explicitly to convert to generic
Result before using `?`; `?` requires compatible Result/Option return context.
`result` is reserved for postconditions and cannot be a local binding name.
print adds newline; write_stdout preserves bytes. Read actual signatures with
vela_get_help(topic="builtins") before using unfamiliar operations.

Imports: `import "math.vela" as math;`, then math::twice(21). Exports require
`pub fn twice(n: Int) -> Int { return n * 2; }`. Imports precede declarations;
open imports are allowed, ambiguity/private API are rejected. Cycles are allowed.
For projects use explicit vela.project: header vela-project|1, name|app,
entry|main.vela; optional test|smoke.vela and dep|math|../math/lib.vela.
Dependency imports use "@math". Run `vela lock vela.project` after reviewing
dependencies. Check/build requires an unchanged lock. Do not invent package
install, registry, filesystem iteration or module auto-discovery commands.

When a manifest exists, check its path, not just main.vela: aliases are only loaded
from the explicitly supplied manifest. E221 on a plain file can mean the manifest
was omitted. Entry/test paths stay inside the project directory; dependencies may
be siblings under the same MCP workspace. Accepted formatting of a dependency changes
its content hash too: review the diff and explicitly refresh the lock.
Check/symbols currently require an application root with main or root-level named
tests. To inspect a library without either, pass the importing application root;
checking the library alone produces E207.

Model finite states with an enum when exhaustive handling prevents forgotten cases;
use distinct IDs when two scalar identifiers must not be interchangeable. Generic
helpers are useful for shared behavior across types; they are not required everywhere.
An executable example combining these choices, Result propagation, contracts and
interpolation is [agent-idioms](../examples/agent-idioms/main.vela), also available
through vela_get_help(topic="idioms").

CLI: `vela check main.vela --json`, `vela build main.vela -o app.exe`,
`vela run main.vela -- args`, `vela fmt main.vela --check`,
`vela test vela.project --json`. `vela_format` returns text for review; it never
overwrites the source. Compiler errors are exit 1; toolchain failures 2; runtime
panic 70. Checked examples are in examples/agent-starter.

In 0.7.0, retrieve help topic stdlib before implementing JSON,
text validation, filesystem updates, process calls or command-line parsing.
Setup copies matching modules into vela-stdlib/ inside the application workspace.
Use explicit imports or manifest aliases and locks. New library functions use
Result<T, module::Error>; legacy builtins retain their old result enums.
Float64's precise rules are in help topic numbers; it needs explicit Int conversions.

Version 0.7.0 has `test "name" effects { state } { ... }`, assert_true and
std/testing.vela (installed into vela-stdlib/testing.vela). Read help topic testing. `vela test FILE --json` runs each
entry-module declaration in its own process and produces report schema 2. The
MCP execution is optional: check capabilities before choosing isolated tools or
the authorized native CLI. Test-only files use vela_test, not vela_build.

For synchronous native integration, read help topic ffi. Version 0.7.0 supports
explicit ABI 1 DLL declarations on Windows x64/MSVC, checked Int32 and opaque
ForeignHandle. Use a trusted adapter and native manifest entries with a reviewed
lock. Never guess a C signature or retain borrowed String storage. Network/GUI
application frameworks, callbacks and GC are still separate roadmap work.

Limited Windows HTTP/GUI integration probes live in prototypes/windows; see its
README and docs/contracts/NETWORK.md and GUI.md. They use explicit ABI 1 adapters.
Their local HTTP and counter-window checks do not establish remote TLS, async
networking or a supported portable application framework.

Current limits matter when generating applications: there is no std.math/sqrt,
precision parameter for Float64 display, multiline/raw literal or general resource
embedding API. JSON extraction currently uses match or config lookups; config.number
requires Number, so accept Integer only through an explicit application conversion.
String remains bytes; Text operations return validated wrappers and typed errors.
MCP artifact_id identifies a built executable, not a downloadable generated file.
There is no output-file retrieval tool; use the authorized native CLI for a saved
HTML/report. Follow the actual capabilities, not future roadmap proposals.
