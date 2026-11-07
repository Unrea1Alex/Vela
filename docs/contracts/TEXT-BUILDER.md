# Bounded byte and text builder

Contract for 0.8.10. A builder holds a shared, mutable sequence of immutable
byte fragments and a byte limit from zero through 16 MiB. Builder operations
use `state`. Copies share the builder state. Append checks the budget before
mutation and treats an empty fragment as a no-op. The retained byte count is
updated on each successful append, and assembling output copies the fragments
once. API users create builders through the checked constructor and do not
modify their representation fields directly.

`finish_bytes` returns immutable bytes. `finish_text` validates the complete
sequence as UTF-8, including when a character spans fragments. NUL is permitted.
Finish leaves the builder usable. Reset removes all fragments and resets the
count while keeping the limit. A previously finished result remains valid and
unchanged after append or reset. Reclamation of abandoned fragments follows GC.

Acceptance covers failed append without mutation, exact limits, zero capacity,
empty fragments, Unicode across fragments, invalid UTF-8, NUL, aliasing and
finish/reset loops. MeasureLab must emit the same report bytes for the same
data after replacing repeated growing concatenations with the builder.
