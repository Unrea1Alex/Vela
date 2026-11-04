# MCP execution contract — 0.7.7

Status: verified on Windows x64; version/platform acceptance is recorded in ROADMAP.md.
Analysis-only protocol 0.6 remains available. Execution is optional and off until
the configured isolation backend passes a real startup probe.

## Tools and snapshots

vela_build accepts a workspace-relative source/manifest path, optional unsaved
source text and overlay_path, following analysis snapshot bounds. It returns an
opaque artifact_id, snapshot_id, compiler_id and execution_toolchain_id only
after successful isolated compilation and complete process-tree termination.
Compiler diagnostics remain native JSON where available. No shell, C flags,
executable paths, downloads or environment overrides are tool arguments.

vela_test accepts the same source snapshot inputs; declarations/legacy entries
use native test report schema 2. Tests execute under exactly the same OS policy
as run, including subprocesses. A successful check is not a successful test.

vela_run accepts only an artifact_id issued by this server, optional argument
array (up to 64 values, 16 KiB total, valid text without NUL), and optional timeout
within the host's cap. No caller-supplied cwd, command, path or environment.
The artifact is bound to executable bytes, complete effective source snapshot,
native companion bytes and the pinned compiler/C toolchain/helper. Store at most
8 artifacts/64 MiB total, expire after 30 minutes; disconnect deletes them.
Unknown/expired/changed artifacts and changed workspace/toolchain are rejected.
An unsaved overlay is part of the artifact; the original disk snapshot must still
match when it runs. Artifacts are immutable host-owned bytes outside guest access.

Snapshot captures regular files only, rejects links/hardlinks/reparse escapes and
checks identities/content again before execution. Imports are resolved from the
snapshot. Native dependencies require an explicit host-configured SHA-256 allowlist;
a project lock alone cannot authorize native DLL execution. No native DLL is
allowed by default. DLLs are included in artifact fingerprints/staged companions.

## Trusted installation and Windows policy

Supported configuration: Windows x64, LPAC (less privileged AppContainer)
with registryRead only (no network/COM/clipboard capabilities), plus a non-breakaway Job Object. A native OS supervisor
creates the token/profile and starts suspended, assigns the job, then resumes.
Use SECURITY_CAPABILITIES and ALL_APPLICATION_PACKAGES_POLICY opt-out. There is
no fallback to an unrestricted process, ordinary cwd or effect annotations.
The helper implements OS primitives; Vela still parses/checks/lowers language code.

The 0.7.8 platform experiment revised the zero-capability proposal: on Windows
10.0.26300 it denied CreateProcess with error 5, even for a readable executable.
registryRead permits required system registry reads and child creation; it does
not grant registry writes or network access. The actual gate checks socket denial
and outside-file denial. No drive aliases or installed-directory ACL changes are
required. MSVC 19.44.35222 with SDK 10.0.26100.0 is the tested configuration.

The maintainer prepares a private copy of the selected MSVC x64 binaries, headers
and libraries and pins every file. Installed Visual Studio/SDK directories and
global ACLs are never modified. Compiler and C compiler execute inside isolation;
untrusted generated C is never compiled as an unrestricted host process.
The guest can read only its snapshot/toolchain and the minimal system resources
required by Windows LPAC. It can write only its private request work directory
and its own disposable AppContainer profile storage. Private user files, original
workspace and other requests/artifacts receive no access grants. No network
capability or loopback exemption is installed. Outbound/loopback access is tested,
not inferred from an effect or a timeout.

The cache omits optional vctip.exe telemetry: those extra MSVC processes exhausted
the job process bound in the platform experiment. A native delete-on-close lease
serializes cache ACL changes across server instances. On host EOF it waits for the
supervisor's operation marker, removes the owned temporary tree without following
reparse points and releases the lease. Legacy stale lock files require review.
Lease and supervisor are detached from Node's implicit child job, with hidden
windows and private pipes; EOF triggers cleanup even after forced Node termination.
Cleanup failures leave a .lock.failure.txt record and disable subsequent execution
until the installation owner reviews it. Concurrent tree monitoring enumerates
directory handles and opens descendants relative to those handles without following
reparse points; disappearance during normal compiler cleanup is not a quota failure.
Startup also builds/runs a known program
and executes both a failing and a passing named test before tools are advertised.
On the tested OS the TokenIsLessPrivilegedAppContainer query returns error 87;
the gate instead verifies AppContainer and actual denial of a protected file
granted only to ALL_APPLICATION_PACKAGES, including in a descendant. TCP IPv4,
TCP IPv6 and UDP socket creation must be denied with WSAEACCES after a successful
host control. This prevents outbound and loopback connections before connect.

Use a fresh owned profile per request; remove it after the complete job exits.
Grant ACLs only to owned directories; remove temporary grants afterwards. The
trusted helper, copied toolchain and host artifact store remain non-writable by
the guest. Reject reparse points when exporting/cleaning guest artifacts.
Host shutdown/cancellation kills the entire job and waits for no active processes
before reporting completion or publishing/removing files.

The environment is an allowlist: system paths, explicit copied INCLUDE/LIB/PATH,
VELA_CC/KIND/SOURCE_ROOT, and private TMP/TEMP. No inherited tokens, passwords,
cloud credentials or arbitrary user environment. The UI is noninteractive;
Job UI restrictions block desktop/clipboard/global settings. Native GUI probes
are deliberately outside these MCP execution capabilities.

## Limits, output and failure

One execution request at a time; analysis has its existing independent bound.
Default run 5 s, maximum 30 s; build/test maximum 120 s. Job memory 1 GiB total,
Job ActiveProcessLimit=8, no breakaway; supervisor wall time is authoritative.
The gate verifies that a workload cannot create an eighth simultaneous child.
Windows can additionally associate its own console hosts with the job: the
observed accounting can exceed 8, so this is not a promise of 8 total OS processes.
Those console hosts are included in complete-job termination before cleanup.
Captured stdout/stderr at most 4 MiB combined. Return valid UTF-8 text or explicit
hex encoding for arbitrary bytes; never silently replace invalid UTF-8.
Private output tree is limited to 64 MiB/1024 files by supervision. Disk/tree
limits are monitored and may overshoot between polls; they are not filesystem
quotas or a guarantee against exhausting the host volume. A deployment needing
a hard disk quota must additionally use a quota-backed volume before enabling
execution. The process/tree/time/memory boundaries remain OS-enforced.

Results distinguish rejected code/tests, build infrastructure failure, invalid
input, source_changed, timeout, cancellation, limit and incompatible backend.
Nonzero application exit is reported as a run result with its exit code; it must
not be reclassified as a compiler error. Tests preserve native passed/failed status.
Failed/cancelled/limited builds never publish an artifact. Temporary files and
profiles are cleaned on all ordinary exit paths; unexpected helper death fails
closed, kills its job via handle closure and reports any cleanup limitation.
Only completed, bounded regular-file outputs can be returned as artifacts; never
copy them into the user's workspace implicitly.
In 0.7.0 artifact_id addresses the built executable only. There is no endpoint
for retrieving a generated HTML/image/data file. Explicit output-file artifacts
are planned in ROADMAP 0.9.9; no future tool name or schema is part of this contract.

## Required gate before enabling a platform

- Positive build/run/test through the official MCP SDK with exact expected output.
- Compiler and child process really have AppContainer/LPAC token and job limits.
- Read/write an outside sentinel fails; original workspace bytes stay identical.
- Network/loopback connection fails without creating a firewall exemption.
- Private work writes succeed; toolchain modification fails.
- A spawned child cannot escape; timeout, explicit cancellation and disconnect
  terminate all descendants. Output flooding and memory/process/tree limits stop work.
- Forged/stale/expired artifact IDs, altered toolchain, unknown native DLL, path
  escape, links, source race, bad arguments and non-UTF-8 output are covered.
- Missing/failed isolation: tools absent, execution:false and a reason in context.
- Fresh agent cycle: help → code → check → build/test/run → correction, with native
  execution tools actually discovered. Record skill discovery separately.

Sources: [AppContainer isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation),
[profile lifecycle](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile),
[process attributes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
Remote MCP transport, arbitrary shell commands, internet-enabled application runs
and other platforms are outside this version.
