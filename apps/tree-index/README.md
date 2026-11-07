# Tree index (library 1.1)

Build: `powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -OutDir bin`.
Run: `bin/app.exe ROOT OUTPUT.json [--query TEXT] [--extension SUFFIX] [--repeat N]`.
No runtime dependency beyond the native executable. Windows and Linux console.
Linux: from this directory, `../../bin/vela build main.vela -o app`, then `./app`.
Place OUTPUT outside ROOT, as in the pilot contract.

Uses the unchanged SDK modules directory/path/fs/text/collections/json. It
re-enumerates and re-reads selected files on each repetition (1..1000), reports
relative slash paths in ordinal order, counts bytes and LF including an
unterminated final line, and publishes only after all iterations succeed.
Dot/empty/binary files are included; links and special files are not followed.
Limits: depth 1024, 1000000 encountered entries, 1 MiB per selected file and
16 MiB total selected data. Directory order itself is unspecified.
Diagnostics go to stderr; invalid arguments/input/I/O produce nonzero status.
Prior output is preserved on input errors.

Acceptance uses the frozen 12 baseline / 26 maintenance checks; see the
[1.1 roadmap](../../docs/ROADMAP.md) for actual verified status.
