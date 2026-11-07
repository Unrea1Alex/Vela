# Vela MCP

Optional local integration. Native build/bootstrap/verify and applications do
not require this package. Requires Node.js 24+, the native compiler and documentation
pinned by [compatibility.json](compatibility.json), and an MCP client. No remote server or credentials are used by the
adapter. Analysis does not execute user programs or the C compiler.

Unpack the separate MCP archive, run `npm ci --omit=dev` in its root. Compiled
`dist` is included. For development use `npm ci`, `npm run build`, `npm test`.
The lock fixes the official SDK and all dependencies. Native Windows delivery
is tested; other platforms are not declared supported by the Windows gate.
Language help and examples are read from the matching native installation.
That installation also contains the compiler sources and recovery seed.

Recommended setup (run from this package, use an existing application directory):

```powershell
node scripts/setup.mjs --workspace G:/Projects/my-app --toolchain G:/Tools/Vela
node G:/Projects/my-app/vela-codex.mjs --doctor
node G:/Projects/my-app/vela-codex.mjs
```

Setup verifies the matching toolchain, installs the application skill, creates
`.codex/vela-mcp.json`, a project MCP config and a launcher. It is repeatable with
identical settings; different existing owned files cause a clear refusal. Existing
client config is retained and a separate fragment is written when needed. No global
config or trust settings are changed. The launcher passes MCP configuration explicitly
and sets the correct working directory; it does not alter execution permissions.
Set VELA_CODEX only if the Codex executable is at a nonstandard location.

Doctor uses the official MCP client and checks fingerprints, tools, help and skill
presence. Its `client_discovery=not_tested` is intentional: a probe cannot establish
that another chat loaded tools. In the newly launched client call vela_get_context
as a native MCP tool and confirm the skill was discovered/read. Desktop/IDE users
must open this application as their trusted project and start a new session; opening
an unrelated chat and merely mentioning SETUP.md does not load its project settings.
The setup keeps connection files under excluded `.codex` so they are never analyzed.

Create a configuration outside the analyzed workspace:

```json
{
  "schema_version": 1,
  "toolchain": "G:/Tools/Vela",
  "workspace": "G:/Projects/my-app",
  "aliases": {"app": "vela.project"}
}
```

Use one workspace ancestor containing source and sibling dependencies. Snapshot
limits are 256 files/16 MiB, 2 MiB per file; excluded directories are build, bin,
dist, work, node_modules, .git and .codex. Links/hardlinks are rejected. Do not
select a whole development drive as the workspace. Source/manifest paths passed
to tools are relative to this root or an explicit configured alias like @app.

Codex configuration (replace paths):

```toml
[mcp_servers.vela]
command = "G:/Node/Node/node.exe"
args = ["G:/Tools/vela-mcp/dist/index.js", "--config", "G:/Projects/vela-mcp.json"]
```

For a temporary test use Codex CLI `-c` overrides; installation tests do not alter
global configuration. See [official MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Copy `agent/vela-app` into the application's `.agents/skills` directory and adapt
`agent/AGENTS.template.md` as its AGENTS.md. In this repository they reside in
`integrations/agent`. Ask the agent to call vela_get_context before writing Vela.

Tools: vela_get_context, vela_get_help, vela_check, vela_format, vela_symbols,
vela_query and vela_plan.
The help topic `idioms` is an executable example of enums, distinct IDs, generics,
Result, contracts and interpolation, tested with the matching compiler.
Help also provides `numbers`, `stdlib`, `testing` and `ffi`. Setup copies the matching
ordinary Vela modules into workspace/vela-stdlib; all dependencies then remain
inside the snapshot boundary. Existing differing library files require review
and are never silently overwritten. Release 0.6 archives remain unchanged.
Analysis tools accept optional unsaved source `text` alongside `path`; the host
can check a draft even when its editor cannot write files. The overlay affects
only the snapshot and never replaces a manifest or a workspace file.
Help is also available as resources at vela://help/TOPIC. Format returns text;
apply the proposed replacement through the host editor.
Use `vela_query` for definitions, references, direct calls and types/effects.
Its optional `at` uses a workspace-relative path and zero-based UTF-16 coordinates.
`vela_plan` takes that query's `snapshot_id` and native `revision` to preview
a rename or formatting edit. It rechecks the proposed source and writes nothing.
Inspect `data.native.scope.excluded_test_roots` when planning a project rename.
The native CLI supports pages for large indexes.
Projects with declared `resource` rows build and run through the local CLI.
MCP execution accepts legacy DLL rows and explicit Windows x64 ABI 1 shared
rows subject to the same host SHA-256 allowlist.

Optional Windows execution uses a prepared private MSVC/SDK cache and LPAC/Job
supervisor. Run the preparation command from this MCP package (or from
integrations/mcp in the repository). Root is the matching native installation;
MSVC x64 build tools and Windows SDK must already be installed. Then set up a
new application workspace with the explicit manifest:

```powershell
powershell -NoProfile -File scripts/prepare-execution.ps1 -Root G:/Vela
node scripts/setup.mjs --workspace G:/Projects/my-app --toolchain G:/Vela --execution-manifest G:/Vela/build/mcp-execution/execution.json
```

The compiler cache excludes optional MSVC telemetry. Setup pins its manifest;
it does not download a compiler or change installed toolchain/global ACLs.
Each server startup verifies all bytes and exercises real isolation, compilation,
execution and named tests before advertising vela_build, vela_test and vela_run.
Context reports execution:false and a reason if this fails; analysis remains usable.
The cache serves one server at a time. A native lease waits for supervisor cleanup
and releases its lock even if the client forcibly terminates the Node server.
Legacy stale lock files require review; setup never silently takes over an active cache.

Build/test accept the same path/text/overlay_path inputs. Build returns artifact_id;
run accepts that ID, args, timeout_ms and optional outputs. Artifacts retain the effective snapshot
and expire after 30 minutes; edits require rebuilding. Default run timeout is 5 s,
maximum 30 s; build/test 120 s, one execution at a time. Outputs are bounded and
returned as UTF-8 or explicitly encoded hex. Execution has no network access and
cannot write the original project. To export a report, request
`outputs: ["report.html"]` and pass `../export/report.html` to the application.
An exit-zero run returns the output's ID, MIME, size and SHA-256. Use
`vela_read_output` to retrieve base64 chunks, verify the hash and save explicitly
in the client. See the [output artifact contract](../../docs/contracts/MCP-OUTPUT-ARTIFACTS.md).
The executable `artifact_id` is distinct from an `output_id`.
Native manifests require host-reviewed hashes in
execution.native_allowlist, empty by default. No arbitrary shell/flags/environment.
See [execution contract](../../docs/contracts/MCP-EXECUTION.md) for exact limits,
the monitored (not hard-quota) disk bound and platform validation requirements.

MCP Inspector CLI can test the same command with tools/list, tools/call and
resources/read. Client versions, wire revisions and actual results are recorded
in compatibility.json and the accompanying validation reports.

Updating: stop the client, install matching native/MCP releases, retain the
configuration's workspace selection, reconnect and inspect vela_get_context.
A fingerprint mismatch is intentional even when version strings agree.
Do not edit hashes to force compatibility. scripts/pin.mjs is a release-maintainer
operation after native/docs verification, not an end-user repair command.
For the released 0.11.0 use matching native and MCP archives. The working tree
targets the 1.0.0-dev series; it is not a new release archive. Setup also delivers
`task_group.vela`, `async_io.vela` and `gui.vela`, alongside `event_loop.vela`,
`tasks.vela` and the extended HTTP modules. The development skill and native help
describe awaitable operations, GUI ownership and payloadless enum equality.

Optional Windows execution tests require a prepared execution cache and a trusted
ABI fixture. Build it with `scripts/build-test-fixture.ps1 -NativeRoot ABSOLUTE_NATIVE`,
set `VELA_TEST_FFI_FIXTURE` to its printed DLL path, `VELA_TEST_NATIVE_ROOT` to that
native installation and optionally `VELA_TEST_EVIDENCE_DIR` to an output directory;
then run `npm run test:execution`. Run hosts sharing one execution cache serially:
its exclusive lease intentionally prevents a second execution host from starting.

Malformed JSON returns a JSON-RPC parse error. Bad UTF-8 or oversized protocol
lines close the connection. Language errors remain native structured diagnostics.
Timeout, cancellation, limits and toolchain failures have separate status values.
Cancellation and disconnect terminate owned analysis children and remove snapshots.
