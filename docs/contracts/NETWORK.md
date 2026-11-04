# Network direction and bounded prototype — 0.7.6

Status: accepted design; Windows x64 prototype implemented and validated.
build/stage07/076-network.log: 10/10. Source:
[network adapter](../../prototypes/windows/network.c) and
[Vela application](../../prototypes/windows/network.vela).
This is not a supported std/net module or the asynchronous network milestone.

Requirements: binary bodies, explicit UTF-8 decoding, status separate from transport
failure, bounded headers/body, finite deadlines, cancellation and deterministic
close. No implicit credentials, browser cookies, proxy inheritance, redirects or
certificate-error suppression. Future HTTP client returns Result<Response, Error>;
Response has status, headers and Bytes; HTTP 4xx/5xx is a response, not a transport
exception. Error distinguishes invalid input, DNS/connect, timeout, TLS, protocol,
limit and cancellation. Stream ownership and async completion wait for 0.8/0.10/0.11.
Server APIs require separate connection/task/backpressure contracts in 0.11.

Decision for this Windows x64 experiment: WinHTTP, a system C API with independent
sessions and no browser credential/UI dependency. The adapter uses ABI 1 and is
outside the compiler/runtime bootstrap. No third-party binary is downloaded.
libcurl remains a candidate for a cross-platform adapter; selecting it needs
packaging, TLS backend and cancellation tests on each target. WinINet's desktop
browser integration is not required. The public future API must not expose HINTERNET.
Sources: [WinHTTP](https://learn.microsoft.com/en-us/windows/win32/winhttp/about-winhttp),
[timeouts](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpsettimeouts).

Prototype contract: synchronous GET to numeric 127.0.0.1, explicit port 1..65535
and ASCII absolute request path, no userinfo/URL parsing or redirect following.
No proxy, auth or cookies. This intentionally exercises local HTTP only.
Each phase uses a 200 ms timeout; that is not a whole-request deadline. A supervising
test process imposes the total deadline. Body cap is 4096 bytes; native response
storage is malloc-owned, accessible only through bounds-checked byte accessors,
and released with ffi_close. OS handles close on success and every failure.
The result handle exposes transport error and status separately; null means
allocation failure. Error codes: 1 input, 2 transport, 3 timeout, 4 limit, 5 allocation.
Vela converts response bytes to its byte String explicitly. The application
validates UTF-8/JSON with std modules; the adapter does not parse Vela or JSON.

Acceptance: local 200 JSON/Unicode body, 404 response, embedded NUL, exact body cap
and cap+1, stalled response timeout, refused connection, invalid input, explicit
resource close. A deterministic local server is test infrastructure only.
TLS verification, DNS, streaming, cancellation inside an active call and remote
Internet interoperability remain untested and are not advertised.
