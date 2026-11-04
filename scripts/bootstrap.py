"""Compatibility entry point. The bootstrap implementation is tools/dev.vela."""
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    if len(sys.argv) != 1:
        raise SystemExit("Use vela-dev.cmd bootstrap; legacy Python bootstrap options were retired.")
    raise SystemExit(subprocess.call([str(root / "vela-dev.cmd"), "bootstrap"], cwd=root))
