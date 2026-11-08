# Native API discovery (1.2.2)

Accepted contract before implementation, 2026-11-07. Extend existing
vela_get_help with topic=api and optional query/name, offset, limit, max_bytes,
version and fingerprint. Old topics/resources and both schema-1 response forms
remain. There is no new mandatory startup tool or automatic full catalog load.
query and name are mutually exclusive. Other topics reject search arguments.

The native Vela executable vela-api reads the generated checked API index and
authored purpose metadata. TypeScript only validates transport inputs, launches
the pinned helper and serializes/bounds its response. It does not parse language
source or implement ranking/filtering/pagination. Native compiler/runtime/native
verification and ordinary applications remain independent of Node/MCP.

Fuzzy query matches all whitespace-separated words against ID/name/purpose;
ASCII case folding, literal non-ASCII UTF-8. Exact name is case-sensitive and may
be a full module:name ID or an unqualified declaration name. IDs are unique and
results are sorted by unsigned UTF-8 ID bytes. An empty/whitespace query is empty;
no fuzzy matches is no_matches; unknown exact name is not_found; multiple exact
unqualified names is ambiguous; successful results are matches. These are native
data states inside a successful MCP envelope, distinct from transport/catalog
errors. Duplicate IDs/malformed catalogs are toolchain_error, never no_matches.

Each item supplies ID, signature, effects/effect parameters, module ownership,
limits, short example and recipe. Signatures/effects are exclusively generated
from native catalog/interfaces. Metadata cannot override them. Module policy is
labelled as such; it does not turn every type into an owning resource.

Header version is the generated compiler version. Fingerprint is SHA-256 of
exact index bytes + LF + exact purpose bytes. Optional expected version/hash
mismatch yields incompatible with native reason stale_version/stale_fingerprint.
The helper/index/purpose and compiler are pinned together. The helper executes
from verified captured bytes in the host's owned temporary tree.

offset is a result index, not a page number; limit 1..8, default 3. A page may
return fewer entries to fit its native payload budget; next_offset advances by
the actual returned count. Empty/out-of-range pages terminate. If one entry
cannot fit, return limit rather than silently skipping it. Query/name limits
are 128/256 UTF-16 code units at the client; NUL/unpaired surrogates reject.
Native argv has independent generous UTF-8 byte caps. Catalog <=1 MiB and purpose
<=256 KiB, with bounded JSON parser limits and at most 4000 unique declarations.

max_bytes 1024..16384, default 8192, bounds the serialized MCP result INCLUDING
text content and structuredContent. Native receives a conservative smaller
payload allowance; host returns limit if the final envelope still exceeds the
bound. Both required forms remain equivalent JSON. Record actual client
tokenization with the fixed published tokenizer; do not claim payload-only
counts as total response cost. Startup must still meet 1.2.1's 2000-token gate.

Acceptance: directory/JSON/HTTP purpose and exact lookups, collisions, unknown
and empty queries, stable multi-page traversal, stale version/hash, malformed or
duplicate catalog, input/output bounds, real SDK response forms/tokenization and
the stage's native verify. Regenerate the index after std changes and only pin
verified artifacts. Existing help/resource clients continue to work.
