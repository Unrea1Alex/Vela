# PulseDeck 1.0 — application contract

Current source exercises Vela 1.0.0-dev library task groups and shared GUI; the archived
0.11.0 application and its release reports retain their original contract.
Windows x64, ABI 1, shared vela-gui and Winsock adapters, trusted curl >= 8.4.

- A one-shot service check contains 1–16 uniquely named endpoints, at most four
  simultaneous GET exchanges, independent deadlines and byte limits. A typed async
  task implements each endpoint's optional warm-up delay. No automatic retries,
  redirects, authentication or remote listener. HTTP failures and transport failures
  remain distinct; a successful probe means the exact configured status matched.
- The default packaged JSON starts a Vela IPv4 loopback demo server on an ephemeral
  port, with healthy, Unicode, missing, failed and over-limit responses. Custom
  settings can select HTTP or HTTPS, an absolute curl path and an optional absolute
  PEM path; TLS validation is never disabled. The demo server is HTTP only.
- UI callbacks enqueue actions on the owning thread. The host pumps the GUI,
  server and one heterogeneous task group. Each probe awaits its delay and HTTP
  exchange in a task-owned scope; group cancellation drains all child operations
  before exposing terminal results. Cleanup failures remain separately observable.
  Native code owns UI/OS objects;
  policy, configuration, scheduling, result classification and JSON are Vela.
- Cancellation stops queued probes and requests cancellation of active exchanges.
  Active exchanges are released only after acknowledgement. A close action follows
  the same drain sequence before destroying callbacks, window and listener.
  Completed results survive cancellation. A new run starts only after full drain.
- Configuration input is bounded to 64 KiB; names to 80 UTF-8 bytes without control
  bytes; warm-up to 10 s; timeout to 120 s; response body to 1 MiB. Endpoints retain
  configuration order in the report regardless of completion order.
- Each launch owns a unique directory inside TEMP or an explicit existing output
  directory. Only `report.json` in that directory is published atomically. It stores
  status, byte length and digest, not response content. Transport staging is removed
  after every exchange. Reports remain after exit. Bundled configuration is found
  relative to the executable, independent of cwd/PATH.
- Exit codes: 0 all expected statuses; 1 completed with failed checks; 2 setup,
  configuration or application error; 3 cancelled. GUI close returns 0 after drain.

Acceptance: native app build, named model tests, live concurrent HTTP and HTTPS,
wrong trust/hostname, deadline, body cap, cancel while active/queued, re-run,
cleanup, actual window inspection/actions, debug profile, cold/warm compiler
cache, query pagination and a relocated package launched outside the repository.
Compiler/runtime semantics are unchanged; the composition API is a library layer.
