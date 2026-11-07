# Typed JSON navigation and error context

Contract for 0.8.9. A JSON cursor pairs a decoded `Value` with a path from `$`.
Field and index selection are checked. Missing fields fail at the selected
child path, while a present `null` remains a value. Indexes are zero based.
ASCII identifier fields use `.name`. Other fields use a JSON quoted bracket
selector, preserving punctuation and escaping. Invalid UTF-8 selectors fail.

Typed readers check object, array, string, integer and numeric values. Numeric
reading requires an explicit integer conversion policy. Exact conversion
rejects any integer that does not round trip. Rounded conversion permits
binary64 rounding. Neither mode accepts booleans, null or nonfinite numbers.

`At<E>` adds a path to an error of type `E`. `with_path` preserves a success
or the original typed cause, and parsing retains the original JSON error.
The API does not add a wildcard to exhaustive matching or require callables.
MeasureLab must report nested field and sample errors with their path.
