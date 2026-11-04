"""Filesystem/build orchestration, kept out of the compiler's semantic phases."""
import os
from pathlib import Path
import tempfile

from .compiler import compile_c
from .source import Source
from .toolchain import Toolchain, discover


def read_source(path: Path) -> Source:
    return Source(str(path.resolve()), path.read_text(encoding="utf-8-sig"))


def executable_suffix() -> str:
    return ".exe" if os.name == "nt" else ""


def build(source: Source, output: Path, toolchain: Toolchain | None = None) -> Path:
    # Analyze before looking for a C compiler: language diagnostics always win.
    generated = compile_c(source)
    toolchain = toolchain or discover()
    output = output.resolve()
    if output == Path(source.name).resolve():
        raise ValueError("Output path must not overwrite the Vela source.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".vela-build-", dir=output.parent) as directory:
        temp = Path(directory)
        c_source = temp / "program.c"
        executable = temp / ("program" + executable_suffix())
        c_source.write_text(generated, encoding="utf-8")
        toolchain.compile(c_source, executable)
        # Existing artifact survives frontend/compiler/linker failures.
        executable.replace(output)
    return output
