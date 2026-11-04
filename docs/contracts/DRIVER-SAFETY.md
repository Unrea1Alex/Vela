# Driver safety and file identity

Status: accepted, 2026-11-04. Implementation/validation tracked in ROADMAP.md.

`file_identity(path: String) -> StringResult effects { io }` queries the OS.
An existing file returns an opaque, nonempty identity (Windows volume/file index;
POSIX device/inode). Aliases of the same file return the same value, including
Unicode case aliases on case-insensitive filesystems, hard links and symlinks.
A missing path returns `Ok("")`. Other failures, including NUL in a path, return
`Err`; handles are closed before returning. Identities are not stable persistent
IDs and cannot protect against concurrent replacement of filesystem entries.
Strings use the existing process region; this adds no ownership mechanism.

Before publishing C or an executable, the driver rejects output identifying the
input file, with exit 2 and no changes to either file. Failure to query identity
also prevents publication. The existing textual check remains an early check.
Ordinary new output paths remain valid.

A failed C toolchain invocation produces driver exit 2. Only after successful
compilation may `run` return the user program's exit code. Old output remains
intact on frontend, toolchain or publication failure.

Acceptance: native identity same/missing/different/NUL scenarios; source
preservation for Unicode aliases in build and emit-c on Windows; synthetic C
compiler exits 1 and 17 both become 2; successful run still returns 17; full
native verify. POSIX implementation is not platform-verified by Windows tests.
