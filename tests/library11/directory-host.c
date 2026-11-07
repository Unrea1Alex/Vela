#include "../../vela/backends/runtime.h"
/* Independent OS failure injection; never compiled into applications/runtime. */
int main(int argc, char **argv) {
    v_stream_result opened;
    v_foreign_handle *handle;
    v_directory *directory;
    v_io_result closed;
    if (argc != 3) return 2;
    {
        int i;
#ifdef _WIN32
        DWORD before, after;
        if (!GetProcessHandleCount(GetCurrentProcess(),&before)) return 8;
#endif
        for (i=0; i<2048; ++i) {
            opened = v_directory_open(v_text(argv[1],strlen(argv[1])),__FILE__,__LINE__,1);
            if (opened.kind || !v_directory_close(opened.handle,__FILE__,__LINE__,1).ok) return 9;
        }
        if (v_directory_count || v_foreign_roots) return 10;
#ifdef _WIN32
        if (!GetProcessHandleCount(GetCurrentProcess(),&after) || after != before) return 11;
#endif
    }
    opened = v_directory_open(v_text(argv[1],strlen(argv[1])),__FILE__,__LINE__,1);
    if (opened.kind != 0) return 3;
    handle = opened.handle;
    if (v_ffi_retain(handle,__FILE__,__LINE__,1).ok ||
        v_ffi_release(handle,__FILE__,__LINE__,1).ok ||
        v_ffi_close(handle,v_text("free",4),__FILE__,__LINE__,1).ok) return 4;
    directory = (v_directory *)handle->pointer;
#ifdef _WIN32
    if (!CloseHandle(directory->handle)) return 5;
#else
    if (close(dirfd(directory->handle))) return 5;
#endif
    closed = v_directory_close(handle,__FILE__,__LINE__,1);
    if (closed.ok || !handle->closed || v_directory_count || v_foreign_roots) return 6;
    opened = v_directory_open(v_text(argv[2],strlen(argv[2])),__FILE__,__LINE__,1);
    if (opened.kind != 2) return 7;
    puts("directory OS close failure and access denial passed");
    return 0;
}
