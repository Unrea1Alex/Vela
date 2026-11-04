# Text, bytes and paths — staged 0.7 contract

0.7.1 defines the migration; it does not silently change the existing String ABI.
Legacy String and str_* operations still represent immutable bytes, permit NUL
and use byte offsets. Existing compiler/tools and old builtin signatures remain
compatible during 0.7. Raw I/O is not claimed to produce valid Unicode.

0.7.2 introduces public module types `Bytes`, `Text` and `Path` as nominal wrappers
over the current storage with checked constructor functions. Text is the checked
UTF-8 String interface during migration: malformed encodings (overlong, surrogate,
truncated or >U+10FFFF) return typed errors. Encoding is lossless, no normalization.
Slices in the checked interface must not split code points. Embedded NUL is valid
text but forbidden in Path and OS argument boundaries. Byte collections preserve
arbitrary values; decoding is explicit and never replaces invalid bytes.

Path is validated UTF-8, nonempty and NUL-free, converted to UTF-16 on Windows.
It does not imply existence, canonical identity, confinement or authorization.
Parent/join are lexical operations; I/O must validate OS errors separately.
Path equivalence is not string equality on case-insensitive filesystems.

The wrappers are transparent Vela records in 0.7, so their fields can be forged;
public operations must revalidate invariants at the boundary. They are not a
compiler-enforced UTF-8 primitive or an opaque security capability. This deliberate
compatibility phase avoids relabelling arbitrary legacy bytes as validated text.

Before 1.0: migrate compiler/tools to Bytes for raw buffers and checked Text for
human text, audit indexing and OS boundaries, then decide a breaking String alias
change with dedicated migration/versioning. That later change needs its own
acceptance gate; 0.7 does not claim it done. Process-region allocation remains
unchanged; GC/borrowing/resource scopes belong to 0.8.

Validation in 0.7.2: arbitrary bytes, invalid UTF-8 classes, supplementary Unicode,
NUL, slice boundaries, Windows Unicode paths, failed/partial I/O and safe updates.
