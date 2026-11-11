#include "../../vela/ffi.h"
#include "pool.h"
#include <string.h>

VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }
VELA_FFI_EXPORT int32_t vela_http_adapter_version(void) { return vh_supported() ? 1 : 0; }

VELA_FFI_EXPORT void *vela_http_pool(int64_t connections, int64_t origin, int64_t idle, VelaBytes ca) {
    vh_settings settings;
    if (connections < 1 || connections > 16 || origin < 1 || origin > connections
        || idle < 1 || idle > 3600 || ca.length > 1048576) return NULL;
    settings = (vh_settings){ (unsigned)connections, (unsigned)origin, (unsigned)idle,
        (const unsigned char *)ca.data, (size_t)ca.length };
    return vh_open(settings);
}
VELA_FFI_EXPORT void *vela_http_request(void *owner, VelaBytes url, VelaBytes headers,
    VelaBytes upload, int64_t method, int64_t limit, int64_t deadline, int64_t connect,
    int64_t *failure) {
    char url_text[8193], header_text[8193];
    vh_input input;
    vh_outcome error;
    vh_request *request;
    *failure = VH_DRIVER;
    if (!owner || url.length < 1 || url.length >= sizeof(url_text) || headers.length >= sizeof(header_text)
        || upload.length > 1048576 || method < VH_GET || method > VH_DELETE || limit < 0 || limit > 16777216
        || deadline < 0 || connect < 1 || connect > 120000 || memchr(url.data, 0, (size_t)url.length)
        || (headers.length && memchr(headers.data, 0, (size_t)headers.length))) return NULL;
    memcpy(url_text, url.data, (size_t)url.length);
    url_text[url.length] = 0;
    if (headers.length) memcpy(header_text, headers.data, (size_t)headers.length);
    header_text[headers.length] = 0;
    input = (vh_input){ url_text, (vh_method)method, header_text, (const unsigned char *)upload.data,
        (size_t)upload.length, (size_t)limit, (uint64_t)deadline, (unsigned)connect };
    request = vh_start(owner, &input, &error);
    *failure = error;
    return request;
}
VELA_FFI_EXPORT int64_t vela_http_manage(void *value, int64_t operation) {
    vh_pool *pool;
    if (!value) return -1;
    switch (operation) {
        case 0: return vh_tick(value);
        case 1:
            pool = value;
            if (vh_stats(pool).slots) return 0;
            return vh_close(&pool);
        case 2: return vh_cancel(value);
        case 3: return vh_release(value);
        case 4: return vh_read(value).outcome;
        case 5: return vh_read(value).status;
        case 6: return vh_read(value).transport_code;
        case 7:
            pool = value;
            return vh_close(&pool);
        default:
            if (operation >= 8 && operation <= 17) return vh_wait(value, (int)(operation - 7));
            return -1;
    }
}
VELA_FFI_EXPORT VelaBytes vela_http_view(void *request, int64_t channel) {
    vh_result value = vh_read(request);
    switch (channel) {
        case 0: return (VelaBytes){ (const char *)value.headers, value.headers_size };
        case 1: return (VelaBytes){ (const char *)value.body, value.body_size };
        case 2: return (VelaBytes){ value.message, strlen(value.message) };
        default: return (VelaBytes){ NULL, 0 };
    }
}
