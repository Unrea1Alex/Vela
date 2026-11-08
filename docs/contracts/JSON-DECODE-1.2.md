# Typed JSON decoding (1.2.6)

Accepted before implementation, 2026-11-08. New opt-in json_decode module;
json/json_stream public types, variants and behavior remain unchanged. No macro,
reflection, Any/cast, C parser or new ownership model is introduced.

Decoder<T> and Fields are opaque. Public constructors: string(), boolean(),
integer(min,max), number(min,max), array(element,min,max), nullable(element),
object<T>(names, Unknown::Ignore|Reject, build). Bounded constructors return
Result<Decoder<...>,Error>; invalid ranges, nonfinite float bounds, duplicate or
invalid field declarations fail as Schema errors before input access. object
snapshots <=256 unique UTF-8 field names (<=1024 bytes each). build has the exact
type fn(Fields)->Result<T,Error> effects {state}; it creates a checked Vela record
or other explicit T. There is no runtime mapping from field names to record layout.

decode(decoder,data,json_stream::Limits) first validates the COMPLETE UTF-8 JSON
syntax with json_stream::skip_value/finish, including all duplicates/ignored
values, before invoking any schema callback. Existing 16 MiB/depth 4096/node
1000000 ceilings apply; caller may choose smaller budgets. Syntax errors take
priority over typed/unknown-field errors. Duplicate keys are Syntax errors with
the unchanged typed json_stream cause, even for ignored members.

The schema layer locates byte spans ONLY in this validated immutable input.
Its delimiter/string-boundary scanner neither accepts raw JSON independently
nor checks/decodes escapes or numeric grammar: json_stream remains the validator
and supplies decoded keys/primitive tokens. Ignored values are never converted
to numbers, so arbitrarily large valid numeric spellings remain skippable.
Spans are immutable String views retaining their backing data under existing GC.

required(fields,name,decoder), optional(fields,name,decoder), and
defaulted(fields,name,decoder,fallback) perform typed field access. names must be
declared; undeclared access is a Schema error. Required absence is Missing;
optional absence is None; default applies ONLY to absence. Explicit null is
decoded normally and never replaced by a default. nullable yields None for null,
Some(decoded) otherwise; optional(nullable(...)) distinguishes missing and null.
Fallback evaluation is ordinarily eager; no hidden lazy callback is introduced.

All schema callbacks/reads run with state, no library I/O. A record builder runs
once after structural validation and unknown-field policy. Ignore validates but
does not retain unknown member spans; Reject reports the first unknown name in
source order before build. Declared members retain private immutable span views.
Objects may read declared members in any order. Schema callbacks may mutate their
explicit captures; a typed failure does not roll back those ordinary side effects.

Arrays return new List<T> in input order, with inclusive min/max count, max 65536.
The first element error stops typed callbacks; complete syntax was already checked.
Integer conversion requires a lexical Int literal (no fraction/exponent), exact
signed 64-bit range, then schema min/max. number converts finite Float64 (ordinary
rounding permitted) then bounds; overflow/nonfinite fails. No string/bool coercion.

Every decoder invocation, including nullable wrappers, consumes one of 128 nested
library-call levels. Outer schema/error paths are limited to 65536 bytes; budget errors point
at the nearest representable parent/value offset. These limits are separate from
the iterative syntax validator's depth: deeply nested IGNORED data still works.
The unchanged syntax cause retains its original reader path, governed by the
existing validator/input budgets, rather than silently truncating that cause.
Arbitrary user callback work/recursion is outside these library bounds. This is
bounded in-memory decoding, not a lazy/file stream or constant-buffer claim.

Error has kind Schema/Syntax/Encoding/Type/Range/Missing/Unknown/Limit, a root-relative
JSON path, zero-based UTF-8 byte offset, message and optional typed json_stream
cause. The cause is retained as returned by its local reader (its coordinates
are local to that span); the outer path/offset translate to the original input.
Missing fields use the containing object's opening byte and the absent member's
path. Unknown fields point to their key's opening quote. Type/range errors point
to the value. describe formats the OUTER coordinates. No byte/code-point confusion.

Validation: typed records/nested arrays; required/optional/default/null distinctions;
unknown/duplicate/ignored malformed or huge numeric values; Int extrema/overflow,
Float range, declaration/array/depth/path budgets; exact Unicode/escaped-key paths
and byte offsets; wrong callback types/effects/opaque construction; callback counts,
payload aliases/backing lifetimes and GC stress. HTTP config and log records replace
their manual event/field/as_* chains; frozen 44/46 app oracles and native verify pass.
