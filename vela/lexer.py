"""Lexing only; offsets are Unicode code point offsets, spans are half-open."""
from dataclasses import dataclass

from .source import Diagnostic, Source, Span


@dataclass(frozen=True)
class Token:
    kind: str
    text: str
    span: Span


def lex(source: Source) -> tuple[Token, ...]:
    text, tokens, i = source.text, [], 0
    pairs = {"->", "=>", "::", "==", "!=", "<=", ">=", "&&", "||"}
    while i < len(text):
        start, c = i, text[i]
        if c.isspace():
            i += 1
            continue
        if text.startswith("//", i):
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        if c.isascii() and (c.isalpha() or c == "_"):
            i += 1
            while i < len(text) and text[i].isascii() and (text[i].isalnum() or text[i] == "_"):
                i += 1
            tokens.append(Token("id", text[start:i], Span(start, i)))
        elif "0" <= c <= "9":
            i += 1
            while i < len(text) and "0" <= text[i] <= "9":
                i += 1
            tokens.append(Token("int", text[start:i], Span(start, i)))
        elif c == '"':
            i += 1
            value: list[str] = []
            escapes = {"n": "\n", "r": "\r", "t": "\t", "0": "\0", '"': '"', "\\": "\\"}
            while i < len(text) and text[i] != '"':
                if text[i] in "\r\n":
                    raise Diagnostic("E001", "Newline in string literal; use \\n.", Span(start, i))
                if text[i] == "\\":
                    i += 1
                    if i >= len(text) or text[i] not in escapes:
                        raise Diagnostic("E001", "Unknown or incomplete string escape.", Span(start, i))
                    value.append(escapes[text[i]])
                else:
                    value.append(text[i])
                i += 1
            if i == len(text):
                raise Diagnostic("E001", "Unterminated string literal.", Span(start, i))
            i += 1
            tokens.append(Token("string", "".join(value), Span(start, i)))
        elif text[i:i + 2] in pairs:
            i += 2
            tokens.append(Token("symbol", text[start:i], Span(start, i)))
        elif c in "(){}:,;=+-*/%!<>":
            i += 1
            tokens.append(Token("symbol", c, Span(start, i)))
        else:
            raise Diagnostic("E001", f"Unexpected character {c!r}.", Span(i, i + 1))
    tokens.append(Token("eof", "<eof>", Span(i, i)))
    return tuple(tokens)
