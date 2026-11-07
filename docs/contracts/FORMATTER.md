# Native formatter

The formatter was introduced in 0.4.4. See the
[historical 196-file checks](../stage04-formatter-evidence.json)
and the [0.9 validation](../VALIDATION-0.9.md).

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
The parser marks generic brackets and expression-match arm separators.
Nested and module-qualified generic arguments have compact brackets and spaces
after commas; comparison operators keep their spaces. Match arms with a comma
end a line. For other lines the formatter aims for 100 UTF-8 bytes, wrapping
at argument/parameter separators, before binary operators or after openings and
assignment/arm markers. Continuations indent four additional spaces. Indivisible
tokens, comments and lines occupied by a multiline raw string can exceed the target.

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
