#include "../../vela/ffi.h"
#include <windows.h>
#include <winhttp.h>
#include <stdlib.h>
#include <string.h>
typedef struct { int64_t error, status, size; unsigned char body[4096]; } Response;
VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }
VELA_FFI_EXPORT void *http_get(int64_t port, VelaBytes path) {
    Response *r = calloc(1,sizeof(*r));
    HINTERNET session = NULL, connection = NULL, request = NULL;
    wchar_t wide[1025]; DWORD flags = WINHTTP_DISABLE_REDIRECTS | WINHTTP_DISABLE_COOKIES | WINHTTP_DISABLE_AUTHENTICATION;
    DWORD status, size, count; unsigned char block[1024]; size_t i;
    if (!r) return NULL;
    if (port < 1 || port > 65535 || !path.length || path.length > 1024 || path.data[0] != '/') { r->error=1; return r; }
    for (i=0; i<path.length; ++i) {
        unsigned char b=(unsigned char)path.data[i];
        if (b<33 || b>126 || b=='#') { r->error=1; return r; }
        wide[i]=b;
    }
    wide[path.length]=0;
    session=WinHttpOpen(L"Vela-0.7-prototype",WINHTTP_ACCESS_TYPE_NO_PROXY,NULL,NULL,0);
    if (!session) goto failure;
    if (!WinHttpSetTimeouts(session,200,200,200,200)) goto failure;
    connection=WinHttpConnect(session,L"127.0.0.1",(INTERNET_PORT)port,0);
    if (!connection) goto failure;
    request=WinHttpOpenRequest(connection,L"GET",wide,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,0);
    if (!request || !WinHttpSetOption(request,WINHTTP_OPTION_DISABLE_FEATURE,&flags,sizeof(flags))) goto failure;
    if (!WinHttpSendRequest(request,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0) ||
        !WinHttpReceiveResponse(request,NULL)) goto failure;
    size=sizeof(status);
    if (!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,NULL,&status,&size,NULL)) goto failure;
    r->status=status;
    for (;;) {
        count=0;
        if (!WinHttpReadData(request,block,sizeof(block),&count)) goto failure;
        if (!count) break;
        if (count > sizeof(r->body)-(size_t)r->size) { r->error=4; goto finish; }
        memcpy(r->body+r->size,block,count); r->size+=count;
    }
    goto finish;
failure:
    r->error=GetLastError()==ERROR_WINHTTP_TIMEOUT ? 3 : 2;
finish:
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    if (session) WinHttpCloseHandle(session);
    return r;
}
VELA_FFI_EXPORT int64_t http_error(void *h) { return h ? ((Response*)h)->error : 5; }
VELA_FFI_EXPORT int64_t http_status(void *h) { return h ? ((Response*)h)->status : 0; }
VELA_FFI_EXPORT int64_t http_size(void *h) { return h ? ((Response*)h)->size : 0; }
VELA_FFI_EXPORT int64_t http_byte(void *h, int64_t index) {
    Response *r=h; return r && index>=0 && index<r->size ? r->body[index] : -1;
}
VELA_FFI_EXPORT void http_close(void *h) { free(h); }
