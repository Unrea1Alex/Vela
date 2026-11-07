# Platform acceptance for 0.11

Each release report names the OS, architecture, compiler and checked
execution paths. Windows x64 with MSVC is the full native suite target.
It owns the Win32 GUI, ABI 1 DLLs, worker Jobs, fibers, curl HTTP/HTTPS
and the Winsock loopback server. Curl 8.4+ is an explicit application
dependency for real HTTP transfers. Local fixture CA verification does
not require modifying system trust.

Linux x86-64 with a C11 compiler is a separate compiler and console
runtime target. The acceptance environment is a fresh Alpine WSL2
instance with GCC and musl. Windows GUI, Windows FFI and the Windows
process and fiber adapters are outside that target. List only completed
Linux checks in the delivery report. Recovery from C and the console
smoke do not imply Linux support for the full Windows matrix.
