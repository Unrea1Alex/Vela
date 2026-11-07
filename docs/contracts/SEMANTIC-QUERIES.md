# Semantic queries (schema 1)

The analysis root is a source file or project manifest. The graph consists of
the entry and its transitive imports, with existing project lock and import
visibility rules. A library root does not need an executable entry point.

Analysis ranges are half-open. Document coordinates are zero-based lines and
UTF-16 code units, with an additional zero-based byte offset in the compiler's
normalized UTF-8 (leading BOM removed, CR and CRLF converted to LF). Positions
inside UTF-8 sequences or surrogate pairs are not editable boundaries. Existing
diagnostic coordinates keep their existing schema; clients translate them
against the corresponding source revision.

A document revision is SHA-256 of normalized source. A disk client retains and
checks the original bytes separately; MCP includes them in its snapshot ID.
An editor version is a separate,
monotonically increasing client counter. The analysis revision is SHA-256 over
the ordered document identities and content revisions. Symbol IDs belong to
that graph: identity derives from the declaration location and kind, not arena
indices, instantiated generic types, or spelling alone. IDs need not survive a
change that moves the declaration. The native index includes absolute paths;
clients remap them to their own workspace when presenting locations.

`vela query ROOT` emits `documents`, `definitions`, `references` and import
edges. `--at PATH LINE CHARACTER` filters definitions and references by
the symbol at a UTF-16 position. A reference's `id` links to its definition
and `caller` identifies its enclosing function for a direct call. Import
edges describe which modules depend on an edited file; a validated plan
lists the exact changed files.

From 0.11.4, the index and edit plan include
`scope: { "root": "entry", "excluded_test_roots": N }`. The count describes
declared test roots omitted as entry points. Any files imported by the entry
remain visible. Check this scope before applying a project-wide edit.
The LSP warns when a rename preview omits declared test roots.

Use `vela query ROOT --page 2000` for a bounded CLI response. The page includes
all documents and up to the requested number of definitions, references and
imports. Send `--offset NEXT --revision PAGE_REVISION` after `--page LIMIT`
using the values from `page.next_offset` and `page.revision`. A null offset
ends the sequence. The continuation revision binds the compiler and resolved
graph. Keep it separate from the plan revision at the top level. See
[incremental analysis](INCREMENTAL-BUILD.md).

Queries distinguish declarations, references, direct calls and import edges.
Concrete generic instantiations at the same source site may expose multiple
types; they share the corresponding source identity. Uninstantiated generic
bodies are not promised to have inferred types. For invalid source, return the
native diagnostic, without inventing symbol resolutions beyond what the
checker established. A rejected graph cannot be used to authorize edits.

## Fields consumed by clients

The envelope contains `schema_version: 1`, `ok`, `revision`, `diagnostics`,
`documents`, `definitions`, `references` and `imports`. Each document has
integer `id`, absolute `path` and content `revision`. A range contains
`document`, `start` and `end`; each endpoint has `line`, `character` and `byte`.

Definitions expose `id`, `name`, `kind`, `type`, `effects`, and `range`.
In 0.10.2 opaque type definitions add `opaque: true` and their field definitions
add `visibility: "module"`. These are source navigation records; they grant no
access to the representation in another module.
In 0.10.3 inherent methods are function definitions with `method: true`.
Private methods carry `visibility: "module"`. Dot and qualified calls share the
same declaration identity, including calls of concrete generic instances.
In 0.10.4 Vela function definitions add `analysis_status` with one of
`checked_body`, `deferred` or `checked_constraints`. Concrete generic call
references carry `checked_instance`. An interface call uses the operation
declaration as its navigation target and reports the declared interface effects.
Builtin and extern targets and interface signatures omit body status.
In 0.10.5 templates with effect parameters also report `checked_constraints`.
Callable types are rendered as `fn(...)` with their effect set. References
through explicit captures share the original local binding's source identity.
The direct call graph includes no guessed target for a call through a value.
From 0.10.6 both dynamic call forms refer to the declared interface operation,
with the same target ID and declared effects as a static interface call.
The runtime implementation is selected by the boxed value.
References expose target `id`, `caller`, `role`, `type`, `effects`, and `range`.
For `role: "call"`, `caller` is the enclosing function ID. Builtin targets use
`builtin:NAME` and need not have a source definition. Imports contain integer
`from`/`to` document IDs, `alias`, and the import's `range`.

These are source facts, not runtime execution counts. Consumers counting call
sites must deduplicate repeated generic instances by source position, caller
and target. Function definition `type` may be empty for a generic template;
its instantiated call sites can still have concrete result types. Empty
template effects alone do not establish purity. A `--at` response is filtered,
not a complete input for a whole-graph report. The root covers transitive
imports, not arbitrary downstream consumers or separate test roots.
