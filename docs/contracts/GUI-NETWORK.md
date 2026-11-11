# FieldDesk network interaction

The current 1.0.1c source uses the shared [GUI library](GUI-LIBRARY.md).
Its Window owns callback registration and event queue; application transfers
drain before Window.close. The current source defaults to an owned
[HTTP multi pool](HTTP-MULTI-1.3.md).

FieldDesk accepts an optional trusted local JSON endpoint configuration and
optional JSON measurement settings. The endpoint selects scheme, host, port,
target, CA file and a total timeout. An explicit curl path selects the
compatibility transport. The GUI owns one exchange
and drives its loop between bounded Win32 message turns. It displays elapsed
time while waiting for the response and a cancellation phase during drain.

Analyze, Export and Load are disabled during the exchange. Cancel is active
until requested. The editor stays available. An edit invalidates the prior
summary. An edit made during a transfer prevents the response from replacing
the editor. Loading intentionally replaces the current buffer if it has not
changed since the button was pressed. A successful replacement clears the old
summary and marks the document as awaiting analysis. A failed or cancelled
transfer preserves the editor and the exported report.

The successful status is 200. Before replacing the editor, validate UTF-8,
absence of NUL, the 4096-byte limit after converting LF to CRLF, and NDJSON
against the measurement settings. Loopback HTTP and verified HTTPS use the
same transport. Multi advances through bounded ticks and returns response bytes
from memory. The compatibility worker stages files in a private local directory
beside the requested report. Validation and publication run on the host.

Close starts cancellation before the callback or window is released. The
host drains and releases the exchange, shuts down the scheduler and closes the pool.
Window callbacks only enqueue events. Programmatic editor replacements suppress
edit notifications. Win32 owns widget layout, the Unicode edit control and
the message pump. Vela owns the protocol, application state and report.

Acceptance uses local HTTP and HTTPS fixtures, verifies status/error/limit and
cancel paths, exercises real editor input during a slow response, and checks
that closing with active work preserves the previous report and drains the
exchange. Verify UTF-8 and CRLF with the real edit control. Record the exercised
DPI settings separately.
