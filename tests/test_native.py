"""End-to-end language semantics, tested through actual native executables.

Native tests skip if a toolchain is unavailable. CI must require a compiler.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from vela.driver import executable_suffix, read_source
from tests.support import build, cli_prefix, native_compiler
from vela.source import Source
from vela.toolchain import ToolchainError, discover


ROOT = Path(__file__).resolve().parents[1]


class NativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.toolchain = discover()
        except ToolchainError as error:
            if os.environ.get("VELA_REQUIRE_NATIVE") == "1":
                raise
            raise unittest.SkipTest(str(error))

    def run_program(self, text, *args):
        with tempfile.TemporaryDirectory(prefix="vela-test-") as directory:
            output = Path(directory) / ("program" + executable_suffix())
            build(Source("test.vela", text), output, self.toolchain)
            return subprocess.run([str(output), *map(str, args)], capture_output=True,
                                  encoding="utf-8", timeout=10)

    def assert_program(self, text, expected, *args, code=0):
        result = self.run_program(text, *args)
        self.assertEqual(result.returncode, code, result.stderr)
        self.assertEqual(result.stdout, expected)
        if code == 0:
            self.assertEqual(result.stderr, "")
        return result

    def test_examples(self):
        cases = [("hello", [], "Hello from Vela!\n42\n"),
                 ("factorial", ["10"], "3628800\n"),
                 ("factorial", ["20"], "2432902008176640000\n"),
                 ("sum", ["12", "-5", "30"], "37\n"),
                 ("gcd", ["84", "30"], "6\n"),
                 ("result", [], "42\n"),
                 ("word_count", [str(ROOT / "examples/data/sample.txt")], "Bytes: 30\nLines: 2\nWords: 5\n")]
        for name, args, expected in cases:
            with self.subTest(name=name, args=args):
                self.assert_program((ROOT / f"examples/{name}.vela").read_text(encoding="utf-8"), expected, *args)

    def test_invalid_argument_is_handled(self):
        self.assert_program((ROOT / "examples/factorial.vela").read_text(),
                            "expected a signed decimal integer\n", "abc", code=2)

    def test_no_argument_is_handled(self):
        self.assert_program((ROOT / "examples/factorial.vela").read_text(),
                            "Usage: factorial <integer 0..20>\n", code=2)

    def test_operators_and_precedence(self):
        self.assert_program('''fn main() -> Unit effects { io } {
            print(2 + 3 * 4); print((2 + 3) * 4);
            print(-7 / 3); print(-7 % 3);
            print(7 / -3); print(7 % -3);
            print(1 < 2 && 4 >= 4); print(!true || 3 != 4);
            print(-9223372036854775808 % -1);
        }''', "14\n20\n-2\n-1\n-2\n1\ntrue\ntrue\n0\n")

    def test_arithmetic_edges(self):
        self.assert_program('''fn main() -> Unit effects { io } {
            print(-9223372036854775808 + 0);
            print(9223372036854775807 - 0);
            print(-9223372036854775808 * 1);
            print(-9223372036854775808 * 0);
            print(-1 * -9223372036854775807);
            print(-9223372036854775808 - -9223372036854775808);
        }''', "-9223372036854775808\n9223372036854775807\n-9223372036854775808\n0\n9223372036854775807\n0\n")

    def test_overflow_and_zero_division(self):
        cases = {
            "9223372036854775807 + 1": "overflow in addition",
            "-9223372036854775808 + -1": "overflow in addition",
            "-9223372036854775808 - 1": "overflow in subtraction",
            "9223372036854775807 - -1": "overflow in subtraction",
            "9223372036854775807 * 2": "overflow in multiplication",
            "-9223372036854775808 * -1": "overflow in multiplication",
            "-1 * -9223372036854775808": "overflow in multiplication",
            "-(-9223372036854775808)": "overflow in negation",
            "-9223372036854775808 / -1": "overflow in division",
            "1 / 0": "division by zero",
            "1 % 0": "remainder by zero",
        }
        for expression, expected in cases.items():
            with self.subTest(expression=expression):
                result = self.run_program(f'fn main() -> Unit effects {{ io }} {{ print({expression}); }}')
                self.assertEqual(result.returncode, 70, result.stderr)
                self.assertIn(expected, result.stderr)
                self.assertIn("test.vela:1:", result.stderr)
                self.assertEqual(result.stdout, "")

    def test_short_circuit(self):
        self.assert_program('''fn fail() -> Bool { let x = 1 / 0; return x == 0; }
            fn main() -> Unit effects { io } {
                print(false && fail()); print(true || fail());
            }''', "false\ntrue\n")

    def test_evaluation_order(self):
        self.assert_program('''
            fn mark(n: Int) -> Int effects { io } { print(n); return n; }
            fn join(a: Int, b: Int) -> Int { return a * 10 + b; }
            fn main() -> Unit effects { io } {
                print(join(mark(1), mark(2)));
                print(mark(3) + mark(4));
            }''', "1\n2\n12\n3\n4\n7\n")

    def test_recursive_function(self):
        self.assert_program('''fn fib(n: Int) -> Int {
            if n < 2 { return n; }
            return fib(n - 1) + fib(n - 2);
        }
        fn main() -> Unit effects { io } { print(fib(10)); }''', "55\n")

    def test_loop_scope_and_conditions(self):
        self.assert_program('''fn main() -> Unit effects { io } {
            var n = 3;
            while n > 0 {
                let copy = n;
                if n == 2 { let copy = 20; print(copy); }
                print(copy);
                n = n - 1;
            }
            print(n);
        }''', "3\n20\n2\n1\n0\n")

    def test_nested_enums_multiple_fields_and_unit(self):
        self.assert_program('''
            enum Outer { Item(Inner, Int), Empty }
            enum Inner { Pair(String, Bool), Nothing(Unit) }
            fn unit() -> Unit {}
            fn main() -> Unit effects { io } {
                let ignored = Inner::Nothing(unit());
                let value = Outer::Item(Inner::Pair("nested", true), 42);
                match value {
                    Outer::Item(inner, n) => {
                        match inner {
                            Inner::Pair(text, flag) => { print(text); print(flag); print(n); }
                            Inner::Nothing(_) => { print("unexpected"); }
                        }
                    }
                    Outer::Empty => { print("empty"); }
                }
            }''', "nested\ntrue\n42\n")

    def test_strings_unicode_nul_and_escaping(self):
        self.assert_program(r'''fn main() -> Unit effects { io } {
            print("Привет, Vela!");
            print("a\0b" == "a\0b");
            print("a\0b" != "a\0c");
            print("\"\\\t");
            print("a\0b");
        }''', 'Привет, Vela!\ntrue\ntrue\n"\\\t\na\0b\n')

    def test_parse_integer_boundaries(self):
        text = '''fn main() -> Int effects { io, args } {
            match arg_int(0) {
                IntResult::Ok(n) => { print(n); return 0; }
                IntResult::Err(message) => { print(message); return 2; }
            }
        }'''
        with tempfile.TemporaryDirectory(prefix="vela-parse-") as directory:
            executable = build(Source("parse.vela", text), Path(directory) / ("parse" + executable_suffix()), self.toolchain)
            cases = [("-9223372036854775808", 0), ("9223372036854775807", 0),
                     ("9223372036854775808", 2), ("-9223372036854775809", 2),
                     ("12x", 2), (" 12", 2), ("12 ", 2), ("+", 2), ("", 2), ("+42", 0)]
            for arg, code in cases:
                with self.subTest(arg=arg):
                    result = subprocess.run([str(executable), arg], capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, code, result.stderr)
                    if code == 0:
                        self.assertEqual(result.stdout, str(int(arg)) + "\n")

    def test_precondition(self):
        result = self.run_program('''fn positive(n: Int) -> Int requires n > 0; { return n; }
            fn main() -> Unit effects { io } { print(positive(-1)); }''')
        self.assertEqual(result.returncode, 70)
        self.assertIn("precondition failed: n > 0", result.stderr)

    def test_postcondition_on_early_return(self):
        result = self.run_program('''fn positive(n: Int) -> Int ensures result > 0; {
                if n == 0 { return 0; } return n;
            }
            fn main() -> Unit effects { io } { print(positive(0)); }''')
        self.assertEqual(result.returncode, 70)
        self.assertIn("postcondition failed: result > 0", result.stderr)

    def test_contract_on_implicit_unit_return(self):
        result = self.run_program('fn main() -> Unit ensures false; {}')
        self.assertEqual(result.returncode, 70)
        self.assertIn("postcondition failed", result.stderr)

    def test_argument_and_result_contracts(self):
        self.assert_program('''fn increment(n: Int) -> Int
                requires n < 9223372036854775807;
                ensures result == n + 1;
            { return n + 1; }
            fn main() -> Unit effects { io } { print(increment(41)); }''', "42\n")

    def test_exit_code(self):
        self.assert_program('fn main() -> Int { return 17; }', "", code=17)
        result = self.run_program('fn main() -> Int { return 256; }')
        self.assertEqual(result.returncode, 70)
        self.assertIn("main exit code", result.stderr)

    def test_build_path_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix="vela space ") as directory:
            executable = build(Source("path with space.vela", "fn main() -> Int { return 0; }"),
                Path(directory) / ("with space" + executable_suffix()), self.toolchain)
            self.assertEqual(subprocess.run([str(executable)], timeout=10).returncode, 0)

    def test_failed_build_preserves_existing_artifact(self):
        class BrokenToolchain:
            def compile(self, source, output):
                raise ToolchainError("deliberate compiler failure")
        with tempfile.TemporaryDirectory(prefix="vela-atomic-") as directory:
            output = Path(directory) / ("artifact" + executable_suffix())
            output.write_bytes(b"previous artifact")
            with self.assertRaises(ToolchainError):
                build(Source("good.vela", "fn main() -> Unit {}"), output, BrokenToolchain())
            self.assertEqual(output.read_bytes(), b"previous artifact")
            self.assertEqual(list(Path(directory).iterdir()), [output])

    def test_cli_run_arguments(self):
        environment = dict(self.toolchain.environment)
        environment['VELA_CC'] = self.toolchain.executable
        environment['VELA_CC_KIND'] = self.toolchain.kind
        result = subprocess.run([*cli_prefix(), "run", "examples/sum.vela", "--", "12", "-5", "30"],
                                cwd=ROOT, env=environment, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "37\n")


if __name__ == "__main__":
    unittest.main()
