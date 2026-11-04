"""Rebuild and smoke-test the shipped examples; write a binary checksum manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from vela import __version__
from vela.driver import build, executable_suffix, read_source
from vela.toolchain import discover


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "bin")
    args = parser.parse_args()
    toolchain = discover()
    cases = {
        "hello": ([], "Hello from Vela!\n42\n"),
        "factorial": (["10"], "3628800\n"),
        "sum": (["12", "-5", "30"], "37\n"),
        "gcd": (["84", "30"], "6\n"),
        "result": ([], "42\n"),
        "word_count": ([str(ROOT / "examples/data/sample.txt")], "Bytes: 30\nLines: 2\nWords: 5\n"),
    }
    manifest = {"vela_version": __version__, "platform": platform.system(),
                "architecture": platform.machine(), "python": platform.python_version(),
                "compiler": toolchain.executable, "artifacts": []}
    for name, (arguments, expected) in cases.items():
        output = build(read_source(ROOT / "examples" / (name + ".vela")),
                       args.output / (name + executable_suffix()), toolchain)
        result = subprocess.run([str(output), *arguments], capture_output=True, encoding="utf-8", timeout=10)
        if result.returncode or result.stdout != expected or result.stderr:
            raise RuntimeError(f"Smoke test failed for {name}: {result}")
        manifest["artifacts"].append({"file": output.name, "size_bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "smoke_test": {"arguments": arguments, "exit_code": result.returncode, "stdout": result.stdout}})
        print(f"OK: {output.name}: {result.stdout.strip()!r}")
    destination = args.output / "build-manifest.json"
    destination.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(destination.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
