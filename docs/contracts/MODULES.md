# Modules (Vela 0.6)

Memory descriptions of the original version are historical. In 0.8,
[the tracing heap](../MEMORY.md) governs managed values.

Status: implemented and verified; roadmap contract 0.6.1, implementation 0.6.2. Existing 0.5 programs
remain valid. A module is one normalized UTF-8 source file; it contains only
imports and declarations, never executable initialization.

## Syntax and names

```
import "math.vela" as math;
import "records.vela";
pub fn twice(n: Int) -> Int { return n * 2; }
fn main() -> Int { return math::twice(21); }
```

Imports precede declarations. Paths are relative to the importing file. An alias
exposes public declarations through `alias::name`; an import without an alias
exposes public names unqualified. Import aliases must be unique and cannot
conflict with declarations. Re-export and wildcard filesystem discovery are not
supported. Dependency-prefixed paths such as "@math" are resolved from an explicit
project manifest; see [PROJECT-FORMAT](PROJECT-FORMAT.md).

Declarations are private by default; `pub` applies to fn/struct/enum/distinct type.
Fields and constructors of an ordinary public struct and variants of a public
enum are public. In the 0.10 development compiler, an
[opaque struct](ENCAPSULATION.md) exports its type without exposing its fields
or constructor. Public signatures and open representations may not expose
private types; opaque fields can contain private types.
Methods declared in the owner's [impl block](METHODS.md) are private unless
marked `pub` and the owning type is public. They are selected by the receiver's
nominal type or by an explicit type qualification.

Generic type parameters are not module declarations. Generic bodies resolve names in their
defining module, including private helpers; call-site type arguments resolve at
the call site. All ordinary function bodies are checked, including unused ones.

Unqualified lookup checks the defining module, then public names from its direct
unaliased imports, then the builtin prelude. Multiple imported declarations of
the same name are an ambiguity error even if their signatures match. Repeated
imports of the same file/declaration do not duplicate that declaration. Local
bindings retain their existing shadowing rules; a shadowed function is not callable.
The 1.0 builtin names remain reserved for top-level declarations in every module.
From 1.1, newly introduced builtin functions are fallbacks: own declarations and
visible imports keep precedence, preserving valid 1.0 programs. The catalog's
since column controls this rule; existing ambiguity/privacy rules stay unchanged.
The root module's internal disambiguation prefix is hidden from public symbol
names and displayed types. [Compatibility contract](LIBRARY-1.1.md).
Qualified access never bypasses privacy. Qualified types work in nested generic
arguments, constructors and enum match patterns. Each declaration has an identity
in its owning module; equal spelling in different modules does not unify types.

The entry file supplies `main`; another module's `main` is an ordinary function.
Single-file sources need no module header or project manifest. Formatting one file
does not load imports or require semantic success, and preserves import order.

## Graph, source locations and limits

Import cycles are allowed because modules have no initialization. The loader
registers file identity before following edges; each file is parsed once. Existing
rejection of recursive types by value applies across module boundaries. This
policy accommodates mutually recursive compiler routines without a textual include.

Canonical file identities deduplicate relative, case and hard-link aliases where
the host supports them. Discovery order is deterministic: entry first, depth-first
imports in source order. Missing files and malformed import declarations are
reported at the importing source; malformed loaded sources retain their own path.
Limits: 256 files, import traversal depth 128, 16 MiB normalized source in a graph.
Limits are checked before dependent parsing/analysis; whole-file reads still use
the process region. These limits do not promise bounded allocation before OS reads.

AST/HIR spans refer to an immutable source table throughout lowering. Diagnostics,
related declarations and runtime checks name the actual originating file. Public
JSON coordinates remain normalized Unicode code points per file, not byte offsets
in aggregate storage. No backend receives syntax nodes or resolves imports.

E221: import/graph failure; E222: ambiguous or unknown module-qualified name;
E223: private declaration or opaque field access; E224: private type in public
API; E232: opaque constructor outside its defining module.
An invalid program exits 1; environment/toolchain failures retain exit 2.

## Validation and bootstrap migration

Test two modules with identical names; public/private access and private signature
leaks; qualified generic types/functions/enum patterns; defining-module generic
lookup; open-import ambiguity; cycles and forbidden value cycles; missing imports;
path aliases, Unicode/BOM/CRLF; exact primary/related/runtime locations; original
and formatted behavior; deterministic output and graph limits.

The compiler becomes an ordinary project made from its authored modules. Its
existing sources.list remains a recovery manifest: the Vela bundler removes only
compiler import/public wrappers and embeds runtime/catalog text into an autonomous
source. This compatibility bundle relies on unique compiler declaration names;
it is not the general module resolver. Verify builds generations from the ordinary
project once the bootstrap seed supports modules, checks compiler and bundler fixed
points, and separately validates the recovery route. No Python dependency is added.

Evidence: `build/stage06/062-final-verify.log`: 850/850, three module-graph
generations and both fixed points. `062-focused-final.log`: 164/164, including
three additional graph-limit checks added after the aggregate run. Linux smoke
was attempted; installed Ubuntu distributions cannot start (missing ext4.vhdx).
No Linux support is claimed from Windows validation.
