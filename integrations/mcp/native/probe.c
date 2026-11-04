#define _WIN32_WINNT 0x0A00
#define _CRT_SECURE_NO_WARNINGS
#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
int wmain(int argc,wchar_t **argv) {
    HANDLE token,file;DWORD n,flag=0;BOOL in_job=FALSE;WSADATA wsa;SOCKET socket_value;struct sockaddr_in address={0};
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION bounds={0};wchar_t temporary[32768],temporary_file[32768];
    if(argc==2 && !wcscmp(argv[1],L"--sleep")){
        if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token))return 120;
        if(!GetTokenInformation(token,TokenIsAppContainer,&flag,sizeof(flag),&n)||!flag)return 121;
        CloseHandle(token);if(!IsProcessInJob(GetCurrentProcess(),NULL,&in_job)||!in_job)return 122;
        file=CreateFileW(L"__all_packages_probe",GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
        if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 131;}if(GetLastError()!=ERROR_ACCESS_DENIED)return 132;
        swprintf(temporary,32768,L"child-ready-%lu",GetCurrentProcessId());file=CreateFileW(temporary,GENERIC_WRITE,0,NULL,CREATE_NEW,0,NULL);
        if(file==INVALID_HANDLE_VALUE)return 133;CloseHandle(file);
        Sleep(60000);return 0;
    }
    if(argc==2 && (!wcscmp(argv[1],L"--tree")||!wcscmp(argv[1],L"--process-limit"))){
        PROCESS_INFORMATION children[10]={{0}};unsigned count=0;DWORD failure=0;wchar_t exe[32768],command[32768];
        GetModuleFileNameW(NULL,exe,32768);
        for(;count<10;++count){STARTUPINFOW si={sizeof(si)};swprintf(command,32768,L"\"%ls\" --sleep",exe);
            if(!CreateProcessW(exe,command,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,NULL,&si,&children[count])){failure=GetLastError();break;}
            printf("child=%lu\n",children[count].dwProcessId);fflush(stdout);
            if(!wcscmp(argv[1],L"--tree")){
                DWORD childCode;swprintf(temporary,32768,L"child-ready-%lu",children[count].dwProcessId);
                for(int j=0;j<100&&GetFileAttributesW(temporary)==INVALID_FILE_ATTRIBUTES;++j)Sleep(10);
                if(GetFileAttributesW(temporary)==INVALID_FILE_ATTRIBUTES||!GetExitCodeProcess(children[count].hProcess,&childCode)||childCode!=STILL_ACTIVE)return 134;
                puts("child LPAC/job verified");fflush(stdout);Sleep(60000);break;
            }
        }
        printf("created=%u denied=%lu\n",count,failure);fflush(stdout);
        for(unsigned i=0;i<count;++i){TerminateProcess(children[i].hProcess,0);WaitForSingleObject(children[i].hProcess,10000);CloseHandle(children[i].hProcess);CloseHandle(children[i].hThread);}
        return count==7&&failure?0:123;
    }
    if(argc==2 && !wcscmp(argv[1],L"--memory")){
        void *blocks[80];unsigned count=0;
        for(;count<80;++count){blocks[count]=VirtualAlloc(NULL,16*1024*1024,MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE);if(!blocks[count])break;}
        printf("allocated=%u denied=%lu\n",count,GetLastError());
        for(unsigned i=0;i<count;++i)VirtualFree(blocks[i],0,MEM_RELEASE);
        return count>0&&count<64?0:124;
    }
    if(argc==2 && !wcscmp(argv[1],L"--flood")){
        char data[65536]={0};for(int i=0;i<160;++i)fwrite(data,1,sizeof(data),stdout);fflush(stdout);Sleep(60000);return 125;
    }
    if(argc==2 && !wcscmp(argv[1],L"--disk")){
        char data[65536]={0};file=CreateFileW(L"large.bin",GENERIC_WRITE,FILE_SHARE_READ,NULL,CREATE_ALWAYS,0,NULL);
        if(file==INVALID_HANDLE_VALUE)return 126;
        for(int i=0;i<1200;++i)if(!WriteFile(file,data,sizeof(data),&n,NULL))break;
        CloseHandle(file);Sleep(60000);return 127;
    }
    if(argc==2 && !wcscmp(argv[1],L"--files")){
        for(int i=0;i<1200;++i){swprintf(temporary,32768,L"file-%d",i);file=CreateFileW(temporary,GENERIC_WRITE,FILE_SHARE_READ,NULL,CREATE_ALWAYS,0,NULL);if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);}
        Sleep(60000);return 128;
    }
    if(argc==2 && !wcscmp(argv[1],L"--breakaway")){
        STARTUPINFOW si={sizeof(si)};PROCESS_INFORMATION pi={0};wchar_t exe[32768],command[32768];
        GetModuleFileNameW(NULL,exe,32768);swprintf(command,32768,L"\"%ls\" --sleep",exe);
        if(CreateProcessW(exe,command,NULL,NULL,FALSE,CREATE_NO_WINDOW|CREATE_BREAKAWAY_FROM_JOB,NULL,NULL,&si,&pi)){
            TerminateProcess(pi.hProcess,0);CloseHandle(pi.hProcess);CloseHandle(pi.hThread);return 129;}
        printf("breakaway denied=%lu\n",GetLastError());return GetLastError()==ERROR_ACCESS_DENIED?0:130;
    }
    if(argc==3 && !wcscmp(argv[1],L"--spawn")){
        STARTUPINFOW si={sizeof(si)};PROCESS_INFORMATION pi={0};wchar_t command[32768];DWORD code;
        file=CreateFileW(argv[2],GENERIC_READ|GENERIC_EXECUTE,FILE_SHARE_READ|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,0,NULL);
        fprintf(stderr,"read execute image: %lu\n",file==INVALID_HANDLE_VALUE?GetLastError():0);if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);
        swprintf(command,32768,L"\"%ls\" --version",argv[2]);
        if(!CreateProcessW(argv[2],command,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,NULL,&si,&pi)){fprintf(stderr,"spawn failure: %lu\n",GetLastError());return 115;}
        WaitForSingleObject(pi.hProcess,10000);GetExitCodeProcess(pi.hProcess,&code);CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return code;
    }
    if(argc==3 && !wcscmp(argv[1],L"--network-control")){
        int rc=WSAStartup(MAKEWORD(2,2),&wsa);
        if(rc){fprintf(stderr,"host WSAStartup %d\n",rc);return 110;}
        for(int i=0;i<2;++i){SOCKET control=socket(i?AF_INET:AF_INET6,i?SOCK_DGRAM:SOCK_STREAM,i?IPPROTO_UDP:IPPROTO_TCP);
            if(control==INVALID_SOCKET)return 113;closesocket(control);}
        socket_value=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(socket_value==INVALID_SOCKET)return 111;
        address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);address.sin_port=htons((u_short)_wtoi(argv[2]));
        rc=connect(socket_value,(struct sockaddr*)&address,sizeof(address));closesocket(socket_value);WSACleanup();
        if(rc)return 112;puts("host loopback control passed");return 0;
    }
    if(argc!=4)return 90;
    if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token))return 91;
    if(!GetTokenInformation(token,TokenIsAppContainer,&flag,sizeof(flag),&n)||!flag)return 92;
    flag=0;
    if(GetTokenInformation(token,TokenIsLessPrivilegedAppContainer,&flag,sizeof(flag),&n)){
        if(!flag)return 93;
    } else {
        fprintf(stderr,"LPAC class query unavailable: %lu; verifying actual ALL_APPLICATION_PACKAGES exclusion\n",GetLastError());
    }
    CloseHandle(token);
    /* This protected fixture grants read to ALL APPLICATION PACKAGES, not the
       request's package SID. LPAC must deny it despite the broad app-container ACE. */
    file=CreateFileW(L"__all_packages_probe",GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 93;}
    if(GetLastError()!=ERROR_ACCESS_DENIED)return 104;
    if(!IsProcessInJob(GetCurrentProcess(),NULL,&in_job)||!in_job)return 94;
    if(!QueryInformationJobObject(NULL,JobObjectExtendedLimitInformation,&bounds,sizeof(bounds),NULL) ||
       !(bounds.BasicLimitInformation.LimitFlags&JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) ||
       bounds.BasicLimitInformation.ActiveProcessLimit!=8 || bounds.JobMemoryLimit!=(SIZE_T)1024*1024*1024)return 95;
    file=CreateFileW(argv[1],GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 96;}
    if(GetLastError()!=ERROR_ACCESS_DENIED)return 137;
    file=CreateFileW(argv[1],GENERIC_WRITE,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 97;}
    if(GetLastError()!=ERROR_ACCESS_DENIED)return 138;
    file=CreateFileW(argv[1],WRITE_DAC|WRITE_OWNER|DELETE,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 140;}if(GetLastError()!=ERROR_ACCESS_DENIED)return 141;
    file=CreateFileW(argv[2],GENERIC_WRITE,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 98;}
    if(GetLastError()!=ERROR_ACCESS_DENIED)return 139;
    file=CreateFileW(argv[2],WRITE_DAC|WRITE_OWNER|DELETE,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);
    if(file!=INVALID_HANDLE_VALUE){CloseHandle(file);return 142;}if(GetLastError()!=ERROR_ACCESS_DENIED)return 143;
    file=CreateFileW(L"inside.txt",GENERIC_WRITE,0,NULL,CREATE_NEW,0,NULL);
    if(file==INVALID_HANDLE_VALUE)return 99;
    if(!WriteFile(file,"private",7,&n,NULL)||n!=7){CloseHandle(file);return 100;}CloseHandle(file);
    if(!GetTempPathW(32768,temporary)||!GetTempFileNameW(temporary,L"vlp",0,temporary_file)){
        fprintf(stderr,"private temp failure %lu at %ls\n",GetLastError(),temporary);return 105;
    }
    DeleteFileW(temporary_file);
    {int network_error=WSAStartup(MAKEWORD(2,2),&wsa);if(network_error){fprintf(stderr,"WSAStartup failed: %d\n",network_error);return 101;}}
    for(int i=0;i<2;++i){SOCKET denied=socket(i?AF_INET:AF_INET6,i?SOCK_DGRAM:SOCK_STREAM,i?IPPROTO_UDP:IPPROTO_TCP);
        if(denied!=INVALID_SOCKET){closesocket(denied);return 135;}if(WSAGetLastError()!=WSAEACCES)return 136;}
    socket_value=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(socket_value==INVALID_SOCKET){
        int e=WSAGetLastError();fprintf(stderr,"isolated socket denied: %d\n",e);WSACleanup();
        if(e!=WSAEACCES)return 102;
        puts("LPAC token, job, outside files, readonly toolchain, private write and loopback denial passed");return 0;
    }
    address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);address.sin_port=htons((u_short)_wtoi(argv[3]));
    if(connect(socket_value,(struct sockaddr*)&address,sizeof(address))==0 || WSAGetLastError()!=WSAEACCES){closesocket(socket_value);return 103;}
    closesocket(socket_value);WSACleanup();
    puts("LPAC token, job, outside files, readonly toolchain, private write and loopback denial passed");
    return 0;
}
