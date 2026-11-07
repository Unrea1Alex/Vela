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
never write source. They identify the original revision, affected documents
and half-open edits; a compiler check over the proposed in-memory overlay must
succeed. Rename additionally checks that existing reference bindings are
preserved under the edit coordinate mapping. A stale revision, unresolved
generic body affected by a proposed rename, conflicting name or changed
resolution rejects the plan. No partial edit is returned on rejection.

Clients must verify their editor versions (or original bytes for disk edits)
again when applying a plan. An LSP result uses versioned document changes.
An MCP client receives a preview; it does not implicitly write the workspace.
