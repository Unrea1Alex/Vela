#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

#define CHECK(condition) do { if (!(condition)) { fprintf(stderr, "line %d: %s\n", __LINE__, #condition); return 1; } } while (0)
typedef struct { DWORD pid; HWND window; } search;

static BOOL CALLBACK window_for_pid(HWND window, LPARAM context) {
    search *target = (search *)context;
    DWORD pid;
    wchar_t name[32];
    GetWindowThreadProcessId(window, &pid);
    if (pid != target->pid || !IsWindowVisible(window)) return TRUE;
    if (!GetClassNameW(window, name, 32) || wcscmp(name, L"VelaGuiAbi1")) return TRUE;
    target->window = window;
    return FALSE;
}
static int command(HWND window, int id) {
    HWND button = GetDlgItem(window, id);
    return button && IsWindowEnabled(button)
        && PostMessageW(window, WM_COMMAND, MAKEWPARAM(id, BN_CLICKED), (LPARAM)button);
}
static int text_has(HWND control, const wchar_t *wanted) {
    wchar_t text[4096] = { 0 };
    DWORD_PTR result;
    return SendMessageTimeoutW(control, WM_GETTEXT, 4096, (LPARAM)text, SMTO_ABORTIFHUNG, 500, &result)
        && wcsstr(text, wanted) != NULL;
}
static int await_text(HWND control, const wchar_t *wanted) {
    const ULONGLONG end = GetTickCount64() + 6000;
    do {
        if (text_has(control, wanted)) return 1;
        Sleep(10);
    } while (GetTickCount64() < end);
    return 0;
}
static int await_button(HWND window, int id) {
    const ULONGLONG end = GetTickCount64() + 6000;
    do {
        if (IsWindowEnabled(GetDlgItem(window, id))) return 1;
        Sleep(10);
    } while (GetTickCount64() < end);
    return 0;
}
static int fielddesk(HWND window) {
    HWND editor = GetDlgItem(window, 201), status = GetDlgItem(window, 202);
    DWORD_PTR result;
    CHECK(editor && status);
    CHECK(command(window, 104));
    CHECK(await_text(status, L"Measurements loaded"));
    CHECK(text_has(editor, L"station from server"));
    CHECK(command(window, 104));
    CHECK(await_text(status, L"Loading measurements"));
    CHECK(!IsWindowEnabled(GetDlgItem(window, 101)));
    CHECK(SendMessageTimeoutW(editor, EM_SETSEL, 0, 0, SMTO_ABORTIFHUNG, 500, &result));
    CHECK(SendMessageTimeoutW(editor, WM_CHAR, L'!', 1, SMTO_ABORTIFHUNG, 500, &result));
    CHECK(await_text(status, L"Your edits were kept"));
    CHECK(text_has(editor, L"!{\"station\":\"station from server\""));
    CHECK(command(window, 104));
    CHECK(await_text(status, L"Loading measurements"));
    Sleep(180);
    CHECK(command(window, 105));
    CHECK(await_text(status, L"Load cancelled."));
    CHECK(text_has(editor, L"!{\"station\":\"station from server\""));
    CHECK(command(window, 104));
    CHECK(await_text(status, L"Loading measurements"));
    Sleep(180);
    CHECK(command(window, 103));
    puts("FieldDesk window: load, concurrent edit, cancel, close");
    return 0;
}
static int pulse(HWND window) {
    HWND status = GetDlgItem(window, 202);
    CHECK(status);
    CHECK(await_button(window, 105));
    Sleep(180);
    CHECK(command(window, 105));
    CHECK(await_text(status, L"Saved:"));
    CHECK(command(window, 101));
    CHECK(await_button(window, 105));
    Sleep(180);
    CHECK(command(window, 103));
    puts("PulseDeck window: cancel, save, run again, close");
    return 0;
}
int main(int argc, char **argv) {
    search target = { 0 };
    const ULONGLONG end = GetTickCount64() + 6000;
    CHECK(argc == 3);
    target.pid = strtoul(argv[2], NULL, 10);
    CHECK(target.pid);
    do {
        EnumWindows(window_for_pid, (LPARAM)&target);
        if (target.window && GetDlgItem(target.window, 202)) break;
        Sleep(10);
    } while (GetTickCount64() < end);
    CHECK(target.window);
    return argv[1][0] == 'f' ? fielddesk(target.window) : pulse(target.window);
}
