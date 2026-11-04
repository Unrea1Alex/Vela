# Vela

**A self-hosted programming language with explicit effects and tools for AI agents.**

[Русский](README.ru.md) · [Language](docs/LANGUAGE.md) · [Quickstart](docs/AGENT-QUICKSTART.md) · [Roadmap](docs/ROADMAP.md) · [MIT license](LICENSE)

Vela compiles to native executables through C11. Its compiler, source bundler,
build driver and test runner are written in Vela. The language makes types,
side effects and error paths visible so that people and agents can reason about
a small piece of code from its local context.

**Current version: 0.7.0.** Verified on Windows x64 with MSVC. Vela is experimental;
the language and APIs may change before 1.0.

## A small example

```text
type NodeId = distinct Int;
struct Node { id: NodeId, name: String }

fn main() -> Unit effects { state, io } {
    let nodes = list_new<Node>();
    list_push(nodes, Node(id: NodeId(1), name: "root"));
    for node in nodes {
        print(f"{node.id.value:d}: {node.name:s}");
    }
}
```

This prints `1: root`. `NodeId` is distinct from `Int`; collections require the
`state` effect even for reads, and printing requires `io`.

## Try it on Windows

Install Visual Studio Build Tools with the **Desktop development with C++**
workload and a Windows SDK. Clone the repository, then run from PowerShell:

```powershell
git clone https://github.com/Unrea1Alex/Vela.git
cd Vela
.\vela.cmd --version
.\vela.cmd check examples/pipeline.vela
.\vela.cmd run examples/pipeline.vela
.\vela.cmd build examples/factorial.vela -o bin/my-factorial.exe
.\bin\my-factorial.exe 10
```

The repository includes four verified bootstrap executables in `bin/`. The command
wrappers locate MSVC automatically. Checking source, formatting and inspecting
symbols do not require a C compiler. Building and running source do. Finished
Vela programs do not require Vela, Python or Node.js to run.

To build the compiler without a Vela executable, use the standalone
[C recovery seed](bootstrap/README.md). Its source and recovery procedure are
included in the repository.

## What works today

- Static types, structs, enums, exhaustive matching and nominal `distinct` IDs.
- Generic functions and types, `List<T>`, `Dict<K,V>`, `Option`, `Result` and `?`.
- Explicit effects, runtime contracts and checked signed integer arithmetic.
- Float64 with explicit integer conversions and documented floating-point rules.
- Imports, public declarations, local project dependencies and lock files.
- Standard modules for text, paths, collections, JSON, CLI, configuration, files,
  processes and testing.
- Named tests, structured diagnostics, formatting and symbol inspection.
- Synchronous Windows x64 FFI ABI 1, with explicit native dependencies and handles.

See the [language specification](docs/LANGUAGE.md), [standard library](docs/STDLIB.md)
and [project guide](docs/PROJECTS.md) for exact behavior and limits.

## Use Vela with an agent

The optional [MCP adapter](integrations/mcp/README.md) supplies language help,
project context, checking, formatting and symbols. The accompanying
[application skill](integrations/agent/vela-app/SKILL.md) teaches an agent how to
use the current language without guessing syntax or APIs.

For a source checkout, install Node.js 24 or newer and build the adapter:

```powershell
cd integrations/mcp
npm ci
npm run build
```

Follow the [MCP setup instructions](integrations/mcp/README.md) to connect an
existing application folder to the matching toolchain. Optional build, test and
run tools become available only after the Windows LPAC/Job isolation probes pass.
The native compiler and ordinary programs have no Node.js or MCP dependency.

## An application: MeasureLab

[MeasureLab](apps/measurelab/README.md) reads JSON measurements, computes mean,
median, p95 and standard deviation, and writes an offline HTML/SVG report.
Its data model, validation, statistics and rendering are Vela; a small C adapter
provides `sqrt` through the FFI.

![MeasureLab report with scenario statistics and charts](apps/measurelab/preview-card.jpg)

The screenshot uses synthetic data, not compiler benchmarks. Build and run the
application from the repository root:

```powershell
.\apps\measurelab\build.ps1
.\apps\measurelab\run-demo.cmd
```

The repository also contains [TimeLog](apps/timelog/README.md), a TSV-to-HTML
report application, and smaller [language examples](examples/).

## Build and verify the language

```powershell
.\vela-dev.cmd verify
```

This builds three compiler generations, compares emitted C byte for byte,
checks the bundler fixed point and runs the native fixture/driver suite.
The recorded 0.7 release gate passed **974/974 checks**, with no failures or skips,
in both the working tree and a clean staging tree. These are local Windows
validation results, not a claim of cross-platform support or a hosted CI result.
See [validation](docs/VALIDATION-0.7.md) and the [architecture](docs/ARCHITECTURE.md).

Edit the authored files listed in `selfhost/sources.list`; regenerate
`selfhost/compiler.vela` using `.\vela-dev.cmd bundle`. Contributor rules are in
[AGENTS.md](AGENTS.md). Bug reports should include the compiler version, a small
reproducer, the command used, expected behavior and actual diagnostics.

## Current limits and next steps

Dynamic objects live in a process region; there is no GC or ownership system yet.
Contracts are runtime checks. Functions as values, closures, async tasks, LSP and
incremental analysis are planned. Windows GUI and HTTP prototypes exist, but a
complete GUI/network framework and other platforms have not passed release gates.

The next development step is **0.8.1**, covering memory and resource contracts.
The [roadmap](docs/ROADMAP.md) also records improvements found while building
MeasureLab: basic math, precise number formatting, JSON extraction, text building,
large text resources, formatter layout and retrieval of files produced through MCP.
These are planned features, not APIs available in 0.7.0.

Documentation was refined after the local 0.7.0 archives were built. Use the
compiler, documentation and MCP compatibility manifest from the same checkout.
The `vela/` Python frontend is a historical 0.2 reference; active development and
verification use the native Vela tools.

Vela is available under the [MIT license](LICENSE).
