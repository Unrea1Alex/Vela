# Windows integration probes (0.7.6)

These applications test the ABI 1 direction. They are not std/net or a portable
GUI framework. Windows x64, MSVC and the Windows SDK are required.

From the repository root run:

~~~powershell
.\vela.cmd run tools/prototypes.vela
node prototypes/windows/network-gate.mjs
.\build\stage07\prototypes\gui.exe
~~~

The first command builds two C adapter DLLs and two Vela executables under
build/stage07/prototypes. Only the optional local HTTP fixture uses Node.
The applications and compiler have no Node dependency. The network application
accepts PORT and PATH and connects only to 127.0.0.1. The GUI application owns
its counter in Vela, polls native events and explicitly closes its window handle.

Contracts and dependency rationale: [NETWORK](../../docs/contracts/NETWORK.md),
[GUI](../../docs/contracts/GUI.md), [FFI](../../docs/contracts/FFI.md).
No remote TLS, asynchronous cancellation, callbacks into Vela, layout framework
or non-Windows support is implied.
