# Native formatter

Status: implemented and verified in 0.4.4, 2026-11-04. Native verify: 439/439;
[196-file idempotence/byte checks](../stage04-formatter-evidence.json).

`velac fmt SOURCE` emits canonical UTF-8 to stdout, without modifying the file.
`--check` emits no source, returns 0 for exact canonical bytes or 1 if formatting
is needed. `--write` atomically replaces the source after successful validation.
These two modes are mutually exclusive; -o is not accepted. Syntax/UTF-8 errors
leave the source untouched and retain ordinary language/environment exit codes.
Formatting does not require a C compiler or semantic success (e.g. unknown names).

`write_stdout(text: String) -> Unit effects { io }` writes the exact bytes without
an added newline and flushes stdout; a write/flush failure is runtime error 70.
On Windows it temporarily selects binary CRT output and restores the prior mode.
This OS primitive lets fmt stdout match file bytes without changing print semantics.

Canonical layout uses four spaces, LF, a final newline for nonempty input,
block indentation and one statement per line; effect sets remain inline.
Struct/enum members are split across lines; member/variant access remains compact.
Generic bracket spacing is context-dependent in 0.7.0; some forms remain spaced.
Long expressions and expression-match branches may remain on one line. The current
formatter does not enforce a line-width limit, reorder declarations or remove code.
Roadmap 0.9.8 plans consistent spacing and wrapping after a separate layout contract.

The TimeLog application check found spaced generic return types before `effects`,
`requires` and `ensures`. The fix recognizes these suffixes, including an intervening
comment; original token/comment spelling and formatter idempotence still apply.

All significant token spellings, literal bytes/escapes, leading-zero numbers and
comment text/order are preserved. Comment placement remains inline when possible;
blank lines/indentation outside comments are canonicalized. The lexer stores
comment spans separately from parser tokens; source text retains concrete spelling.
Before publication, formatted output is lexed/parsed again and token/comment
sequences are checked for equality. This is a safety check, not a semantic proof.

Acceptance: native fmt/check/write tests, idempotence across all syntactically
valid fixtures and authored compiler/tools/examples, rejection without writes for
invalid syntax/UTF-8, exact comments/literals, generic/operator/unary cases,
unchanged execution/rejections of the formatted corpus, full native verify.
Phase 0.4.5 applies formatting to authored sources after these checks.
