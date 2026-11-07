# HTTP and TLS contract

The client block uses curl with libcurl as its HTTP and TLS engine in a
supervised process. It requires a trusted executable, curl 8.4 or later,
and the Windows process adapter. The executable and optional CA file are
explicit configuration. Windows Schannel uses its normal certificate and
hostname verification. An explicit CA file is per transport. Tests use
local servers and a fixture CA without changing system trust.

The client supports GET/HEAD/POST/PUT/DELETE, validated headers and bounded binary
uploads. `get` uses explicit scheme/host/port/target; `from_url` parses an absolute
ASCII URL. The [HTTP API contract](HTTP-API.md) defines accepted syntax and budgets
from 1.0.0-dev.4. It rejects credentials
in the endpoint, whitespace, fragments and path backslashes. Curl config,
proxy routing, redirects, globbing and automatic client certificates are
disabled. The response keeps the status, raw headers and binary body
separate. A 404 or 302 is a response. A TLS, connection, partial transfer,
timeout or limit failure has its own error.

Each request owns a private directory for its outputs and optional upload. The supervisor
deadline covers launch and transfer, and the worker uses the same budget
for curl's internal timeout. Cancellation finishes only after Job drain.
The caller may observe pending work, take a bounded response after drain
and release the private files explicitly. Body limit is 1 to 1,048,576
bytes and returned raw headers are limited to 32,768 bytes. Curl's
`--max-filesize` limits body transfers, including unknown-length downloads
in the supported versions. HEAD has no body and may describe a larger representation.
Raw header/output budgets are checked after transfer, not disk quotas.
Parsing or moving the response into GUI state
is a separate host operation and uses the file API.

Focused acceptance covers binary and Unicode bodies, HTTP status,
partial and oversized responses, a successful trusted TLS connection,
untrusted certificates and hostname mismatch, total deadline and
cancellation, explicit output cleanup and a scripted transport.
See [curl options](https://curl.se/docs/manpage.html#--max-filesize)
and [certificate verification](https://curl.se/docs/sslcerts.html).

## Loopback server

The Windows server uses nonblocking Winsock through a small ABI 1 adapter.
Vela parses HTTP/1.1 and builds responses. The listener binds IPv4 loopback
only. A port of zero lets the OS choose a port. This server accepts one
GET or HEAD request per connection with a required Host header. It closes after
one response. It rejects request bodies, transfer encoding and extra bytes
received with the header. It never processes a subsequent request on the
same socket. Unsupported request syntax receives 400. Headers are limited to
8192 bytes, response bodies to 1 MiB and active clients to 16. Each client
has a monotonic deadline from accept through its final response write.
Response includes a validated `content_type`; HEAD includes the representation's
Content-Length and no body, including error responses. Methods with request bodies
remain unsupported by this server. Neither adapter pools connections; persistent
connections and their ownership/cancellation contract are retained after 1.0.

Readiness is polled by the host. A turn accepts at most one client, reads
or writes at most one chunk per existing client and handles partial sends.
The handler is a callable with a state-only effect ceiling. Explicit
shutdown closes every client before the listener. HTTPS verification is
provided by the client. The loopback server speaks HTTP for application
composition and local tests.
