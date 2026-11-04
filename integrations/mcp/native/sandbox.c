/* Windows OS supervisor; no language parsing/checking/lowering. */
#define _WIN32_WINNT 0x0A00
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <winternl.h>
#include <userenv.h>
#include <sddl.h>
#include <aclapi.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <wchar.h>
typedef NTSTATUS (NTAPI *open_relative_fn)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,ULONG,ULONG);
static open_relative_fn open_relative;
static int tree_handle(HANDLE directory,unsigned depth,uint64_t *bytes,unsigned *files) {
    unsigned char *buffer;FILE_ATTRIBUTE_TAG_INFO tag;int ok=1;BOOL first=TRUE;
    if(depth>64||!GetFileInformationByHandleEx(directory,FileAttributeTagInfo,&tag,sizeof(tag))||(tag.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))return 0;
    buffer=malloc(65536);if(!buffer)return 0;
    for(;;){
        FILE_ID_BOTH_DIR_INFO *entry;
        if(!GetFileInformationByHandleEx(directory,first?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo,buffer,65536)){
            DWORD e=GetLastError();ok=e==ERROR_NO_MORE_FILES||e==ERROR_FILE_NOT_FOUND||e==ERROR_PATH_NOT_FOUND||e==ERROR_DELETE_PENDING;break;
        }
        first=FALSE;entry=(void*)buffer;
        for(;;){
            if(!((entry->FileNameLength==2&&entry->FileName[0]==L'.')||(entry->FileNameLength==4&&entry->FileName[0]==L'.'&&entry->FileName[1]==L'.'))){
                if((entry->FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)||++*files>1024){ok=0;break;}
                if(entry->FileAttributes&FILE_ATTRIBUTE_DIRECTORY){
                    UNICODE_STRING name;OBJECT_ATTRIBUTES attributes={0};IO_STATUS_BLOCK io;HANDLE child=NULL;NTSTATUS status;
                    if(entry->FileNameLength>65534){ok=0;break;}
                    name.Buffer=entry->FileName;name.Length=(USHORT)entry->FileNameLength;name.MaximumLength=name.Length;
                    attributes.Length=sizeof(attributes);attributes.RootDirectory=directory;attributes.ObjectName=&name;attributes.Attributes=0x40;
                    /* Relative object handle + OPEN_REPARSE_POINT: never traverse a
                       path that the guest can swap to an outside junction. */
                    status=open_relative(&child,FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,&attributes,&io,
                        FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,0x1|0x20|0x00200000);
                    if(status>=0){ok=tree_handle(child,depth+1,bytes,files);CloseHandle(child);}
                    else if((ULONG)status!=0xc0000034u&&(ULONG)status!=0xc000003au&&(ULONG)status!=0xc0000056u)ok=0;
                    if(!ok)break;
                }else{
                    if(entry->EndOfFile.QuadPart<0){ok=0;break;}
                    *bytes+=(uint64_t)entry->EndOfFile.QuadPart;if(*bytes>64*1024*1024){ok=0;break;}
                }
            }
            if(!entry->NextEntryOffset)break;
            entry=(void*)((unsigned char*)entry+entry->NextEntryOffset);
        }
        if(!ok)break;
    }
    free(buffer);return ok;
}
static int tree_size(const wchar_t *root,unsigned depth,uint64_t *bytes,unsigned *files) {
    HANDLE directory;int ok;
    if(!open_relative)open_relative=(open_relative_fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtOpenFile");
    if(!open_relative)return 0;
    directory=CreateFileW(root,FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,NULL);
    if(directory==INVALID_HANDLE_VALUE)return 0;
    ok=tree_handle(directory,depth,bytes,files);CloseHandle(directory);return ok;
}
static DWORD grant(const wchar_t *path, PSID sid, DWORD permission, PSECURITY_DESCRIPTOR *saved) {
    PACL old=NULL, updated=NULL; PSID owner=NULL; EXPLICIT_ACCESSW entries[2]={{0}}; DWORD error;
    error=GetNamedSecurityInfoW((LPWSTR)path,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION|OWNER_SECURITY_INFORMATION,&owner,NULL,&old,NULL,saved);
    if (error) return error;
    entries[0].grfAccessPermissions=permission; entries[0].grfAccessMode=GRANT_ACCESS;
    entries[0].grfInheritance=SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    entries[0].Trustee.TrusteeForm=TRUSTEE_IS_SID; entries[0].Trustee.TrusteeType=TRUSTEE_IS_UNKNOWN; entries[0].Trustee.ptstrName=(LPWSTR)sid;
    /* The host owner needs WRITE_OWNER to lower the label of its new private root.
       AppContainer's second access check still restricts guest rights to its SID. */
    entries[1]=entries[0];entries[1].grfAccessPermissions=FILE_ALL_ACCESS;entries[1].Trustee.ptstrName=(LPWSTR)owner;
    error=SetEntriesInAclW(2,entries,old,&updated);
    if (!error) error=SetNamedSecurityInfoW((LPWSTR)path,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,NULL,NULL,updated,NULL);
    if (updated) LocalFree(updated);
    return error;
}
static DWORD restore(const wchar_t *path, PSECURITY_DESCRIPTOR saved) {
    PACL acl=NULL; BOOL present,def;
    if (!saved) return 0;
    if (!GetSecurityDescriptorDacl(saved,&present,&acl,&def) || !present) return ERROR_INVALID_SECURITY_DESCR;
    return SetNamedSecurityInfoW((LPWSTR)path,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,NULL,NULL,acl,NULL);
}
static DWORD low_label(const wchar_t *path) {
    PSECURITY_DESCRIPTOR sd=NULL; PACL acl=NULL; BOOL present,def; DWORD error;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"S:(ML;OICI;NW;;;LW)",SDDL_REVISION_1,&sd,NULL)) return GetLastError();
    if (!GetSecurityDescriptorSacl(sd,&present,&acl,&def)) { LocalFree(sd); return GetLastError(); }
    error=SetNamedSecurityInfoW((LPWSTR)path,SE_FILE_OBJECT,LABEL_SECURITY_INFORMATION,NULL,NULL,NULL,acl);
    LocalFree(sd); return error;
}
static DWORD label_tree(const wchar_t *path,unsigned depth) {
    wchar_t pattern[32768],child[32768];WIN32_FIND_DATAW data;HANDLE find;DWORD error;
    if(depth>64 || wcslen(path)>32000)return ERROR_BAD_PATHNAME;
    error=low_label(path);if(error)return error;
    swprintf(pattern,32768,L"%ls\\*",path);find=FindFirstFileW(pattern,&data);
    if(find==INVALID_HANDLE_VALUE)return GetLastError()==ERROR_FILE_NOT_FOUND?0:GetLastError();
    do{
        if(!wcscmp(data.cFileName,L".")||!wcscmp(data.cFileName,L".."))continue;
        if(data.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){FindClose(find);return ERROR_ACCESS_DENIED;}
        swprintf(child,32768,L"%ls\\%ls",path,data.cFileName);
        error=data.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY?label_tree(child,depth+1):low_label(child);
        if(error){FindClose(find);return error;}
    }while(FindNextFileW(find,&data));
    error=GetLastError();FindClose(find);return error==ERROR_NO_MORE_FILES?0:error;
}
static int quote(wchar_t *command, size_t *used, const wchar_t *arg) {
    size_t i=0,slashes;
#define PUT(ch) do { if(*used>=32766)return 0;command[(*used)++]=(ch); } while(0)
    PUT(L'"');
    for (;;) {
        slashes=0;while(arg[i]==L'\\'){++slashes;++i;}
        if (!arg[i] || arg[i]==L'"') slashes*=2;
        while(slashes--) PUT(L'\\');
        if (!arg[i]) break;
        if(arg[i]==L'"')PUT(L'\\');
        PUT(arg[i++]);
    }
    PUT(L'"');PUT(L' '); command[*used]=0;
    return 1;
#undef PUT
}
static uint64_t file_size(HANDLE file) {
    LARGE_INTEGER n; return GetFileSizeEx(file,&n) ? (uint64_t)n.QuadPart : UINT64_MAX;
}
static wchar_t *guest_environment(const wchar_t *root) {
    static const wchar_t *keys[]={L"APPDATA",L"INCLUDE",L"LIB",L"LOCALAPPDATA",L"PATH",L"SystemRoot",L"TEMP",L"TMP",L"USERPROFILE",L"VELA_CC",L"VELA_CC_KIND",L"VELA_SOURCE_ROOT",L"VSLANG",L"WINDIR"};
    wchar_t *block=calloc(65536,sizeof(wchar_t)),value[32768];size_t used=0;
    if(!block)return NULL;
    for(size_t i=0;i<sizeof(keys)/sizeof(keys[0]);++i){
        size_t length=wcslen(keys[i]),size;
        if(!wcscmp(keys[i],L"APPDATA")||!wcscmp(keys[i],L"LOCALAPPDATA")||!wcscmp(keys[i],L"USERPROFILE"))wcscpy_s(value,32768,root);
        else {DWORD count=GetEnvironmentVariableW(keys[i],value,32768);if(!count)continue;if(count>=32768){free(block);return NULL;}}
        size=wcslen(value)+1;
        if(used+length+size+2>=65536){free(block);return NULL;}
        memcpy(block+used,keys[i],length*sizeof(wchar_t));used+=length;block[used++]=L'=';
        memcpy(block+used,value,size*sizeof(wchar_t));used+=size;
    }
    block[used]=0;return block;
}
static DWORD package_probe(const wchar_t *root) {
    HANDLE token=NULL,file;DWORD size=0,error=0;TOKEN_USER *user=NULL;LPWSTR sid=NULL;
    wchar_t path[32768],sddl[512];PSECURITY_DESCRIPTOR sd=NULL;PACL acl=NULL;BOOL present,def;
    if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token))return GetLastError();
    GetTokenInformation(token,TokenUser,NULL,0,&size);user=malloc(size);
    if(!user){CloseHandle(token);return ERROR_OUTOFMEMORY;}
    if(!GetTokenInformation(token,TokenUser,user,size,&size)||!ConvertSidToStringSidW(user->User.Sid,&sid)){error=GetLastError();goto done;}
    swprintf(sddl,512,L"D:P(A;;FA;;;%ls)(A;;GR;;;S-1-15-2-1)",sid);
    if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,SDDL_REVISION_1,&sd,NULL)||
       !GetSecurityDescriptorDacl(sd,&present,&acl,&def)){error=GetLastError();goto done;}
    swprintf(path,32768,L"%ls\\__all_packages_probe",root);
    file=CreateFileW(path,GENERIC_WRITE,0,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    if(file==INVALID_HANDLE_VALUE){error=GetLastError();goto done;}CloseHandle(file);
    error=SetNamedSecurityInfoW(path,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION|PROTECTED_DACL_SECURITY_INFORMATION,NULL,NULL,acl,NULL);
done:
    if(sd)LocalFree(sd);if(sid)LocalFree(sid);free(user);CloseHandle(token);return error;
}
static DWORD recover_profile(const wchar_t *tool,const wchar_t *profile) {
    PSID sid=NULL;PSECURITY_DESCRIPTOR sd=NULL;PACL acl=NULL,updated=NULL;EXPLICIT_ACCESSW entry={0};DWORD error;
    HRESULT hr=DeriveAppContainerSidFromAppContainerName(profile,&sid);if(FAILED(hr))return (DWORD)hr;
    error=GetNamedSecurityInfoW((LPWSTR)tool,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,NULL,NULL,&acl,NULL,&sd);
    if(!error){entry.grfAccessMode=REVOKE_ACCESS;entry.Trustee.TrusteeForm=TRUSTEE_IS_SID;entry.Trustee.ptstrName=(LPWSTR)sid;
        error=SetEntriesInAclW(1,&entry,acl,&updated);
        if(!error)error=SetNamedSecurityInfoW((LPWSTR)tool,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,NULL,NULL,updated,NULL);}
    if(updated)LocalFree(updated);if(sd)LocalFree(sd);FreeSid(sid);
    hr=DeleteAppContainerProfile(profile);if(FAILED(hr)&&hr!=HRESULT_FROM_WIN32(ERROR_NOT_FOUND)&&hr!=HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND))return (DWORD)hr;
    return error;
}
static DWORD remove_private_tree(const wchar_t *root,unsigned depth) {
    WIN32_FIND_DATAW data;HANDLE find;DWORD error=0;size_t size=wcslen(root)+300;wchar_t *child;
    if(depth>256||size>32768)return ERROR_BAD_PATHNAME;
    child=malloc(size*sizeof(wchar_t));if(!child)return ERROR_OUTOFMEMORY;
    swprintf(child,size,L"%ls\\*",root);find=FindFirstFileW(child,&data);
    if(find==INVALID_HANDLE_VALUE){error=GetLastError();free(child);return error==ERROR_FILE_NOT_FOUND||error==ERROR_PATH_NOT_FOUND?0:error;}
    do{
        if(!wcscmp(data.cFileName,L".")||!wcscmp(data.cFileName,L".."))continue;
        swprintf(child,size,L"%ls\\%ls",root,data.cFileName);
        if((data.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)&&!(data.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))error=remove_private_tree(child,depth+1);
        else if(data.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY){if(!RemoveDirectoryW(child))error=GetLastError();}
        else {if(data.dwFileAttributes&FILE_ATTRIBUTE_READONLY)SetFileAttributesW(child,data.dwFileAttributes&~FILE_ATTRIBUTE_READONLY);if(!DeleteFileW(child))error=GetLastError();}
        if(error)break;
    }while(FindNextFileW(find,&data));
    FindClose(find);free(child);if(!error&&!RemoveDirectoryW(root))error=GetLastError();return error;
}
static int lease(const wchar_t *path,const wchar_t *base) {
    HANDLE file,operation;DWORD available,written;char pid[32];wchar_t pending[32768];
    wchar_t temp[32768],absolute[32768];DWORD length=GetTempPathW(32768,temp);
    if(!length||!GetFullPathNameW(base,32768,absolute,NULL)||_wcsnicmp(absolute,temp,length)||wcsncmp(absolute+length,L"vela-exec-",10))return 2;
    for(const wchar_t *p=absolute+length+10;*p;++p)if(!(*p>=L'a'&&*p<=L'z')&&!(*p>=L'A'&&*p<=L'Z')&&!(*p>=L'0'&&*p<=L'9')&&*p!=L'-')return 2;
    file=CreateFileW(path,GENERIC_READ|GENERIC_WRITE|DELETE,FILE_SHARE_READ,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_DELETE_ON_CLOSE,NULL);
    if(file==INVALID_HANDLE_VALUE)return 2;
    sprintf(pid,"%lu\n",GetCurrentProcessId());WriteFile(file,pid,(DWORD)strlen(pid),&written,NULL);
    puts("ready");fflush(stdout);
    while(PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),NULL,0,NULL,&available,NULL)&&!available)Sleep(10);
    swprintf(pending,32768,L"%ls.operation",path);
    /* The execution supervisor still restores ACL/profile after its pipe EOF.
       Keep the lease until its delete-on-close operation marker is released. */
    for(;;){
        operation=CreateFileW(pending,GENERIC_READ|GENERIC_WRITE,0,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
        if(operation!=INVALID_HANDLE_VALUE){CloseHandle(operation);break;}
        if(GetLastError()==ERROR_FILE_NOT_FOUND)break;
        Sleep(10);
    }
    {DWORD error=0;for(int i=0;i<20;++i){error=remove_private_tree(absolute,0);if(!error)break;Sleep(50);}
     if(error){HANDLE report;wchar_t message[32768];swprintf(pending,32768,L"%ls.failure.txt",path);
        report=CreateFileW(pending,GENERIC_WRITE,FILE_SHARE_READ,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
        if(report!=INVALID_HANDLE_VALUE){swprintf(message,32768,L"\xfeff" L"cleanup_error=%lu\r\nbase=%ls\r\n",error,absolute);WriteFile(report,message,(DWORD)(wcslen(message)*sizeof(wchar_t)),&written,NULL);CloseHandle(report);}}
     CloseHandle(file);return error?2:0;}
}
int wmain(int argc, wchar_t **argv) {
    /* PRIVATE_WORK READONLY_TOOLCHAIN OWNED_PROFILE TIMEOUT CWD EXE [ARGV...] */
    PSID sid=NULL; HRESULT hr; DWORD error=0,exit_code=0,timeout,available;
    PSECURITY_DESCRIPTOR work_acl=NULL,tool_acl=NULL;
    HANDLE job=NULL,out=INVALID_HANDLE_VALUE,err=INVALID_HANDLE_VALUE,in=INVALID_HANDLE_VALUE,operation=INVALID_HANDLE_VALUE;
    SECURITY_ATTRIBUTES sa={sizeof(sa),NULL,TRUE}; SECURITY_CAPABILITIES caps={0};
    PSID *cap_groups=NULL,*cap_sids=NULL;DWORD cap_group_count=0,cap_count=0;SID_AND_ATTRIBUTES cap_entry={0};
    STARTUPINFOEXW startup={0}; PROCESS_INFORMATION process={0};
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION bounds={0};
    JOBOBJECT_BASIC_UI_RESTRICTIONS ui={0};
    SIZE_T attribute_size=0; DWORD lpac=PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT;
    HANDLE handles[3]; wchar_t file[32768],command[32768]={0},executable[32768],cwd[32768],*environment=NULL; size_t used=0;
    const char *status="incompatible",*step="profile"; ULONGLONG started=0; int created=0,initialized=0,profile=0;DWORD peak_processes=0,total_processes=0;
    if(argc==4&&!wcscmp(argv[1],L"--lease"))return lease(argv[2],argv[3]);
    if(argc==4&&!wcscmp(argv[1],L"--recover")&&!wcsncmp(argv[3],L"vela-mcp-exec-",14)){
        error=recover_profile(argv[2],argv[3]);printf("{\"recovered\":%s,\"os_error\":%lu}\n",error?"false":"true",error);return error?2:0;}
    if(argc<7 || wcsncmp(argv[3],L"vela-mcp-exec-",14)) { fprintf(stderr,"invalid supervisor invocation\n"); return 2; }
    timeout=wcstoul(argv[4],NULL,10); if(!timeout || timeout>120000) return 2;
    {wchar_t lock[32768];DWORD size=GetEnvironmentVariableW(L"VELA_EXECUTION_LOCK",lock,32768);
     if(!size||size>32000){error=ERROR_BAD_ENVIRONMENT;goto finish;}
     swprintf(file,32768,L"%ls.operation",lock);
     operation=CreateFileW(file,GENERIC_READ|GENERIC_WRITE|DELETE,FILE_SHARE_READ,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_DELETE_ON_CLOSE,NULL);
     if(operation==INVALID_HANDLE_VALUE){error=GetLastError();goto finish;}}
    hr=CreateAppContainerProfile(argv[3],L"Vela isolated execution",L"Disposable Vela MCP request",NULL,0,&sid);
    if(FAILED(hr)) { error=(DWORD)hr; goto finish; } profile=1;
    step="work_acl";error=grant(argv[1],sid,FILE_GENERIC_READ|FILE_GENERIC_WRITE|FILE_GENERIC_EXECUTE|DELETE|FILE_DELETE_CHILD,&work_acl);
    if(error)goto finish;
    step="label";error=label_tree(argv[1],0);if(error)goto finish;
    step="tool_acl";error=grant(argv[2],sid,FILE_GENERIC_READ|FILE_GENERIC_EXECUTE,&tool_acl);if(error)goto finish;
    step="package_probe";error=package_probe(argv[1]);if(error)goto finish;
    for(int i=6;i<argc;++i)if(!quote(command,&used,argv[i])){error=ERROR_BAD_LENGTH;goto finish;}
    wcscpy_s(executable,32768,argv[6]);wcscpy_s(cwd,32768,argv[5]);
    step="capture";
    swprintf(file,32768,L"%ls\\__stdout",argv[1]);
    out=CreateFileW(file,GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ,&sa,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    swprintf(file,32768,L"%ls\\__stderr",argv[1]);
    err=CreateFileW(file,GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ,&sa,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    in=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&sa,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(out==INVALID_HANDLE_VALUE || err==INVALID_HANDLE_VALUE || in==INVALID_HANDLE_VALUE) {error=GetLastError();goto finish;}
    step="job";job=CreateJobObjectW(NULL,NULL);if(!job){error=GetLastError();goto finish;}
    bounds.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE|JOB_OBJECT_LIMIT_ACTIVE_PROCESS|JOB_OBJECT_LIMIT_JOB_MEMORY;
    bounds.BasicLimitInformation.ActiveProcessLimit=8;bounds.JobMemoryLimit=(SIZE_T)1024*1024*1024;
    ui.UIRestrictionsClass=JOB_OBJECT_UILIMIT_ALL;
    if(!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&bounds,sizeof(bounds)) ||
       !SetInformationJobObject(job,JobObjectBasicUIRestrictions,&ui,sizeof(ui))) {error=GetLastError();goto finish;}
    step="attributes";InitializeProcThreadAttributeList(NULL,3,0,&attribute_size);
    startup.lpAttributeList=malloc(attribute_size);if(!startup.lpAttributeList){error=ERROR_OUTOFMEMORY;goto finish;}
    if(!InitializeProcThreadAttributeList(startup.lpAttributeList,3,0,&attribute_size)){error=GetLastError();goto finish;} initialized=1;
    caps.AppContainerSid=sid;handles[0]=in;handles[1]=out;handles[2]=err;
    {typedef BOOL(WINAPI *derive_fn)(LPCWSTR,PSID**,DWORD*,PSID**,DWORD*);
     derive_fn derive=(derive_fn)GetProcAddress(GetModuleHandleW(L"kernelbase.dll"),"DeriveCapabilitySidsFromName");
     if(!derive||!derive(L"registryRead",&cap_groups,&cap_group_count,&cap_sids,&cap_count)||cap_count!=1){error=GetLastError();goto finish;}
     cap_entry.Sid=cap_sids[0];cap_entry.Attributes=SE_GROUP_ENABLED;caps.Capabilities=&cap_entry;caps.CapabilityCount=1;}
    if(!UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,&caps,sizeof(caps),NULL,NULL) ||
       !UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY,&lpac,sizeof(lpac),NULL,NULL) ||
       !UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,handles,sizeof(handles),NULL,NULL)) {error=GetLastError();goto finish;}
    startup.StartupInfo.cb=sizeof(startup);startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES|STARTF_USESHOWWINDOW;
    startup.StartupInfo.wShowWindow=SW_HIDE;startup.StartupInfo.hStdInput=in;startup.StartupInfo.hStdOutput=out;startup.StartupInfo.hStdError=err;
    environment=guest_environment(argv[1]);if(!environment){error=ERROR_OUTOFMEMORY;goto finish;}
    step="create";if(!CreateProcessW(executable,command,NULL,NULL,TRUE,EXTENDED_STARTUPINFO_PRESENT|CREATE_SUSPENDED|CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT,environment,cwd,&startup.StartupInfo,&process)) {error=GetLastError();goto finish;} created=1;
    step="assign";
    if(!AssignProcessToJobObject(job,process.hProcess)){error=GetLastError();goto finish;}
    if(ResumeThread(process.hThread)==(DWORD)-1){error=GetLastError();goto finish;}
    status="ok";step="running";started=GetTickCount64();
    for (;;) {
        uint64_t bytes=0;unsigned files=0;
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting={0};
        if(QueryInformationJobObject(job,JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),NULL)){
            if(accounting.ActiveProcesses>peak_processes)peak_processes=accounting.ActiveProcesses;
            total_processes=accounting.TotalProcesses;}
        if(!PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),NULL,0,NULL,&available,NULL) || available) {status="cancelled";break;}
        if(GetTickCount64()-started>=timeout){status="timeout";break;}
        if(file_size(out)+file_size(err)>4*1024*1024 || !tree_size(argv[1],0,&bytes,&files)){status="limit";break;}
        if(WaitForSingleObject(process.hProcess,10)==WAIT_OBJECT_0){GetExitCodeProcess(process.hProcess,&exit_code);break;}
    }
finish:
    if(created) {
        /* Successful roots can leave children: terminate before publishing. */
        if(job)TerminateJobObject(job,70);
        TerminateProcess(process.hProcess,70);WaitForSingleObject(process.hProcess,INFINITE);
        if(job) {
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting={0};
            do { if(!QueryInformationJobObject(job,JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),NULL))break;
                 if(accounting.ActiveProcesses)Sleep(10);
            } while(accounting.ActiveProcesses);
        }
        CloseHandle(process.hThread);CloseHandle(process.hProcess);
    }
    if(!strcmp(status,"ok")){uint64_t bytes=0;unsigned files=0;
        if(file_size(out)+file_size(err)>4*1024*1024||!tree_size(argv[1],0,&bytes,&files))status="limit";}
    if(job)CloseHandle(job);
    if(in!=INVALID_HANDLE_VALUE)CloseHandle(in);if(out!=INVALID_HANDLE_VALUE)CloseHandle(out);if(err!=INVALID_HANDLE_VALUE)CloseHandle(err);
    if(initialized)DeleteProcThreadAttributeList(startup.lpAttributeList);
    free(startup.lpAttributeList);free(environment);
    {DWORD e=restore(argv[2],tool_acl);if(e){error=e;status="incompatible";}}
    {DWORD e=restore(argv[1],work_acl);if(e){error=e;status="incompatible";}}
    if(work_acl)LocalFree(work_acl);if(tool_acl)LocalFree(tool_acl);if(sid)FreeSid(sid);
    if(profile){hr=DeleteAppContainerProfile(argv[3]);if(FAILED(hr)){error=(DWORD)hr;status="incompatible";}}
    for(DWORD i=0;i<cap_group_count;++i)LocalFree(cap_groups[i]);LocalFree(cap_groups);
    for(DWORD i=0;i<cap_count;++i)LocalFree(cap_sids[i]);LocalFree(cap_sids);
    if(operation!=INVALID_HANDLE_VALUE)CloseHandle(operation);
    printf("{\"status\":\"%s\",\"exit_code\":%lu,\"os_error\":%lu,\"step\":\"%s\",\"peak_processes\":%lu,\"total_processes\":%lu}\n",status,exit_code,error,step,peak_processes,total_processes);
    return strcmp(status,"incompatible") ? 0 : 2;
}
