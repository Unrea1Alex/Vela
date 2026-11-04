# Working on MeasureLab

This is an application for the released Vela 0.7 toolchain, not a compiler change.
Read README.md for schema, bounds, statistics and exit-code contracts.
Use the installed vela-app skill and matching MCP context/help where available.
Check/build/test **vela.project**, never infer dependency aliases from main.vela.

Calculations, validation and rendering belong in authored .vela modules. The C
adapter only exposes sqrt through ABI 1. Do not add networking, retained borrowed
pointers or implicit shell commands. Review any changed native code before updating
the project lock or the MCP execution.native_allowlist SHA-256.

From the Vela repository root: `vela.cmd check apps/measurelab/vela.project`,
`vela.cmd test apps/measurelab/vela.project --json`. `build.ps1` builds the adapter
and application; `verify.ps1` exercises the CLI and preservation of input/output.
Update app documentation and VALIDATION.json with actual checks. Keep demo data
explicitly synthetic; these samples are not measurements of the Vela compiler.
Never package machine-specific .codex connection paths or temporary build trees.
