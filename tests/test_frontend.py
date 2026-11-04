import json
from pathlib import Path
import subprocess
import sys
import unittest

from tests.support import analyze, compile_c, symbols, cli_prefix
from vela.source import Diagnostic, Source


ROOT = Path(__file__).resolve().parents[1]


class FrontendTests(unittest.TestCase):
    def good(self, text):
        return analyze(Source("test.vela", text))

    def bad(self, code, text):
        with self.assertRaises(Diagnostic) as raised:
            self.good(text)
        self.assertEqual(raised.exception.code, code, str(raised.exception))
        return raised.exception

    def test_examples_check(self):
        for path in (ROOT / "examples").glob("*.vela"):
            # Optional historical 0.2 cross-frontend reference suite.
            if path.stem == "collections":
                continue
            with self.subTest(path=path.name):
                self.good(path.read_text(encoding="utf-8"))

    def test_forward_function_and_enum_references(self):
        self.good("""
            enum Outer { Item(Inner) }
            enum Inner { Number(Int) }
            fn main() -> Int { return later(3); }
            fn later(n: Int) -> Int { return n; }
        """)

    def test_type_mismatch(self):
        self.bad("E201", 'fn main() -> Int { return true; }')

    def test_no_implicit_numeric_boolean_conversion(self):
        self.bad("E201", 'fn main() -> Int { if 1 { return 0; } return 1; }')

    def test_local_type_annotation(self):
        self.bad("E201", 'fn main() -> Unit { let x: Int = "bad"; }')

    def test_assignment_type(self):
        self.bad("E201", 'fn main() -> Unit { var x = 1; x = false; }')

    def test_immutable_binding(self):
        self.bad("E213", 'fn main() -> Unit { let x = 1; x = 2; }')

    def test_parameter_is_immutable(self):
        self.bad("E213", 'fn f(x: Int) -> Unit { x = 2; } fn main() -> Unit {}')

    def test_block_scope(self):
        self.bad("E203", 'fn main() -> Int { if true { let x = 1; } return x; }')

    def test_shadowing_in_nested_scope(self):
        self.good('fn main() -> Int { let x = 1; if true { let x = 2; return x; } return x; }')

    def test_duplicate_binding(self):
        self.bad("E202", 'fn main() -> Unit { let x = 1; let x = 2; }')

    def test_duplicate_parameter(self):
        self.bad("E202", 'fn f(x: Int, x: Int) -> Int { return x; } fn main() -> Unit {}')

    def test_duplicate_top_level_name(self):
        self.bad("E202", 'enum A { B } fn A() -> Unit {} fn main() -> Unit {}')

    def test_unknown_type(self):
        self.bad("E200", 'fn main() -> Missing {}')

    def test_main_signature(self):
        self.bad("E207", 'fn main(x: Int) -> Int { return x; }')

    def test_missing_main(self):
        self.bad("E207", 'fn f() -> Unit {}')

    def test_missing_return(self):
        self.bad("E208", 'fn main() -> Int { if true { return 0; } }')

    def test_unreachable(self):
        self.bad("E212", 'fn main() -> Int { return 0; return 1; }')

    def test_exhaustive_match_return(self):
        self.good('''fn main() -> Int {
            match parse_int("42") {
                IntResult::Ok(n) => { return 0; }
                IntResult::Err(message) => { return 1; }
            }
        }''')

    def test_missing_arm(self):
        self.bad("E216", '''fn main() -> Int {
            match parse_int("42") { IntResult::Ok(n) => { return 0; } }
        }''')

    def test_duplicate_arm(self):
        self.bad("E215", '''fn main() -> Unit {
            match parse_int("42") { IntResult::Ok(n) => {} IntResult::Ok(m) => {} }
        }''')

    def test_wrong_pattern_arity(self):
        self.bad("E210", '''fn main() -> Unit {
            match parse_int("42") { IntResult::Ok => {} IntResult::Err(_) => {} }
        }''')

    def test_wrong_pattern_enum(self):
        self.bad("E201", '''enum Other { Ok(Int) } fn main() -> Unit {
            match parse_int("42") { Other::Ok(n) => {} }
        }''')

    def test_unknown_variant(self):
        self.bad("E211", 'fn main() -> Unit { let x = IntResult::Missing; }')

    def test_constructor_types(self):
        self.bad("E201", 'fn main() -> Unit { let x = IntResult::Ok(false); }')

    def test_no_recursive_value_enum(self):
        self.bad("E204", 'enum A { Item(B) } enum B { Item(A) } fn main() -> Unit {}')

    def test_no_empty_enum(self):
        self.bad("E204", 'enum Empty {} fn main() -> Unit {}')

    def test_no_duplicate_variant(self):
        self.bad("E202", 'enum A { X, X } fn main() -> Unit {}')

    def test_direct_effect(self):
        self.bad("E209", 'fn main() -> Unit { print(1); }')

    def test_transitive_effect(self):
        self.bad("E209", 'fn write() -> Unit effects { io } { print(1); } fn main() -> Unit { write(); }')

    def test_arguments_effect(self):
        self.bad("E209", 'fn main() -> Int { return arg_count(); }')

    def test_unknown_effect(self):
        self.bad("E206", 'fn main() -> Unit effects { magic } {}')

    def test_contracts_are_pure(self):
        self.bad("E209", 'fn main() -> Int effects { args } requires arg_count() > 0; { return 0; }')

    def test_postcondition_result_type(self):
        self.bad("E201", 'fn main() -> Int ensures result; { return 0; }')

    def test_result_not_available_in_precondition(self):
        self.bad("E203", 'fn main() -> Int requires result == 0; { return 0; }')

    def test_result_reserved(self):
        self.bad("E202", 'fn main() -> Unit { let result = 1; }')

    def test_unused_result_expression(self):
        self.bad("E214", 'fn main() -> Unit { parse_int("1"); }')

    def test_integer_bounds(self):
        self.good('fn main() -> Unit { let min = -9223372036854775808; let max = 9223372036854775807; }')
        for number in ("9223372036854775808", "-9223372036854775809", "1" * 5000):
            with self.subTest(number=number[:25]):
                self.bad("E205", f'fn main() -> Unit {{ let x = {number}; }}')

    def test_leading_zero_literal(self):
        self.good('fn main() -> Int { return ' + '0' * 5000 + '1; }')

    def test_string_tokens_not_confused_with_operators(self):
        self.good('fn main() -> Unit effects { io } { print("-"); print("true"); print("}"); }')

    def test_invalid_escapes(self):
        self.bad("E001", r'fn main() -> Unit { let x = "\q"; }')

    def test_unterminated_string(self):
        self.bad("E001", 'fn main() -> Unit { let x = "unfinished; }')

    def test_unfinished_block(self):
        self.bad("E100", 'fn main() -> Unit {')

    def test_wrong_call_arity(self):
        self.bad("E210", 'fn main() -> Unit { let x = parse_int(); }')

    def test_local_name_masks_function(self):
        self.bad("E201", 'fn main() -> Unit { let parse_int = 1; let x = parse_int("3"); }')

    def test_source_location(self):
        source = Source("location.vela", '// comment\nfn main() -> Int {\n    return false;\n}\n')
        with self.assertRaises(Diagnostic) as raised:
            analyze(source)
        detail = raised.exception.to_dict(source)
        self.assertEqual(detail["span"]["line"], 3)
        self.assertEqual(detail["span"]["column"], 5)
        self.assertIn("return false;", raised.exception.render(source))

    def test_deterministic_c(self):
        source = Source("deterministic.vela", 'fn main() -> Unit effects { io } { print(42); }')
        self.assertEqual(compile_c(source), compile_c(source))

    def test_symbol_protocol(self):
        index = symbols(Source("test.vela", 'fn main() -> Int ensures result == 0; { return 0; }'))
        self.assertEqual(index["schema_version"], 1)
        self.assertEqual(index["functions"][0]["contracts"]["verification"], "runtime")
        self.assertEqual(index["functions"][0]["contracts"]["ensures"], 1)

    def test_json_diagnostic_cli(self):
        result = subprocess.run([*cli_prefix(), "check",
            str(ROOT / "examples/invalid/missing_effect.vela"), "--json"],
            cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["diagnostics"][0]["code"], "E209")

    def test_deep_input_has_diagnostic(self):
        self.bad("E101", 'fn main() -> Int { return ' + '(' * 2000 + '0' + ')' * 2000 + '; }')


if __name__ == "__main__":
    unittest.main()
