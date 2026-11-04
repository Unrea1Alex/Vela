"""Run the same language tests through Python stage0 or a native compiler.

The native path only transports source/results and invokes the host C toolchain;
it never invokes the Python parser, checker or code generator.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch

from vela import compiler, driver
from vela.cli import symbols as python_symbols
from vela.source import Diagnostic, Span


def native_compiler():
    value = os.environ.get('VELA_TEST_COMPILER')
    return Path(value).resolve() if value else None


def invoke(command, source, output=False):
    executable = native_compiler()
    assert executable
    with tempfile.TemporaryDirectory(prefix='vela-differential-') as directory:
        path = Path(directory) / 'input.vela'
        path.write_text(source.text, encoding='utf-8', newline='\n')
        args = [str(executable), command, str(path), '--source-name', source.name]
        destination = Path(directory) / 'program.c'
        if output:
            args += ['-o', str(destination)]
        elif command == 'check':
            args += ['--json']
        result = subprocess.run(args, capture_output=True, encoding='utf-8', timeout=30)
        if result.returncode != 0:
            if command == 'check' and result.stdout:
                item = json.loads(result.stdout)['diagnostics'][0]
                raise Diagnostic(item['code'], item['message'], Span(item['span']['start'], item['span']['end']))
            raise AssertionError(f'Native compiler failed ({result.returncode}): {result.stdout}\n{result.stderr}')
        return destination.read_text(encoding='utf-8') if output else json.loads(result.stdout)


def analyze(source):
    if native_compiler():
        invoke('check', source)
        return None
    return compiler.analyze(source)


def compile_c(source):
    return invoke('emit-c', source, output=True) if native_compiler() else compiler.compile_c(source)


def symbols(source):
    return invoke('symbols', source) if native_compiler() else python_symbols(source)


def build(source, output, toolchain=None):
    if native_compiler():
        with patch('vela.driver.compile_c', compile_c):
            return driver.build(source, output, toolchain)
    return driver.build(source, output, toolchain)


def cli_prefix():
    import sys
    return [str(native_compiler())] if native_compiler() else [sys.executable, '-m', 'vela']
