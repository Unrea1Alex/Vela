"""Name resolution, type/effect checking, exhaustive matches and return analysis."""
from __future__ import annotations

from . import ir, syntax as s
from .source import Diagnostic, Span
from .typesys import (BOOL, BUILTINS, EFFECTS, INT, PRELUDE_ENUMS, PRIMITIVES,
                      STRING, UNIT, Enum, Signature, Type, Variant, PRINT_EFFECTS, PRINT_ABI)


class Checker:
    def __init__(self) -> None:
        self.types = dict(PRIMITIVES)
        self.types.update({e.type.name: e.type for e in PRELUDE_ENUMS})
        self.enums = {e.type.name: e for e in PRELUDE_ENUMS}
        self.signatures = dict(BUILTINS)
        self.scopes: list[dict[str, ir.Binding]] = []
        self.next_id = 0
        self.allowed: frozenset[str] = frozenset()
        self.returns = UNIT

    def fail(self, code: str, message: str, span: Span, *notes: str):
        raise Diagnostic(code, message, span, tuple(notes))

    def type(self, name: str, span: Span) -> Type:
        if name not in self.types:
            self.fail("E200", f"Unknown type '{name}'.", span)
        return self.types[name]

    def same(self, actual: Type, expected: Type, span: Span) -> None:
        if actual != expected:
            self.fail("E201", f"Expected {expected.name}, found {actual.name}.", span)

    def binding(self, name: str, type_: Type, mutable: bool = False) -> ir.Binding:
        self.next_id += 1
        return ir.Binding(self.next_id, name, type_, mutable)

    def declare(self, name: str, type_: Type, mutable: bool, span: Span) -> ir.Binding:
        if name == "result":
            self.fail("E202", "'result' is reserved for postconditions.", span)
        if name == "_":
            self.fail("E202", "'_' is only allowed as a discarded match binding.", span)
        if name in self.scopes[-1]:
            self.fail("E202", f"Duplicate binding '{name}' in this scope.", span)
        binding = self.binding(name, type_, mutable)
        self.scopes[-1][name] = binding
        return binding

    def lookup(self, name: str, span: Span) -> ir.Binding:
        for scope in reversed(self.scopes):
            if name in scope:
                return scope[name]
        self.fail("E203", f"Unknown binding '{name}'.", span)

    def check(self, module: s.Module) -> ir.Program:
        occupied = set(self.types) | set(self.signatures) | {"print"}
        for decl in (*module.enums, *module.functions):
            if decl.name in occupied:
                self.fail("E202", f"Duplicate or reserved declaration '{decl.name}'.", decl.span)
            occupied.add(decl.name)
        for decl in module.enums:
            self.types[decl.name] = Type(decl.name)
        for decl in module.enums:
            if not decl.variants:
                self.fail("E204", "An enum must have at least one variant.", decl.span)
            variants, seen = [], set()
            for tag, variant in enumerate(decl.variants):
                if variant.name in seen:
                    self.fail("E202", f"Duplicate variant '{variant.name}'.", variant.span)
                seen.add(variant.name)
                fields = tuple(self.type(t, variant.span) for t in variant.fields)
                variants.append(Variant(variant.name, fields, tag))
            self.enums[decl.name] = Enum(self.types[decl.name], tuple(variants))
        ordered, active, complete = [], set(), set()
        spans = {d.name: d.span for d in module.enums}

        def visit(name: str) -> None:
            if name in complete:
                return
            if name in active:
                self.fail("E204", f"Recursive by-value enum '{name}' has no finite size.", spans[name],
                          "Indirection and recursive types are not supported in Vela 0.2.")
            active.add(name)
            enum = self.enums[name]
            for variant in enum.variants:
                for type_ in variant.fields:
                    if type_.name in self.enums:
                        visit(type_.name)
            active.remove(name)
            complete.add(name)
            ordered.append(enum)

        for name in self.enums:
            visit(name)
        for fn in module.functions:
            unknown = fn.effects - EFFECTS
            if unknown:
                self.fail("E206", f"Unknown effects: {', '.join(sorted(unknown))}.", fn.span)
            self.signatures[fn.name] = Signature(fn.name,
                tuple(self.type(p.annotation, p.span) for p in fn.parameters),
                self.type(fn.returns, fn.span), fn.effects)
        main = self.signatures.get("main")
        if main is None:
            self.fail("E207", "Program must define fn main() -> Int or Unit.", Span(0, 0))
        if main.parameters or main.returns not in {INT, UNIT}:
            self.fail("E207", "main must have no parameters and return Int or Unit.",
                      next(f.span for f in module.functions if f.name == "main"))
        functions = tuple(self.function(fn) for fn in module.functions)
        return ir.Program(tuple(ordered), functions)

    def function(self, fn: s.Function) -> ir.Function:
        signature = self.signatures[fn.name]
        self.scopes = [{}]
        self.returns = signature.returns
        parameters = tuple(self.declare(p.name, type_, False, p.span)
                           for p, type_ in zip(fn.parameters, signature.parameters))
        result = self.binding("result", signature.returns)
        self.allowed = frozenset()
        requires = tuple(self.condition(e) for e in fn.requires)
        self.scopes.append({"result": result})
        ensures = tuple(self.condition(e) for e in fn.ensures)
        self.scopes.pop()
        self.allowed = signature.effects
        body, returns = self.block(fn.body, nested=False)
        if not returns:
            if signature.returns != UNIT:
                self.fail("E208", f"Function '{fn.name}' can reach its end without returning {signature.returns.name}.", fn.span)
            body += (ir.Return(fn.span, ir.Constant(fn.span, UNIT, None)),)
        return ir.Function(fn.span, signature, parameters, result, requires, ensures, body)

    def effects(self, signature: Signature, span: Span) -> None:
        missing = signature.effects - self.allowed
        if missing:
            self.fail("E209", f"Call to '{signature.name}' requires undeclared effects: {', '.join(sorted(missing))}.", span,
                      "Declare these effects in the caller's signature. Contracts must be effect-free.")

    def condition(self, expr: s.Expr) -> ir.Expr:
        value = self.expression(expr)
        self.same(value.type, BOOL, expr.span)
        return value

    def arguments(self, args: tuple[s.Expr, ...], expected: tuple[Type, ...], span: Span) -> tuple[ir.Expr, ...]:
        if len(args) != len(expected):
            self.fail("E210", f"Expected {len(expected)} arguments, found {len(args)}.", span)
        values = tuple(self.expression(arg) for arg in args)
        for value, type_ in zip(values, expected):
            self.same(value.type, type_, value.span)
        return values

    def construct(self, name: s.Name, args: tuple[s.Expr, ...], span: Span) -> ir.Construct:
        enum_name, variant_name = name.parts
        enum = self.enums.get(enum_name)
        if enum is None:
            self.fail("E200", f"Unknown enum '{enum_name}'.", span)
        variant = enum.variant(variant_name)
        if variant is None:
            self.fail("E211", f"Unknown variant '{enum_name}::{variant_name}'.", span)
        return ir.Construct(span, enum.type, variant, self.arguments(args, variant.fields, span))

    def expression(self, expr: s.Expr) -> ir.Expr:
        if isinstance(expr, s.Literal):
            if isinstance(expr.value, bool):
                type_ = BOOL
            elif isinstance(expr.value, int):
                if expr.value > 9223372036854775807:
                    self.fail("E205", "Integer literal is outside the signed 64-bit range.", expr.span)
                type_ = INT
            else:
                type_ = STRING
            return ir.Constant(expr.span, type_, expr.value)
        if isinstance(expr, s.Name):
            if len(expr.parts) == 2:
                return self.construct(expr, (), expr.span)
            binding = self.lookup(expr.parts[0], expr.span)
            return ir.Local(expr.span, binding.type, binding)
        if isinstance(expr, s.Unary):
            if expr.op == "-" and isinstance(expr.operand, s.Literal) and type(expr.operand.value) is int:
                if expr.operand.value > 9223372036854775808:
                    self.fail("E205", "Integer literal is outside the signed 64-bit range.", expr.span)
                return ir.Constant(expr.span, INT, -expr.operand.value)
            operand = self.expression(expr.operand)
            type_ = INT if expr.op == "-" else BOOL
            self.same(operand.type, type_, expr.span)
            return ir.Unary(expr.span, type_, expr.op, operand)
        if isinstance(expr, s.Binary):
            left, right = self.expression(expr.left), self.expression(expr.right)
            if expr.op in {"&&", "||"}:
                self.same(left.type, BOOL, expr.left.span)
                self.same(right.type, BOOL, expr.right.span)
                type_ = BOOL
            elif expr.op in {"==", "!="}:
                self.same(right.type, left.type, expr.right.span)
                if left.type not in {INT, BOOL, STRING}:
                    self.fail("E201", "Equality is supported for Int, Bool and String only.", expr.span)
                type_ = BOOL
            else:
                self.same(left.type, INT, expr.left.span)
                self.same(right.type, INT, expr.right.span)
                type_ = BOOL if expr.op in {"<", "<=", ">", ">="} else INT
            return ir.Binary(expr.span, type_, expr.op, left, right)
        if isinstance(expr, s.Call):
            if len(expr.target.parts) == 2:
                return self.construct(expr.target, expr.args, expr.span)
            name = expr.target.parts[0]
            if any(name in scope for scope in self.scopes):
                self.fail("E201", f"Local binding '{name}' is not callable.", expr.span)
            if name == "print":
                if len(expr.args) != 1:
                    self.fail("E210", "print expects exactly one argument.", expr.span)
                value = self.expression(expr.args[0])
                if value.type not in {INT, BOOL, STRING}:
                    self.fail("E201", "print accepts Int, Bool or String.", expr.span)
                signature = Signature("print", (value.type,), UNIT, PRINT_EFFECTS, True, PRINT_ABI)
                args = (value,)
            else:
                signature = self.signatures.get(name)
                if signature is None:
                    self.fail("E203", f"Unknown function '{name}'.", expr.span)
                args = self.arguments(expr.args, signature.parameters, expr.span)
            self.effects(signature, expr.span)
            return ir.Call(expr.span, signature.returns, signature, args)
        raise AssertionError(f"Unhandled syntax expression: {type(expr)}")

    def block(self, body: tuple[s.Stmt, ...], nested: bool = True) -> tuple[tuple[ir.Stmt, ...], bool]:
        if nested:
            self.scopes.append({})
        result, returns = [], False
        for stmt in body:
            if returns:
                self.fail("E212", "Unreachable statement after unconditional return.", stmt.span)
            node, returns = self.statement(stmt)
            result.append(node)
        if nested:
            self.scopes.pop()
        return tuple(result), returns

    def statement(self, stmt: s.Stmt) -> tuple[ir.Stmt, bool]:
        if isinstance(stmt, s.Bind):
            value = self.expression(stmt.value)
            if stmt.annotation:
                self.same(value.type, self.type(stmt.annotation, stmt.span), stmt.span)
            binding = self.declare(stmt.name, value.type, stmt.mutable, stmt.span)
            return ir.Bind(stmt.span, binding, value), False
        if isinstance(stmt, s.Assign):
            binding = self.lookup(stmt.name, stmt.span)
            if not binding.mutable:
                self.fail("E213", f"Cannot assign to immutable binding '{stmt.name}'.", stmt.span,
                          "Use 'var' instead of 'let' for mutable local state.")
            value = self.expression(stmt.value)
            self.same(value.type, binding.type, stmt.span)
            return ir.Assign(stmt.span, binding, value), False
        if isinstance(stmt, s.Return):
            value = self.expression(stmt.value) if stmt.value else ir.Constant(stmt.span, UNIT, None)
            self.same(value.type, self.returns, stmt.span)
            return ir.Return(stmt.span, value), True
        if isinstance(stmt, s.Expression):
            value = self.expression(stmt.value)
            if value.type != UNIT:
                self.fail("E214", "Unused value. Bind it with 'let' or handle it with 'match'.", stmt.span)
            return ir.Expression(stmt.span, value), False
        if isinstance(stmt, s.If):
            condition = self.condition(stmt.condition)
            then_body, then_returns = self.block(stmt.then_body)
            else_body, else_returns = self.block(stmt.else_body)
            return ir.If(stmt.span, condition, then_body, else_body), then_returns and else_returns
        if isinstance(stmt, s.While):
            condition = self.condition(stmt.condition)
            body, _ = self.block(stmt.body)
            return ir.While(stmt.span, condition, body), False
        if isinstance(stmt, s.Match):
            value = self.expression(stmt.value)
            enum = self.enums.get(value.type.name)
            if enum is None:
                self.fail("E201", "match expects an enum value.", stmt.value.span)
            seen, arms, returns = set(), [], True
            for arm in stmt.arms:
                if arm.enum != enum.type.name:
                    self.fail("E201", f"Expected a variant of {enum.type.name}, found {arm.enum}.", arm.span)
                variant = enum.variant(arm.variant)
                if variant is None:
                    self.fail("E211", f"Unknown variant '{arm.enum}::{arm.variant}'.", arm.span)
                if arm.variant in seen:
                    self.fail("E215", f"Duplicate match arm '{arm.variant}'.", arm.span)
                seen.add(arm.variant)
                if len(arm.bindings) != len(variant.fields):
                    self.fail("E210", f"Pattern expects {len(variant.fields)} bindings, found {len(arm.bindings)}.", arm.span)
                self.scopes.append({})
                bindings = tuple(None if name == "_" else self.declare(name, type_, False, arm.span)
                                 for name, type_ in zip(arm.bindings, variant.fields))
                body, arm_returns = self.block(arm.body, nested=False)
                self.scopes.pop()
                arms.append(ir.Arm(variant, bindings, body))
                returns = returns and arm_returns
            missing = {v.name for v in enum.variants} - seen
            if missing:
                self.fail("E216", f"Non-exhaustive match; missing: {', '.join(sorted(missing))}.", stmt.span,
                          "Handle every variant explicitly; wildcard arms are not supported.")
            return ir.Match(stmt.span, value, tuple(arms)), returns
        raise AssertionError(f"Unhandled syntax statement: {type(stmt)}")


def check(module: s.Module) -> ir.Program:
    return Checker().check(module)
