#include "../../native/gui/adapter.c"
#include <stdio.h>
static int events, last_event, deny;
static int32_t event(uint64_t token,int64_t code,int64_t *answer) {
    (void)token; ++events;last_event=(int)code;*answer=deny;return VELA_CALLBACK_OK;
}
static VelaBytes bytes(const char *s) { VelaBytes b={s,(uint64_t)strlen(s)};return b; }
static void check(int ok,const char *message) { if(!ok) { fprintf(stderr,"%s\n",message);exit(1); } }
static void dpi(VelaGui *g,int value) {
    RECT r={0,0,MulDiv(g->width,value,96),MulDiv(g->height,value,96)};
    RECT editor; LOGFONTW font;
    check(AdjustWindowRectExForDpi(&r,WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,FALSE,0,(UINT)value),"DPI frame");
    OffsetRect(&r,100-r.left,100-r.top);
    SendMessageW(g->window,WM_DPICHANGED,MAKELONG(value,value),(LPARAM)&r);
    GetWindowRect(g->editor,&editor);
    check(editor.right-editor.left==MulDiv(g->width-40,value,96),"editor DPI width");
    check(editor.bottom-editor.top==MulDiv(g->height-152,value,96),"editor DPI height");
    check(GetObjectW(g->font,sizeof(font),&font)!=0 && font.lfHeight==-MulDiv(9,value,72),"DPI font");
}
int main(int argc,char **argv) {
    VelaCallback callback={VELA_CALLBACK_VERSION,0,1,event};
    DPI_AWARENESS_CONTEXT old=GetThreadDpiAwarenessContext();
    VelaGui *g=gui_open(bytes("Vela GUI DPI acceptance"),bytes("Unicode: Москва · αβ"),512,310,0,4096,103,106);
    check(g!=NULL,"open");
    check(AreDpiAwarenessContextsEqual(old,GetThreadDpiAwarenessContext()),"thread DPI restored");
    check(gui_button(g,101,bytes("Save")) && gui_button(g,103,bytes("Close")),"buttons");
    check(!gui_button(g,103,bytes("duplicate")),"duplicate ID");
    check(gui_attach(g,&callback),"attach");
    check(gui_text(g,bytes("Москва · αβ\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\nline 6\r\nline 7\r\nline 8\r\nline 9\r\nline 10")),"Unicode text");
    check(gui_snapshot(g)>0 && events==0,"snapshot and programmatic edit suppression");
    if(argc>1) {
        char status[80];int value=atoi(argv[1]);
        dpi(g,value);snprintf(status,sizeof(status),"Effective DPI: %d. Close to finish.",value);gui_status(g,bytes(status));
        while(!g->closing) { check(gui_pump(g,50)==0,"visible pump"); }
    } else {
        dpi(g,96);dpi(g,144);dpi(g,192);
        SendMessageW(g->editor,EM_SETSEL,0,-1);
        SendMessageW(g->editor,EM_REPLACESEL,TRUE,(LPARAM)L"User edit");check(last_event==106,"change event");
        SendMessageW(g->buttons[0],BM_CLICK,0,0);check(last_event==101,"button event");
        deny=1;SendMessageW(g->buttons[0],BM_CLICK,0,0);check(gui_pump(g,0)==-1,"callback overflow/error visible");
        SendMessageW(g->window,WM_CLOSE,0,0);check(last_event==103,"close event");
        {int count=events;SendMessageW(g->window,WM_CLOSE,0,0);check(events==count,"one close event");}
    }
    gui_close(g);puts("GUI layout passed");return 0;
}
