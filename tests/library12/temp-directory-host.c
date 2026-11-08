#define WIN32_LEAN_AND_MEAN
#include <windows.h>
static int remaining,attempts,create_rival;
static wchar_t rival[MAX_PATH+1];
static BOOL injected_directory(LPCWSTR name,LPSECURITY_ATTRIBUTES attributes);
#define CreateDirectoryW injected_directory
#include "../../vela/backends/runtime.h"
#undef CreateDirectoryW
static BOOL injected_directory(LPCWSTR name,LPSECURITY_ATTRIBUTES attributes){
 ++attempts;if(remaining>0){--remaining;if(create_rival){HANDLE file;DWORD written;create_rival=0;lstrcpyW(rival,name);file=CreateFileW(name,GENERIC_WRITE,0,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,NULL);if(file==INVALID_HANDLE_VALUE)return FALSE;if(!WriteFile(file,"7",1,&written,NULL)||written!=1){CloseHandle(file);return FALSE;}CloseHandle(file);}SetLastError(ERROR_ALREADY_EXISTS);return FALSE;}return CreateDirectoryW(name,attributes);
}
int main(void){v_io_result result,owned;v_string parent;HANDLE file;DWORD count;char data;
 owned=v_temp_dir(v_text("",0),__FILE__,__LINE__,1);if(!owned.ok)return 2;parent=owned.value;
 remaining=1;attempts=0;create_rival=1;result=v_temp_dir(parent,__FILE__,__LINE__,1);if(!result.ok||attempts!=2)return 3;if(!v_remove_dir(result.value,__FILE__,__LINE__,1).ok)return 4;
 file=CreateFileW(rival,GENERIC_READ,0,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);if(file==INVALID_HANDLE_VALUE)return 6;if(!ReadFile(file,&data,1,&count,NULL)||count!=1||data!='7'){CloseHandle(file);return 7;}CloseHandle(file);if(!DeleteFileW(rival))return 8;
 remaining=32;attempts=0;result=v_temp_dir(parent,__FILE__,__LINE__,1);if(result.ok||attempts!=32)return 5;
 if(!v_remove_dir(parent,__FILE__,__LINE__,1).ok)return 9;
 puts("exclusive temporary directory retry, rival preservation and bound passed");return 0;
}
