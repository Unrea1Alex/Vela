# Fixed Float64 formatting

Contract for 0.8.8. `float_to_fixed(value, digits) -> StringResult` accepts
0 through 18 fractional digits. Out of range precision returns `Err`.
Finite values use decimal fixed notation and ASCII `.` with exactly the
requested number of fractional digits. Rounding is nearest, ties to even,
applied to the binary64 input. The sign bit is preserved for zero and for
negative values rounded to zero. No decimal point is emitted at precision 0.
Finite output is at most 329 bytes, excluding the native terminator.

With valid precision, special values return `nan`, `inf` or `-inf`.
The numeric locale is isolated to C for formatting. The operation has no
language effects, and existing display and interpolation formats keep their
behavior. MeasureLab uses two digits and normalizes displayed negative zero.
