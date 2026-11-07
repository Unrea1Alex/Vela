/* Vela C ABI 1. A DLL using this interface is trusted native code. */
#ifndef VELA_FFI_H
#define VELA_FFI_H
#include <stdint.h>
#include <stddef.h>
#define VELA_FFI_ABI_VERSION 1
#if defined(_WIN32)
#define VELA_FFI_EXPORT __declspec(dllexport)
#else
#define VELA_FFI_EXPORT
#endif
typedef struct { const char *data; uint64_t length; } VelaBytes;
#define VELA_CALLBACK_VERSION 1
enum VelaCallbackStatus {
    VELA_CALLBACK_OK = 0,
    VELA_CALLBACK_CLOSED = 1,
    VELA_CALLBACK_WRONG_THREAD = 2,
    VELA_CALLBACK_DEPTH_LIMIT = 3,
    VELA_CALLBACK_INVALID = 4
};
typedef struct {
    uint32_t version;
    uint32_t reserved;
    uint64_t token;
    int32_t (*invoke)(uint64_t token, int64_t input, int64_t *output);
} VelaCallback;
_Static_assert(sizeof(void*) == 8, "Vela ABI 1 requires 64-bit pointers");
_Static_assert(sizeof(int32_t) == 4 && sizeof(int64_t) == 8 && sizeof(double) == 8, "Vela ABI 1 scalar sizes");
_Static_assert(sizeof(VelaBytes) == 16 && _Alignof(VelaBytes) == 8, "VelaBytes layout");
_Static_assert(offsetof(VelaBytes, data) == 0 && offsetof(VelaBytes, length) == 8, "VelaBytes offsets");
_Static_assert(sizeof(VelaCallback) == 24 && offsetof(VelaCallback, token) == 8 &&
    offsetof(VelaCallback, invoke) == 16, "VelaCallback layout");
/* Every adapter exports this symbol and returns VELA_FFI_ABI_VERSION. */
VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void);
#endif
