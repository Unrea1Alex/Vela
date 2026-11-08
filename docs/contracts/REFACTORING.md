# Refactoring previews (schema 1)

`vela plan ROOT REVISION DOCUMENT BYTE NEW_NAME` selects a source declaration
or reference by graph document ID and normalized UTF-8 byte offset. The first
supported rename targets are ordinary Vela functions and lexical bindings.
In the 0.10 development compiler from dev.3, inherent methods are also supported
with one declaration identity across dot and qualified calls.
Starting with dev.4, selecting an interface operation or one of its implementations
renames the operation, implementations and resolved uses together within the supplied graph.
Entry points, implicit bindings, foreign functions and unresolved sites are
not targets. The scope is the supplied import graph, so downstream consumers
outside that graph must be opened through their own root.

`vela plan ROOT REVISION DOCUMENT fmt` plans a formatting correction. Plans
never write source. Rename/format identify the original revision, affected documents
and half-open edits; a compiler check over the proposed in-memory overlay must
succeed. Rename additionally checks that existing reference bindings are
preserved under the edit coordinate mapping. A stale revision, unresolved
generic body affected by a proposed rename, conflicting name or changed
resolution rejects the plan. No partial edit is returned on rejection.

Clients must verify their editor versions (or original bytes for disk edits)
again when applying a plan. An LSP result uses versioned document changes.
An MCP client receives a preview; it does not implicitly write the workspace.

## Diagnostic plans in 1.2

`vela plan ROOT REVISION DOCUMENT diagnose` also works on the first rejected
analysis. Error JSON supplies revision/documents, UTF-16/byte range and a native
explanation. E200/E222 qualified-namespace errors may suggest a unique import;
E225 may normalize a name or correct a unique field spelling; E209 may add
args/io/state only to private ordinary root main. E201 explains expected/actual.
Public/process/callable effects and ambiguous bindings require explicit edits.

A handled diagnose result has ok=true and the original diagnostic. Only
validated=true with nonempty changes is a checked correction. Explanation-only
results have no changes. Every candidate passes a disposable native frontend
overlay check; source/locks are never written. `query ROOT --validate` performs
that check without an index or C emission. Query overlays also cover a manifest
through the same parser/lock rules; MCP's source-text overlay input stays unchanged.
[Exact contract and limits](DIAGNOSTIC-PLANS-1.2.md).
