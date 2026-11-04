"""Untyped syntax tree. This layer has no knowledge of symbols, types or backends."""
from __future__ import annotations

from dataclasses import dataclass

from .source import Span


@dataclass(frozen=True)
class Expr:
    span: Span


@dataclass(frozen=True)
class Literal(Expr):
    value: int | bool | str


@dataclass(frozen=True)
class Name(Expr):
    parts: tuple[str, ...]


@dataclass(frozen=True)
class Unary(Expr):
    op: str
    operand: Expr


@dataclass(frozen=True)
class Binary(Expr):
    op: str
    left: Expr
    right: Expr


@dataclass(frozen=True)
class Call(Expr):
    target: Name
    args: tuple[Expr, ...]


@dataclass(frozen=True)
class Stmt:
    span: Span


@dataclass(frozen=True)
class Bind(Stmt):
    name: str
    annotation: str | None
    value: Expr
    mutable: bool


@dataclass(frozen=True)
class Assign(Stmt):
    name: str
    value: Expr


@dataclass(frozen=True)
class Return(Stmt):
    value: Expr | None


@dataclass(frozen=True)
class Expression(Stmt):
    value: Expr


@dataclass(frozen=True)
class If(Stmt):
    condition: Expr
    then_body: tuple[Stmt, ...]
    else_body: tuple[Stmt, ...]


@dataclass(frozen=True)
class While(Stmt):
    condition: Expr
    body: tuple[Stmt, ...]


@dataclass(frozen=True)
class Arm:
    span: Span
    enum: str
    variant: str
    bindings: tuple[str, ...]
    body: tuple[Stmt, ...]


@dataclass(frozen=True)
class Match(Stmt):
    value: Expr
    arms: tuple[Arm, ...]


@dataclass(frozen=True)
class Parameter:
    span: Span
    name: str
    annotation: str


@dataclass(frozen=True)
class Function:
    span: Span
    name: str
    parameters: tuple[Parameter, ...]
    returns: str
    effects: frozenset[str]
    requires: tuple[Expr, ...]
    ensures: tuple[Expr, ...]
    body: tuple[Stmt, ...]


@dataclass(frozen=True)
class Variant:
    span: Span
    name: str
    fields: tuple[str, ...]


@dataclass(frozen=True)
class Enum:
    span: Span
    name: str
    variants: tuple[Variant, ...]


@dataclass(frozen=True)
class Module:
    enums: tuple[Enum, ...]
    functions: tuple[Function, ...]
