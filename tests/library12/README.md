# Library/tooling 1.2 acceptance

Run the mandatory native suite with `vela-dev.cmd verify` after each roadmap ID.
It includes the independently specified old-API output/rejection fixtures.
Optional Node harnesses exercise MCP/documentation/package integration and do not
become compiler/application/native-verify dependencies.

- `node tests/library12/help.mjs G:/Vela`: check/build/run thirteen recipes, inspect
  native generic/effect/opaque/method/async interfaces and rejection before emission.
  The CLI recipe joins the original seven executable recipes in 1.2.4.
- `vela run tools/help.vela -- G:/Vela G:/Vela/bin/velac.exe G:/Vela/docs/api-index.json`:
  regenerate signatures/effects from checked native public interfaces.
- `node tests/library12/frozen-check.mjs G:/Vela`: verify immutable fixture/archive
  hashes and the old API inventory in the freshly generated index. This is an
  additional compatibility guard; new semantics use literal independent oracles.
- `node tests/library12/api-search.mjs G:/Vela`: 25 native search cases, including
  independent SHA-256/UTF-8 ordering, pages, bad catalogs, ambiguity and limits.
  `api-examples.vela` checks the short metadata examples in typed contexts;
  OS example operations are not executed by its main.
- `node tests/library12/scaffold.mjs`: with the C toolchain environment set,
  33 independent scaffold checks; optional VELA_TEST_COMPILER selects a candidate.
  Native verify also checks both template builds/tests. Linux counterpart:
  `wsl -d VelaRelease100 --exec sh /mnt/g/Vela/tests/library12/scaffold-linux.sh`
  after emitting the current native compiler to build/stage12/compiler123-linux.c.
- `node tests/library12/cli-apps.mjs`: after building index124/logs124/http124 into
  build/stage12, 49 CLI/help/error/determinism/preserved-output checks. The frozen
  original app oracle is also rerun for each migration; never edit its expectations.
- v124a_combinators has an independent exact callback trace, eager/lazy defaults,
  typed context and nested aliases; four rejection fixtures require E201/E209.
  Its native executable also runs with VELA_GC_STRESS=1/VELA_GC_REPORT=1.
- Build sort-probe.vela as build/stage12/sort125.exe, then `node tests/library12/sort.mjs`:
  56 stable-rank oracles, with comparison bounds and Int extrema. v125_sort also
  tests the exact comparison trace, alias mutation, Unicode/raw bytes and NaN/zeros.
- v125a_traversals covers all twelve normal/fallible traversals, exact callback
  traces, empty/singleton/record values, typed errors and alias mutation; E201/E209
  rejects are separate. Build traversal-memory.vela as traversal-memory125a.exe
  in build/stage12, then run traversal-memory.mjs for managed-allocation evidence.
  Capacity rounding uses the runtime's <2n growth rule; this is O(n) snapshot
  storage, not the later streaming stage's constant working-buffer promise.
- v125b_set checks 200 ordered insert/remove steps and twelve algebra pairs
  against independent linear-list references, Unicode/raw bytes, Int extrema,
  distinct keys, aliases and private storage. Eight rejections preserve Dict's
  key domain and state/opaque boundaries. Run its executable with GC stress too.
  set-gc.vela separately checks dynamically created String keys after the creator
  returns, across repeated collections and shared-alias removal.
- v125c_cell checks shared copies/closures, independent cells, nested payload
  aliasing, and generic record/Set/callable roots after creator scopes. Five
  rejection cases require state/type/opaque boundaries; GC stress is separate.
- v126_json_decode covers primitive/record/array schemas, exact Unicode/escaped
  paths/byte offsets, missing/null/default, syntax-before-callback, huge ignored
  numbers/depth 4096 and the separate selected-decoder/path budgets. Seven
  rejection fixtures preserve state/type/opaque boundaries. json-decode-gc.vela
  separately checks bounded dynamic schema/payload/span backing lifetimes;
  the full depth-4096/path-65536 fixture is not forced through GC at every safepoint.

`frozen/apps-1.1.zip` preserves the three authored application source/build/README
sets from commit 106890e. `manifest.json` records source hashes, lexical volume
metrics, old fixture hashes and archived compiler provenance. The archived 1.1
compiler and current compiler both execute the fixture with exactly
`legacy library APIs passed` and reject missing state with E209.

The [evolution contract](../../docs/contracts/STDLIB-EVOLUTION-1.2.md) distinguishes
proposed names from implementation. Current stage commands/results and unperformed
checks are in `docs/acceptance/`; do not infer future support from this contract.
