# Multiline raw strings (0.9)

`"""…"""` is a String expression. The first following triple quote ends it.
All characters between the delimiters are data, including leading and
trailing newlines, indentation, backslashes, braces, and one or two quotes
when they are not part of the closing delimiter. There are no escapes,
dedent, or interpolation. Use concatenation when the text includes the
delimiter. The ordinary source rules apply: valid UTF-8, a leading file
BOM removed, CRLF and CR normalized to LF before tokenization.

A raw string has one source span, covering both delimiters, and the same
runtime representation and evaluation as an ordinary string. An unterminated
literal is E001 at the opening delimiter. Raw strings are expressions,
not import paths, test names, foreign library names, or interpolation holes.
The formatter may change surrounding whitespace; the literal spelling and
normalized payload are preserved exactly.

MeasureLab keeps its HTML and CSS in source, so the executable is autonomous
with respect to those assets. For declared external text or binary files
with exact hashes and distribution paths, see [0.11 packaging](PACKAGING.md).
