#include "../../vela/ffi.h"
#include <windows.h>
#include <stdlib.h>
#include <string.h>
typedef struct { HWND window,label; DWORD thread; int actions,overflow,closed,reported; } Gui;
static wchar_t *text(VelaBytes value) {
    int count; wchar_t *copy;
    if (value.length>4096 || memchr(value.data,0,(size_t)value.length)) return NULL;
    count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data,(int)value.length,NULL,0);
    if (!count && value.length) return NULL;
    copy=malloc(((size_t)count+1)*sizeof(wchar_t));
    if (!copy) return NULL;
    if (count && !MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data,(int)value.length,copy,count)) { free(copy); return NULL; }
    copy[count]=0; return copy;
}
static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wp, LPARAM lp) {
    Gui *g=(Gui*)GetWindowLongPtrW(window,GWLP_USERDATA);
    if (message==WM_NCCREATE) {
        g=(Gui*)((CREATESTRUCTW*)lp)->lpCreateParams;
        SetWindowLongPtrW(window,GWLP_USERDATA,(LONG_PTR)g);
    }
    if (g && message==WM_COMMAND && LOWORD(wp)==100 && HIWORD(wp)==BN_CLICKED) {
        if (g->actions<64) ++g->actions; else g->overflow=1; return 0;
    }
    if (g && message==WM_CLOSE) { DestroyWindow(window); return 0; }
    if (g && message==WM_DESTROY) { g->closed=1; g->window=NULL; return 0; }
    return DefWindowProcW(window,message,wp,lp);
}
VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }
VELA_FFI_EXPORT void *gui_open(VelaBytes title) {
    WNDCLASSW wc={0}; Gui *g; wchar_t *name=text(title);
    if (!name) return NULL;
    wc.lpfnWndProc=window_proc; wc.hInstance=GetModuleHandleW(NULL);
    wc.lpszClassName=L"Vela07Prototype"; wc.hCursor=LoadCursorW(NULL,IDC_ARROW);
    wc.hbrBackground=(HBRUSH)(COLOR_WINDOW+1);
    if (!RegisterClassW(&wc) && GetLastError()!=ERROR_CLASS_ALREADY_EXISTS) { free(name); return NULL; }
    g=calloc(1,sizeof(*g)); if (!g) { free(name); return NULL; }
    g->thread=GetCurrentThreadId();
    g->window=CreateWindowExW(0,wc.lpszClassName,name,WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,
        CW_USEDEFAULT,CW_USEDEFAULT,440,220,NULL,NULL,wc.hInstance,g);
    free(name);
    if (!g->window) { free(g); return NULL; }
    g->label=CreateWindowExW(0,L"STATIC",L"",WS_CHILD|WS_VISIBLE,28,30,370,32,g->window,NULL,wc.hInstance,NULL);
    if (!g->label || !CreateWindowExW(0,L"BUTTON",L"Increment",WS_CHILD|WS_VISIBLE|WS_TABSTOP,
        28,85,180,38,g->window,(HMENU)100,wc.hInstance,NULL)) { DestroyWindow(g->window); free(g); return NULL; }
    ShowWindow(g->window,SW_SHOWNORMAL); UpdateWindow(g->window); return g;
}
VELA_FFI_EXPORT int32_t gui_caption(void *handle, VelaBytes caption) {
    Gui *g=handle; wchar_t *copy; int32_t ok;
    if (!g || g->thread!=GetCurrentThreadId() || g->closed) return 0;
    copy=text(caption); if (!copy) return 0;
    ok=SetWindowTextW(g->label,copy)!=0; free(copy); return ok;
}
VELA_FFI_EXPORT int64_t gui_poll(void *handle, int64_t wait_ms) {
    Gui *g=handle; MSG message;
    if (!g || g->thread!=GetCurrentThreadId() || wait_ms<0 || wait_ms>100) return -1;
    if (!g->closed) MsgWaitForMultipleObjects(0,NULL,FALSE,(DWORD)wait_ms,QS_ALLINPUT);
    while (PeekMessageW(&message,NULL,0,0,PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
    if (g->closed && !g->reported) { g->reported=1; return 2; }
    if (g->overflow) { g->overflow=0; return -2; }
    if (g->actions) { --g->actions; return 1; }
    return 0;
}
VELA_FFI_EXPORT void gui_close(void *handle) {
    Gui *g=handle;
    if (!g || g->thread!=GetCurrentThreadId()) return;
    if (g->window) DestroyWindow(g->window);
    free(g);
}
