"""Compatibility entry point. The test runner and orchestration are Vela."""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    raise SystemExit(subprocess.call([str(root / "vela-dev.cmd"), "verify"], cwd=root))
