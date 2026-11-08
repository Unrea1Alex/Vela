# Diagnostic explanations and checked previews — 1.2.8

Accepted before implementation. The existing rename/format protocols remain.
`vela plan ROOT REVISION DOCUMENT diagnose [--overlay SOURCE CONTENT_FILE]`
handles the first native diagnostic in the selected document. Failed native
JSON analyses add a deterministic source-graph revision, document inventory,
UTF-16/byte range and an explanation beside existing codes/details/related spans.
Manifest E225 uses its normalized text and document 0. Source revisions retain
the existing fixed-width SHA-256 composition and snapshot-mount independence.
The plan verifies that exact revision before any proposed change; a stale
revision/document rejects with E231. No recovered invalid IR reaches a backend.

Explanations distinguish project fields/names, missing qualified imports,
expected/actual types and missing effects, with the original diagnostic as the
root cause and existing related declaration locations. Other diagnostics keep
their message with general guidance; this is not an assertion of auto-repair.

Bounded concrete proposals:

* Invalid project names use the existing deterministic project_suggest_name
  normalization. A one-character field misspelling may replace a key only when
  exactly one schema key matches. Duplicates/malformed/ambiguous keys are not
  deleted or guessed. A required dependency relock is never performed implicitly.
* An unknown qualified alias may import its exact ASCII-named sibling .vela or
  matching vela-stdlib module only when exactly one candidate exists. Unknown
  bare names, multiple files, conflicting aliases and non-public members have
  explanations or a rejected preview, not a guessed binding.
  A qualifier that already resolved to a type (including a builtin or generic
  parameter) is never reinterpreted as an import. E200 Unknown enum is therefore
  explanation-only; E200 Unknown type can identify a missing qualifier.
* E209 may add only missing args/io/state to a private ordinary root main with
  no parameters and an Int/Unit result. Public/generic/async functions, callable
  effect contracts and any process expansion require an explicit user edit.
* E201 always explains expected/actual; choosing a new type versus a new value
  is ambiguous. It does not insert casts, change return types or coerce literals.

Every concrete candidate is rechecked by the same native compiler in an owned
temporary overlay. Query's validate-only mode emits no code; manifest overlays
go through the same project parser and lock checks. Existing overlays are kept,
source writes/lock updates/builds never happen. A failed preview returns the
original explanation with no changes. Bounded child analysis uses 15 seconds,
the existing frontend/overlay limits and explicit temporary-file cleanup. Compiler
algorithms remain Vela; Node/LSP only transport native requests and results.

A handled diagnostic plan has ok=true, original diagnostics/explanations,
validated boolean and changes. Only a nonempty changes array with validated=true
is an actionable preview. Explanation-only is successful protocol handling,
not successful compilation. Clients must recheck original bytes/editor versions
again before applying. LSP code actions use versioned documentChanges and native
ranges; MCP adds diagnose to vela_plan without removing old forms. CLI/LSP/MCP
share native explanation/edits, including Unicode and multi-file coordinates.

Manifest diagnostics capture at most the existing 1 MiB text budget. An oversized
manifest retains an empty diagnostic context and cannot receive a correction;
the renderer does not build a line table for its rejected excess bytes.

Worker staging uses the existing temp_dir primitive. On Windows, a filename
reservation must be deleted before exclusive directory creation; another worker
can occupy that gap. Retry up to 32 collisions/delete-pending access failures,
preserving the old path limit and error ABI. After the reservation is deleted,
never delete a rival's path; return only a directory this call created. Genuine
failure still rejects the worker. No sleep, shared directory or unbounded retry.

Acceptance: positive name/key/import/private-main fixes; type explanations;
ambiguous imports, alias conflict, public/process effect expansion, stale revision,
bad document and failed recheck; multi-file Unicode offsets; filesystem hashes
unchanged; real CLI/LSP/MCP consistency. Fix init --help before any I/O and make
global usage list api/init. Run focused checks and the full native verify gate.
