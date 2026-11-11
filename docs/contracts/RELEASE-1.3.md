# Vela 1.3.0 release gate

Roadmap stage 1.3.6 depends on the accepted compiler audit in 1.3.5a.
The native distribution uses ordinary O2. Local MSVC and Alpine GCC builds
may explicitly select PGO, LTO or their documented combinations. Each shipped
mode must compile and execute its independent behavioral workloads. PGO
training, profile validation and native cache isolation follow the
[PGO contract](NATIVE-PGO-1.3.md) and [LTO contract](NATIVE-LTO-1.3.md).

The Windows x64 SDK includes the compiler, tools, sources, C recovery seed,
and application examples. FieldDesk and PulseDeck include their native GUI
dependencies. Native HTTP uses the audited ABI 1 DLL with pinned libcurl,
OpenSSL and c-ares, with license and dependency metadata. The explicit curl
path is exercised separately. The Linux x86-64 musl SDK delivers the static
compiler and console tools. The separate Node.js 24 MCP adapter targets the
matching Windows SDK and pins its compiler, documentation and API index.

Verify the archives in fresh Unicode paths with spaces. Compare each inventory
entry by byte count and SHA-256. Rebuild the standalone C seed and verify that
it emits the same canonical C. The Windows package must pass both fixed points
and the full native suite after recovery. On Linux, compare generated C bytes
across compiler generations and run console project and recovery checks. Verify
the SDK protocol with the separately extracted MCP adapter.

Repeat the functional oracles and ordinary runtime measurements against the
[1.3.1 budgets](PERFORMANCE-1.3.md) and compare the cumulative compiler changes
against the fixed 1.3.4d baseline. Record samples, time, CPU, whole-process-tree
memory, executable and archive sizes, and external dependencies. Run the
30-minute HTTP observation separately from ordinary timing and record socket
counts and process memory windows. Preserve the independently accepted 1.3.4e–l
measurements and identify any accepted exceptions explicitly.

The checkout itself requires a separate `vela-dev.cmd verify` for this stage.
Archive digests belong in the external release manifest and checksum file.
Record test results and platform scope in [1.3 validation](../VALIDATION-1.3.md)
before closing the stage.
