# Typed file publication and cleanup

Stage 1.3.4b adds opt-in file publication through the existing synchronous
`io::Reader` and `io::Writer`. A publication reports the operation result,
a separate ordered cleanup list, and the exact replacement flag. Its failure
record carries the stage, path, optional zero-based byte position and the
original file or stream error. Rendering is separate.

`io::copy_detailed` borrows the same handles and runs the same copy loop as
`copy`. The typed failure additionally records source, destination or copy
control, including errors whose categories can come from either endpoint.
Legacy `copy` and `copy_owned` keep their existing effects and result types.

`fs::publish_owned` takes an existing reader and always closes it once,
including when the target or buffer is rejected. The destination is a private
staging file in the target directory. A bounded copy retires the staged writer,
then attempts replacement only after a successful copy and both closes.
Reader and writer failures retain their own path and position. Closing a handle
uses its shared identity and cached outcome.
Supply an idle reader. Its callbacks follow the stream non-reentrancy contract.

`Publication.operation` reports the copy and any attempted replacement. If
copy succeeded and a close blocked replacement, it holds the staged byte
count and `committed` is false. After a successful replacement `committed`
is true even when removal of the private directory fails. Cleanup records
reader close, writer close, remaining staged content and directory failures
in that order. A failure never discards a primary cause. Temporary removal
acts only on the path owned by that publication.

`fs::copy_atomic` opens a source file with an explicit positive Int64 total
bound. `fs::write_atomic_detailed` uses an immutable memory source and the
same 256 MiB input ceiling as `write_atomic`. Buffer size is 1–65,536 bytes.
Reads use the existing file adapter and short writes finish before another
chunk is requested. The staging buffer is separate from a caller-owned input
String. Successful rename is the publication point.

The legacy `write_atomic` and `write_text_atomic` signatures keep `io` and
the existing `Error::Cleanup(directory, committed)` precedence. They share
target staging with the detailed path. The HTTP Collector publishes only
after its exchanges drain and its pool closes.

Acceptance includes native Windows and Linux publication, zero and bounded
content, alias-safe replacement, failure after partial staging, source and
destination copy failures, repeated shared close, failed rename, and cleanup
faults before and after commit. A failed publication must preserve the
previous target whenever commit is false. Force GC and measure working
memory with a bounded buffer and an independent output digest.
