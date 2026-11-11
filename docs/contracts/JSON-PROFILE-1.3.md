# Profile-guided JSON string scanning

Stage 1.3.4 targets the frozen typed JSON workload from 1.3.1. The medium
input has 64 object keys and a selected integer. A successful run decodes
300 documents and sums the selected field to 2100. The historical median
is 197.77 ms. Acceptance requires at most 158.22 ms, the same result on
8/64/256 keys and a peak job commit within 10% of the baseline.

The original function profile attributes 76,200 calls to the stream
string scanner and 2,497,200 calls to its byte-peek helper. For an unescaped
string, the scanner can advance across a run of ordinary bytes using a
local checked byte offset. It commits the shared reader cursor once it
finds the closing quote. The returned string is still a detached immutable
copy. The short-lived slice used for copying retains the original input
only during the call and uses the existing precise tracing rules.

Opening quotes, escapes, control bytes, incomplete strings, UTF-8,
duplicates, budgets, paths and zero-based byte offsets keep the existing
contract. A failed fast scan leaves the shared cursor at the first content
byte for the established scanner. No schema callback runs before full
validation. Typed fields keep the existing span rules. Stage 1.3.4a owns
the wider integration of tree parsing, reader and typed validation.

Acceptance compares an independent literal oracle and the frozen executable
on the same inputs. It includes unescaped Unicode, escaped keys and values,
malformed strings and duplicate keys, stored values after reader lifetime,
forced GC, existing typed-decoder and application regressions, and both
native fixed points. Detailed before/after allocation and function counts
are recorded separately from release timings.
