# Diagnostic protocol

Status: implemented and verified in 0.4.3, 2026-11-04: 240 native checks,
five independently decoded JSON scenarios in [evidence](../stage04-diagnostics-evidence.json).

Keep schema_version 1, existing error codes, severity, source, span and notes.
Diagnostics remain fail-fast: one primary language error per check. Add `details`
and `related` fields compatibly; clients must tolerate additional fields.

- Type mismatch: details.expected_type and actual_type are canonical names.
- Effect error: callee plus required_effects, allowed_effects, missing_effects
  are explicit arrays. All missing effects are reported together. User function
  declaration is related; builtins have no fictitious source declaration.
- Non-exhaustive match: details.missing_variants lists fully qualified variants
  in declaration order; related points to the enum declaration when user-defined.
- Duplicate binding/declaration: related points to the first declaration.
- Type mismatch can relate the expected parameter/type declaration where known.

`related` is an array of {message,source,span}; every span uses the same normalized
Unicode code-point coordinates as the primary diagnostic. Offsets are half-open,
line/column are one-based, including non-BMP characters; not UTF-16 or bytes.
Strings are UTF-8 JSON with valid quote/control escaping. Human diagnostics include
the same expected/actual types, effect names, missing variants and related positions.
Empty details/related are allowed for errors without this information.

Acceptance: exact structured fields and known spans for type/effect/match/duplicate
cases, human messages, UTF-8/non-BMP/CRLF/BOM coordinates, negative fixtures and full
native verify. JSON must parse with an independent JSON decoder during validation.
No new type/effect semantics or static proof of contracts is introduced.
