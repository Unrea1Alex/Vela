# Float64 square root

Contract for 0.8.7. `float_sqrt(x) -> FloatResult` computes the principal
binary64 square root in the standard floating point environment. Negative
nonzero inputs (including negative infinity) and NaN return `Err`. Positive
infinity returns positive infinity. Both signs of zero are preserved. The
result is rounded to binary64, including for subnormal inputs. The function
has no language effects. The existing floor, ceil and round operations keep
their behavior.

Acceptance covers exact squares, an irrational root, subnormal and large
inputs, signed zero, infinities and NaN. MeasureLab must compile and run with
the same reference statistics without a native dependency in its manifest.
