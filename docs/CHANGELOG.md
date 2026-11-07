# Changelog

## 1.0.0 — 2026-11-07

Release acceptance found a Windows AppContainer failure when publishing an allowed
native DLL: canonical_path could not query a DOS volume name. Its restricted-token
fallback now uses the normalized handle NT path in Win32 GLOBALROOT form, preserving
identity/containment checks and isolation. This repairs the documented valid-path
contract; ABI/effects/budgets are unchanged. The conservative source snapshot is
reviewed/refreshed for this implementation fix and explanatory documentation.

The 1.0 contract is frozen; [release acceptance](VALIDATION-1.0.md) is tracked in roadmap 1.0.4.
Compared with 0.11: task groups and awaitable HTTP/process; observable cache
hits/misses and directory fallback; shared Windows GUI; URL/method/header/binary
HTTP requests and HEAD/Content-Type server support; payloadless enum equality.

Source changes requiring migration: HTTP Error adds two variants and server
Response requires content_type. GUI examples now use vela-gui.dll. See
[migration](MIGRATING-1.0.md). Project/lock format 1, public FFI ABI 1 and internal
runtime ABI 2 retain their versions. HTTP pooling is deferred after 1.0.

Roadmap 1.0.2 creates an 84-file conservative source contract snapshot; 1.0.3 adds
the compatibility/deprecation/patch policy and executable migration example.
No API is initially deprecated. Release evidence and checksums accompany the
Windows native, optional MCP and Linux console artifacts.

Historical releases: [0.11](VALIDATION-0.11.md), [0.10](VALIDATION-0.10.md),
[0.9](VALIDATION-0.9.md), [0.8](VALIDATION-0.8.md), [0.7](VALIDATION-0.7.md).
