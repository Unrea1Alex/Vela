# HTTP collector (library acceptance, Windows)

Build: `powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -OutDir bin`.
Run: `bin/app.exe CONFIG.json OUTPUT.json [--fail-on-error] [--repeat N]`.
Runtime: trusted Windows system curl 8.4+ (`SystemRoot/System32/curl.exe`), owned
and supervised by the version-matched standard HTTP API. No application process/HTTP
wrapper, SDK fork or additional language runtime. Linux HTTP is not claimed.
cli_schema handles required positionals, fail flag and bounded repeat/defaults.
`--help` prints help/exit 0; CLI errors use stderr/exit 2. Repeated/unknown
options reject; `--` ends option recognition.

Configuration requires urls (0..128 plain-HTTP URL strings), concurrency (integer
literal 1..8), timeout_ms (integer literal 50..5000). JSON is fully validated with
json_decode over json_stream before sending any request; a typed InputConfig
builder replaces manual event/field conversion. Extra fields are validated and
skipped. Decoder errors carry the exact JSON path and original config byte offset.
Config <=1 MiB, depth <=4096, values <=1000000; each body <=1 MiB.

Uses the opt-in `http::curl_transfer` factory: original curl --max-time covers the
whole response body; bounded helper startup/drain gets a separate budget.
`parallel` admits bounded per-item tasks; `async_io::fetch` owns each exchange
through its task Scope. The host only ticks the job and time; application
slots/poll/release loops are gone. Results preserve input order and count
body bytes; 4xx/5xx remain completed responses, timeouts/network errors get zero
status/bytes. No retries. Every exchange drains and releases its files.

Repeat 1..1000 re-reads/revalidates config and performs fresh GETs in the same
process. Output is written once atomically, after all iterations succeed.
--fail-on-error writes the final report then exits 1 if any iteration had an HTTP
error status or request error; otherwise a completed collection exits 0. Invalid
arguments/config/I/O exit nonzero and preserve prior output. Validation uses the
frozen 29 baseline /44 maintenance checks; actual status is in the roadmap.
