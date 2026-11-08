# Native project scaffolding (1.2.3)

Accepted before implementation, 2026-11-07. Command:
`vela init DIRECTORY [--name NAME] [--kind cli|library] [--json]`.
DIRECTORY must be new and its parent must exist. Existing files, directories
(including empty ones), and concurrent publication conflicts are rejected;
there is no overwrite option. Relative paths resolve against the caller's cwd;
spaces and Unicode are allowed independently of the ASCII project identifier.
The default kind is cli. Repeated/unknown options and missing values reject.
Explicit invalid names produce E225 and a valid suggested ASCII identifier.
The default name is a sanitized basename (letters/digits/underscore, a leading
digit gains project_, an empty/non-ASCII basename falls back to vela_project).

Both templates contain vela.project, its content-hashed lock, main.vela,
tests.vela and README.md. The library template additionally exports answer()
from lib.vela and supplies a runnable demo main; it is a source-module library,
not a shared-library artifact. Both examples print 42 and have a named test
asserting answer()==42. There are no absolute imports, external dependencies,
Node/Python prerequisites or configuration changes. check/build/test work from
another cwd. Manifest/header and test schema remain unchanged.

Generate all text first, write only into a uniquely owned sibling temp_dir,
then publish the whole directory without replacement. Cleanup removes only
the known generated files and that empty owned staging directory, never a
preexisting destination. Failure is E225 for invalid invocation/existing target
or E900 for I/O; partial staging cleanup failure is reported with its path.
Success JSON has schema_version=1, ok=true, command=init, kind, name, directory,
manifest, files and diagnostics=[]. Normal diagnostic envelopes handle errors.

The existing io install_file(from,to) primitive gains directory-source support:
Windows already moves without replacement; Linux uses renameat2 with
RENAME_NOREPLACE. Unsupported kernels/filesystems fail closed, without a racy
check/rename fallback. The Linux behavior follows the
[Linux rename ABI](https://man7.org/linux/man-pages/man2/rename.2.html).
Regular-file behavior/signature/effects stay unchanged (Windows move, POSIX
hard link whose source the caller removes). Directory success transfers the
owned staging path to the destination. No language allocation/ownership or FFI
ABI extension is involved. This primitive does not provide a hostile-directory
sandbox or crash-durable fsync transaction.

Validation: both templates check/build/test/run on Windows/Linux; relative,
space/Unicode paths and another cwd; invalid name suggestion, duplicate/unknown
options/kinds, existing file/empty directory and repeated invocation preserving
all destination bytes; concurrent publication admits exactly one winner;
unchanged regular-file install tests; native verify and both fixed points.
