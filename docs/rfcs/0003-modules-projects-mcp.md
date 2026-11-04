# RFC 0003: modules, projects and local MCP

Status: accepted architectural direction for 0.6; each dependent protocol contract
is completed before its implementation. Date: 2026-11-04.

The native compiler owns source loading, module names, privacy, type checking and
code generation. Modules use explicit file imports and pub declarations; the
[MODULES contract](../contracts/MODULES.md) defines cycles and source coordinates.
There is no implicit module execution. Separate source records preserve locations
even when text storage and AST/HIR tables are shared within a compilation.

The ordinary compiler project and autonomous recovery bundle are both required.
The bootstrap transition first builds a module-capable compiler from the old
bundle, then uses that compiler to build the authored module graph. Subsequent
generations use the same graph, while the Vela bundler remains reproducible.

0.6.3 adds a strict versioned manifest, explicit local dependencies and a content
lock. 0.6.4 unifies the public native CLI; 0.6.5 specifies resource/native-library
metadata without claiming public FFI. Those contracts must separate implemented
metadata validation from future linking semantics.

0.6.6–0.6.8 add an optional TypeScript/Node.js MCP host using the official SDK.
It serves matching documentation and launches the native compiler per request.
It cannot implement Vela parsing/checking/emission. Native tools and recovery do
not depend on this package. Execution tools and an unbounded native server loop
remain outside 0.6. Acceptance includes independent CLI parity, clean package
installation, actual clients and an agent unfamiliar with this conversation.
