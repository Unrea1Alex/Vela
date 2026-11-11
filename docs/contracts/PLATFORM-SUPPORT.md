# Platform acceptance

Each release report names the OS, architecture, compiler and checked
execution paths. Windows x64 with MSVC is the full native suite target.
It covers Win32 GUI, ABI 1 DLLs, worker Jobs, fibers, native HTTP/HTTPS
and the Winsock loopback server. The Windows 1.3 HTTP applications ship
`vela-http.dll` with pinned libcurl, TLS and resolver dependencies.
The explicit legacy curl transport requires a curl 8.4+ executable.
Local fixture CA verification uses an explicit CA file.

Linux x86-64 with GCC and musl is a separate compiler and console runtime
target. The acceptance environment is Alpine on WSL2. Windows GUI, DLL FFI,
worker Jobs, fibers and the HTTP adapters belong to the Windows matrix.
See [1.3 release acceptance](../VALIDATION-1.3.md) for executed checks.
