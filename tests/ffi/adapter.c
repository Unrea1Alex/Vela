#include "../../vela/ffi.h"
#include <stdlib.h>
#include <string.h>
#include <fenv.h>
#ifndef FIXTURE_ABI
#define FIXTURE_ABI 1
#endif
static int64_t destroyed, ticks;
VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { fesetround(FE_DOWNWARD); return FIXTURE_ABI; }
VELA_FFI_EXPORT int64_t echo64(int64_t x) { return x; }
VELA_FFI_EXPORT int32_t echo32(int32_t x) { return x; }
VELA_FFI_EXPORT double mixed(int64_t a, double b, int32_t c, double d, int64_t e, double f) {
    return (double)a + b + (double)c + d + (double)e + f;
}
VELA_FFI_EXPORT int32_t invert(int32_t b) { return !b; }
VELA_FFI_EXPORT int32_t invalid_bool(void) { return 2; }
VELA_FFI_EXPORT int64_t bytes_ok(VelaBytes b) {
    const unsigned char expected[] = {'A',0,0xf0,0x9f,0x98,0x80};
    return b.length == sizeof(expected) && !memcmp(b.data,expected,sizeof(expected));
}
VELA_FFI_EXPORT void tick(void) { ++ticks; fesetround(FE_UPWARD); }
VELA_FFI_EXPORT int64_t tick_count(void) { return ticks; }
VELA_FFI_EXPORT int64_t rounding(void) { return fegetround() == FE_TONEAREST; }
VELA_FFI_EXPORT void *resource(int64_t value) { int64_t *p = malloc(sizeof(*p)); if (p) *p = value; return p; }
VELA_FFI_EXPORT void *null_resource(void) { return NULL; }
VELA_FFI_EXPORT int64_t resource_value(void *p) { return p ? *(int64_t*)p : -1; }
VELA_FFI_EXPORT void release_resource(void *p) { ++destroyed; free(p); fesetround(FE_DOWNWARD); }
VELA_FFI_EXPORT int64_t release_count(void) { return destroyed; }
