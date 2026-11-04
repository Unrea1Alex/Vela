import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from vela.driver import executable_suffix
from vela.source import Diagnostic, Source
from vela.toolchain import ToolchainError, discover
from tests.support import analyze, build, cli_prefix


def literal(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t').replace('\0', '\\0') + '"'


class ExtensionFrontendTests(unittest.TestCase):
    def reject(self, code, body, signature='fn main() -> Unit'):
        with self.assertRaises(Diagnostic) as error:
            analyze(Source('extension.vela', signature + ' { ' + body + ' }'))
        self.assertEqual(error.exception.code, code)

    def test_list_requires_state(self):
        self.reject('E209', 'let items = ints_new();')

    def test_list_items_are_typed(self):
        self.reject('E201', 'let items = ints_new(); ints_push(items, "wrong");', 'fn main() -> Unit effects { state }')

    def test_list_reads_are_effectful(self):
        code = 'fn size(items: IntList) -> Int { return ints_len(items); } fn main() -> Unit {}'
        with self.assertRaises(Diagnostic) as error:
            analyze(Source('extension.vela', code))
        self.assertEqual(error.exception.code, 'E209')

    def test_contract_cannot_read_shared_list(self):
        code = 'fn size(items: IntList) -> Int effects { state } requires ints_len(items) > 0; { return ints_len(items); } fn main() -> Unit {}'
        with self.assertRaises(Diagnostic) as error:
            analyze(Source('extension.vela', code))
        self.assertEqual(error.exception.code, 'E209')

    def test_list_equality_rejected(self):
        self.reject('E201', 'let a = ints_new(); let equal = a == a;', 'fn main() -> Unit effects { state }')

    def test_file_io_effect(self):
        self.reject('E209', 'let result_value = read_file("x");')

    def test_process_effect(self):
        self.reject('E209', 'let arguments = strings_new(); let status = process_run(arguments);', 'fn main() -> Unit effects { state }')

    def test_string_result_exhaustiveness(self):
        self.reject('E216', 'match read_file("x") { StringResult::Ok(value) => {} }', 'fn main() -> Unit effects { io }')

    def test_unicode_whitespace(self):
        for space in ('\u00a0', '\u2003', '\u2028', '\x0b', '\x1e'):
            with self.subTest(space=repr(space)):
                analyze(Source('unicode.vela', f'fn{space}main() -> Unit {{}}'))


class ExtensionRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.toolchain = discover()
        except ToolchainError as error:
            if os.environ.get('VELA_REQUIRE_NATIVE') == '1':
                raise
            raise unittest.SkipTest(str(error))

    def run_code(self, code, *arguments):
        with tempfile.TemporaryDirectory(prefix='vela-extension-') as directory:
            executable = build(Source('extension.vela', code), Path(directory) / ('program' + executable_suffix()), self.toolchain)
            return subprocess.run([str(executable), *arguments], capture_output=True, encoding='utf-8', timeout=15)

    def good(self, code, expected, *arguments):
        result = self.run_code(code, *arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, expected)

    def test_dynamic_string_lifetime_and_bytes(self):
        self.good('''fn value() -> String { return str_concat("ab", "Привет"); }
            fn main() -> Unit effects { io } {
                let s = value(); print(str_slice(s, 2, str_len(s))); print(str_len(s));
                print(str_byte(s, 0)); print(str_from_byte(0) == "\\0");
                print(int_to_string(-9223372036854775808));
            }''', 'Привет\n14\n97\ntrue\n-9223372036854775808\n')

    def test_list_aliases_and_growth(self):
        self.good('''fn add(items: IntList, value: Int) -> Unit effects { state } { ints_push(items, value); }
            fn main() -> Unit effects { state, io } {
                let a = ints_new(); let alias = a; var i = 0;
                while i < 10000 { add(alias, i); i = i + 1; }
                ints_set(a, 1, 42); print(ints_get(alias, 1)); print(ints_len(a));
                print(ints_get(a, 9999)); ints_truncate(alias, 2); print(ints_len(a));
            }''', '42\n10000\n9999\n2\n')

    def test_string_list_builder(self):
        self.good('''fn main() -> Unit effects { state, io } {
            let s = strings_new(); print(strings_join(s, ","));
            strings_push(s, "one"); strings_push(s, "two"); strings_set(s, 1, "three");
            print(strings_join(s, ":")); strings_truncate(s, 1); print(strings_get(s, 0));
        }''', '\none:three\none\n')

    def test_collection_in_enum(self):
        self.good('''enum Store { Items(IntList) }
            fn modify(s: Store) -> Unit effects { state } { match s { Store::Items(items) => { ints_push(items, 42); } } }
            fn main() -> Unit effects { state, io } { let items = ints_new(); modify(Store::Items(items)); print(ints_get(items, 0)); }
        ''', '42\n')

    def test_bounds_failures(self):
        cases = ['let x = str_byte("x", -1);', 'let x = str_byte("x", 1);',
                 'let x = str_slice("x", 1, 0);', 'let x = str_slice("x", 0, 2);',
                 'let x = str_from_byte(256);', 'let x = ints_get(ints_new(), 0);',
                 'ints_set(ints_new(), 0, 1);', 'strings_truncate(strings_new(), 1);']
        for body in cases:
            with self.subTest(body=body):
                result = self.run_code('fn main() -> Unit effects { state } { ' + body + ' }')
                self.assertEqual(result.returncode, 70)
                self.assertIn('extension.vela:', result.stderr)

    def test_file_roundtrip_and_replacement(self):
        with tempfile.TemporaryDirectory(prefix='vela файлы ') as directory:
            first = Path(directory) / 'a.txt'
            second = Path(directory) / 'b.txt'
            code = '''fn done(r: WriteResult) -> Unit effects { io, process } {
                match r { WriteResult::Ok => {} WriteResult::Err(message) => { eprint(message); exit(9); } }
            }
            fn main() -> Unit effects { io } {
                match read_file(PATH) { StringResult::Ok(_) => { print("unexpected"); } StringResult::Err(_) => { print("missing"); } }
            }'''.replace('PATH', literal(str(first)))
            self.good(code, 'missing\n')
            code = '''fn done(r: WriteResult) -> Unit effects { io, process } {
                match r { WriteResult::Ok => {} WriteResult::Err(message) => { eprint(message); exit(9); } }
            }
            fn main() -> Unit effects { io, process } {
                done(write_file(FIRST, "a\\0Привет")); done(write_file(SECOND, "old"));
                done(replace_file(FIRST, SECOND));
                match read_file(SECOND) {
                    StringResult::Ok(value) => { print(value == "a\\0Привет"); }
                    StringResult::Err(message) => { eprint(message); exit(8); }
                }
                done(remove_file(SECOND));
            }'''.replace('FIRST', literal(str(first))).replace('SECOND', literal(str(second)))
            self.good(code, 'true\n')
            self.assertFalse(first.exists())
            self.assertFalse(second.exists())

    def test_unicode_process_arguments_without_shell(self):
        code = '''fn argument(i: Int) -> String effects { args } {
            match arg(i) { StringResult::Ok(s) => { return s; } StringResult::Err(_) => { return ""; } }
        }
        fn main() -> Int effects { args, state, process } {
            let command = strings_new(); var i = 0;
            while i < arg_count() { strings_push(command, argument(i)); i = i + 1; }
            return process_run(command);
        }'''
        arguments = ['', 'a b', 'quote"inside', 'tail\\', 'Привет', '%PATH%', '&echo']
        result = self.run_code(code, sys.executable, '-c', 'import sys,json; print(json.dumps(sys.argv[1:]))', *arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), arguments)

    def test_process_output_redirect(self):
        code = '''fn main() -> Int effects { state, process } {
            let args = strings_new(); strings_push(args, PYTHON); strings_push(args, "-c");
            strings_push(args, "print('child output')"); return process_run_to_stderr(args);
        }'''.replace('PYTHON', literal(sys.executable))
        result = self.run_code(code)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr, 'child output\n')

    def test_nonexistent_process(self):
        self.good('''fn main() -> Unit effects { state, process, io } {
            let a = strings_new(); strings_push(a, "vela-no-such-executable-82931");
            print(process_run(a) != 0);
        }''', 'true\n')

    def test_dynamic_strings_in_pure_contract(self):
        self.good('''fn greet(name: String) -> String ensures str_len(result) == str_len(name) + 3;
            { return str_concat("Hi ", name); }
            fn main() -> Unit effects { io } { print(greet("Vela")); }''', 'Hi Vela\n')

    def test_temp_directory(self):
        self.good('''fn main() -> Unit effects { io } {
            match temp_dir("") {
                StringResult::Ok(path) => {
                    match remove_dir(path) { WriteResult::Ok => { print("removed"); } WriteResult::Err(message) => { print(message); } }
                }
                StringResult::Err(message) => { print(message); }
            }
        }''', 'removed\n')

    def test_normalized_source_file_cli(self):
        with tempfile.TemporaryDirectory(prefix='vela source ') as directory:
            source = Path(directory) / 'исходник.vela'
            source.write_bytes(b'\xef\xbb\xbf' + 'fn main() -> Unit {\r\n let x = "Привет";\r}\r\n'.encode('utf-8'))
            result = subprocess.run([*cli_prefix(), 'check', str(source), '--json'], capture_output=True, encoding='utf-8', timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(json.loads(result.stdout)['ok'])


if __name__ == '__main__':
    unittest.main()
