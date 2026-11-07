# Internal runtime ABI 2

ABI 2 adds a compile-time generator/runtime agreement. Generated C checks the
embedded runtime's `VELA_RUNTIME_ABI` before compiling the generated program.
The ABI 2 transition began with a region allocator. Root-aware emission supplies
descriptors and stack roots before opting in with `v_gc_enable`, as specified in
[RFC 0005](../rfcs/0005-precise-gc.md). A runtime compiled by the old generator
never activates collection merely because it includes the new allocator.

A 0.7 generator emits no activation call. Its output can use the new runtime
compatibility entry points during bootstrap with reclamation disabled. The DLL
ABI defined in [FFI.md](FFI.md) remains version 1, with the same borrowed byte
layout. A missing or mismatched internal ABI must fail at C compilation.

## Windows stack reserve in 0.10

MSVC output reserves 32 MiB of virtual address space for the main stack.
Stack pages are committed as needed. This preserves the documented frontend
nesting limit when the self-hosted compiler processes deep expressions and
reports E101 above its limit. Managed heap roots and collection policy stay
the same. The release gate builds a valid nested call chain and checks the
diagnostic on a deeper chain.
