# Reusable GUI layer — 1.0.1c

Contract before implementation. `std/gui.vela` and `native/gui/adapter.c` provide
a Windows 10+ x64 ABI 1 form: caption, multiline text/editor, status and up to five
buttons. Geometry is specified in 96-DPI logical pixels. This is a bounded form
API, not a general widget toolkit or Linux backend.

`open(Config)` returns an opaque Window. Config specifies title/caption, client
width/height, read_only, UTF-8 text byte limit, buttons and close/changed event IDs.
Limits: width 320..1600, height 240..1200, text 1..65536 bytes, 1..5 unique buttons,
labels/title/caption/status 4096 UTF-8 bytes, event IDs 1..65535; zero disables
changed notifications. Close ID is a button ID and cannot equal changed ID.
Invalid configuration rejects before creating a window. Text disallows NUL.

Native callbacks only append event codes to the library's 64-entry queue. A pump
dispatches at most 64 messages and returns a copied event list in order, then
empties the queue. Overflow/dispatch failure is an explicit error. Application
I/O executes after pump returns. Close emits one event; actual window destruction
occurs only through `close`, after the app drains its own operations. Copies share
the owner, queue and closed state. Close cancels the callback before native handle
release and is idempotent. Other operations on a closed owner fail. All GUI APIs
are host calls with io/process/state effects and cannot run in async call graphs.

Native code owns HWND/control handles, font and transient UTF-8 snapshot; Vela owns
event policy and data. Snapshot is read synchronously before pumping again; no
borrowed native pointer escapes. Native setters suppress editor change events for
programmatic changes. Input exceeding the UTF-8 byte budget rejects on snapshot.

Windows are created in per-monitor-v2 awareness, restoring the caller's thread
context afterward. Initial DPI and WM_DPICHANGED resize controls and recreate
fonts using logical coordinates and the OS-suggested window rectangle. Scrolling
and text remain native Unicode controls. No global display settings are changed.
The editor supports Ctrl+A selection through the shared pump.

Acceptance: all three apps share this module/DLL; native lifecycle, duplicate IDs,
queue overflow, Unicode/snapshot, closed-owner errors; actual Notes edit/save/load
and scrolling; PulseDeck cancel/rerun/close; native message/layout checks and visible
rendering at 96/144/192 effective DPI. Synthetic DPI messages are distinguished
from unperformed physical multi-monitor transitions. Rebuild compiler and run
full verify after migration.

Platform references: [thread DPI](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext),
[WM_DPICHANGED](https://learn.microsoft.com/en-us/windows/win32/hidpi/wm-dpichanged),
[window geometry](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-adjustwindowrectexfordpi).
