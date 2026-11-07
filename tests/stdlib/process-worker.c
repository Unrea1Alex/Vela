#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>

static HANDLE entered, release_open;
static DWORD caller;
static volatile LONG worker_seen;

static HANDLE gated_open(LPCWSTR path, DWORD access, DWORD sharing,
        LPSECURITY_ATTRIBUTES security, DWORD creation, DWORD flags, HANDLE template_file) {
    if (creation == OPEN_EXISTING && access == GENERIC_READ && wcsstr(path, L"worker-probe.exe")) {
        InterlockedExchange(&worker_seen, GetCurrentThreadId() != caller);
        SetEvent(entered);
        WaitForSingleObject(release_open, 4000);
        SetLastError(ERROR_FILE_NOT_FOUND);
        return INVALID_HANDLE_VALUE;
    }
    return CreateFileW(path, access, sharing, security, creation, flags, template_file);
}

#define CreateFileW gated_open
#include "../../vela/backends/runtime.h"
#undef CreateFileW

static v_string literal(const char *text) {
    return v_text(text, strlen(text));
}

int main(int argc, char **argv) {
    v_string_list *command;
    v_spawn_result started;
    v_parse_result pending;
    v_foreign_handle *handle;
    v_argc = argc;
    v_argv = argv;
    v_runtime_init();
    caller = GetCurrentThreadId();
    entered = CreateEventW(NULL, TRUE, FALSE, NULL);
    release_open = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!entered || !release_open) return 1;
    command = v_strings_new(__FILE__, __LINE__, 1);
    v_strings_push(command, literal("C:\\worker-probe.exe"), __FILE__, __LINE__, 1);
    started = v_process_spawn(command, literal("C:\\"),
        literal("C:\\worker-probe.out"), literal("C:\\worker-probe.err"),
        __FILE__, __LINE__, 1);
    handle = started.handle;
    if (!handle || WaitForSingleObject(entered, 2000) != WAIT_OBJECT_0 || !worker_seen) return 2;
    pending = v_process_poll(handle);
    if (!pending.ok || pending.value != -1) return 3;
    if (!v_process_cancel(handle, __FILE__, __LINE__, 1).ok) return 4;
    if (v_process_close(handle, __FILE__, __LINE__, 1).ok) return 5;
    SetEvent(release_open);
    if (WaitForSingleObject(((v_child_process *)handle->pointer)->launcher, 2000) != WAIT_OBJECT_0) return 6;
    if (v_process_poll(handle).ok) return 7;
    if (!v_process_close(handle, __FILE__, __LINE__, 1).ok) return 8;
    CloseHandle(entered);
    CloseHandle(release_open);
    puts("process worker passed");
    return 0;
}
