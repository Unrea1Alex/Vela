# Shared JSON lexical rules

Stage 1.3.4a consolidates scanning in the standard library's implementation
module `json_tokens`. Tree parsing and the pull reader use the same rules
for whitespace, strings, escapes, Unicode scalar values, number spelling
and literal prefixes. Their public readers and error types retain their
own structural policy. Typed decoding validates the entire source through
the pull reader and locates only already validated spans. Its record builder
scans validated member boundaries in source order and retains declared spans.
It reuses canonical key quoting for paths and avoids a second grammar pass
through each ignored subtree. Complete validation still precedes every callback.
The existing local reader for selected primitive values preserves conversion
causes in the selected span's coordinates.

Both entry points check UTF-8 once before starting lexical scans. The
scanner works on immutable String data and byte offsets. Decoded strings
are detached, raw numeric spelling is a slice, and scan state lives in
the calling thread. Checked integer arithmetic and precise GC apply.
No tree is created by skipping or typed decoding.

Tree parsing retains its depth and node ceilings, 4096-byte numeric
conversion limit, exact Int64 when possible, Float64 fallback and
insertion-ordered values. Its syntax error coordinate retains the
historical cursor after consuming an invalid escape or low surrogate.
The pull reader keeps its larger depth and node ceilings, original
number spelling, typed conversion, sticky first error and precise path.
It reports the offending escape or low-surrogate position. Both reject
duplicate decoded names. Each layer keeps its prior diagnostic priority
for invalid delimiters, duplicate names and malformed syntax.

The bounded tree writer and pull-reader path quoting retain their existing
output policies. The tree writer reuses `text::Builder` with the same
16 MiB bound and keeps its separate node/depth limits. Empty fragments do
not consume capacity. Their byte escapes use the same mapping. A short path
fragment can represent an escaped key without changing the syntax of the
source or the resource budget of the tree writer.

Acceptance uses a literal corpus with valid/invalid strings and numbers,
every cut through an escaped key/value and signed exponent, typed skip
with malformed unknown fields, exact duplicate/encoding/byte offsets,
and bounded output. Compare each public view against its own expectation.
A frozen implementation is supplementary evidence. The 1.3.1 medium
target and peak commit limits still apply, including forced GC, application
oracles and the aggregate native gate.
