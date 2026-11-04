# String interpolation (0.5.5)

Status: verified in 0.5.5: 626 native checks and both fixed points.

`f"value={expression:d}"` creates a String. Each hole requires an explicit format:
`d` for Int, `s` for String, `b` for Bool, `display` for any of these or a distinct
wrapper (using its primitive value). Unsupported formats and incompatible types
are compile-time errors. No locale, width, floating point or user-defined formatter
is implied. Decimal Int and lowercase true/false match the existing to_string.

Literal segments accept the ordinary string escapes; `{{` and `}}` mean braces.
An unescaped unmatched brace is an error. Expressions can contain strings, generic
constructors, match expressions and nested interpolation. Every hole is parsed and
checked with its original source position. Raw newlines are forbidden throughout
the interpolation; escaped newline is allowed. Comments inside holes are excluded.

Holes evaluate once, left to right, and introduce only their expressions' effects.
Earlier `?`/panic prevents later evaluation. Formatting itself is pure; temporary
assembly storage is private in the existing process region. The resulting String
is immutable; UTF-8 and embedded NUL are preserved. Existing StringBuilder remains
appropriate for incremental compiler output; interpolation does not replace loops
that accumulate arbitrarily many fragments.

The source formatter preserves the whole interpolated literal verbatim, including
hole spacing, and validates its parsed holes. It never reformats text inside a
literal. This preserves literal/escape spelling and formatter idempotence.

Acceptance: empty/literal-only strings, escaped braces/quotes/newlines/NUL, Unicode,
nested expressions/interpolation, generic calls and match, all formats/Int limits,
invalid syntax/format/type, exact source locations, expression effects/order,
short-circuit and propagation, formatter round trips. Migrate diagnostic/report
construction, verify both compiler generations, then run the 0.5 release gate.
