"""Public compilation API: Source -> checked IR -> target text.

No user file I/O or subprocesses; C emission reads the bundled runtime resource.
"""
from . import ir
from .backends.c import emit_c
from .checker import check
from .parser import parse
from .source import Diagnostic, Source, Span


def analyze(source: Source) -> ir.Program:
    try:
        return check(parse(source))
    except RecursionError as exc:
        raise Diagnostic("E101", "Source nesting exceeds the prototype's compiler limit.", Span(0, 0)) from exc


def compile_c(source: Source) -> str:
    program = analyze(source)
    try:
        return emit_c(program, source)
    except RecursionError as exc:
        raise Diagnostic("E101", "Source nesting exceeds the prototype's compiler limit.", Span(0, 0)) from exc
