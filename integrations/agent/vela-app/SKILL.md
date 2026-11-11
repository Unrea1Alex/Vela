---
name: vela-app
description: Write and verify Vela applications with the matching installed native SDK.
---
Call vela_get_context first. Use vela_get_help for capabilities and recipes before
inventing an API. Native `vela init NEW_DIRECTORY --kind cli|library` scaffolds a
checked project; fetch quickstart for details. Import the installed vela-stdlib modules explicitly. Keep all
sources and dependencies inside the configured workspace. Check each small step;
record actual tests separately from successful compilation. If execution=false,
use the authorized native CLI. Never change global settings or fingerprints to
repair discovery. Source edits and dependency relocks need review. For rejected queries, plan kind=diagnose explains errors.
Only validated nonempty changes are checked previews. Drain cancelled work
before closing owned resources. Details are fetched on demand; older-version
instructions belong to migration help.
Use the matching native SDK and MCP adapter. The context reports the installed
version and compiler fingerprint.
For repeated UTF-8 or path reads, use the checked-values recipe if the installed
SDK exposes it.
For repeated configuration lookup, use config-snapshot when available.
For file publication, use the file-publish recipe when available and report
the operation error, cleanup failures and commit flag separately.
For Windows HTTP/HTTPS, use curl_multi when available, stage its sibling
vela-http.dll, and keep one owner across exchanges. Cancel and drain pending
work, release exchanges, then call close_multi. Legacy process transports are
explicit compatibility choices.
For FFI, close each owned handle once and retire all its aliases. The FFI
contract describes nullable DLL returns and repeated-close errors.
Use `vela check ROOT --cache DIR --cache-report` for repeated local checks.
The semantic event reports declarations and bodies checked and modules reused.
MCP checks analyze the current snapshot, including unsaved dependency text.
For a generated-C comparison, use the native `emit-c --no-ir-simplify` mode.
It keeps full Vela checking and bypasses the checked scalar simplifier.
The C backend still selects functions and layouts from the executable or test entry.
Local PGO is explicit and uses `pgo-instrument`, `pgo-train` and
`build --pgo-profile`. Use a fresh profile directory and separate training
and evaluation inputs. MCP native execution supports ordinary O2 builds.
Local `build --lto` selects link-time optimization. For GCC PGO with LTO,
use `--lto` at instrumentation and final build. MSVC PGO already uses LTCG.
