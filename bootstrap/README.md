# Recovery seed

`velac.c` is the verified standalone C emitted from the current compiler source.
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
