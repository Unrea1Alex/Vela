# Native analysis service and LSP

`vela-lsp.cmd WORKSPACE` starts a persistent, single-workspace stdio session
with standard LSP Content-Length framing (UTF-8 JSON, at most 4 MiB per
message). It advertises UTF-16, full document synchronization, definition,
references, hover, rename, formatting, diagnostic code actions, and publishes diagnostics for open
documents. A session can optionally use an explicit source/project analysis
root inside WORKSPACE to resolve references from other open files.

Open documents are keyed by local file URI and retain monotonically increasing
versions. The service snapshots those buffers for each request. The compiler
worker is disposable: a syntax error cannot terminate the service or produce
fake bindings. Workers are serialized, have bounded input/output and a deadline;
their outputs and overlay files are discarded after each request. A result
belongs to the captured versions; rename returns only versioned document
changes for open documents. Clients reject a change if a version has moved.

In 1.2, serverInfo.version comes from the supplied native compiler. Diagnostics
retain native expected/actual/effect explanation in data and native related
locations in relatedInformation. textDocument/codeAction requests the same
checked diagnose plan as CLI/MCP, filters the requested range, and returns
versioned documentChanges only for validated corrections to open documents.
Ambiguous/explanation-only cases return no edit. [Diagnostic plans](DIAGNOSTIC-PLANS-1.2.md).
Worker infrastructure failures are logged to stderr with their failing stage.
Windows staging retries bounded directory-creation collisions across workers.

Requests execute in stream order. Cancellation notifications have no reply;
a synchronous worker already executing can finish before the notification is
read. Clients discard cancelled results. This first service does not implement
background analysis, incremental synchronization or concurrent workers.

The runtime provides bounded binary stdin reads as an OS primitive.
`read_stdin(limit, line)` returns a `ReadResult`: in exact mode it reads exactly
limit bytes; in line mode it reads through the first LF, included, within the
limit. Truncated input is an error. On a limit/truncation the caller must stop
processing the stream. Neither mode interprets bytes as Unicode or parses
protocols; the Vela service validates the framing and JSON.
