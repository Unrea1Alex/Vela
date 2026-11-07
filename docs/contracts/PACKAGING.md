# Packaging and relocated resources, 0.11.6

1.0 acceptance correction: Windows canonical paths normally use normalized DOS
names. If an already opened, type-checked handle cannot query that name with
ERROR_ACCESS_DENIED (AppContainer Mount Manager restriction), query its normalized
NT name and return the Win32 `\\?\GLOBALROOT` form. This still resolves the actual
opened object; never substitute lexical input paths or expand sandbox permissions.
The returned path must reopen the same object. Other errors remain failures.
Source containment and destination alias checks compare the resolved namespace
consistently and still reject reparse escapes. No ABI, ownership or budget changes.
API flags and resolved-path semantics: [GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew).

Manifest format 1 retains `native|BASENAME.dll|SOURCE`. It also accepts
`native|BASENAME.dll|SOURCE|windows-x64|1|shared` for an explicit Windows
ABI 1 companion, and `resource|assets/DESTINATION|SOURCE` for a distribution
file. A legacy native row retains its existing lock shape. Explicit native
metadata and each resource's source, destination and exact-byte digest
appear in the lock. Static libraries and a format 2 header require a
separate toolchain contract.

New source entries resolve to regular files inside the project directory.
The source name can be Unicode. A resource destination is a portable
ASCII relative path under `assets/`. Reject empty, traversal and device
components, trailing dots, case collisions and file/directory prefix
collisions. The native adapter name remains a DLL basename. An explicit
native declaration validates the host target, PE x64 DLL header and
declared ABI. The FFI loader verifies the actual ABI export at runtime.

Build, run and test stage resources next to the executable. For explicit
artifacts, the driver uses the locked byte snapshot. It checks all existing destinations before
publishing. Each companion is published without replacing differing bytes.
An already identical file may be shared. An existing destination that
resolves outside the package or through an alias is rejected. A failed
build preserves existing executable and companion bytes. Files published
before an independent I/O failure can be reused by a retry.
Run and test clean their private artifact directories after use.

`executable_path()` has the `io` effect and returns the OS path of the
running image as UTF-8. It does not search PATH or interpret argv[0].
`std/path::executable` returns a checked Path and `resource_base` returns
its parent. Windows uses the module image path. Linux uses procfs and
reports an error when the path is unavailable. The resource base is the
same when the working directory or invocation spelling changes.

The native packaging gate records SHA-256 and size for released files,
preserves redistribution notices and exercises a clean relocation with
Unicode and spaces. Linux must compile the C recovery seed, rebuild a
native generation and execute a relocated resource fixture. Windows must
exercise the native suite, GUI/network and relocatable packages. Record
each exact platform and any unperformed clean-machine or DPI check.
See [platform support](PLATFORM-SUPPORT.md).
