# Source-tree cleanup after 1.0

Status: verified on 2026-11-07, requested after the release. This is source-tree maintenance,
not a replacement of the published 1.0.0 release or a language change.

## Contract and scope

Remove the historical Python 0.2 implementation, reference tests, wrappers and
packaging metadata. Remove obsolete generated build/staging/toolchain copies,
old example executables, Python wheels/caches and unused prototype DLLs.
Keep authored native sources/tests, the active builtin/runtime/FFI inputs,
bootstrap tools and C recovery seed, runnable app assets, historical release
archives/evidence, MCP dependencies and the registered WSL Linux environment.

Preserve `build/native/stage3.c`, `build/gui-notes/notes.exe` and
`build/gui-notes/vela-gui.dll`: the current Windows packaging script reads them.
Preserve `build/stage1040/linux-distro` and its WSL registration `VelaRelease100`.
The old root MCP execution cache has a stale compiler fingerprint; prepare a
fresh matching cache after the native gate. Never edit hashes to bypass a mismatch.

The removed Python API implemented historical 0.2, outside the stable 1.x native
CLI. No compiler algorithms, syntax, runtime semantics or ABI are changed.
The stable source snapshot refresh covers explanatory docs only; unchanged native
inputs must retain their original hashes. Published archives are not regenerated.

## Acceptance

- No authored Python source/entry point/packaging metadata remains in the live tree.
- Current instructions and examples use native commands; local Markdown links resolve.
- Resolved deletion paths stay within the workspace and exclude protected inputs/WSL.
- Rebuild three compiler generations, verify C/bundler fixed points and run the full native suite without skips.
- Recover from the retained C seed and compare emitted C with the rebuilt compiler.
- Check stable contracts and matching MCP documentation/compiler fingerprints; run MCP regression/execution gates.
- Verify retained WSL registration/disk, native runtime/catalog/FFI inputs, runnable app assets and release archives.

## Results

- Removed 24 Python source files, the old entry point and packaging metadata.
  Removed 123061 obsolete files in 365 checked targets (10170567480 bytes), plus
  four reviewed test junctions. All deletion paths stayed under `G:/Vela`.
- Preserved six native source/bootstrap inputs byte-for-byte, all 46 non-wheel
  release files, runnable application assets and the WSL disk/registration.
  Python wheels and unpacked duplicate distributions were removed; release ZIPs,
  tarballs and their historical evidence were retained. Small historical logs
  were consolidated under `build/cleanup-1.0/historical-logs/`.
- `vela-dev.cmd verify`: 1214 passed, 0 failed, 0 skipped; three compiler generations
  and both byte-for-byte C/bundler fixed points. All five native tools were rebuilt
  and installed. The retained recovery seed emits the same C as the new compiler.
- C recovery compiled with MSVC, checked the agent-idioms example and matched
  `build/native/stage3.c`. This was the recovery comparison gate, not a second
  clean-tree 1214-test run.
- Stable contract: 84 files and two negative checks passed. Only four explanatory
  document fingerprints changed; language, stdlib, builtin/FFI inputs and formats
  are unchanged. Matching MCP fingerprints were refreshed after native/docs checks.
- MCP TypeScript build and all five SDK regression groups passed, including 1000
  requests, 25 cancellations, setup/skill installation and protocol lifecycle.
  A fresh 3219-file execution cache matches the rebuilt compiler. Execution SDK:
  26 checks; OS isolation: 26; failure handling: 11; output artifacts: 22; all passed.
- LSP base/method/interface gates each passed 200 requests; callable hover/rename
  and excluded test-root scope gates also passed, without changing sources.
- Windows/MCP packaging `-StageOnly` passed with matching fingerprints. Duplicate
  smoke staging was removed after its manifests were saved in the audit directory.
- Current documentation links/content checks and skill frontmatter validation passed.
  The main temporary directories shrank by about 9.19 GB after rebuilding and
  recreating the required MCP cache (`build/`: about 1.37 GB, including WSL).

The [machine-readable report](cleanup-evidence.json) records the actual counts and
hashes. Detailed deletion inventory and current gate logs are under
`build/cleanup-1.0/`; historical release validation reports remain unchanged.

Not repeated for this maintenance change: a Linux rebuild, interactive GUI/DPI
checks, a fresh OS installation or an external agent's client workflow. The WSL
environment was preserved without booting it; native sources/runtime are unchanged.
Published archives and GitHub were not modified.
