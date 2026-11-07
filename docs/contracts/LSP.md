# Native analysis service and LSP

`vela-lsp.cmd WORKSPACE` starts a persistent, single-workspace stdio session
with standard LSP Content-Length framing (UTF-8 JSON, at most 4 MiB per
message). It advertises UTF-16, full document synchronization, definition,
references, hover, rename, formatting, and publishes diagnostics for open
documents. A session can optionally use an explicit source/project analysis
root inside WORKSPACE to resolve references from other open files.

Open documents are keyed by local file URI and retain monotonically increasing
versions. The service snapshots those buffers for each request. The compiler
worker is disposable: a syntax error cannot terminate the service or produce
fake bindings. Workers are serialized, have bounded input/output and a deadline;
their outputs and overlay files are discarded after each request. A result
belongs to the captured versions; rename returns only versioned document
changes for open documents. Clients reject a change if a version has moved.

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
