#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <wchar.h>

int wmain(int argc, wchar_t **argv) {
    wchar_t executable[32768], command[32768];
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION child = {0};
    HANDLE parent;
    DWORD length;
    if (argc == 2) {
        HANDLE inherited = (HANDLE)(uintptr_t)_wcstoui64(argv[1], NULL, 10);
        if (WaitForSingleObject(inherited, 5000) != WAIT_OBJECT_0) return 2;
        CloseHandle(inherited);
        puts("descendant ready");
        fflush(stdout);
        Sleep(INFINITE);
        return 3;
    }
    length = GetModuleFileNameW(NULL, executable, 32768);
    if (!length || length >= 32768) return 4;
    parent = OpenProcess(SYNCHRONIZE, TRUE, GetCurrentProcessId());
    if (!parent) return 5;
    if (swprintf_s(command, 32768, L"\"%ls\" %llu", executable,
            (unsigned long long)(uintptr_t)parent) < 0) {
        CloseHandle(parent);
        return 6;
    }
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    if (!CreateProcessW(executable, command, NULL, NULL, TRUE, CREATE_NO_WINDOW,
            NULL, NULL, &startup, &child)) {
        CloseHandle(parent);
        return 7;
    }
    CloseHandle(parent);
    CloseHandle(child.hThread);
    CloseHandle(child.hProcess);
    return 47;
}
