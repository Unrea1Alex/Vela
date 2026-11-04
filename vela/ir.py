"""Typed high-level IR: symbol IDs, resolved calls and variants, explicit source spans.

This is the backend boundary. No syntax nodes or textual name lookup cross it.
Future lowering to CFG/SSA can consume this IR without changing the parser.
"""
from __future__ import annotations

from dataclasses import dataclass

from .source import Span
from .typesys import Enum, Signature, Type, Variant


@dataclass(frozen=True)
class Binding:
    id: int
    name: str
    type: Type
    mutable: bool = False


@dataclass(frozen=True)
class Expr:
    span: Span
    type: Type


@dataclass(frozen=True)
class Constant(Expr):
    value: int | bool | str | None


@dataclass(frozen=True)
class Local(Expr):
    binding: Binding


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
    target: Signature
    args: tuple[Expr, ...]


@dataclass(frozen=True)
class Construct(Expr):
    variant: Variant
    args: tuple[Expr, ...]


@dataclass(frozen=True)
class Stmt:
    span: Span


@dataclass(frozen=True)
class Bind(Stmt):
    binding: Binding
    value: Expr


@dataclass(frozen=True)
class Assign(Stmt):
    binding: Binding
    value: Expr


@dataclass(frozen=True)
class Return(Stmt):
    value: Expr


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
    variant: Variant
    bindings: tuple[Binding | None, ...]
    body: tuple[Stmt, ...]


@dataclass(frozen=True)
class Match(Stmt):
    value: Expr
    arms: tuple[Arm, ...]


@dataclass(frozen=True)
class Function:
    span: Span
    signature: Signature
    parameters: tuple[Binding, ...]
    result: Binding
    requires: tuple[Expr, ...]
    ensures: tuple[Expr, ...]
    body: tuple[Stmt, ...]


@dataclass(frozen=True)
class Program:
    # Enums are in dependency order; recursive by-value types are rejected.
    enums: tuple[Enum, ...]
    functions: tuple[Function, ...]
