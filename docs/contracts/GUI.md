# GUI direction and bounded prototype — 0.7.6

Status: accepted design; Windows x64 prototype implemented and validated.
Visible UI inspection and coordinate click changed the Vela-owned counter 4 → 5;
Unicode label was readable, close removed the window and process exit was 0.
Evidence: build/stage07/076-gui.png, 076-gui-tree.txt, 076-gui-exit.txt.
The initial count 4 reflected user interaction before the automated check.
Source: [adapter](../../prototypes/windows/gui.c),
[Vela application](../../prototypes/windows/gui.vela).
This is not the GUI framework/callback milestone 0.10.5.

Requirements: native window lifecycle, Unicode text, application-owned state,
typed events, main-thread affinity, bounded queues, explicit close and no Vela
callback retained by native code until callback/root contracts exist.
Future portable API: opaque Window/Widget resources, Event enum (close, action,
text, resize), Result-returning operations and subscription ownership scoped to
the window. Async network work must post completion events; it cannot block the
UI thread. Dispatch, cancellation, accessibility and DPI/layout need dedicated
acceptance in 0.10/0.11.

Decision for this experiment: User32 standard window/button/static controls,
through a C ABI 1 DLL. This is an existing Windows system GUI library with native
message-loop and Unicode APIs, no vendored binary/runtime and a small auditable
bridge. Cross-platform widgets are not inferred: Qt and GTK remain candidates
requiring a C shim, distribution/license review and lifecycle tests before a
portable GUI choice. Bootstrap remains independent of User32/WinHTTP adapters.
Reference: [creating a Win32 window](https://learn.microsoft.com/en-us/windows/win32/learnwin32/creating-a-window).

Prototype contract: one window, a label and Increment button. Vela owns an Int
counter and handles action events. The DLL copies borrowed UTF-8 title/text to
UTF-16 per call and frees its copy; strings with NUL/invalid UTF-8 or over 4096 bytes
are rejected. Open returns an owned handle or null. poll(handle, wait_ms) returns
0 no event, 1 action, 2 close, -1 invalid argument; wait range 0..100 ms. A native
WndProc only enqueues/coalesces control messages and never calls Vela. The native
queue holds at most 64 pending actions, overflow is an observable -2 event.
Close hides/destroys the window and emits one close event; ffi_close frees native
metadata. Calls must occur on the creating thread.

Acceptance: actual visible window, Unicode label, user-style button clicks update
the Vela counter, close event ends the loop and explicit destructor runs. Validate
invalid text and wait bounds. Hidden creation/build alone cannot close this gate.
No layout framework, persistence, async callbacks, network GUI, accessibility or
cross-platform support is claimed by this prototype.
