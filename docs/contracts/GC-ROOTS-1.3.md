# Root elision for values without managed references

Stage 1.3.4f uses the completed checked layout order. Each by-value field is
known before its containing record, distinct wrapper or enum. Every enum
variant participates in the decision. A concrete generic instance is classified
by its actual fields. Unknown types keep the existing visitor behavior.

A scalar aggregate with no managed fields needs neither a root registration
nor a visitor. `String`, collections, foreign handles, dynamic boxes and
callable environments keep their existing managed ownership. A scalar list
element can use a null element visitor while the list and backing buffer remain
rooted. A scalar dynamic payload can use a null payload visitor while the box
itself remains live. A closure with scalar captures keeps its managed environment
while eliding the empty environment visitor. No storage layout, runtime ABI,
scope boundary, safepoint or collection trigger changes.

The [frozen generator](../acceptance/1.3.4e.json) emits 21 registrations and
14 layout visitors for the isolated scalar aggregate benchmark on either host.
The [optimization contract](C-OPTIMIZATION-1.3.md) sets the minimum reduction at
25%, which means at most 15 registrations in that fixture. Mixed aggregate,
strings, collections, closure/dyn, FFI and suspension remain controls. Run the
same checksum oracle under forced GC on both hosts where supported. Retain
located failures and cleanup outcomes. Verify the native seed transition, both
fixed points and recovery on MSVC and GCC. Compare measurements against 1.3.4e
and the fixed 1.3.4d baseline before accepting the stage.
