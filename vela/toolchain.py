"""Host toolchain integration. No shell is used to compile or run user programs."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


class ToolchainError(Exception):
    pass


@dataclass(frozen=True)
class Toolchain:
    kind: str
    executable: str
    environment: dict[str, str]

    def compile(self, source: Path, output: Path) -> None:
        if self.kind == "msvc":
            command = [self.executable, "/nologo", "/TC", "/std:c11", "/utf-8", "/O2", "/W3", "/MT",
                       f"/Fo{output.with_suffix('.obj')}", f"/Fe{output}", str(source),
                       "/link", "/INCREMENTAL:NO"]
        else:
            command = [self.executable, "-std=c11", "-O2", "-Wall", "-Wextra", str(source), "-o", str(output)]
        try:
            result = subprocess.run(command, cwd=source.parent, env=self.environment,
                                    capture_output=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolchainError(f"Could not invoke C compiler: {exc}") from exc
        if result.returncode or not output.is_file():
            details = (result.stdout + result.stderr).decode("utf-8", errors="replace")
            raise ToolchainError(f"C compiler failed ({result.returncode}):\n{details}")


def _msvc_environment(installation: Path) -> dict[str, str]:
    setup = installation / "VC" / "Auxiliary" / "Build" / "vcvars64.bat"
    if not setup.is_file():
        raise ToolchainError(f"Missing MSVC environment script: {setup}")
    # cmd is needed only for the vendor's environment setup. This script contains
    # a discovered installation path, never language source or build arguments.
    if any(c in str(setup) for c in '\r\n"%'):
        raise ToolchainError("Unsupported characters in MSVC installation path.")
    with tempfile.TemporaryDirectory(prefix="vela-msvc-") as directory:
        script = Path(directory) / "environment.cmd"
        script.write_text(f'@echo off\ncall "{setup}" >nul\nif errorlevel 1 exit /b 1\nset\n', encoding="utf-8")
        try:
            result = subprocess.run([os.environ.get("COMSPEC", "cmd.exe"), "/d", "/u", "/c", str(script)],
                                    capture_output=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolchainError(f"Could not initialize MSVC: {exc}") from exc
    if result.returncode:
        raise ToolchainError("MSVC environment initialization failed.")
    environment = {}
    for line in result.stdout.decode("utf-16-le", errors="replace").splitlines():
        if "=" in line and not line.startswith("="):
            key, value = line.split("=", 1)
            environment[key] = value
    return environment


@lru_cache(maxsize=1)
def discover() -> Toolchain:
    override = os.environ.get("VELA_CC")
    if override:
        executable = shutil.which(override)
        if executable is None:
            raise ToolchainError("VELA_CC must name an existing compiler executable, without flags.")
        kind = "msvc" if Path(executable).name.lower() in {"cl", "cl.exe"} else "cc"
        return Toolchain(kind, executable, dict(os.environ))
    for name in ("clang", "gcc", "cc", "cl"):
        executable = shutil.which(name)
        if executable:
            return Toolchain("msvc" if name == "cl" else "cc", executable, dict(os.environ))
    if os.name == "nt":
        roots = [os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"),
                 os.environ.get("ProgramFiles", "C:/Program Files")]
        for root in roots:
            vswhere = Path(root) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
            if not vswhere.is_file():
                continue
            try:
                result = subprocess.run([str(vswhere), "-latest", "-products", "*", "-requires",
                    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath", "-utf8"],
                    capture_output=True, timeout=15)
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise ToolchainError(f"MSVC discovery failed: {exc}") from exc
            installation = result.stdout.decode("utf-8", errors="replace").strip()
            if result.returncode == 0 and installation:
                environment = _msvc_environment(Path(installation))
                search_path = next((v for k, v in environment.items() if k.upper() == "PATH"), "")
                executable = shutil.which("cl.exe", path=search_path)
                if executable:
                    return Toolchain("msvc", executable, environment)
    raise ToolchainError("No C11 compiler found. Install MSVC Build Tools (Desktop development with C++), "
                         "Clang or GCC. 'check', 'symbols' and 'emit-c' work without a C compiler.")
