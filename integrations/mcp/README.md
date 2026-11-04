# Vela MCP 0.7.0

Optional local integration. Native build/bootstrap/verify and applications do
not require this package. Requires Node.js 24+, the matching native Vela 0.7
delivery, and an MCP client. No remote server or credentials are used by the
adapter. Analysis does not execute user programs or the C compiler.

Unpack the separate MCP archive, run `npm ci --omit=dev` in its root. Compiled
`dist` is included. For development use `npm ci`, `npm run build`, `npm test`.
The lock fixes the official SDK and all dependencies. Native Windows delivery
is tested; other platforms are not declared supported by the Windows gate.
Included language documents, source examples and historical reports are reference
material. Run their native compiler/bootstrap commands from the separate native
installation, which contains the full compiler sources and recovery seed.

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

Tools: vela_get_context, vela_get_help, vela_check, vela_format, vela_symbols.
The help topic `idioms` is an executable example of enums, distinct IDs, generics,
Result, contracts and interpolation, tested with the matching compiler.
Version 0.7 also provides `numbers`, `stdlib`, `testing` and `ffi`. Setup copies the matching
ordinary Vela modules into workspace/vela-stdlib; all dependencies then remain
inside the snapshot boundary. Existing differing library files require review
and are never silently overwritten. Release 0.6 archives remain unchanged.
Analysis tools accept optional unsaved source `text` alongside `path`; the host
can check a draft even when its editor cannot write files. The overlay affects
only the snapshot and never replaces a manifest or a workspace file.
Help is also available as resources at vela://help/TOPIC. Format returns text;
apply the proposed replacement through the host editor.

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
run accepts that ID, args and timeout_ms only. Artifacts retain the effective snapshot
and expire after 30 minutes; edits require rebuilding. Default run timeout is 5 s,
maximum 30 s; build/test 120 s, one execution at a time. Outputs are bounded and
returned as UTF-8 or explicitly encoded hex. Execution has no network access and
cannot write the original project. Files created by applications are disposable,
not automatically exported. artifact_id identifies a built executable; 0.7.0 has
no generated-file retrieval tool. A saved report currently requires the authorized
native CLI. Explicit file artifacts are planned in ROADMAP 0.9.9, with a separate
contract and host-controlled saving; this is not an available capability.
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
Documentation in the working tree was corrected after the 0.7.0 archives were
created. Its documentation pins differ; the compiler bytes/version are unchanged.
Keep native documents and the MCP compatibility manifest from the same verified
revision. Existing archives retain their original contents and matching manifest.

Malformed JSON returns a JSON-RPC parse error. Bad UTF-8 or oversized protocol
lines close the connection. Language errors remain native structured diagnostics;
timeout/cancellation/limits/toolchain failures have separate status values.
Cancellation/disconnect terminates owned analysis children and removes snapshots.
Analysis relies on a checked, link-free snapshot. Optional execution additionally
uses OS isolation; it is not inferred from effects or an ordinary temporary cwd.
