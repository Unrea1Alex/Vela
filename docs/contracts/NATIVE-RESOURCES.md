# Native libraries and resources

For the current manifest and resource contract see [PACKAGING](PACKAGING.md).
The original stage 0.6.5 established a design boundary. The native-DLL subset
shipped in 0.7.0 and remains compatible. The 0.11 extension uses the same
format header for explicit Windows native metadata and distributed resources.

## Historical 0.7.0 baseline

Manifest header `vela-project|1` accepts `native|BASENAME.dll|relative/path.dll`.
The lock records the DLL byte SHA-256; build/run/test stage declared companions
beside the executable, refusing a conflicting destination. Check validates the
project and language declarations without executing the C compiler or native code.
See [PROJECT-FORMAT](PROJECT-FORMAT.md) and [FFI ABI 1](FFI.md) for exact rules.

The supported target is synchronous Windows x64/MSVC ABI 1. External signatures
are checked before C emission. String arguments are borrowed only for the call;
opaque ForeignHandle values require explicit close. Libraries remain loaded until
process exit. There are no retained callbacks or managed objects passed to C.
ABI/load/invalid-handle failures are located runtime errors, not C type checking;
ffi_load offers recoverable preflight. No arbitrary flags, build hooks, downloads
or native-source compilation are inferred from a manifest.

The 0.7.0 release supported the three-field row. The 0.11 format 1 extensions
are specified in the current packaging contract.

## Retained proposal beyond the implemented subset

The original design considered these records in a future format 2:

```text
native|name|target-triple|static-or-shared|relative-library-path|sha256
resource|name|relative-source-path|relative-distribution-path|sha256
```

These spellings are historical design inputs. The accepted 0.11 spellings
retain format 1, keep DLL metadata in its native row and hash resource contents
in the lock. 0.9.7 selected [raw literals](TEXT-LITERALS-RESOURCES.md) for
inline static text. Static linking and automatic embedding remain separate.

Retained requirements: unique names, SHA-256 of exact bytes, explicit target/ABI
and artifact kind where applicable, deterministic inventory, no shell/linker search
text or implicit downloads. Native/resource paths must be regular files within
declared roots. Reject symlink/identity escapes, destination traversal/collisions
and Windows case-folded collisions; hashes and relevant target metadata belong in
the lock. Include redistribution metadata in the delivery inventory.

The original resource design copied files atomically to a distribution root with
their relative layout and did not embed them into C. MeasureLab motivates comparing
declared text embedding with raw strings. The file-resource decision must
cover exact bytes/UTF-8/line endings, limits, diagnostic source locations, lock
changes, MCP snapshots and locating resources independently of the caller's cwd.
No resource mechanism is implemented by documenting these alternatives.

Ownership and rooting use [lexical cleanup](RESOURCES.md) and [foreign roots](FFI-ROOTS.md).
DLLs remain loaded until process teardown. See [callbacks](CALLBACKS.md) for
registered callable lifetime.

## Acceptance ownership

The implemented DLL subset passed the 0.7.5 focused/native gate and final
[0.7.0 acceptance](../VALIDATION-0.7.md). It does not prove resource packaging.

0.11.6 must cover changed hashes, invalid/missing/wrong-target artifacts,
Unicode paths, duplicate destinations, traversal, deterministic distribution and
a packaged resource read with independently specified output after relocation.
0.8.4–0.8.5 cover handle lifetime/rooting and the explicit unload decision;
0.10.9 covers callback lifetime/cancellation. Record unimplemented scope explicitly.
