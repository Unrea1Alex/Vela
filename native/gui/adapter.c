#define UNICODE
#define _WIN32_WINNT 0x0A00
#include "../../vela/ffi.h"
#include <windows.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    HWND window, editor, status, caption, buttons[5];
    int ids[5], count, width, height, limit, close_id, changed_id;
    DWORD thread;
    UINT dpi;
    HFONT font;
    const VelaCallback *callback;
    int failed, closing, programmatic, length;
    char *snapshot;
} VelaGui;
static VelaGui *gui_owner(void *handle) {
    VelaGui *g = handle;
    return g && g->thread == GetCurrentThreadId() && g->window ? g : NULL;
}
static wchar_t *gui_utf8(VelaBytes value, int limit) {
    wchar_t *w;
    int count;
    if (value.length < 0 || value.length > limit || (value.length && memchr(value.data, 0, (size_t)value.length))) return NULL;
    w = malloc(((size_t)value.length + 1) * sizeof(*w));
    if (!w) return NULL;
    count = value.length ? MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data, (int)value.length, w, (int)value.length) : 0;
    if (!count && value.length) { free(w); return NULL; }
    w[count] = 0; return w;
}
static int gui_px(VelaGui *g, int v) { return MulDiv(v, (int)g->dpi, 96); }
static void gui_move(VelaGui *g, HWND h, int x, int y, int w, int height) {
    MoveWindow(h, gui_px(g,x), gui_px(g,y), gui_px(g,w), gui_px(g,height), TRUE);
    SendMessageW(h, WM_SETFONT, (WPARAM)g->font, TRUE);
}
static int gui_layout(VelaGui *g) {
    HFONT previous = g->font;
    int i, width;
    g->font = CreateFontW(-MulDiv(9,(int)g->dpi,72),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,
        DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
    if (!g->font) { g->font = previous; return 0; }
    gui_move(g,g->caption,20,16,g->width-40,24);
    gui_move(g,g->editor,20,48,g->width-40,g->height-152);
    gui_move(g,g->status,20,g->height-48,g->width-40,42);
    width = g->count ? (g->width-40-(g->count-1)*10)/g->count : 0;
    for (i=0;i<g->count;++i) gui_move(g,g->buttons[i],20+i*(width+10),g->height-92,width,32);
    if (previous) DeleteObject(previous);
    return 1;
}
static void gui_deliver(VelaGui *g, int code) {
    int64_t answer = -1;
    if (g->callback && (g->callback->invoke(g->callback->token,code,&answer)!=VELA_CALLBACK_OK || answer)) g->failed=1;
}
static LRESULT CALLBACK gui_proc(HWND window, UINT message, WPARAM wp, LPARAM lp) {
    VelaGui *g=(VelaGui *)GetWindowLongPtrW(window,GWLP_USERDATA);
    if (message==WM_NCCREATE) {
        g=((const CREATESTRUCTW *)lp)->lpCreateParams;
        SetWindowLongPtrW(window,GWLP_USERDATA,(LONG_PTR)g);
    }
    if (g && message==WM_COMMAND && !g->closing) {
        if ((HWND)lp==g->editor && HIWORD(wp)==EN_CHANGE && !g->programmatic && g->changed_id) gui_deliver(g,g->changed_id);
        if (HIWORD(wp)==BN_CLICKED) {
            int i;
            for(i=0;i<g->count;++i) if((HWND)lp==g->buttons[i]) {
                if(g->ids[i]==g->close_id) SendMessageW(window,WM_CLOSE,0,0);
                else gui_deliver(g,g->ids[i]);
            }
        }
        return 0;
    }
    if (g && message==WM_CLOSE) {
        if(!g->closing) { g->closing=1; gui_deliver(g,g->close_id); }
        return 0;
    }
    if (g && message==WM_DPICHANGED) {
        const RECT *r=(const RECT *)lp;
        UINT dpi=HIWORD(wp);
        if(dpi<48 || dpi>768 || !r) { g->failed=1; return 0; }
        g->dpi=dpi;
        if(!gui_layout(g)) g->failed=1;
        SetWindowPos(window,NULL,r->left,r->top,r->right-r->left,r->bottom-r->top,SWP_NOZORDER|SWP_NOACTIVATE);
        return 0;
    }
    if(g && message==WM_DESTROY) g->window=NULL;
    return DefWindowProcW(window,message,wp,lp);
}
static HWND gui_control(VelaGui *g,const wchar_t *kind,const wchar_t *label,DWORD style,int id) {
    return CreateWindowExW(0,kind,label,WS_CHILD|WS_VISIBLE|style,0,0,1,1,g->window,
        (HMENU)(INT_PTR)id,GetModuleHandleW(NULL),NULL);
}
VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }
VELA_FFI_EXPORT void gui_close(void *handle) {
    VelaGui *g=handle;
    if(!g || g->thread!=GetCurrentThreadId()) return;
    g->callback=NULL;
    if(g->window) DestroyWindow(g->window);
    if(g->font) DeleteObject(g->font);
    free(g->snapshot); free(g);
}
VELA_FFI_EXPORT void *gui_open(VelaBytes title,VelaBytes caption,int64_t width,int64_t height,
        int64_t readonly,int64_t limit,int64_t close_id,int64_t changed_id) {
    WNDCLASSW wc={0}; RECT r={0}; VelaGui *g;
    wchar_t *name=NULL,*label=NULL;
    DPI_AWARENESS_CONTEXT old;
    DWORD style=WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX;
    if(width<320||width>1600||height<240||height>1200||limit<1||limit>65536||readonly<0||readonly>1||close_id<1||close_id>65535||changed_id<0||changed_id>65535||close_id==changed_id) return NULL;
    name=gui_utf8(title,4096); label=gui_utf8(caption,4096);
    if(!name||!label) { free(name);free(label);return NULL; }
    g=calloc(1,sizeof(*g));
    if(!g) { free(name);free(label);return NULL; }
    g->thread=GetCurrentThreadId();g->width=(int)width;g->height=(int)height;
    g->limit=(int)limit;g->close_id=(int)close_id;g->changed_id=(int)changed_id;
    g->snapshot=malloc((size_t)limit);
    if(!g->snapshot) { free(name);free(label);free(g);return NULL; }
    old=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if(!old) { free(name);free(label);gui_close(g);return NULL; }
    wc.lpfnWndProc=gui_proc;wc.hInstance=GetModuleHandleW(NULL);wc.lpszClassName=L"VelaGuiAbi1";
    wc.hCursor=LoadCursorW(NULL,IDC_ARROW);wc.hbrBackground=(HBRUSH)(COLOR_WINDOW+1);
    if(!RegisterClassW(&wc)&&GetLastError()!=ERROR_CLASS_ALREADY_EXISTS) goto failed;
    g->window=CreateWindowExW(0,wc.lpszClassName,name,style,CW_USEDEFAULT,CW_USEDEFAULT,
        (int)width,(int)height,NULL,NULL,wc.hInstance,g);
    if(!g->window) goto failed;
    g->dpi=GetDpiForWindow(g->window);
    r.right=gui_px(g,g->width);r.bottom=gui_px(g,g->height);
    if(!AdjustWindowRectExForDpi(&r,style,FALSE,0,g->dpi)) goto failed;
    SetWindowPos(g->window,NULL,0,0,r.right-r.left,r.bottom-r.top,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);
    g->caption=gui_control(g,L"STATIC",label,0,0);
    g->editor=gui_control(g,L"EDIT",L"",WS_TABSTOP|WS_BORDER|WS_VSCROLL|ES_MULTILINE|ES_AUTOVSCROLL|ES_WANTRETURN|(readonly?ES_READONLY:0),201);
    g->status=gui_control(g,L"STATIC",L"Ready",0,202);
    if(!g->editor||!g->caption||!g->status||!gui_layout(g)) goto failed;
    SendMessageW(g->editor,EM_SETLIMITTEXT,(WPARAM)limit,0);
    SetThreadDpiAwarenessContext(old);free(name);free(label);return g;
failed:
    SetThreadDpiAwarenessContext(old);free(name);free(label);gui_close(g);return NULL;
}
VELA_FFI_EXPORT int32_t gui_button(void *handle,int64_t id,VelaBytes label) {
    VelaGui *g=gui_owner(handle);wchar_t *text;int i;
    if(!g||g->callback||g->count>=5||id<1||id>65535||id==g->changed_id) return 0;
    for(i=0;i<g->count;++i) if(g->ids[i]==id) return 0;
    text=gui_utf8(label,4096);if(!text) return 0;
    g->buttons[g->count]=gui_control(g,L"BUTTON",text,WS_TABSTOP,(int)id);free(text);
    if(!g->buttons[g->count]) return 0;
    g->ids[g->count++]=(int)id;return gui_layout(g);
}
VELA_FFI_EXPORT int32_t gui_attach(void *handle,const VelaCallback *callback) {
    VelaGui *g=gui_owner(handle);int i,found=0;
    if(!g||!callback||callback->version!=VELA_CALLBACK_VERSION||g->callback) return 0;
    for(i=0;i<g->count;++i) if(g->ids[i]==g->close_id) found=1;
    if(!found) return 0;
    g->callback=callback;ShowWindow(g->window,SW_SHOWNORMAL);UpdateWindow(g->window);SetFocus(g->editor);return 1;
}
static int gui_set(VelaGui *g,HWND control,VelaBytes value,int limit) {
    wchar_t *text=gui_utf8(value,limit);int ok;
    if(!text) return 0;
    g->programmatic=1;ok=SetWindowTextW(control,text)!=0;g->programmatic=0;free(text);return ok;
}
VELA_FFI_EXPORT int32_t gui_text(void *handle,VelaBytes value) {
    VelaGui *g=gui_owner(handle);return g?gui_set(g,g->editor,value,g->limit):0;
}
VELA_FFI_EXPORT int32_t gui_status(void *handle,VelaBytes value) {
    VelaGui *g=gui_owner(handle);return g?gui_set(g,g->status,value,4096):0;
}
VELA_FFI_EXPORT int32_t gui_enabled(void *handle,int64_t id,int64_t enabled) {
    VelaGui *g=gui_owner(handle);int i;
    if(!g||(enabled!=0&&enabled!=1)) return 0;
    for(i=0;i<g->count;++i) if(g->ids[i]==id) { EnableWindow(g->buttons[i],(BOOL)enabled);return 1; }
    return 0;
}
VELA_FFI_EXPORT int64_t gui_snapshot(void *handle) {
    VelaGui *g=gui_owner(handle);wchar_t *text;int count;
    if(!g||GetWindowTextLengthW(g->editor)>g->limit) return -1;
    g->length=0;text=malloc(((size_t)g->limit+1)*sizeof(*text));if(!text) return -1;
    count=GetWindowTextW(g->editor,text,g->limit+1);
    g->length=count?WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text,count,g->snapshot,g->limit,NULL,NULL):0;
    free(text);return count&&!g->length?-1:g->length;
}
VELA_FFI_EXPORT int64_t gui_byte(void *handle,int64_t i) {
    VelaGui *g=gui_owner(handle);return g&&i>=0&&i<g->length?(unsigned char)g->snapshot[i]:-1;
}
VELA_FFI_EXPORT int64_t gui_pump(void *handle,int64_t wait_ms) {
    VelaGui *g=gui_owner(handle);MSG m;int i;
    if(!g||!g->callback||wait_ms<0||wait_ms>100) return -1;
    if(MsgWaitForMultipleObjects(0,NULL,FALSE,(DWORD)wait_ms,QS_ALLINPUT)==WAIT_FAILED) return -1;
    for(i=0;i<64&&PeekMessageW(&m,NULL,0,0,PM_REMOVE);++i) {
        if(m.message==WM_QUIT) { SendMessageW(g->window,WM_CLOSE,0,0);break; }
        if(m.hwnd==g->editor && m.message==WM_KEYDOWN && m.wParam=='A' && (GetKeyState(VK_CONTROL)&0x8000)) {
            SendMessageW(g->editor,EM_SETSEL,0,-1);continue;
        }
        if(!IsDialogMessageW(g->window,&m)) { TranslateMessage(&m);DispatchMessageW(&m); }
        if(g->failed) break;
    }
    return g->failed?-1:0;
}
