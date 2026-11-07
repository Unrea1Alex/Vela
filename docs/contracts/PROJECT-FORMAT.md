# Project format 1 (0.6.3)

Memory descriptions of the original version are historical. In 0.8,
[the tracing heap](../MEMORY.md) governs managed values.

Historical base: implemented and verified in 0.6.3. Aggregate: 878/878, three compiler
generations from selfhost/vela.project and both fixed points. Evidence:
build/stage06/063-verify.log; focused project checks: 22/22.

The explicit input `vela.project` or a file ending `.vproj` is a manifest.
Other inputs remain ordinary source files. UTF-8/BOM/CRLF follow source rules.
Lines are pipe-separated, without escaping; blank lines and lines beginning #
are ignored. Header must be `vela-project|1`. Fields are exact, not whitespace
trimmed. Unknown fields, versions, duplicate singleton fields/aliases fail E225.

```
vela-project|1
name|hello
entry|main.vela
dep|math|../math/lib.vela
test|tests/smoke.vela
```

name and entry are required, name/aliases use ASCII identifiers. Entry and tests
are relative paths beneath the manifest directory (no dot-dot segments). Local
dependencies are named module entry files, may use relative sibling paths and
must exist. They are not package registries or nested manifests. An import
`"@math"` resolves exactly that configured entry; unknown aliases fail E221.
All modules in the graph share the manifest aliases. Direct file compilation
has no aliases. Relative imports in a dependency resolve from that module.

`vela lock PROJECT` explicitly creates/replaces `PROJECT.lock`. check/build/run/
symbols/test require a matching lock when dependencies exist. There is no silent
refresh. The lock contains a format header, SHA-256 of normalized manifest text,
each alias/path and each dependency graph's deterministic traversal fingerprint.
Fingerprint records use traversal IDs, normalized UTF-8 content SHA-256 and import
edge owner/target/alias; absolute paths and OS file IDs are not persisted. File
identity deduplicates modules during one traversal. A relocated identical tree
keeps its lock valid. All dependency modules are covered, including cycles.
Own source changes do not change the lock unless imported by a dependency.
Missing/stale/tampered locks fail E226 before semantic analysis.
The [incremental cache](INCREMENTAL-BUILD.md) keeps lock verification in place.
Lock is reproducibility/integrity metadata, not a signature or trust grant.

`sha256(String)->String` hashes exact bytes, including NUL, returning 64 lowercase
hex digits; no effects. Runtime allocates 65 bytes in the existing process region;
the temporary hash state is stack storage. No ownership model change. This is a
generic storage digest primitive, never a parser/resolver in C. Algorithm:
[FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final).

Validation: standard hash vectors and block boundaries; malformed manifests,
missing/changed/transitive dependencies and forged locks; aliases/cycles; relocation,
Unicode/spaces; compiler built from manifest; clean build and three-generation gate.
CLI integration beyond check/build is specified separately in BUILD-PROTOCOL.

## Native companions (0.7.5 extension)

Format 1 additionally accepts native|adapter.dll|relative/path.dll. At most 128
entries, unique case-insensitively on Windows. Basenames contain ASCII letters,
digits, underscore or hyphen followed by .dll (total 5..128 bytes). Paths follow
dep relative-path rules. They are explicit local files, not nested manifests or
compiler/linker flags. The lock appends native|name|relative|SHA256 of exact bytes;
native entries require a lock even without source dependencies.
Build/run/test stage declared companions beside their executable; differing
existing companions are refused. Source/native inputs cannot be output targets.
Native files are trusted code: review before locking. No permission or sandbox
is granted by a lock. See [FFI](FFI.md) for ABI/lifetime/loading rules.

The 0.11.6 extension accepts explicit Windows x64 ABI 1 shared metadata and
external resource rows in the same format. See [PACKAGING](PACKAGING.md) for
exact spellings, snapshot limits, lock fields and output rules. Static multiline
text may also use [raw strings](TEXT-LITERALS-RESOURCES.md).
