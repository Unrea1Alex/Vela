"""Historical 0.2 semantic types; all builtin metadata comes from builtins.def."""
from dataclasses import dataclass
from importlib.resources import files


@dataclass(frozen=True)
class Type:
    name: str


INT, BOOL, STRING, UNIT = (Type(n) for n in ("Int", "Bool", "String", "Unit"))
INT_LIST, STRING_LIST = Type("IntList"), Type("StringList")
PRIMITIVES = {t.name: t for t in (INT, BOOL, STRING, UNIT, INT_LIST, STRING_LIST)}
INT_RESULT, STRING_RESULT, WRITE_RESULT = (Type(n) for n in ("IntResult", "StringResult", "WriteResult"))
EFFECTS = frozenset({"io", "args", "state", "process"})


@dataclass(frozen=True)
class Variant:
    name: str
    fields: tuple[Type, ...]
    tag: int


@dataclass(frozen=True)
class Enum:
    type: Type
    variants: tuple[Variant, ...]

    def variant(self, name: str) -> Variant | None:
        return next((v for v in self.variants if v.name == name), None)


@dataclass(frozen=True)
class Signature:
    name: str
    parameters: tuple[Type, ...]
    returns: Type
    effects: frozenset[str]
    builtin: bool = False
    abi: str = ""


def _catalog():
    records, names = [], set()
    for number, row in enumerate(files("vela").joinpath("builtins.def").read_text(encoding="utf-8").splitlines(), 1):
        if not row or row.startswith("#"):
            continue
        cols = row.split("|")
        if len(cols) != 8 or cols[0] not in {"enum", "fn"}:
            raise ValueError(f"Invalid builtin catalog row {number}")
        if cols[1] in names:
            raise ValueError(f"Duplicate builtin catalog name: {cols[1]}")
        names.add(cols[1])
        records.append(cols)
    return records


CATALOG = _catalog()
_types, _enums = dict(PRIMITIVES), []
for kind, name, variables, parameters, returns, effects, abi, since in CATALOG:
    if kind != "enum" or variables or since != "0.2":
        continue
    type_ = _types.setdefault(name, Type(name))
    variants = []
    for tag, item in enumerate(parameters.split(";")):
        variant, fields_ = item.split(":")
        variants.append(Variant(variant, tuple(_types[n] for n in fields_.split(",") if n), tag))
    _enums.append(Enum(type_, tuple(variants)))
PRELUDE_ENUMS = tuple(_enums)
INT_RESULT_DEF, STRING_RESULT_DEF, WRITE_RESULT_DEF = PRELUDE_ENUMS
BUILTINS = {}
for kind, name, variables, parameters, returns, effects, abi, since in CATALOG:
    if kind == "fn" and since == "0.2":
        BUILTINS[name] = Signature(name, tuple(_types[n] for n in parameters.split(";") if n),
                                  _types[returns], frozenset(e for e in effects.split(";") if e), True, abi)
PRINT_SPEC = next(row for row in CATALOG if row[0] == "fn" and row[1] == "print")
PRINT_EFFECTS = frozenset(e for e in PRINT_SPEC[5].split(";") if e)
PRINT_ABI = PRINT_SPEC[6]
