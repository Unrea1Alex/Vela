from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

from . import __version__
from .compiler import analyze, compile_c
from .driver import build, executable_suffix, read_source
from .source import Diagnostic, Source
from .toolchain import ToolchainError, discover


def json_output(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=True, indent=2))


def symbols(source: Source) -> dict:
    program = analyze(source)
    return {"schema_version": 1, "source": source.name,
            "enums": [{"name": enum.type.name, "variants": [
                {"name": v.name, "fields": [t.name for t in v.fields]} for v in enum.variants]}
                for enum in program.enums],
            "functions": [{"name": fn.signature.name,
                "parameters": [{"name": p.name, "type": p.type.name} for p in fn.parameters],
                "returns": fn.signature.returns.name, "effects": sorted(fn.signature.effects),
                "line": source.position(fn.span.start)[0],
                "contracts": {"verification": "runtime", "requires": len(fn.requires), "ensures": len(fn.ensures)}}
                for fn in program.functions]}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="vela", description=f"Vela {__version__}: typed language -> C11 -> native executable")
    result.add_argument("--version", action="version", version=f"Vela {__version__}")
    commands = result.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="check syntax, types, effects and control flow")
    check.add_argument("source", type=Path)
    check.add_argument("--json", action="store_true", help="emit versioned JSON diagnostics")
    native = commands.add_parser("build", help="build a standalone native executable")
    native.add_argument("source", type=Path)
    native.add_argument("-o", "--output", type=Path)
    emit = commands.add_parser("emit-c", help="emit standalone C11 source without invoking a C compiler")
    emit.add_argument("source", type=Path)
    emit.add_argument("-o", "--output", type=Path)
    run = commands.add_parser("run", help="build in a temporary directory and run")
    run.add_argument("source", type=Path)
    run.add_argument("arguments", nargs=argparse.REMAINDER, help="program arguments, optionally after --")
    symbol = commands.add_parser("symbols", help="emit the checked symbol index as JSON")
    symbol.add_argument("source", type=Path)
    commands.add_parser("doctor", help="show the discovered native toolchain")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    source: Source | None = None
    try:
        if args.command == "doctor":
            toolchain = discover()
            print(f"Vela {__version__}\nPython {sys.version.split()[0]}\nCompiler: {toolchain.kind}\n{toolchain.executable}")
            return 0
        source = read_source(args.source)
        if args.command == "check":
            analyze(source)
            if args.json:
                json_output({"schema_version": 1, "ok": True, "source": source.name, "diagnostics": []})
            else:
                print(f"OK: {args.source}")
        elif args.command == "symbols":
            json_output(symbols(source))
        elif args.command == "emit-c":
            code = compile_c(source)
            if args.output:
                if args.output.resolve() == args.source.resolve():
                    raise ValueError("Output path must not overwrite the Vela source.")
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(code, encoding="utf-8")
                print(args.output.resolve())
            else:
                print(code, end="")
        elif args.command == "build":
            output = args.output or Path.cwd() / (args.source.stem + executable_suffix())
            print(build(source, output))
        elif args.command == "run":
            arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
            with tempfile.TemporaryDirectory(prefix="vela-run-") as directory:
                executable = build(source, Path(directory) / ("program" + executable_suffix()))
                return subprocess.run([str(executable), *arguments]).returncode
        return 0
    except Diagnostic as error:
        assert source is not None
        if getattr(args, "json", False):
            json_output({"schema_version": 1, "ok": False, "source": source.name,
                         "diagnostics": [error.to_dict(source)]})
        else:
            print(error.render(source), file=sys.stderr)
        return 1
    except (OSError, UnicodeError, ValueError, ToolchainError) as error:
        if getattr(args, "json", False):
            json_output({"schema_version": 1, "ok": False, "diagnostics": [
                {"code": "E900", "severity": "error", "message": str(error)}]})
        else:
            print(f"vela: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130
