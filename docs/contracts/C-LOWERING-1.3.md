# Checked IR and C lowering audit

Stage 1.3.4d checks the boundary from completed semantic analysis to generated
C. The backend consumes checked expression, statement, symbol and type tables.
Syntax and C compiler diagnostics do not decide whether Vela is well typed.
The audit keeps the current layout, runtime ABI, source locations and GC roots.

The behavior oracle is defined before the C builds.

| Area | Expected behavior |
|---|---|
| Integer text and conversions | Decimal integer tokens retain their decimal value, including leading zeros. Minimum and maximum signed values emit representable C constants. Float64 and Int32 conversions retain their documented bounds. |
| Arithmetic and boundaries | Int addition, subtraction, multiplication, division and negation fail at the start of the original expression when the result is out of range. Division and remainder by zero fail. The remainder of minimum Int and -1 is zero. Unsigned SHA-256 word shifts are checked against independent digest vectors. The language exposes no Int shift operator. |
| Calls and short circuit | Evaluate operands and arguments once in written order, including method receivers and named constructor fields. Evaluate only the selected logical operand and match arm. A bad evaluated operand fails before any later effect. |
| Exits | Return expressions are evaluated before registered defers run. Cleanup is LIFO on fallthrough, return, propagation, break, continue and supported async cancellation. Located process panics follow the runtime contract. |
| Source mapping | A runtime failure names the original source, line and column. Debug C export retains the source line and callable frame. Imported failures name the defining file. |

Run the native Windows gate and compile the same focused source and independent
expected outputs with MSVC and GCC. Check Linux in its compiler and console
scope per [platform support](PLATFORM-SUPPORT.md). Repeat relevant lifetime
checks with forced GC. Inspect suspicious C operations independently and check
any reproduced failure both before and after a scoped fix. Recover a compiler
from emitted C on both toolchains, verify the seed transition and compare its
re-emission on each platform. Preserve the arithmetic and source contract in
[language](../LANGUAGE.md), [numbers](NUMBERS.md) and [debugging](DEBUGGING.md).
