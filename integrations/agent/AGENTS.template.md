# Vela application

This is an application project. Use the installed Vela toolchain; do not rebuild
the compiler or copy its internal modules into the app.

Before writing Vela, call vela_get_context and read relevant help through
vela_get_help (or the matching installed docs/AGENT-QUICKSTART.md and builtin
catalog if MCP is unavailable). Check the toolchain fingerprint. Do not invent
APIs or infer semantics from another language. Keep a small compilable example.

Use vela_check after edits. If context advertises execution, use vela_build,
vela_test and vela_run with the issued artifact_id; otherwise use the host CLI
when authorized. Add tests with explicit expected behavior and
report exactly which checks ran. Use the documented tracing heap and
explicit effects. Use a manifest and explicit imports for multi-file projects.
An MCP artifact_id identifies the built executable. For a generated file, request
its name in vela_run outputs, write it to ../export/NAME inside the run, then read
the output_id, check the hash and explicitly save it through the host.
Roadmap proposals are not available syntax or library functions.
