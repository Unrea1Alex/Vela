# Standard library — 0.7.2 contract

Status: included in Vela 0.7.0, verified on Windows x64/MSVC.
Original stage 0.7.2 verify: 916/916, no skips, three generations and both fixed points.
Focused module/application and atomic-temp cleanup checks also passed. POSIX was
not executed on this host. Evidence: build/stage07/072-*.log.
Final acceptance: [Vela 0.7.0](../VALIDATION-0.7.md). std.testing was added in 0.7.3;
its declarations/assertions are specified separately in [TESTING](TESTING.md).

The library is authored Vela modules under `std/`, explicitly imported by relative
path or a reviewed local manifest dependency. There is no implicit std import,
registry or network download. Runtime additions are OS/storage primitives only.
All new failure-returning APIs use Result<T, Error>; error variants have stable
categories and contextual path/index/message, not parsed OS error strings.

- `std/text.vela`: nominal Bytes/Text wrappers; UTF-8 validation, explicit decode/
  encode, byte-length and code-point-boundary slicing, split/trim, HTML escaping
  and bounded zero padding. See TEXT-BYTES-PATH for the compatibility limitation:
  record fields remain public and boundary operations revalidate them.
- `std/path.vela`: checked nonempty/NUL-free UTF-8 Path, lexical parent/join;
  Windows drive roots and separators recognized, no claim of identity/confinement.
- `std/fs.vela`: bounded binary/text reads, typed invalid-path/encoding/limit/I/O
  errors; atomic replacement through a private sibling temporary directory,
  cleanup on every ordinary Result path. Destination remains unchanged until
  rename succeeds. Atomic visibility is not power-loss durability; concurrent
  modification/conflict detection is explicit, not a lost-update guarantee.
- `std/process.vela`: validated argv, direct subprocess (no shell interpolation),
  explicit cwd/output paths, timeout and typed launch/exit errors. The child tree
  is controlled on Windows for redirected processes, but this is not an OS sandbox;
  MCP execution uses the separate [MCP-EXECUTION](MCP-EXECUTION.md) policy and gate.
- `std/collections.vela`: copies and stable ascending scalar sorts; without
  first-class callbacks comparator closures are not part of this release. Float
  sort puts NaNs last and preserves equal values/-0 ordering. Explicit `state`.
- `std/json.vela`: a tagged value tree (Null/Bool/Int/Float/Text/Array/Object).
  UTF-8 strings and escapes including surrogate pairs; strict JSON number grammar;
  duplicate keys rejected; depth<=128, values<=65536, bytes<=16 MiB, numeric token<=4096 bytes.
  Integer spellings fitting Int remain Int, other finite numbers become Float64.
  Overflow/non-finite values are errors. Stringify preserves member order and
  escapes controls; validate forged strings, duplicate object members and bounds.
  Repeated serialization must not depend on dictionary iteration order.
- `std/cli.vela`: explicit option specification (flag/value), positional args,
  `--` terminator, duplicate/unknown/missing-value errors. No implicit abbreviation.
- `std/config.vela`: JSON object configuration, typed required/optional scalar
  lookups, no implicit coercion; caller decides defaults and allowed keys.

No type here adds GC, borrowing, implicit destructors, shared-memory concurrency
or retained callbacks. A process-region program must bound its inputs/lifetime.
Resources opened by a single runtime operation close before that operation returns.

Acceptance: positive, rejection and boundary tests; malformed UTF-8/JSON/NUL,
supplementary characters, number extremes, depth/size, duplicate keys/options,
sorting stability, Unicode files and preservation on failed updates, timeout/exit
codes. A standalone JSON configuration/report utility must exercise the modules.
Compiler rebuild and full native verify close the item; unperformed platforms
remain explicitly unverified.

Actual API/signatures and limitations: [standard modules](../STDLIB.md).
The prototype uses stable insertion sorts (quadratic time). Read limits are
0..256 MiB. Cleanup failure after successful atomic publication reports the
committed flag. Output redirection files are explicit caller-authorized outputs;
launch failure may leave them truncated. This library is not the MCP sandbox.
