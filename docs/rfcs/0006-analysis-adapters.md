# RFC 0006: keep the SDK adapter for MCP

Status: accepted for 0.9.

The compiler owns semantic queries and refactoring checks. CLI and the
native LSP worker run the same entry points as the MCP adapter. The latter
continues to run a separately pinned compiler process on a bounded snapshot.

The native LSP proves that Vela can retain editor versions and frame stdio
without Node.js. That option has fewer dependencies for an editor, and a
disposable checker limits the lifetime of its memory and file handles.
It implements LSP, so its latency and memory measurements are a native
transport baseline rather than an equivalent MCP benchmark.

The existing MCP server uses the official SDK and already has protocol
negotiation, cancellation, schema checks, workspace capture, version pins,
Windows job isolation and client setup. A native MCP candidate would need
to reproduce all those behaviors and pass the same SDK and fault gates.
The extra semantic tools do not introduce duplicate compiler logic in
TypeScript. Keep the external adapter; revisit the transport if measurements
or deployment constraints justify a complete comparison on equivalent jobs.

Measurements and checked protocol scenarios are recorded in the
[0.9 validation report](../VALIDATION-0.9.md).
