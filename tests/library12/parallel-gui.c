#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
int main(void){HWND window=NULL,button;int i;ULONGLONG peak=0;DWORD_PTR answer;
 for(i=0;i<60&&!window;i++){window=FindWindowW(NULL,L"Vela parallel acceptance");if(!window)Sleep(50);}if(!window)return 2;
 button=GetDlgItem(window,101);if(!button)return 3;
 for(i=0;i<5;i++){ULONGLONG start=GetTickCount64(),elapsed;if(!SendMessageTimeoutW(window,WM_NULL,0,0,SMTO_ABORTIFHUNG,500,&answer))return 4;elapsed=GetTickCount64()-start;if(elapsed>peak)peak=elapsed;if(!PostMessageW(window,WM_COMMAND,MAKEWPARAM(101,BN_CLICKED),(LPARAM)button))return 5;Sleep(50);}
 printf("{\"messages\":5,\"max_response_ms\":%llu}\n",(unsigned long long)peak);return 0;}
