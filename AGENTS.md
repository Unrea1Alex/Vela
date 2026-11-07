# Working on Vela

## Development plan

- Development follows [docs/ROADMAP.md](docs/ROADMAP.md). Read it before feature work or architectural refactoring; identify the current milestone, item ID, dependencies and acceptance criteria. Current explicit user instructions take precedence over the planned order.
- Keep the roadmap current in the same change as implementation: update item/version status, remaining work, affected dependencies, evidence and the next concrete step. Record the reason for changes of order or scope; do not silently remove unfinished commitments.
- Follow each item's sequence: define its contract and validation criteria, implement a bounded block, run focused checks immediately, update actual specifications/examples, then run the applicable aggregate gate. New semantics, memory/resource behavior, ABI, FFI, protocols and cancellation require explicit contracts before dependent implementation.
- Distinguish planned, in-progress, implemented-but-unverified and verified work. Close a roadmap checkbox only after its acceptance criteria are met; finish a version only after its release gate. Keep proposed designs separate from documentation of implemented behavior.
- Use the roadmap's requirements for additional tests and documents, including the GUI/network application milestones. Record actual results and unperformed checks; do not claim support from a build alone.
- Documentation-only changes require link/content/dependency checks, not a full compiler/runtime rebuild. Routine decisions within authorized work should be made and recorded without inventing an extra approval step.
- Maintain documentation as part of every public language, builtin, CLI, project or MCP change: update current specifications, quickstart, skill guidance and affected examples together; remove contradictory old claims instead of only appending a new section. Keep historical release reports explicitly historical. Validate executable examples and links, refresh compatibility fingerprints only after verification, and record any unperformed documentation/client checks in the roadmap. A feature is not finished while its shipped instructions describe different behavior.

## Compiler and validation rules

- Keep syntax, semantic analysis, checked IR, backend and host integration separate.
- Do not pass syntax nodes to a backend or use the C compiler as Vela's type checker.
- Preserve source locations and documented evaluation order through every lowering.
- Never lower signed arithmetic to unchecked C operations unless overflow has been proved impossible.
- Contracts are runtime checks; do not report them as statically proved.
- The active compiler and development tools are Vela. Python is an optional historical 0.2 reference, not a build dependency.
- The optional external MCP adapter planned in roadmap 0.6.6–0.6.8 may use TypeScript/Node.js and the official MCP SDK for transport, documentation access and process orchestration only. Compiler algorithms remain in Vela; native build/bootstrap/verify and ordinary Vela programs must not depend on Node.js or MCP. Keep its packaging and integration gate separate.
- Run `.\vela-dev.cmd verify` when changing compiler/runtime semantics. It builds three compiler generations, compares emitted C bytes, checks the bundler fixed point and runs the native fixture/driver suite without skips.
- New features need observable behavior tests, including rejection/error cases where appropriate.
- Document semantic changes in `docs/LANGUAGE.md`; update `docs/ARCHITECTURE.md` when changing phase boundaries.
- Do not silently expand the memory model. Specify ownership/lifetimes before adding dynamic allocations or references.
- Follow the precise tracing model in `docs/MEMORY.md` and preserve bootstrap compatibility. List reads/writes require `state`.
- Edit authored selfhost/*.vela files, not the generated selfhost/compiler.vela bundle. `tools/bundle.vela` reads `selfhost/sources.list`; `.\vela-dev.cmd bundle` regenerates the bundle.
- Add builtin signatures, effects, generic patterns and ABI classifications only in `vela/builtins.def`. Keep the Python reference reader and native catalog reader compatible with that format.
- Tests live in `tests/cases/` plus `tools/test.vela`. Add explicit expected outputs/rejection codes; do not use compiler output as its own test oracle.
- Keep compiler algorithms in Vela. Runtime code may provide storage/OS primitives, not language parsing/checking/emission or calls to Python.
