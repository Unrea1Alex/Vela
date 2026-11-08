# Compact entry and generated API (1.2.1)

Implemented and verified in 1.2.1; the roadmap links the focused and native
evidence. Existing 1.x APIs and MCP response envelopes remain compatible.

The native command `vela api SOURCE_OR_PROJECT --json` checks the module graph
without requiring main, then describes only exported declarations of the entry
module. It includes uninstantiated generic signatures, effect parameters, public
methods, interface operations and opaque type names without their hidden fields.
`vela api --builtins` describes the embedded catalog. No C compiler is involved.
Schema 1 gives stable module-local names, signatures/effects and source spans;
invalid source returns the normal native diagnostic. `tools/help.vela` executes
these commands to generate `docs/api-index.json`. Authored recipe metadata refers
to these IDs; it never supplies a second handwritten function signature.

The installed skill is a short entry instruction. Context returns a separate
short start text, current versions, limits and actual execution availability.
Language/API details, platform limits, recipes and historical migration material
are fetched on demand. Existing help topics/resources and equivalent JSON text
plus structuredContent remain available. No automatic loading of full help.
When execution=false, use the authorized installed native check/build/test/run;
configured MCP or an external probe does not imply client tool discovery.

Startup measurement is fixed before implementation: published
[js-tiktoken 1.0.21](https://www.npmjs.com/package/js-tiktoken/v/1.0.21),
cl100k_base, npm integrity recorded with evidence. Count the complete skill,
model-facing mandatory analysis-tool definitions (name, description, inputSchema),
and the actual context response, including BOTH text and structuredContent.
Serialize compact JSON with UTF-8, concatenate the three parts with LF and encode
once; the limit is 2000 tokens. This is the fixed client projection used for the
later A/B experiment. Optional execution tools are discovered only when enabled.
Also report the complete wire tool list, including outputSchema/annotations,
separately; schema validation metadata is not omitted from that measurement.
These are reproducible tokenizer counts, not claimed provider billing tokens.

Input validation retains all old bounds/conditional requirements. Shared source
fields in a plan may be described once and conditional constraints checked at
runtime; invalid combinations remain protocol input errors. Output schema 1 is
unchanged. Examples must check/build/run with independent golden output; the
directory recipe uses a supplied fixture, HTTP uses deterministic setup rather
than relying on a public server. A fresh agent must find the directory recipe
from only the installed entry/recipe index. The stage also requires native verify.
