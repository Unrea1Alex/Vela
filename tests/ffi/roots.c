/* A native owner has a handle slot outside the generated lexical root chain. */
#include "../../vela/backends/runtime.h"

int main(int argc, char **argv) {
    int resource = 123;
    v_foreign_handle *handle;
    size_t retained;
    v_argc = argc;
    v_argv = argv;
    v_runtime_init();
    v_gc_enable();
    handle = v_foreign_wrap(&resource, NULL, __FILE__, __LINE__, 1);
    if (!v_ffi_retain(handle, __FILE__, __LINE__, 1).ok) return 1;
    if (v_ffi_retain(handle, __FILE__, __LINE__, 1).ok) return 2;
    retained = v_gc_bytes;
    (void)v_foreign_wrap(NULL, NULL, __FILE__, __LINE__, 1);
    v_gc_collect();
    if (v_gc_bytes != retained || handle->pointer != &resource) return 3;
    if (!v_ffi_release(handle, __FILE__, __LINE__, 1).ok) return 4;
    if (v_ffi_release(handle, __FILE__, __LINE__, 1).ok) return 5;
    v_gc_collect();
    if (v_gc_bytes != 0) return 6;
    puts("ffi roots passed");
    return 0;
}
