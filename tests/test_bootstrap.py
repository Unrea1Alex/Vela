"""Independent checks of native distribution and bootstrap evidence."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from vela.toolchain import discover

ROOT = Path(__file__).resolve().parents[1]


class BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.executable = ROOT / 'bin' / ('velac.exe' if os.name == 'nt' else 'velac')
        if not cls.executable.exists():
            if os.environ.get('VELA_REQUIRE_NATIVE') == '1':
                raise RuntimeError('Run vela-dev.cmd verify before required native tests')
            raise unittest.SkipTest('Run vela-dev.cmd verify to build self-hosted compiler')
        tc = discover()
        cls.environment = dict(tc.environment)
        cls.environment['VELA_CC'] = tc.executable
        cls.environment['VELA_CC_KIND'] = tc.kind

    def test_fixed_point_evidence(self):
        directory = ROOT / 'build/native'
        report = json.loads((directory / 'bootstrap.json').read_text())
        second = (directory / 'stage2.c').read_bytes()
        third = (directory / 'stage3.c').read_bytes()
        self.assertEqual(second, third)
        self.assertTrue(report['fixed_point'])
        self.assertTrue(report['bundler_fixed_point'])
        self.assertEqual(len((directory / 'compiler.vela').read_bytes()), report['source_bytes'])

    def test_native_compiler_without_project_or_python_environment(self):
        with tempfile.TemporaryDirectory(prefix='vela standalone ') as directory:
            root = Path(directory)
            executable = root / self.executable.name
            shutil.copy2(self.executable, executable)
            source = root / 'example.vela'
            source.write_text('fn main() -> Unit effects { io } { print(6 * 7); }')
            output = root / 'example.exe'
            environment = {k: v for k, v in self.environment.items() if k.upper() not in {'PYTHONPATH', 'PYTHONHOME'}}
            for key in list(environment):
                if key.upper() == 'PATH':
                    environment[key] = os.pathsep.join(p for p in environment[key].split(os.pathsep) if 'python' not in p.lower())
            result = subprocess.run([str(executable), 'build', str(source), '-o', str(output)], cwd=root,
                                    env=environment, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            program = subprocess.run([str(output)], cwd=root, capture_output=True, text=True, timeout=10)
            self.assertEqual(program.returncode, 0, program.stderr)
            self.assertEqual(program.stdout, '42\n')

    def test_failed_build_preserves_existing_output(self):
        with tempfile.TemporaryDirectory(prefix='vela native failure ') as directory:
            root = Path(directory)
            source = root / 'input.vela'
            output = root / 'output.exe'
            for text, expected in [('fn main() -> Int { return false; }', 1), ('fn main() -> Unit {}', 2)]:
                with self.subTest(text=text):
                    source.write_text(text)
                    output.write_bytes(b'previous build')
                    environment = dict(self.environment)
                    environment['VELA_CC'] = str(root / 'nonexistent-compiler.exe')
                    result = subprocess.run([str(self.executable), 'build', str(source), '-o', str(output)],
                                            env=environment, capture_output=True, text=True, timeout=20)
                    self.assertEqual(result.returncode, expected, result.stderr)
                    self.assertEqual(output.read_bytes(), b'previous build')
                    self.assertEqual(sorted(p.name for p in root.iterdir()), ['input.vela', 'output.exe'])

    def test_source_cannot_be_output(self):
        with tempfile.TemporaryDirectory(prefix='vela protect source ') as directory:
            source = Path(directory) / 'source.vela'
            code = 'fn main() -> Unit {}'
            source.write_text(code)
            for command in ('build', 'emit-c'):
                with self.subTest(command=command):
                    result = subprocess.run([str(self.executable), command, str(source), '-o', str(source.parent / '.' / source.name)],
                                            capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 2)
                    self.assertEqual(source.read_text(), code)

    def test_missing_and_invalid_utf8_source_json(self):
        with tempfile.TemporaryDirectory(prefix='vela invalid ') as directory:
            source = Path(directory) / 'source.vela'
            for data in (None, b'\xff\xfeinvalid'):
                with self.subTest(data=data):
                    if data is not None:
                        source.write_bytes(data)
                    result = subprocess.run([str(self.executable), 'check', str(source), '--json'],
                                            capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertEqual(json.loads(result.stdout)['diagnostics'][0]['code'], 'E900')


if __name__ == '__main__':
    unittest.main()
