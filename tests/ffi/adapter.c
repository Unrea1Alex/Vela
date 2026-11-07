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

#include <windows.h>
static const VelaCallback *saved_callback;
VELA_FFI_EXPORT void save_callback(void *owner, const VelaCallback *callback) {
    if (owner && callback && callback->version == VELA_CALLBACK_VERSION) saved_callback = callback;
}
VELA_FFI_EXPORT int64_t invoke_saved(int64_t input) {
    int64_t output = -1;
    int32_t status;
    if (!saved_callback) return -100;
    fesetround(FE_UPWARD);
    status = saved_callback->invoke(saved_callback->token, input, &output);
    if (fegetround() != FE_UPWARD) return -999;
    if (status && output != -1) return -998;
    return status ? -100 - status : output;
}
static DWORD WINAPI invoke_on_worker(void *ignored) {
    int64_t output = -1;
    int32_t status;
    (void)ignored;
    status = saved_callback->invoke(saved_callback->token, 0, &output);
    return output == -1 ? (DWORD)status : 999;
}
VELA_FFI_EXPORT int64_t callback_other_thread(void) {
    DWORD status = 999;
    HANDLE worker = CreateThread(NULL, 0, invoke_on_worker, NULL, 0, NULL);
    if (!worker) return status;
    WaitForSingleObject(worker, INFINITE);
    GetExitCodeThread(worker, &status);
    CloseHandle(worker);
    return status;
}
