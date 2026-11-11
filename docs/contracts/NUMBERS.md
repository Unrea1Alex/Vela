# Numbers — 0.7.1 contract

Status: included in Vela 0.7.0, verified on Windows x64/MSVC.
Original stage 0.7.1 verify: 905/905, both fixed points; `tools/float-platform.vela` separately
verified parsing/formatting inside a comma-decimal UCRT locale without changing it.
The original 0.7.1 gate exercised Windows. The 1.3 lowering audit separately
checks the numeric boundaries on Linux/GCC and Windows/MSVC.
Final release gate: [Vela 0.7.0](../VALIDATION-0.7.md), 974/974 in two native trees.

Int remains checked signed 64-bit. Float64 is IEEE 754 binary64, a separate
primitive with no implicit Int conversions. Decimal literals require digits
before the decimal point, digits after it when present, and/or an exponent
(`1.25`, `2e3`, `1.0e-2`). `1..3` remains an integer range. Literal overflow
is E205; subnormal/underflow rounding is allowed. Hex floats, underscores,
`.5` and `1.` are not accepted. Unary minus preserves negative zero.

Float64 supports + - * / and comparisons. Operations use round-to-nearest,
ties-to-even, without fast-math or fused contraction. Overflow produces signed
infinity; zero/zero produces NaN; finite nonzero divided by zero produces signed
infinity. NaN is unequal to everything including itself; ordered comparisons
with NaN are false. +0 and -0 compare equal. `%` and float ranges are rejected.
Scalar includes Float64 and distinct Float64; Number includes Int and Float64
(not distinct wrappers). Dict keys deliberately exclude Float64 and its distinct
wrappers because NaN lacks reflexive equality. Lists/records/enums may store it.

`float_from_int` rounds to binary64. `float_to_int` truncates toward zero and
returns IntResult::Err for NaN/infinity or values outside [-2^63,2^63).
`float_floor`, `float_ceil`, `float_round` preserve non-finite values; round uses
ties away from zero, explicitly different from arithmetic rounding.
`float_is_finite` and `float_is_nan` classify values.

`parse_float` returns FloatResult, consumes the whole ASCII string, has the same
decimal grammar except an integer spelling is also accepted, and allows a leading
+/- and exact `nan`, `inf`, `-inf`, `+inf`. Maximum input length is 4096 bytes. No whitespace, hex, NUL, locale comma
or trailing junk. Decimal overflow is Err; underflow rounds to a subnormal/zero.
`float_text_valid` is a numeric conversion probe used by the compiler; syntax
recognition and diagnostics remain in Vela. Conversions use a private C locale.

`float_to_string`, print, to_string and `:display` interpolation emit 17 significant
decimal digits with a dot (round-trip precision, not shortest representation).
Exponent is lowercase e; non-finite spellings are `nan`, `inf`, `-inf`; -0 is `-0`.
`:d` remains Int-only. The JSON module added in stage 0.7.2 rejects non-finite
numbers, accepts only JSON decimal grammar, and serializes Number values with
a decimal point or exponent to preserve their distinction from Integer.
In 0.8, `float_sqrt` returns FloatResult and `float_to_fixed` returns StringResult.
See [square root](MATH.md) and [fixed formatting](NUMBER-FORMAT.md). The display
format above keeps its existing rules.

Storage is an 8-byte C double with compile-time binary64 checks. Formatted
strings use the [managed heap](../MEMORY.md). The 0.7 bootstrap first introduced
the numeric runtime/catalog/backend, then enables compiler literal range checks
using the new probe. Final verify must compare three generations and cover
edge values, negative zero, NaN, conversion failures, generics/collections,
effects, formatter and locale-independent parsing/printing.
