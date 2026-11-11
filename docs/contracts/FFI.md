# C FFI ABI 1 and memory transition — 0.7.4 contract

Status: implemented in stage 0.7.5 and included in the local Vela 0.7.0 release.
Stage gate: 33/33 focused checks and 974/974 aggregate without skips, three compiler
generations and both fixed points: build/stage07/075-focused.log and 075-verify.log.
Final release acceptance: [Vela 0.7.0](../VALIDATION-0.7.md). Other platforms remain unverified.
Supported execution target: Windows x64/MSVC C ABI. Other architectures/platforms
are unverified and must reject unsupported foreign execution explicitly.

## Declaration and trust boundary

Implemented syntax:

```text
extern "adapter.dll" fn measure(value: Float64) -> Float64 effects { process, state };
pub extern "adapter.dll" fn open_resource(name: String) -> ForeignHandle effects { io, process, state };
```

extern is contextual at module scope. Symbols use the Vela function name and
must be ordinary ASCII C identifiers. Library names contain ASCII letters, digits,
underscore or hyphen followed by .dll, total 5..128 bytes.
No inline C, variadics, C++ objects/exceptions, custom calling convention, generics,
contracts or arbitrary pointer casts. Up to 16 parameters. From dev.9,
registered callback handles can cross the boundary as input parameters.
Every foreign declaration requires process and state; io is additionally declared
when the external operation performs I/O. Callers inherit these effects normally.
Effects describe behavior; they grant no OS permission.
The runtime saves/restores the floating-point environment around DLL loading,
ABI probing, calls and destructors so a returning foreign call cannot change
Vela's rounding mode. C exceptions/longjmp across Vela frames are forbidden.

The compiler validates declarations and Vela arguments before lowering. It cannot
prove a DLL matches its declaration or obeys borrowing rules. A wrong or malicious
C library can corrupt its process; this is an explicit trusted boundary. Library
status/error codes are converted to typed Result by a Vela wrapper. ABI/loading/
invalid-handle violations stop execution with a located runtime error (70).
ffi_load provides a recoverable preflight for missing/incompatible libraries.
Capture errno/GetLastError inside the C adapter and return it explicitly; their
values are not promised across separate Vela calls or loader/runtime operations.

## Supported layout

| Vela type | C ABI type | Size/alignment on Windows x64 |
|---|---|---|
| Int | int64_t | 8/8 |
| Int32 (FFI carrier) | int32_t | 4/4 |
| Float64 | double (IEEE binary64) | 8/8 |
| Bool | int32_t restricted to 0/1 | 4/4 |
| String parameter only | VelaBytes { const char *data; uint64_t length; } | 16/8, fields at 0 and 8 |
| ForeignHandle | void * externally; checked metadata handle inside Vela | pointer 8/8 |
| CallbackHandle parameter only | const VelaCallback * | pointer 8/8 |
| Unit result only | void | no value |

The generated C prototype, not hand-written assembly, performs the platform's
register/stack/aggregate passing rules. In particular a 16-byte aggregate has
platform-specific argument handling. See Microsoft's [x64 calling convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention).
The public companion header vela/ffi.h defines ABI version 1 and static
size/offset assertions. Libraries must export int32_t vela_ffi_abi_version(void)
returning 1 before any application symbol is called. Existing libraries use a
small conforming C adapter when they do not expose this entry point/layout.

Int32 is constructed through int32_from_int returning Int32Result; out-of-range
input is rejected, never truncated. int32_to_int widens exactly. Int32 initially
has no arithmetic, implicit conversions or dictionary-key support; widen before
ordinary arithmetic. Bool results other than 0/1 are rejected at runtime.
All structs/enums/lists/dicts/distinct wrappers are rejected at the FFI boundary.
No returned String or returned pointer/length pair is accepted in this slice.

## Lifetime and ownership

String storage is borrowed read-only through the end of the synchronous call;
length includes embedded NUL and is in bytes, no trailing NUL/UTF-8 guarantee.
C must not mutate, free or retain it. For a char* API, the adapter validates and
makes its own terminated copy. Allocating/retaining pointers to Vela storage,
callbacks into Vela and passing Vela heap objects to C are forbidden in 0.7.

ForeignHandle is opaque and cannot be fabricated from an integer. It carries
the originating library and a shared live/closed flag; copying aliases that flag.
A foreign returned null is allowed and can be queried with ffi_is_null.
The runtime rejects a retired handle before passing arguments to the target
symbol, including a runtime owner whose native pointer was cleared at close.
A live non-null handle must belong to the target library.
ffi_close(handle, destructor_name) resolves a void(void*) destructor in that same
library, calls it once, then invalidates all aliases. Repeated close is a typed
error. Closing a genuine foreign null is a no-op. The adapter must supply a
destructor of precisely that signature and leave owned input handles for the
caller to release through ffi_close. The adapter is responsible for this
lifetime contract.

Wrapper metadata uses the managed heap in 0.8. Libraries stay loaded
until process exit; no unload is allowed while handles/functions could reference
them. Unclosed native resources are not silently finalized by GC or by an inferred
destructor. Explicit close is required; process teardown provides only OS cleanup.

Generated roots hold borrowed managed arguments across synchronous calls.
Collection runs at Vela safepoints and keeps addresses stable. Resource scopes
support deterministic close. The [callback contract](CALLBACKS.md) defines
registration, thread checks and cancellation from dev.9. ABI 1 extern
values contain no GC header.

## Loading, projects and delivery

A library is loaded from the executable's own directory using its full path.
The loader does not fall back to current directory or PATH. DLL dependencies use
that directory and System32 only via [LoadLibraryExW search flags](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw).
This narrows resolution; it does not authenticate the native code.

The 0.7.5 manifest extension is native|BASENAME.dll|relative/path.dll. Entries are
local, explicit and included in vela.project.lock with byte SHA-256. No downloads,
native source compilation or arbitrary linker flags are inferred. build/run/test
stage only these declared files next to their executable. Existing differing
destination DLLs are rejected rather than overwritten; use a clean output directory.
Standalone build can use a manually supplied companion beside its output, but
run/test with native dependencies should use a manifest. Copying identical bytes
is allowed; native inputs must never be overwritten by output publication.

MCP execution separately decides which native dependencies are allowed. An ABI
version check or a Vela effect is not a sandbox. Build/test/run must not acquire
unrestricted native execution merely because this language feature exists.

## Acceptance for 0.7.5

Own C DLL with verified ABI tag, sizes/offsets, int32 edges, Int64/Float64/mixed
argument and >4-argument calls, Bool validation, Unicode/NUL byte slices and void
results. Test missing DLL/symbol/wrong ABI, checked narrowing failures, null/live/
closed/aliased/wrong-owner handles, explicit destructor exactly once and source
locations. Reject generics/aggregates/returned strings/unknown effects before C.
Test native manifest lock changes, staging, dependency resolution from a different
cwd, refusing conflicting outputs and source preservation. Native verify plus
three compiler generations; no GUI/TLS/Node/Python build dependency.
### Explicit collector roots in 0.8

`ffi_retain` and `ffi_release` register and remove a root for live handle
metadata. Successful close invalidates aliases and drops the root. These
operations leave the DLL ABI and borrowed byte lifetime unchanged. See the
[foreign root contract](FFI-ROOTS.md) and [lexical cleanup](RESOURCES.md).
