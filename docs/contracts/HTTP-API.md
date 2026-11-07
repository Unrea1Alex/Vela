# HTTP API boundary — 1.0.1d

Compatible 1.1 opt-in: `curl_transfer(executable, ca_file)` returns the same opaque
Curl/Transport API with a complete-transfer timeout and a separate bounded helper
supervisor. `curl` retains the original combined launch/transfer deadline.
No enum, required record field, effect or public FFI ABI changes. See
[deadlines and validation](LIBRARY-1.1.md).

Accepted implementation scope before code. This extends the existing bounded
Windows curl/process client and IPv4-loopback server; TLS and cancellation retain
the [network contract](NETWORK-TLS.md) and [task scopes](TASK-GROUPS.md).

Client: `from_url(url, timeout_ms, body_limit)` accepts absolute lowercase http/https
URLs, ASCII DNS/IPv4 host, optional decimal port and an ASCII path/query. Missing
path becomes `/`; a query without path becomes `/?...`. Default ports are 80/443.
It uses the same host/target validation as `get`, preserving encoded bytes and
explicit ports. Credentials, fragments, backslashes, whitespace, malformed `%`
escapes, IPv6 literals and non-ASCII hostnames reject. No implicit percent/IDNA
conversion or relative URL resolution. `get` remains compatible and pure.

`with_method(request, Method, Bytes)` supports Get/Head/Post/Put/Delete. Get/Head
require an empty body; other bodies are at most 1 MiB. A snapshot of the immutable
bytes is stored in opaque Request. The worker reads a private staged upload file,
which is removed on start failure or after acknowledged cancellation/completion.
No retry of non-idempotent requests. HEAD returns headers/status with an empty
body; its Content-Length describes the representation, not transferred bytes.

`with_headers(request, List<Header>)` replaces application headers with a validated
immutable snapshot. At most 32 headers/8192 bytes, names 1..64 ASCII letters/digits/
hyphens, values at most 1024 printable ASCII bytes. Case-insensitive duplicates,
CR/LF/NUL, and Host, Content-Length, Transfer-Encoding, Connection, Expect, Upgrade,
Authorization, Proxy-Authorization and Cookie reject. Framing, authentication and
connection policy are adapter-owned. Transport config, proxies, redirects, cookie
storage and automatic client certificates stay disabled. TLS verification remains
mandatory. Response body <=1 MiB, headers <=32 KiB, timeout <=120 s; existing
post-transfer header/output budgets are not a claim of kernel disk quotas.

Server: Request adds a Method (only Get/Head). Response adds content_type; callers
migrate octet-stream explicitly or select a validated ASCII media type, up to 128
bytes: nonempty type/subtype made of letters, digits, `-`, `.` and `+`, with
optional exact `; charset=utf-8`. Invalid values or oversized bodies produce
500. HEAD runs the same handler, sends the same Content-Length and no body.
HEAD error responses also omit the body, including 400/431 before handler dispatch.
Request bodies and other methods remain rejected with 400, as do transfer encoding
and pipelining. Input headers <=8192 bytes, output body <=1 MiB, <=16 connections,
one request per connection, accept-to-final-send deadline. No server TLS/auth.

Connection reuse is explicitly outside 1.0: every client exchange owns a curl
process and every server response closes its socket. Existing three-request overlap
proves concurrency, not pooling. A persistent transport needs its own connection/
TLS-session ownership, cross-request cancellation/isolation, resource and latency
benchmarks. This is a retained post-1.0 commitment, not an implemented capability.

Acceptance: URL defaults and rejections, method/body/header validation, live binary
POST/PUT/DELETE echo, HEAD with large representation Content-Length, headers and
Content-Type, TLS and redirects unchanged, cleanup on completion/cancel/failed
scheduling, server malformed requests and HEAD, legacy app regressions, full verify.
