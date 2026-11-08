# NDJSON summary (library acceptance)

Build: `powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -OutDir bin`.
Run: `bin/app.exe INPUT.ndjson OUTPUT.json [--min-level N] [--max-level N] [--repeat N]`.
Windows/Linux console; no runtime dependencies beyond the native executable.
Linux: from this directory, `../../bin/vela build main.vela -o app`, then `./app`.
cli_schema supplies required positionals, defaults, integer bounds and min<=max.
`--help` prints help/exit 0; CLI errors use stderr/exit 2. Repeated/unknown
options reject; `--` ends option recognition.

Uses a reusable typed json_decode record schema over json_stream validation,
without application event/field/as_* conversion chains. Each record requires string service, integer-literal
level 0..5 and integer-literal value -1000000..1000000. Unknown values are fully
validated and skipped without converting their numbers. All records, including
excluded levels, are checked. Decoding errors report the JSON path and byte offset
relative to that record. Output groups use ordinal service order and checked
Int arithmetic. Each repetition re-reads/revalidates the input; publication is
atomic and occurs once after all repetitions succeed.
The output builder uses algorithms::try_fold over sorted service names; its
private StringList accumulates linearly and a formatting error stops publication.

Bounds: UTF-8 file 1 MiB; nonblank line 4096 bytes; JSON depth 4096, 8192 values
per record. Filters are inclusive; min<=max, repeat 1..1000. Blank means only
space/tab/CR; a final line without LF is accepted. Malformed input preserves
previous output. The frozen pilot checks 30 baseline /46 maintenance cases;
actual acceptance is recorded in the [roadmap](../../docs/ROADMAP.md).
