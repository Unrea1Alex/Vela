# Changelog

## 1.3.0 — libraries, HTTP and compiler performance

- Checked Text and Path values and typed Config snapshots are opt-in APIs.
- JSON scanners and decoders share lexical validation. Typed file publication
  preserves operation and cleanup errors and supports atomic replacement.
- On Windows, the native HTTP client uses reusable libcurl multi sessions.
  Applications retain explicit access to the legacy curl transport.
- Checked IR gains conservative simplification, signed range proofs and C
  reachability. Precise GC roots and safepoints preserve traced ownership.
- The project checker reuses verified semantic results for eligible changes.
  Local builds can explicitly select PGO and LTO.

See [release acceptance and measured results](VALIDATION-1.3.md).

## 1.2.0 — compact agent entry and standard library

1.2.1 adds compact installed entry instructions, on-demand capabilities/recipes
and historical migration help. Native `api SOURCE --json` verifies exported
interfaces; `api --builtins` uses the embedded catalog. The Vela documentation
generator produces the signature/effects index. Existing MCP response envelopes,
topics, input bounds and conditional plan validation remain compatible.
1.2.1a freezes old API/application fixtures and specifies opt-in library evolution.
1.2.2 adds native Vela API discovery through MCP help: exact/purpose queries,
stable pages, version/fingerprint, explicit empty/missing/ambiguous states and
complete response-size bounds. Old help/resources and both response forms remain.
1.2.3 adds native `init` for CLI/source-library projects, named smoke tests and
locks; existing targets reject. E225 invalid names suggest a valid identifier.
Directory publication is atomic without replacement on Windows/Linux.
1.2.4 adds opt-in cli_schema with typed descriptors/getters, defaults, required
positionals, integer bounds/relations and generated help. Three acceptance apps
use it; the original cli API remains unchanged.
1.2.4a adds opt-in result_ops/option combinators with callback effects, eager and
lazy defaults and typed error context; existing result::map_error/explain remain.
1.2.5 adds stable generic comparator sorting with a shallow snapshot and an
O(n log n) comparison bound. Existing collection sorts delegate without changing
their public signatures, unsigned string-byte order or NaN/signed-zero behavior.
1.2.5a adds eager map/filter/fold/find/any/all and typed fallible variants. Ordered
callbacks use a detached shallow snapshot; short circuits/errors stop callbacks.
The basics sum and LogSummary JSON builder now use fold/try_fold.
1.2.5b adds opaque Set<K> on existing Dict keys, with ordered enumeration,
shared identity and independent union/intersection/difference results.
1.2.5c adds opaque Cell<T> with shared copy/capture identity and stateful
create/get/set, preserving ordinary nested payload aliases and tracing GC.
1.2.6 adds typed JSON decoders with explicit record builders, arrays, nullability,
required/optional/default fields, bounds and original-input error paths/offsets.
Full syntax validation precedes callbacks; HTTP/log apps replace manual event chains.
1.2.6a adds io Reader/Writer, memory/file adapters, bounded copy and independent
operation/cleanup causes; stream_lines adds typed locations and split UTF-8,
BOM/CRLF support. New native read/write owners allow explicit Int64 file bounds;
legacy read limits and String line errors remain unchanged.
1.2.7 adds host-driven ordered parallel mapping, Collect/FailFast policy,
cancellation/deadline and per-item child cleanup. HTTP collector now uses
parallel and async_io instead of managing slots/exchanges itself.
1.2.8 adds native diagnostic explanations and revision-bound diagnose previews
for deterministic project/import/private-main corrections. Unsafe effects and
type choices stay explicit. LSP exposes versioned code actions and the actual
compiler version; MCP forwards diagnose. init --help no longer creates a project.
Windows temp_dir now retries bounded exclusive-creation collisions between
workers and preserves a competing caller's path. A native injected-collision
regression covers ownership and the retry bound.
The compiler inventory/frontend audit records arena, tag and source-location
invariants. Checked import previews never reinterpret a known type namespace as
a module; builtin/generic-parameter regressions preserve explanation-only results.
The [roadmap](ROADMAP.md) and [acceptance](VALIDATION-1.2.md) record actual gates.

## 1.1.0 — 2026-11-07

Compatible library additions: Windows/Linux directory metadata and bounded
iterative no-follow traversal; a pull JSON reader with validated skip, preserved
number spellings and explicit budgets; opt-in curl_transfer with the original
transfer timeout and separate bounded helper supervision. The legacy curl factory
keeps its 1.0 combined launch/transfer deadline.

New builtin functions are prelude fallbacks derived from catalog since metadata,
so valid 1.0 user functions/types/imports with the same names keep working.
Existing builtin reservations, public enum variants, project/lock formats and FFI
ABI 1/runtime ABI 2 remain unchanged. New tree-index, log-summary and http-collector
applications use the standard SDK. See [acceptance and platform scope](VALIDATION-1.1.md).

## Unreleased — source-tree maintenance

Removed the historical Python 0.2 frontend, reference tests, compatibility wrappers
and Python packaging metadata. Native compiler/CLI behavior, language semantics,
project/lock formats and ABIs are unchanged. The old implementation remains in Git
history. Updated current instructions and removed generated development copies;
historical release ZIPs and the registered Linux build environment are retained.
See [cleanup and validation](CLEANUP-1.0.md).

## 1.0.0 — 2026-11-07

Release acceptance found a Windows AppContainer failure when publishing an allowed
native DLL: canonical_path could not query a DOS volume name. Its restricted-token
fallback now uses the normalized handle NT path in Win32 GLOBALROOT form, preserving
identity/containment checks and isolation. This repairs the documented valid-path
contract; ABI/effects/budgets are unchanged. The conservative source snapshot is
reviewed/refreshed for this implementation fix and explanatory documentation.

The 1.0 contract is frozen; [release acceptance](VALIDATION-1.0.md) is tracked in roadmap 1.0.4.
Compared with 0.11: task groups and awaitable HTTP/process; observable cache
hits/misses and directory fallback; shared Windows GUI; URL/method/header/binary
HTTP requests and HEAD/Content-Type server support; payloadless enum equality.

Source changes requiring migration: HTTP Error adds two variants and server
Response requires content_type. GUI examples now use vela-gui.dll. See
[migration](MIGRATING-1.0.md). Project/lock format 1, public FFI ABI 1 and internal
runtime ABI 2 retain their versions. HTTP pooling is deferred after 1.0.

Roadmap 1.0.2 creates an 84-file conservative source contract snapshot; 1.0.3 adds
the compatibility/deprecation/patch policy and executable migration example.
No API is initially deprecated. Release evidence and checksums accompany the
Windows native, optional MCP and Linux console artifacts.

Historical releases: [0.11](VALIDATION-0.11.md), [0.10](VALIDATION-0.10.md),
[0.9](VALIDATION-0.9.md), [0.8](VALIDATION-0.8.md), [0.7](VALIDATION-0.7.md).
