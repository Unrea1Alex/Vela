# Recovery seed

`velac.c` is the standalone C seed for Vela 1.1.0, emitted from the verified
compiler. Recovery and delivery results are recorded in [1.1 acceptance](../docs/VALIDATION-1.1.md).
It includes the runtime and embedded builtin catalog. It can restore the native
compiler without Python and without an older Vela executable.

From the project root in an x64 MSVC Developer Command Prompt:

```bat
if not exist bin mkdir bin
if not exist build\native mkdir build\native
cl /nologo /TC /std:c11 /utf-8 /O2 /fp:strict /MT /Fobuild\native\recovery.obj /Febin\velac.exe bootstrap\velac.c
bin\velac.exe build tools\dev.vela -o bin\vela-dev.exe
vela-dev.cmd verify
```

The ordinary workflow uses the delivered binaries and `vela-dev.cmd verify`.
Regenerate this seed only after a successful verification; the delivery manifest
records hashes of the seed, standalone Vela source and installed executables.
Compilation of this C seed is independently checked during delivery.
`scripts/verify-1.1-recovery.ps1` checks MSVC recovery and identical emitted C;
`-CleanVerify` runs the full native bootstrap/suite in an isolated delivered tree.

On the Linux console target, use the recovery source with a local C11 compiler.

```sh
cc -std=c11 -O2 -ffp-contract=off bootstrap/velac.c -lm -o velac
./velac --version
```

See the [platform matrix](../docs/contracts/PLATFORM-SUPPORT.md).
