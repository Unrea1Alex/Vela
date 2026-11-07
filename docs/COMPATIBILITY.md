# Vela compatibility and maintenance policy

Policy adopted by roadmap 1.0.3 for the [frozen 1.0 contract](contracts/STABLE-1.0.md).
The stable baseline starts at 1.0.0; 0.x and 1.0 prereleases are migration inputs,
not versions covered retroactively by the 1.x compatibility promise.

| Release | Permitted changes |
|---|---|
| 1.0.z patch | Correctness/security fixes and documentation corrections preserving documented valid programs, APIs, effects, ownership, formats and protocol versions |
| 1.y.0 minor | Compatible opt-in additions; no removal or reinterpretation of valid existing programs |
| 2.0.0 major | Breaking changes with an explicit migration guide and release notice |
| -rc.N / -dev.N | Prerelease; exact matching tools/docs required, may change before stable acceptance |

Rejecting previously accepted but undocumented invalid programs, repairing behavior
that violates a published contract, and changing diagnostic prose or performance
may be patch fixes. Explain affected behavior and add a regression test. Do not
call an observable documented behavior a bug merely to evade compatibility.
New mandatory effects, narrower budgets, new rejection of valid input, changed
ownership/cleanup, changed evaluation order, and removing an enum variant are
breaking changes. Adding variants to a public exhaustively matched enum or fields
to a required-field record is also breaking, even if it looks additive.

Source compatibility requires the same supported platform/dependencies. Public
signatures, nominal identity, effects, error categories and documented ordering
are covered. Binary compatibility is promised only within the explicit public FFI
ABI and target, not between arbitrary generated executables/C/runtime layouts.
Internal ABI, caches, snapshot/artifact IDs and executable hashes are not portable
across toolchains. Cache failure must preserve correct fallback. Rebuild with the
matching compiler/runtime; never repair compatibility by editing hashes.

Project/lock version 1 must remain readable throughout 1.x. A future incompatible
format needs a new version and explicit converter; never silently rewrite user
projects or native/resource locks. Tool clients check schema_version and protocol
negotiation, ignore only documented optional unknown fields, and reject unsupported
versions. Existing required fields and status meanings cannot disappear in a patch.
MCP native/docs/skill and execution toolchain fingerprints must match exactly,
including rebuilds with the same version. Refresh them only after native/docs gates.

Deprecation does not remove an API or fail valid programs in a patch/minor release.
Announce it in the changelog and guide with a working replacement, first deprecated
version and earliest removal major version. Keep it working for the rest of 1.x;
removal requires 2.0 or later. If a critical vulnerability makes that unsafe, publish
an explicit compatibility exception and mitigation; do not silently change behavior.
No 1.0 API is initially deprecated. This policy does not claim a compiler warning
or annotation mechanism; notices are release documentation.

Patch workflow: reproduce with explicit expected behavior; assess source/format/ABI
and platform impact; implement a bounded fix; run focused and full native checks;
update specs/examples, changelog and migration notes as needed; review and refresh
the conservative stable source snapshot; rebuild/recover and verify affected packages;
pin matching MCP files and record checksums/results. Test the oldest supported 1.x
project/lock/FFI client where relevant. Publish artifacts only after acceptance.
Supported maintenance line: latest 1.x; no fixed support duration or backport SLA
is promised. Preserve historical release artifacts and evidence.

See [migration from 0.11](MIGRATING-1.0.md) and [CHANGELOG](CHANGELOG.md).
