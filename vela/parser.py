"""Recursive descent statements and precedence-climbing expressions."""
from . import syntax as s
from .lexer import Token, lex
from .source import Diagnostic, Source, Span


KEYWORDS = frozenset("fn enum let var return if else while match effects requires ensures true false".split())
PRECEDENCE = {"||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4,
              ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6}


class Parser:
    def __init__(self, tokens: tuple[Token, ...]):
        self.tokens, self.i = tokens, 0

    @property
    def token(self) -> Token:
        return self.tokens[self.i]

    def at(self, text: str) -> bool:
        return self.token.kind in {"symbol", "id", "eof"} and self.token.text == text

    def take(self) -> Token:
        token = self.token
        if token.kind != "eof":
            self.i += 1
        return token

    def accept(self, text: str) -> bool:
        if self.at(text):
            self.take()
            return True
        return False

    def expect(self, text: str) -> Token:
        if not self.at(text):
            self.error(f"Expected {text!r}, found {self.token.text!r}.")
        return self.take()

    def identifier(self) -> Token:
        if self.token.kind != "id" or self.token.text in KEYWORDS:
            self.error("Expected an identifier.")
        return self.take()

    def error(self, message: str) -> None:
        raise Diagnostic("E100", message, self.token.span)

    def span(self, start: int) -> Span:
        return Span(start, self.tokens[self.i - 1].span.end)

    def module(self) -> s.Module:
        enums, functions = [], []
        while self.token.kind != "eof":
            if self.at("enum"):
                enums.append(self.enum())
            elif self.at("fn"):
                functions.append(self.function())
            else:
                self.error("Expected 'fn' or 'enum'.")
        return s.Module(tuple(enums), tuple(functions))

    def comma_list(self, end: str, parse_item) -> tuple:
        items = []
        if not self.at(end):
            while True:
                items.append(parse_item())
                if not self.accept(",") or self.at(end):
                    break
        self.expect(end)
        return tuple(items)

    def enum(self) -> s.Enum:
        start = self.expect("enum").span.start
        name = self.identifier().text
        self.expect("{")

        def variant() -> s.Variant:
            token = self.identifier()
            fields = self.comma_list(")", lambda: self.identifier().text) if self.accept("(") else ()
            return s.Variant(self.span(token.span.start), token.text, fields)

        variants = self.comma_list("}", variant)
        return s.Enum(self.span(start), name, variants)

    def function(self) -> s.Function:
        start = self.expect("fn").span.start
        name = self.identifier().text
        self.expect("(")

        def parameter() -> s.Parameter:
            token = self.identifier()
            self.expect(":")
            annotation = self.identifier().text
            return s.Parameter(self.span(token.span.start), token.text, annotation)

        parameters = self.comma_list(")", parameter)
        self.expect("->")
        returns = self.identifier().text
        effects: tuple[str, ...] = ()
        if self.accept("effects"):
            self.expect("{")
            effects = self.comma_list("}", lambda: self.identifier().text)
            if len(set(effects)) != len(effects):
                self.error("Duplicate effect in signature.")
        requires, ensures = [], []
        while self.at("requires") or self.at("ensures"):
            target = requires if self.take().text == "requires" else ensures
            target.append(self.expression())
            self.expect(";")
        body = self.block()
        return s.Function(self.span(start), name, parameters, returns, frozenset(effects),
                          tuple(requires), tuple(ensures), body)

    def block(self) -> tuple[s.Stmt, ...]:
        self.expect("{")
        statements = []
        while not self.at("}"):
            if self.token.kind == "eof":
                self.error("Expected '}' before end of file.")
            statements.append(self.statement())
        self.expect("}")
        return tuple(statements)

    def statement(self) -> s.Stmt:
        start = self.token.span.start
        if self.at("let") or self.at("var"):
            mutable = self.take().text == "var"
            name = self.identifier().text
            annotation = self.identifier().text if self.accept(":") else None
            self.expect("=")
            value = self.expression()
            self.expect(";")
            return s.Bind(self.span(start), name, annotation, value, mutable)
        if self.accept("return"):
            value = None if self.at(";") else self.expression()
            self.expect(";")
            return s.Return(self.span(start), value)
        if self.accept("if"):
            condition = self.expression()
            then_body = self.block()
            else_body = ()
            if self.accept("else"):
                else_body = (self.statement(),) if self.at("if") else self.block()
            return s.If(self.span(start), condition, then_body, else_body)
        if self.accept("while"):
            condition = self.expression()
            body = self.block()
            return s.While(self.span(start), condition, body)
        if self.accept("match"):
            value = self.expression()
            self.expect("{")
            arms = []
            while not self.at("}"):
                arm_start = self.token.span.start
                enum = self.identifier().text
                self.expect("::")
                variant = self.identifier().text
                bindings = self.comma_list(")", lambda: self.identifier().text) if self.accept("(") else ()
                self.expect("=>")
                body = self.block()
                arms.append(s.Arm(self.span(arm_start), enum, variant, bindings, body))
                self.accept(",")
            self.expect("}")
            return s.Match(self.span(start), value, tuple(arms))
        if self.token.kind == "id" and self.tokens[self.i + 1].text == "=":
            name = self.identifier().text
            self.expect("=")
            value = self.expression()
            self.expect(";")
            return s.Assign(self.span(start), name, value)
        value = self.expression()
        self.expect(";")
        return s.Expression(self.span(start), value)

    def expression(self, minimum: int = 0) -> s.Expr:
        token = self.take()
        if token.kind == "int":
            # Avoid Python's decimal conversion limit on untrusted oversized literals.
            if len(token.text.lstrip("0")) > 19:
                raise Diagnostic("E205", "Integer literal is outside the signed 64-bit range.", token.span)
            left: s.Expr = s.Literal(token.span, int(token.text.lstrip("0") or "0"))
        elif token.kind == "string":
            left = s.Literal(token.span, token.text)
        elif token.kind == "id" and token.text in {"true", "false"}:
            left = s.Literal(token.span, token.text == "true")
        elif token.kind == "symbol" and token.text in {"-", "!"}:
            operand = self.expression(7)
            left = s.Unary(Span(token.span.start, operand.span.end), token.text, operand)
        elif token.kind == "symbol" and token.text == "(":
            left = self.expression()
            self.expect(")")
        elif token.kind == "id" and token.text not in KEYWORDS:
            parts = [token.text]
            if self.accept("::"):
                parts.append(self.identifier().text)
            left = s.Name(self.span(token.span.start), tuple(parts))
            if self.accept("("):
                args = self.comma_list(")", self.expression)
                left = s.Call(self.span(token.span.start), left, args)
        else:
            raise Diagnostic("E100", "Expected an expression.", token.span)
        while self.token.kind == "symbol" and PRECEDENCE.get(self.token.text, -1) >= minimum:
            op = self.take().text
            right = self.expression(PRECEDENCE[op] + 1)
            left = s.Binary(Span(left.span.start, right.span.end), op, left, right)
        return left


def parse(source: Source) -> s.Module:
    return Parser(lex(source)).module()
