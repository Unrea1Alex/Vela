#include "../../vela/backends/runtime.h"
/* Independent ownership, shared budget and OS close failure probe. */
int main(int argc,char **argv) {
    v_stream_result r,w,handles[128];v_foreign_handle *h;v_io_result closed;int i;
    if(argc!=3)return 2;
    r=v_stream_open_large(v_text(argv[1],strlen(argv[1])),INT64_MAX,__FILE__,__LINE__,1);
    w=v_stream_create(v_text(argv[2],strlen(argv[2])),__FILE__,__LINE__,1);
    if(r.kind||w.kind||v_stream_count!=2)return 3;
    if(v_stream_next(w.handle,1,__FILE__,__LINE__,1).kind!=2 ||
       v_stream_write(r.handle,v_text("x",1)).ok ||
       v_stream_close(w.handle,__FILE__,__LINE__,1).ok ||
       v_stream_write_close(r.handle,__FILE__,__LINE__,1).ok)return 4;
    h=w.handle;
    if(v_ffi_retain(h,__FILE__,__LINE__,1).ok||v_ffi_release(h,__FILE__,__LINE__,1).ok||
       v_ffi_close(h,v_text("free",4),__FILE__,__LINE__,1).ok)return 5;
    if(v_ffi_callback_register(h,NULL,NULL,__FILE__,__LINE__,1).entry)return 6;
    if(!v_stream_write(h,v_text("abc",3)).ok)return 7;
#ifdef _WIN32
    if(!CloseHandle((HANDLE)_get_osfhandle(_fileno((FILE*)h->pointer))))return 8;
#else
    if(close(fileno((FILE*)h->pointer)))return 8;
#endif
    closed=v_stream_write_close(h,__FILE__,__LINE__,1);
    if(closed.ok||!h->closed||v_stream_count!=1||*v_foreign_root_slot(h))return 9;
    if(!v_stream_close(r.handle,__FILE__,__LINE__,1).ok||v_foreign_roots)return 10;
    for(i=0;i<128;i++){
        handles[i]=i%2?v_stream_open_large(v_text(argv[1],strlen(argv[1])),INT64_MAX,__FILE__,__LINE__,1):v_stream_create(v_text(argv[2],strlen(argv[2])),__FILE__,__LINE__,1);
        if(handles[i].kind)return 11;
    }
    if(v_stream_create(v_text(argv[2],strlen(argv[2])),__FILE__,__LINE__,1).kind!=2||
       v_stream_open_large(v_text(argv[1],strlen(argv[1])),INT64_MAX,__FILE__,__LINE__,1).kind!=2)return 12;
    for(i=0;i<128;i++){closed=i%2?v_stream_close(handles[i].handle,__FILE__,__LINE__,1):v_stream_write_close(handles[i].handle,__FILE__,__LINE__,1);if(!closed.ok)return 13;}
    if(v_stream_count||v_foreign_roots)return 14;
    puts("stream owner, 128 shared handles and failed close retirement passed");return 0;
}
