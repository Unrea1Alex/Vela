"""Source locations and stable, machine-readable diagnostics shared by all phases."""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Span:
    start: int
    end: int


@dataclass(frozen=True)
class Source:
    name: str
    text: str
    line_starts: tuple[int, ...] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "line_starts", (0,) + tuple(
            i + 1 for i, c in enumerate(self.text) if c == "\n"))

    def position(self, offset: int) -> tuple[int, int]:
        line = bisect_right(self.line_starts, offset) - 1
        return line + 1, offset - self.line_starts[line] + 1


class Diagnostic(Exception):
    def __init__(self, code: str, message: str, span: Span, notes: tuple[str, ...] = ()):
        super().__init__(message)
        self.code, self.message, self.span, self.notes = code, message, span, notes

    def to_dict(self, source: Source) -> dict:
        line, column = source.position(self.span.start)
        end_line, end_column = source.position(self.span.end)
        return {"code": self.code, "severity": "error", "message": self.message,
                "source": source.name, "span": {"start": self.span.start,
                "end": self.span.end, "line": line, "column": column,
                "end_line": end_line, "end_column": end_column}, "notes": list(self.notes)}

    def render(self, source: Source) -> str:
        line, column = source.position(self.span.start)
        text = source.text.splitlines()
        excerpt = text[line - 1] if line <= len(text) else ""
        width = max(1, min(self.span.end - self.span.start, len(excerpt) - column + 1))
        pointer = " " * (column - 1) + "^" * width
        notes = "".join("\n  note: " + note for note in self.notes)
        return f"{source.name}:{line}:{column}: {self.code}: {self.message}\n  {excerpt}\n  {pointer}{notes}"
