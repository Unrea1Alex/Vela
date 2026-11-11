# Write a Vela application

Call `vela_get_context`, then fetch `capabilities` and the relevant `recipes`.
The context reports the installed version, exact compiler fingerprint and actual
execution availability. Read signatures from the generated API index or
`vela api MODULE --json`; builtins come from `vela api --builtins`.
For focused discovery use `vela_get_help(topic="api", query="directory metadata")`
or `name="std/directory:walk"`. Responses include version/fingerprint and a
next_offset when another page exists. Empty/unknown/ambiguous are explicit states.
For Vela 1.3.0, use the matching native SDK and MCP archive from
[release acceptance](VALIDATION-1.3.md).

```vela
import "vela-stdlib/algorithms.vela" as algorithms;
fn main() -> Int effects { io, state } {
    let values = list_new<Int>();
    list_push(values, 20);
    list_push(values, 22);
    let total = algorithms::fold(values, 0, fn [](sum: Int, value: Int) -> Int { return sum + value; });
    print(f"total={total:d}");
    return 0;
}
```

This executable example is [basics](../examples/recipes/basics.vela).
Use the [CLI recipe](../examples/recipes/cli.vela) for typed options, defaults,
inclusive integer bounds and generated help instead of repeating validation.
Use the [JSON schema recipe](../examples/recipes/json-schema.vela) for typed record
decoding, defaults and error paths before writing field/event conversion loops.
Use the [checked values recipe](../examples/recipes/checked-values.vela) to
validate text or paths once before repeated slicing, parent or join operations.
Use [config-snapshot](../examples/recipes/config-snapshot.vela) for repeated
reads from validated JSON configuration with isolated nested collections.
Use [file-publish](../examples/recipes/file-publish.vela) to report operation
and cleanup separately. The commit flag tells whether the destination was replaced.
Use [http-multi](../examples/recipes/http-multi.vela) for bounded Windows
HTTP/HTTPS with connection reuse. Stage the [native adapter](contracts/HTTP-MULTI-1.3.md)
beside the executable, then drain exchanges before closing the pool.
Create a project in a new directory (its parent must exist):

```powershell
SDK/vela.cmd init my_app --kind cli
# --kind library adds a public lib.vela and a runnable demo.
```

Native fallback, running from the generated directory:

```powershell
SDK/vela.cmd check vela.project
SDK/vela.cmd build vela.project -o app.exe
SDK/vela.cmd test vela.project --json
./app.exe
```

Use the installed `bin/vela` on Linux. `vela run main.vela` compiles and runs;
pass application arguments after `--`. A successful check does not execute tests.
For a manifest, pass the manifest, review dependency changes, then explicitly
refresh its lock with `vela lock vela.project`.

For repeated local checks, use `vela check ROOT --cache DIR --cache-report`.
The stderr analysis event reports checked declarations, checked bodies and
reused modules. This cache belongs to local CLI checks. LSP queries and MCP
snapshots continue to resolve the current source and overlays in full.
[Semantic cache contract](contracts/SEMANTIC-CACHE-1.3.md).

Use `vela emit-c ROOT --no-ir-simplify -o reference.c` to compare emitted C
with the checked scalar pass bypassed. The frontend checks all source bodies.
The C backend selects functions and layouts from the executable or test entry.

Local native PGO uses `pgo-instrument ROOT --profile DIR`, then
`pgo-train DIR -- ARGS`, then `build ROOT -o OUTPUT --pgo-profile DIR`.
Use a new directory for each training run and separate training and evaluation
inputs. See the [toolchain and profile contract](contracts/NATIVE-PGO-1.3.md).

Use `build ROOT -o OUTPUT --lto` for local link-time optimization. With GCC,
train and apply profiles with the same LTO setting. MSVC PGO already uses
LTCG. See the [native LTO contract](contracts/NATIVE-LTO-1.3.md).

MCP check/build/test accept a relative path and optional unsaved source text.
An overlay exists only in a private snapshot. Build returns artifact_id; run uses
that ID, which expires and becomes stale after workspace changes. With
execution=false, use the authorized CLI or record that execution was unperformed.
Do not treat an external handshake as discovery in the current client.

For a rejected query, use its native revision/document and MCP snapshot_id with
`vela_plan kind=diagnose`, or `vela plan ROOT REVISION DOCUMENT diagnose`.
Inspect the original explanation. Apply only validated, nonempty changes to the
same source/editor version; types and unsafe effects may require a manual edit.
The preview changes no source or dependency lock.

Match-expression arms contain expressions. Use a match statement for return or
multiple statements. `if`/`while` are statements. Effects, typed errors and explicit
closure captures are checked. `pub opaque` hides representation; it does not make
nested mutable collections immutable. Scope/defer provides structured cleanup;
handle close errors and drive cancellation to a terminal outcome.
When using [FFI](contracts/FFI.md), release each owned handle once and retire its
aliases together. A null returned by the DLL can be passed to that DLL.

[Capabilities](CAPABILITIES.md) · [Recipes](RECIPES.md) ·
[Language](LANGUAGE.md) · [Projects](PROJECTS.md) ·
[Historical guidance](AGENT-MIGRATION.md) · [Compatibility](COMPATIBILITY.md).
