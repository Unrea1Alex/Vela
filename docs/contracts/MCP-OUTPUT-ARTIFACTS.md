# MCP generated output artifacts (0.9)

When execution is enabled, `vela_run` optionally accepts `outputs`: one
to four distinct flat file names from the documented extension allowlist.
The application runs with its normal private project cwd and writes these
files under `../export/`. The directory starts empty and exists only for
an opted-in request. No workspace paths are accepted as output destinations.

After a successful, exit-zero run and termination of every job process,
the host checks the exact declared directory contents. Directories, reparse
points, symbolic links, hard links, missing/extra entries, and over-limit
files fail the whole export. Maximum size: 512 KiB/file and 2 MiB/run;
the session stores at most 16 outputs/8 MiB for five minutes. The host
publishes only after private-tree cleanup, a cancellation check, and a
fresh workspace identity check. An unsuccessful run never exports files.

Each metadata record includes `output_id`, name, byte count, SHA-256,
MIME, `run_id`, the producing executable's `artifact_id`, and the
snapshot ID. Output IDs are opaque and session-scoped. They cannot be used
as executables. `vela_read_output` returns at most 64 KiB of base64 data
from a given byte offset, plus the metadata and next offset. The client
checks size/hash and chooses whether and where to save the file. The
adapter cannot write to the workspace. HTML and SVG are untrusted data,
and the adapter never embeds them as privileged UI.

Cancel, timeout, source change, supervisor failure and a failed validation
publish no output IDs. Expired outputs are pruned and client disconnect
clears the in-memory store. The default run without `outputs` keeps its
existing stdout/stderr and exit-code behavior.
