/* Vela runtime. Embedded into each generated standalone C11 translation unit. */
#ifndef _WIN32
#define _GNU_SOURCE 1
#define _POSIX_C_SOURCE 200809L
#endif
#ifdef _MSC_VER
#define _CRT_SECURE_NO_WARNINGS
#endif
#include <stdint.h>
#include <inttypes.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <math.h>
#include <float.h>
#include <fenv.h>
#include <locale.h>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

typedef struct { const char *data; size_t length; } v_string;
typedef struct { int ok; int64_t value; v_string error; } v_parse_result;
static int v_argc;
static char **v_argv;

static v_string v_text(const char *data, size_t length) {
    v_string value; value.data = data; value.length = length; return value;
}

static void v_panic(const char *file, int line, int column, const char *message) {
    fprintf(stderr, "%s:%d:%d: runtime error: %s\n", file, line, column, message);
    exit(70);
}

static int64_t v_add(int64_t a, int64_t b, const char *f, int l, int c) {
    if ((b > 0 && a > INT64_MAX - b) || (b < 0 && a < INT64_MIN - b))
        v_panic(f, l, c, "integer overflow in addition");
    return a + b;
}

static int64_t v_sub(int64_t a, int64_t b, const char *f, int l, int c) {
    if ((b > 0 && a < INT64_MIN + b) || (b < 0 && a > INT64_MAX + b))
        v_panic(f, l, c, "integer overflow in subtraction");
    return a - b;
}

static int64_t v_mul(int64_t a, int64_t b, const char *f, int l, int c) {
    if ((a > 0 && b > 0 && a > INT64_MAX / b) ||
        (a > 0 && b < 0 && b < INT64_MIN / a) ||
        (a < 0 && b > 0 && a < INT64_MIN / b) ||
        (a < 0 && b < 0 && a < INT64_MAX / b))
        v_panic(f, l, c, "integer overflow in multiplication");
    return a * b;
}

static int64_t v_div(int64_t a, int64_t b, const char *f, int l, int c) {
    if (b == 0) v_panic(f, l, c, "division by zero");
    if (a == INT64_MIN && b == -1) v_panic(f, l, c, "integer overflow in division");
    return a / b;
}

static int64_t v_rem(int64_t a, int64_t b, const char *f, int l, int c) {
    if (b == 0) v_panic(f, l, c, "remainder by zero");
    if (a == INT64_MIN && b == -1) return 0;
    return a % b;
}

static int64_t v_neg(int64_t a, const char *f, int l, int c) {
    if (a == INT64_MIN) v_panic(f, l, c, "integer overflow in negation");
    return -a;
}

static int v_string_eq(v_string a, v_string b) {
    return a.length == b.length && (a.length == 0 || memcmp(a.data, b.data, a.length) == 0);
}

static uint8_t v_print_String(v_string value, const char *f, int l, int c) {
    if (fwrite(value.data, 1, value.length, stdout) != value.length || fputc('\n', stdout) == EOF)
        v_panic(f, l, c, "failed to write standard output");
    return 0;
}

static uint8_t v_write_stdout(v_string value, const char *f, int l, int c) {
    int ok;
#ifdef _WIN32
    int mode;
    if (fflush(stdout) == EOF) v_panic(f, l, c, "failed to flush standard output");
    mode = _setmode(_fileno(stdout), _O_BINARY);
    if (mode == -1) v_panic(f, l, c, "cannot select binary standard output");
#endif
    ok = fwrite(value.data, 1, value.length, stdout) == value.length;
    if (fflush(stdout) == EOF) ok = 0;
#ifdef _WIN32
    if (_setmode(_fileno(stdout), mode) == -1) ok = 0;
#endif
    if (!ok) v_panic(f, l, c, "failed to write standard output");
    return 0;
}

static uint8_t v_print_Int(int64_t value, const char *f, int l, int c) {
    if (printf("%" PRId64 "\n", value) < 0) v_panic(f, l, c, "failed to write standard output");
    return 0;
}

static uint8_t v_print_Bool(int value, const char *f, int l, int c) {
    return v_print_String(value ? v_text("true", 4) : v_text("false", 5), f, l, c);
}

static v_parse_result v_parse_error(const char *message) {
    v_parse_result result;
    result.ok = 0; result.value = 0; result.error = v_text(message, strlen(message));
    return result;
}

static v_parse_result v_parse_int(v_string input) {
    size_t i = 0;
    int negative = 0;
    uint64_t number = 0;
    uint64_t limit;
    v_parse_result result;
    if (input.length == 0) return v_parse_error("expected a signed decimal integer");
    if (input.data[0] == '-' || input.data[0] == '+') {
        negative = input.data[0] == '-'; i = 1;
    }
    if (i == input.length) return v_parse_error("expected a signed decimal integer");
    limit = negative ? ((uint64_t)INT64_MAX + 1) : (uint64_t)INT64_MAX;
    for (; i < input.length; ++i) {
        unsigned char ch = (unsigned char)input.data[i];
        uint64_t digit;
        if (ch < '0' || ch > '9') return v_parse_error("expected a signed decimal integer");
        digit = (uint64_t)(ch - '0');
        if (number > (limit - digit) / 10) return v_parse_error("integer argument is out of range");
        number = number * 10 + digit;
    }
    result.ok = 1;
    result.value = negative ? (number == (uint64_t)INT64_MAX + 1 ? INT64_MIN : -(int64_t)number) : (int64_t)number;
    result.error = v_text("", 0);
    return result;
}

static v_parse_result v_arg_int(int64_t index) {
    const char *arg;
    if (index < 0 || index >= (int64_t)v_argc - 1) return v_parse_error("missing integer argument");
    arg = v_argv[(size_t)index + 1];
    return v_parse_int(v_text(arg, strlen(arg)));
}

static int64_t v_arg_count(void) { return (int64_t)v_argc - 1; }

static int v_exit_code(int64_t value, const char *f, int l, int c) {
    if (value < 0 || value > 255) v_panic(f, l, c, "main exit code must be between 0 and 255");
    return (int)value;
}

/* Process-region storage: every allocation is reclaimed at normal/error exit. */
#include <errno.h>
#include <limits.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
#else
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <signal.h>
#include <time.h>
#endif

typedef struct v_allocation { void *data; struct v_allocation *next; } v_allocation;
static v_allocation *v_allocations;
typedef struct { int64_t length, capacity; int64_t *data; } v_int_list;
typedef struct { int64_t length, capacity; v_string *data; } v_string_list;
typedef struct { int ok; v_string value; } v_io_result;
#ifdef _WIN32
static wchar_t **v_wargv;
static HMODULE v_shell_module;
#endif

static void v_foreign_shutdown(void);
static void v_runtime_free(void) {
    v_foreign_shutdown();
    while (v_allocations) {
        v_allocation *allocation = v_allocations;
        v_allocations = allocation->next;
        free(allocation->data); free(allocation);
    }
#ifdef _WIN32
    if (v_wargv) LocalFree(v_wargv);
    if (v_shell_module) FreeLibrary(v_shell_module);
#endif
}

static void *v_allocate(size_t size, const char *f, int l, int c) {
    v_allocation *allocation = (v_allocation *)malloc(sizeof(v_allocation));
    if (!allocation) v_panic(f, l, c, "out of memory");
    allocation->data = malloc(size ? size : 1);
    if (!allocation->data) { free(allocation); v_panic(f, l, c, "out of memory"); }
    allocation->next = v_allocations; v_allocations = allocation;
    return allocation->data;
}

static size_t v_size_add(size_t a, size_t b, const char *f, int l, int c) {
    if (b > SIZE_MAX - a || a + b > INT64_MAX) v_panic(f, l, c, "allocation size overflow");
    return a + b;
}

/* FIPS 180-4 SHA-256: byte-storage digest; all arithmetic is unsigned. */
static uint32_t v_sha_rotr(uint32_t x, unsigned n) { return (x >> n) | (x << (32 - n)); }
static void v_sha_block(uint32_t h[8], const unsigned char b[64]) {
    static const uint32_t k[64] = {
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    };
    uint32_t w[64],a=h[0],bb=h[1],cc=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    unsigned i;
    for (i=0;i<16;i++) w[i]=((uint32_t)b[4*i]<<24)|((uint32_t)b[4*i+1]<<16)|((uint32_t)b[4*i+2]<<8)|b[4*i+3];
    for (i=16;i<64;i++) {
        uint32_t x=w[i-15],y=w[i-2];
        w[i]=w[i-16]+(v_sha_rotr(x,7)^v_sha_rotr(x,18)^(x>>3))+w[i-7]+(v_sha_rotr(y,17)^v_sha_rotr(y,19)^(y>>10));
    }
    for (i=0;i<64;i++) {
        uint32_t t1=hh+(v_sha_rotr(e,6)^v_sha_rotr(e,11)^v_sha_rotr(e,25))+((e&f)^((~e)&g))+k[i]+w[i];
        uint32_t t2=(v_sha_rotr(a,2)^v_sha_rotr(a,13)^v_sha_rotr(a,22))+((a&bb)^(a&cc)^(bb&cc));
        hh=g;g=f;f=e;e=d+t1;d=cc;cc=bb;bb=a;a=t1+t2;
    }
    h[0]+=a;h[1]+=bb;h[2]+=cc;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
}
static v_string v_sha256(v_string value, const char *f, int l, int c) {
    uint32_t h[8]={0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
    unsigned char tail[128]={0};
    size_t offset=0,remaining,blocks,i;
    uint64_t bits;
    char *out;
    static const char hex[]="0123456789abcdef";
    if (value.length > UINT64_MAX/8) v_panic(f,l,c,"SHA-256 input too large");
    bits=(uint64_t)value.length*8;
    while (value.length-offset>=64) { v_sha_block(h,(const unsigned char *)value.data+offset); offset+=64; }
    remaining=value.length-offset;
    if (remaining) memcpy(tail,value.data+offset,remaining);
    tail[remaining]=0x80; blocks=remaining<56?64:128;
    for (i=0;i<8;i++) tail[blocks-1-i]=(unsigned char)(bits>>(i*8));
    v_sha_block(h,tail); if (blocks==128) v_sha_block(h,tail+64);
    out=(char *)v_allocate(65,f,l,c);
    for (i=0;i<32;i++) { unsigned byte=(h[i/4]>>(24-(i%4)*8))&255;out[i*2]=hex[byte>>4];out[i*2+1]=hex[byte&15]; }
    out[64]=0; return v_text(out,64);
}
static char *v_c_string(v_string value, const char *f, int l, int c) {
    char *data;
    if (memchr(value.data, 0, value.length)) v_panic(f, l, c, "NUL byte in OS argument");
    data = (char *)v_allocate(v_size_add(value.length, 1, f, l, c), f, l, c);
    memcpy(data, value.data, value.length); data[value.length] = 0; return data;
}

static int64_t v_str_len(v_string value, const char *f, int l, int c) {
    (void)f; (void)l; (void)c; return (int64_t)value.length;
}
static int64_t v_str_byte(v_string value, int64_t index, const char *f, int l, int c) {
    if (index < 0 || (uint64_t)index >= value.length) v_panic(f, l, c, "string index out of bounds");
    return (unsigned char)value.data[index];
}
static v_string v_str_slice(v_string value, int64_t start, int64_t end, const char *f, int l, int c) {
    if (start < 0 || end < start || (uint64_t)end > value.length) v_panic(f, l, c, "string slice out of bounds");
    return v_text(value.data + start, (size_t)(end - start));
}
static v_string v_str_concat(v_string a, v_string b, const char *f, int l, int c) {
    size_t size = v_size_add(a.length, b.length, f, l, c);
    char *data = (char *)v_allocate(size, f, l, c);
    memcpy(data, a.data, a.length); memcpy(data + a.length, b.data, b.length);
    return v_text(data, size);
}
static v_string v_str_from_byte(int64_t byte, const char *f, int l, int c) {
    char *data;
    if (byte < 0 || byte > 255) v_panic(f, l, c, "byte must be between 0 and 255");
    data = (char *)v_allocate(1, f, l, c); data[0] = (char)byte; return v_text(data, 1);
}
static v_string v_int_to_string(int64_t value, const char *f, int l, int c) {
    char *data = (char *)v_allocate(32, f, l, c);
    int length = snprintf(data, 32, "%" PRId64, value);
    if (length < 0 || length >= 32) v_panic(f, l, c, "integer formatting failed");
    return v_text(data, (size_t)length);
}

#define V_LIST(PREFIX, LIST, ITEM) \
static LIST *v_##PREFIX##_new(const char *f, int l, int c) { \
    LIST *list = (LIST *)v_allocate(sizeof(LIST), f, l, c); \
    list->length = 0; list->capacity = 0; list->data = NULL; return list; \
} \
static int64_t v_##PREFIX##_len(LIST *list, const char *f, int l, int c) { \
    (void)f; (void)l; (void)c; return list->length; \
} \
static ITEM v_##PREFIX##_get(LIST *list, int64_t index, const char *f, int l, int c) { \
    if (index < 0 || index >= list->length) v_panic(f, l, c, "list index out of bounds"); \
    return list->data[index]; \
} \
static uint8_t v_##PREFIX##_set(LIST *list, int64_t index, ITEM value, const char *f, int l, int c) { \
    if (index < 0 || index >= list->length) v_panic(f, l, c, "list index out of bounds"); \
    list->data[index] = value; return 0; \
} \
static uint8_t v_##PREFIX##_push(LIST *list, ITEM value, const char *f, int l, int c) { \
    if (list->length == list->capacity) { \
        int64_t capacity; ITEM *data; \
        if (list->capacity > INT64_MAX / 2) v_panic(f, l, c, "list capacity overflow"); \
        capacity = list->capacity ? list->capacity * 2 : 16; \
        if ((uint64_t)capacity > SIZE_MAX / sizeof(ITEM)) v_panic(f, l, c, "list size overflow"); \
        data = (ITEM *)v_allocate((size_t)capacity * sizeof(ITEM), f, l, c); \
        if (list->length) memcpy(data, list->data, (size_t)list->length * sizeof(ITEM)); \
        list->data = data; list->capacity = capacity; \
    } \
    list->data[list->length++] = value; return 0; \
} \
static uint8_t v_##PREFIX##_truncate(LIST *list, int64_t length, const char *f, int l, int c) { \
    if (length < 0 || length > list->length) v_panic(f, l, c, "invalid truncation length"); \
    list->length = length; return 0; \
}
V_LIST(ints, v_int_list, int64_t)
V_LIST(strings, v_string_list, v_string)
#undef V_LIST

static v_string v_strings_join(v_string_list *list, v_string separator, const char *f, int l, int c) {
    size_t size = 0, position = 0; int64_t i; char *data;
    for (i = 0; i < list->length; ++i) {
        size = v_size_add(size, list->data[i].length, f, l, c);
        if (i) size = v_size_add(size, separator.length, f, l, c);
    }
    data = (char *)v_allocate(size, f, l, c);
    for (i = 0; i < list->length; ++i) {
        if (i) { memcpy(data + position, separator.data, separator.length); position += separator.length; }
        memcpy(data + position, list->data[i].data, list->data[i].length); position += list->data[i].length;
    }
    return v_text(data, size);
}

#ifdef _WIN32
static wchar_t *v_wide(v_string value, const char *f, int l, int c) {
    int length; wchar_t *data;
    if (value.length > INT_MAX || memchr(value.data, 0, value.length)) v_panic(f, l, c, "invalid OS string");
    length = value.length ? MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data, (int)value.length, NULL, 0) : 0;
    if (!length && value.length) v_panic(f, l, c, "OS string is not UTF-8");
    data = (wchar_t *)v_allocate(((size_t)length + 1) * sizeof(wchar_t), f, l, c);
    if (length) MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data, (int)value.length, data, length);
    data[length] = 0; return data;
}
static v_string v_utf8(const wchar_t *value, const char *f, int l, int c) {
    int length = WideCharToMultiByte(CP_UTF8, 0, value, -1, NULL, 0, NULL, NULL);
    char *data;
    if (!length) v_panic(f, l, c, "UTF-8 conversion failed");
    data = (char *)v_allocate((size_t)length, f, l, c);
    WideCharToMultiByte(CP_UTF8, 0, value, -1, data, length, NULL, NULL);
    return v_text(data, (size_t)length - 1);
}
#endif

static v_io_result v_io(int ok, v_string value) { v_io_result result; result.ok = ok; result.value = value; return result; }
static v_io_result v_io_error(const char *message) { return v_io(0, v_text(message, strlen(message))); }
static v_io_result v_file_identity(v_string path, const char *f, int l, int c) {
    char identity[128]; int length;
    if (memchr(path.data, 0, path.length)) return v_io_error("NUL byte in file path");
#ifdef _WIN32
    BY_HANDLE_FILE_INFORMATION info;
    HANDLE handle = CreateFileW(v_wide(path, f, l, c), 0,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
        OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, NULL);
    if (handle == INVALID_HANDLE_VALUE) {
        DWORD error = GetLastError();
        if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND)
            return v_io(1, v_text("", 0));
        return v_io_error("cannot query file identity");
    }
    if (!GetFileInformationByHandle(handle, &info)) {
        CloseHandle(handle); return v_io_error("cannot query file identity");
    }
    CloseHandle(handle);
    length = snprintf(identity, sizeof(identity), "%lu:%lu:%lu",
        (unsigned long)info.dwVolumeSerialNumber,
        (unsigned long)info.nFileIndexHigh, (unsigned long)info.nFileIndexLow);
#else
    struct stat info;
    if (stat(v_c_string(path, f, l, c), &info)) {
        if (errno == ENOENT || errno == ENOTDIR) return v_io(1, v_text("", 0));
        return v_io_error("cannot query file identity");
    }
    length = snprintf(identity, sizeof(identity), "%" PRIuMAX ":%" PRIuMAX,
        (uintmax_t)info.st_dev, (uintmax_t)info.st_ino);
#endif
    if (length < 0 || (size_t)length >= sizeof(identity)) return v_io_error("invalid file identity");
    return v_io(1, v_str_concat(v_text(identity, (size_t)length), v_text("", 0), f, l, c));
}
static v_io_result v_arg(int64_t index, const char *f, int l, int c) {
    if (index < 0 || index >= (int64_t)v_argc - 1) return v_io_error("missing argument");
#ifdef _WIN32
    if (v_wargv) return v_io(1, v_utf8(v_wargv[(size_t)index + 1], f, l, c));
#endif
    return v_io(1, v_text(v_argv[(size_t)index + 1], strlen(v_argv[(size_t)index + 1])));
}
static FILE *v_open(v_string path, int writing, const char *f, int l, int c) {
    if (memchr(path.data, 0, path.length)) return NULL;
#ifdef _WIN32
    return _wfopen(v_wide(path, f, l, c), writing ? L"wb" : L"rb");
#else
    return fopen(v_c_string(path, f, l, c), writing ? "wb" : "rb");
#endif
}
static v_io_result v_read_file(v_string path, const char *f, int l, int c) {
    FILE *file = v_open(path, 0, f, l, c);
    v_string_list *chunks; char buffer[8192]; size_t count; v_string result;
    if (!file) return v_io_error("cannot open file for reading");
    chunks = v_strings_new(f, l, c);
    while ((count = fread(buffer, 1, sizeof(buffer), file)) != 0) {
        char *data = (char *)v_allocate(count, f, l, c); memcpy(data, buffer, count);
        v_strings_push(chunks, v_text(data, count), f, l, c);
    }
    if (ferror(file)) { fclose(file); return v_io_error("cannot read file"); }
    if (fclose(file)) return v_io_error("cannot close input file");
    result = v_strings_join(chunks, v_text("", 0), f, l, c); return v_io(1, result);
}
static v_io_result v_write_file(v_string path, v_string value, const char *f, int l, int c) {
    FILE *file = v_open(path, 1, f, l, c); int ok;
    if (!file) return v_io_error("cannot open file for writing");
    ok = fwrite(value.data, 1, value.length, file) == value.length;
    if (fclose(file)) ok = 0;
    return ok ? v_io(1, v_text("", 0)) : v_io_error("cannot write file");
}
static v_io_result v_remove_file(v_string path, const char *f, int l, int c) {
    int result;
    if (memchr(path.data, 0, path.length)) return v_io_error("NUL byte in file path");
#ifdef _WIN32
    result = _wremove(v_wide(path, f, l, c));
#else
    result = remove(v_c_string(path, f, l, c));
#endif
    return !result ? v_io(1, v_text("", 0)) : v_io_error("cannot remove file");
}
static v_io_result v_replace_file(v_string from, v_string to, const char *f, int l, int c) {
    int ok;
    if (memchr(from.data, 0, from.length) || memchr(to.data, 0, to.length)) return v_io_error("NUL byte in file path");
#ifdef _WIN32
    ok = MoveFileExW(v_wide(from, f, l, c), v_wide(to, f, l, c), MOVEFILE_REPLACE_EXISTING) != 0;
#else
    ok = rename(v_c_string(from, f, l, c), v_c_string(to, f, l, c)) == 0;
#endif
    return ok ? v_io(1, v_text("", 0)) : v_io_error("cannot replace file");
}
static uint8_t v_eprint(v_string value, const char *f, int l, int c) {
    if (fwrite(value.data, 1, value.length, stderr) != value.length || fputc('\n', stderr) == EOF)
        v_panic(f, l, c, "cannot write standard error");
    return 0;
}
static uint8_t v_exit(int64_t code, const char *f, int l, int c) { exit(v_exit_code(code, f, l, c)); return 0; }
static v_string v_platform(const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
#ifdef _WIN32
    return v_text("windows", 7);
#else
    return v_text("posix", 5);
#endif
}
static v_string v_env(v_string name, const char *f, int l, int c) {
#ifdef _WIN32
    wchar_t *key = v_wide(name, f, l, c); DWORD count = GetEnvironmentVariableW(key, NULL, 0); wchar_t *data;
    if (!count) return v_text("", 0);
    data = (wchar_t *)v_allocate((size_t)count * sizeof(wchar_t), f, l, c);
    if (!GetEnvironmentVariableW(key, data, count)) return v_text("", 0);
    return v_utf8(data, f, l, c);
#else
    const char *value = getenv(v_c_string(name, f, l, c));
    return value ? v_str_concat(v_text(value, strlen(value)), v_text("", 0), f, l, c) : v_text("", 0);
#endif
}
static int64_t v_process_execute_extended(v_string_list *arguments, int redirect, const v_string *out_path, const v_string *err_path, int64_t timeout, const v_string *cwd, const char *f, int l, int c) {
    if (arguments->length == 0) v_panic(f, l, c, "process argument list is empty");
    if (timeout < 0 || timeout > 2147483647) v_panic(f, l, c, "invalid process timeout");
#ifdef _WIN32
    size_t capacity = 1, pos = 0; int64_t i; char *command; wchar_t *wide;
    STARTUPINFOW startup; PROCESS_INFORMATION process; DWORD code;
    HANDLE out_file = INVALID_HANDLE_VALUE, err_file = INVALID_HANDLE_VALUE, job = NULL;
    for (i = 0; i < arguments->length; ++i) {
        size_t length = arguments->data[i].length;
        if (memchr(arguments->data[i].data, 0, length)) v_panic(f, l, c, "NUL byte in process argument");
        capacity = v_size_add(capacity, v_size_add(v_size_add(length, length, f, l, c), 4, f, l, c), f, l, c);
    }
    command = (char *)v_allocate(capacity, f, l, c);
    for (i = 0; i < arguments->length; ++i) {
        v_string arg = arguments->data[i]; size_t j = 0;
        if (i) command[pos++] = ' '; command[pos++] = '"';
        while (j < arg.length) {
            size_t slashes = 0, k;
            while (j < arg.length && arg.data[j] == '\\') { ++slashes; ++j; }
            if (j == arg.length || arg.data[j] == '"') {
                for (k = 0; k < slashes * 2; ++k) command[pos++] = '\\';
                if (j < arg.length) { command[pos++] = '\\'; command[pos++] = '"'; ++j; }
            } else {
                for (k = 0; k < slashes; ++k) command[pos++] = '\\';
                command[pos++] = arg.data[j++];
            }
        }
        command[pos++] = '"';
    }
    command[pos] = 0; wide = v_wide(v_text(command, pos), f, l, c);
    memset(&startup, 0, sizeof(startup)); startup.cb = sizeof(startup);
    if (redirect) {
        startup.dwFlags = STARTF_USESTDHANDLES;
        startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        startup.hStdOutput = GetStdHandle(STD_ERROR_HANDLE);
        startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    }
    if (out_path) {
        SECURITY_ATTRIBUTES sa = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
        out_file = CreateFileW(v_wide(*out_path, f, l, c), GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        err_file = CreateFileW(v_wide(*err_path, f, l, c), GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (out_file == INVALID_HANDLE_VALUE || err_file == INVALID_HANDLE_VALUE) {
            if (out_file != INVALID_HANDLE_VALUE) CloseHandle(out_file);
            if (err_file != INVALID_HANDLE_VALUE) CloseHandle(err_file); return -1;
        }
        startup.dwFlags = STARTF_USESTDHANDLES; startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        startup.hStdOutput = out_file; startup.hStdError = err_file;
        job = CreateJobObjectW(NULL, NULL); memset(&limits, 0, sizeof(limits));
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
            CloseHandle(out_file); CloseHandle(err_file); if (job) CloseHandle(job); return -1;
        }
    }
    memset(&process, 0, sizeof(process));
    if (!CreateProcessW(NULL, wide, NULL, NULL, TRUE, out_path ? CREATE_SUSPENDED : 0, NULL, cwd ? v_wide(*cwd, f, l, c) : NULL, &startup, &process)) {
        if (out_path) { CloseHandle(out_file); CloseHandle(err_file); CloseHandle(job); } return -1;
    }
    if (out_path) {
        CloseHandle(out_file); CloseHandle(err_file);
        if (!AssignProcessToJobObject(job, process.hProcess)) {
            TerminateProcess(process.hProcess, 255); CloseHandle(job); CloseHandle(process.hThread); CloseHandle(process.hProcess); return -1;
        }
        if (ResumeThread(process.hThread) == (DWORD)-1) {
            TerminateJobObject(job, 255); CloseHandle(job); CloseHandle(process.hThread); CloseHandle(process.hProcess); return -1;
        }
    }
    if (WaitForSingleObject(process.hProcess, timeout ? (DWORD)timeout : INFINITE) == WAIT_TIMEOUT) {
        if (job) TerminateJobObject(job, 124); else TerminateProcess(process.hProcess, 124);
        WaitForSingleObject(process.hProcess, INFINITE);
        if (job) CloseHandle(job);
        CloseHandle(process.hThread); CloseHandle(process.hProcess); return -2;
    } else if (!GetExitCodeProcess(process.hProcess, &code)) code = 255;
    if (job) CloseHandle(job);
    CloseHandle(process.hThread); CloseHandle(process.hProcess); return (int64_t)code;
#else
    char **args; int64_t i; pid_t pid; int status, launch[2], error; ssize_t count;
    if ((uint64_t)arguments->length + 1 > SIZE_MAX / sizeof(char *)) v_panic(f, l, c, "argument list too large");
    args = (char **)v_allocate(((size_t)arguments->length + 1) * sizeof(char *), f, l, c);
    for (i = 0; i < arguments->length; ++i) args[i] = v_c_string(arguments->data[i], f, l, c);
    args[arguments->length] = NULL;
    if (pipe(launch)) return -1;
    if (fcntl(launch[1], F_SETFD, FD_CLOEXEC) < 0) { close(launch[0]); close(launch[1]); return -1; }
    pid = fork(); if (pid < 0) { close(launch[0]); close(launch[1]); return -1; }
    if (!pid) {
        close(launch[0]);
        setpgid(0, 0);
        if (cwd && chdir(v_c_string(*cwd, f, l, c))) goto launch_failed;
        if (out_path) {
            if (!freopen(v_c_string(*out_path, f, l, c), "wb", stdout) || !freopen(v_c_string(*err_path, f, l, c), "wb", stderr)) goto launch_failed;
        } else if (redirect && dup2(STDERR_FILENO, STDOUT_FILENO) < 0) goto launch_failed;
        execvp(args[0], args);
launch_failed:
        error = errno; (void)write(launch[1], &error, sizeof(error)); _exit(127);
    }
    close(launch[1]);
    do { count = read(launch[0], &error, sizeof(error)); } while (count < 0 && errno == EINTR);
    close(launch[0]);
    if (count != 0) { kill(-pid, SIGKILL); kill(pid, SIGKILL); while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {} return -1; }
    if (timeout) {
        struct timespec start, now, pause = {0, 10000000}; clock_gettime(CLOCK_MONOTONIC, &start);
        for (;;) {
            pid_t done = waitpid(pid, &status, WNOHANG); if (done == pid) break;
            if (done < 0 && errno != EINTR) return -1;
            clock_gettime(CLOCK_MONOTONIC, &now);
            if ((now.tv_sec - start.tv_sec) * 1000 + (now.tv_nsec - start.tv_nsec) / 1000000 >= timeout) {
                kill(-pid, SIGKILL); kill(pid, SIGKILL); while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {} return -2;
            } nanosleep(&pause, NULL);
        }
    } else { while (waitpid(pid, &status, 0) < 0) { if (errno != EINTR) return -1; } }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
#endif
}
static int64_t v_process_execute(v_string_list *arguments, int redirect, const v_string *out_path, const v_string *err_path, int64_t timeout, const char *f, int l, int c) {
    int64_t code = v_process_execute_extended(arguments, redirect, out_path, err_path, timeout, NULL, f, l, c);
    return code == -2 ? 124 : code;
}
static int64_t v_process_run(v_string_list *arguments, const char *f, int l, int c) {
    return v_process_execute(arguments, 0, NULL, NULL, 0, f, l, c);
}
static int64_t v_process_run_to_stderr(v_string_list *arguments, const char *f, int l, int c) {
    return v_process_execute(arguments, 1, NULL, NULL, 0, f, l, c);
}
static int64_t v_process_run_files(v_string_list *arguments, v_string out, v_string err, int64_t timeout, const char *f, int l, int c) {
    if (v_string_eq(out, err)) v_panic(f, l, c, "process output files must differ");
    return v_process_execute(arguments, 0, &out, &err, timeout, f, l, c);
}
static void v_runtime_init(void) {
    if (atexit(v_runtime_free)) v_panic("runtime", 0, 0, "cannot register memory teardown");
#ifdef _WIN32
    typedef wchar_t **(WINAPI *v_parse_command_line)(const wchar_t *, int *);
    v_parse_command_line parse;
    v_shell_module = LoadLibraryW(L"shell32.dll");
    if (!v_shell_module) v_panic("runtime", 0, 0, "cannot initialize Unicode arguments");
    parse = (v_parse_command_line)GetProcAddress(v_shell_module, "CommandLineToArgvW");
    if (!parse) v_panic("runtime", 0, 0, "cannot initialize Unicode arguments");
    v_wargv = parse(GetCommandLineW(), &v_argc);
    if (!v_wargv) v_panic("runtime", 0, 0, "cannot read Unicode arguments");
#endif
}

static v_io_result v_absolute_path(v_string path, const char *f, int l, int c) {
#ifdef _WIN32
    wchar_t *input = v_wide(path, f, l, c); DWORD count = GetFullPathNameW(input, 0, NULL, NULL); wchar_t *data;
    if (!count) return v_io_error("cannot resolve path");
    data = (wchar_t *)v_allocate((size_t)count * sizeof(wchar_t), f, l, c);
    if (!GetFullPathNameW(input, count, data, NULL)) return v_io_error("cannot resolve path");
    return v_io(1, v_utf8(data, f, l, c));
#else
    char buffer[4096];
    if (path.length && path.data[0] == '/') return v_io(1, path);
    if (!getcwd(buffer, sizeof(buffer))) return v_io_error("cannot resolve current directory");
    return v_io(1, v_str_concat(v_str_concat(v_text(buffer, strlen(buffer)), v_text("/", 1), f, l, c), path, f, l, c));
#endif
}
static v_io_result v_temp_dir(v_string parent, const char *f, int l, int c) {
#ifdef _WIN32
    wchar_t base[MAX_PATH + 1], name[MAX_PATH + 1]; wchar_t *directory;
    if (!parent.length) {
        DWORD count = GetTempPathW(MAX_PATH, base); if (!count || count >= MAX_PATH) return v_io_error("cannot find temporary directory"); directory = base;
    } else { directory = v_wide(parent, f, l, c); }
    if (!GetTempFileNameW(directory, L"vla", 0, name)) return v_io_error("cannot create temporary name");
    if (!DeleteFileW(name) || !CreateDirectoryW(name, NULL)) return v_io_error("cannot create temporary directory");
    return v_io(1, v_utf8(name, f, l, c));
#else
    v_string base = parent.length ? parent : v_text("/tmp", 4);
    char *name = v_c_string(v_str_concat(base, v_text("/vela-XXXXXX", 12), f, l, c), f, l, c);
    extern char *mkdtemp(char *);
    if (!mkdtemp(name)) return v_io_error("cannot create temporary directory");
    return v_io(1, v_text(name, strlen(name)));
#endif
}
static v_io_result v_remove_dir(v_string path, const char *f, int l, int c) {
#ifdef _WIN32
    int ok = RemoveDirectoryW(v_wide(path, f, l, c)) != 0;
#else
    int ok = rmdir(v_c_string(path, f, l, c)) == 0;
#endif
    return ok ? v_io(1, v_text("", 0)) : v_io_error("cannot remove empty directory");
}
/* Generic storage: checked IR supplies element sizes; no compiler logic lives here. */
typedef struct { size_t size; int64_t length, capacity; unsigned char *data; } v_list;
static size_t v_size_mul(size_t a, size_t b, const char *f, int l, int c) {
    if (b && a > SIZE_MAX / b) v_panic(f, l, c, "allocation size overflow");
    return a * b;
}
/* Shallow storage snapshot. Element layout is supplied by checked code. */
static void *v_copy_items(const void *data, int64_t length, size_t size, const char *f, int l, int c) {
    size_t bytes = v_size_mul((size_t)length, size, f, l, c);
    void *copy = v_allocate(bytes, f, l, c);
    if (bytes) memcpy(copy, data, bytes);
    return copy;
}
static v_list *v_list_new(size_t size, const char *f, int l, int c) {
    v_list *v = (v_list *)v_allocate(sizeof(v_list), f, l, c);
    memset(v, 0, sizeof(*v)); v->size = size; return v;
}
static int64_t v_list_len(v_list *v, const char *f, int l, int c) { (void)f; (void)l; (void)c; return v->length; }
static void *v_list_get(v_list *v, int64_t index, const char *f, int l, int c) {
    if (index < 0 || index >= v->length) v_panic(f, l, c, "list index out of bounds");
    return v->data + (size_t)index * v->size;
}
static uint8_t v_list_set(v_list *v, int64_t index, const void *value, const char *f, int l, int c) {
    memcpy(v_list_get(v, index, f, l, c), value, v->size); return 0;
}
static uint8_t v_list_push(v_list *v, const void *value, const char *f, int l, int c) {
    if (v->length == v->capacity) {
        int64_t cap = v->capacity ? v_mul(v->capacity, 2, f, l, c) : 8;
        unsigned char *data = (unsigned char *)v_allocate(v_size_mul((size_t)cap, v->size, f, l, c), f, l, c);
        if (v->length) memcpy(data, v->data, (size_t)v->length * v->size);
        v->data = data; v->capacity = cap;
    }
    memcpy(v->data + (size_t)v->length * v->size, value, v->size); ++v->length; return 0;
}
static uint8_t v_list_truncate(v_list *v, int64_t length, const char *f, int l, int c) {
    if (length < 0 || length > v->length) v_panic(f, l, c, "invalid list truncation");
    v->length = length; return 0;
}
typedef struct { uint64_t hash; unsigned char state; void *key, *value; } v_entry;
typedef struct { size_t key_size, value_size, capacity, used, count; int key_kind; v_entry *entries; } v_dict;
static uint64_t v_key_hash(v_dict *d, const void *key) {
    const unsigned char *bytes = (const unsigned char *)key; size_t count = d->key_size, i;
    uint64_t hash = UINT64_C(14695981039346656037);
    if (d->key_kind == 3) { v_string s = *(const v_string *)key; bytes = (const unsigned char *)s.data; count = s.length; }
    for (i = 0; i < count; ++i) { hash ^= bytes[i]; hash *= UINT64_C(1099511628211); } return hash;
}
static int v_key_equal(v_dict *d, const void *a, const void *b) {
    if (d->key_kind == 3) return v_string_eq(*(const v_string *)a, *(const v_string *)b);
    if (d->key_kind == 1) return *(const int64_t *)a == *(const int64_t *)b;
    return *(const int *)a == *(const int *)b;
}
static v_entry *v_dict_slot(v_dict *d, const void *key, uint64_t hash) {
    size_t index = (size_t)hash & (d->capacity - 1); v_entry *removed = NULL;
    for (;;) {
        v_entry *e = &d->entries[index];
        if (!e->state) return removed ? removed : e;
        if (e->state == 2) { if (!removed) removed = e; }
        else if (e->hash == hash && v_key_equal(d, e->key, key)) return e;
        index = (index + 1) & (d->capacity - 1);
    }
}
static void v_dict_grow(v_dict *d, const char *f, int l, int c) {
    size_t old_capacity = d->capacity, i; v_entry *old = d->entries;
    d->capacity = old_capacity ? v_size_mul(old_capacity, 2, f, l, c) : 16;
    d->entries = (v_entry *)v_allocate(v_size_mul(d->capacity, sizeof(v_entry), f, l, c), f, l, c);
    memset(d->entries, 0, d->capacity * sizeof(v_entry)); d->used = d->count;
    for (i = 0; i < old_capacity; ++i) if (old[i].state == 1) *v_dict_slot(d, old[i].key, old[i].hash) = old[i];
}
static v_dict *v_dict_new(size_t key_size, size_t value_size, int key_kind, const char *f, int l, int c) {
    v_dict *d = (v_dict *)v_allocate(sizeof(v_dict), f, l, c); memset(d, 0, sizeof(*d));
    d->key_size = key_size; d->value_size = value_size; d->key_kind = key_kind; v_dict_grow(d, f, l, c); return d;
}
static int64_t v_dict_len(v_dict *d, const char *f, int l, int c) {
    if (d->count > INT64_MAX) v_panic(f, l, c, "dictionary length overflow"); return (int64_t)d->count;
}
static int v_dict_has(v_dict *d, const void *key, const char *f, int l, int c) {
    (void)f; (void)l; (void)c; return v_dict_slot(d, key, v_key_hash(d, key))->state == 1;
}
static void *v_dict_get(v_dict *d, const void *key, const char *f, int l, int c) {
    v_entry *e = v_dict_slot(d, key, v_key_hash(d, key));
    if (e->state != 1) v_panic(f, l, c, "dictionary key not found"); return e->value;
}
static const void *v_dict_get_or(v_dict *d, const void *key, const void *fallback, const char *f, int l, int c) {
    v_entry *e = v_dict_slot(d, key, v_key_hash(d, key)); (void)f; (void)l; (void)c;
    return e->state == 1 ? e->value : fallback;
}
static uint8_t v_dict_set(v_dict *d, const void *key, const void *value, const char *f, int l, int c) {
    uint64_t hash = v_key_hash(d, key); v_entry *e;
    if (d->used >= d->capacity - d->capacity / 3) v_dict_grow(d, f, l, c);
    e = v_dict_slot(d, key, hash);
    if (e->state != 1) {
        if (!e->state) ++d->used;
        e->key = v_allocate(d->key_size, f, l, c); memcpy(e->key, key, d->key_size);
        e->value = v_allocate(d->value_size, f, l, c); e->hash = hash; e->state = 1; ++d->count;
    } memcpy(e->value, value, d->value_size); return 0;
}
static int v_dict_remove(v_dict *d, const void *key, const char *f, int l, int c) {
    v_entry *e = v_dict_slot(d, key, v_key_hash(d, key)); (void)f; (void)l; (void)c;
    if (e->state != 1) return 0; e->state = 2; --d->count; return 1;
}
static v_io_result v_make_dir(v_string path, const char *f, int l, int c) {
#ifdef _WIN32
    wchar_t *p = v_wide(path, f, l, c);
    if (CreateDirectoryW(p, NULL)) return v_io(1, v_text("", 0));
    if (GetLastError() == ERROR_ALREADY_EXISTS && (GetFileAttributesW(p) & FILE_ATTRIBUTE_DIRECTORY)) return v_io(1, v_text("", 0));
#else
    char *p = v_c_string(path, f, l, c); struct stat st;
    if (mkdir(p, 0777) == 0 || (errno == EEXIST && stat(p, &st) == 0 && S_ISDIR(st.st_mode))) return v_io(1, v_text("", 0));
#endif
    return v_io_error("cannot create directory");
}
static uint8_t v_set_env(v_string name, v_string value, const char *f, int l, int c) {
    if (!name.length || memchr(name.data, '=', name.length)) v_panic(f, l, c, "invalid environment variable name");
#ifdef _WIN32
    if (!SetEnvironmentVariableW(v_wide(name, f, l, c), v_wide(value, f, l, c))) v_panic(f, l, c, "cannot set environment variable");
#else
    if (setenv(v_c_string(name, f, l, c), v_c_string(value, f, l, c), 1)) v_panic(f, l, c, "cannot set environment variable");
#endif
    return 0;
}
static v_io_result v_set_current_dir(v_string path, const char *f, int l, int c) {
#ifdef _WIN32
    int ok = SetCurrentDirectoryW(v_wide(path, f, l, c)) != 0;
#else
    int ok = chdir(v_c_string(path, f, l, c)) == 0;
#endif
    return ok ? v_io(1, v_text("", 0)) : v_io_error("cannot change current directory");
}

/* Binary64 numeric primitives. No locale-global mutation or language parsing. */
_Static_assert(sizeof(double) == 8 && FLT_RADIX == 2 && DBL_MANT_DIG == 53 && DBL_MAX_EXP == 1024, "Float64 requires IEEE binary64");
typedef struct { int ok; double value; v_string error; } v_float_parse;
static v_float_parse v_float_error(const char *message) {
    v_float_parse r = {0}; r.error = v_text(message, strlen(message)); return r;
}
static v_float_parse v_parse_float(v_string input, const char *f, int l, int c) {
    v_float_parse r = {0}; size_t i = 0, begin; char *text, *end; double value;
    if (!input.length || input.length > 4096) return v_float_error("expected a decimal Float64 (at most 4096 bytes)");
    if (v_string_eq(input, v_text("nan", 3))) { r.ok = 1; r.value = NAN; return r; }
    if (v_string_eq(input, v_text("inf", 3)) || v_string_eq(input, v_text("+inf", 4))) { r.ok = 1; r.value = INFINITY; return r; }
    if (v_string_eq(input, v_text("-inf", 4))) { r.ok = 1; r.value = -INFINITY; return r; }
    if (input.data[i] == '+' || input.data[i] == '-') ++i;
    begin = i;
    while (i < input.length && input.data[i] >= '0' && input.data[i] <= '9') ++i;
    if (i == begin) return v_float_error("expected decimal digits");
    if (i < input.length && input.data[i] == '.') {
        begin = ++i;
        while (i < input.length && input.data[i] >= '0' && input.data[i] <= '9') ++i;
        if (i == begin) return v_float_error("expected fraction digits");
    }
    if (i < input.length && (input.data[i] == 'e' || input.data[i] == 'E')) {
        ++i;
        if (i < input.length && (input.data[i] == '+' || input.data[i] == '-')) ++i;
        begin = i;
        while (i < input.length && input.data[i] >= '0' && input.data[i] <= '9') ++i;
        if (i == begin) return v_float_error("expected exponent digits");
    }
    if (i != input.length) return v_float_error("invalid character in Float64");
    text = (char *)malloc(input.length + 1);
    if (!text) v_panic(f, l, c, "out of memory");
    memcpy(text, input.data, input.length); text[input.length] = 0;
#ifdef _WIN32
    {
        _locale_t locale = _create_locale(LC_NUMERIC, "C");
        if (!locale) { free(text); v_panic(f, l, c, "cannot create numeric locale"); }
        value = _strtod_l(text, &end, locale); _free_locale(locale);
    }
#else
    {
        locale_t locale = newlocale(LC_NUMERIC_MASK, "C", (locale_t)0);
        if (!locale) { free(text); v_panic(f, l, c, "cannot create numeric locale"); }
        value = strtod_l(text, &end, locale); freelocale(locale);
    }
#endif
    i = (size_t)(end - text); free(text);
    if (i != input.length || !isfinite(value)) return v_float_error("Float64 out of range");
    r.ok = 1; r.value = value; return r;
}
static int v_float_text_valid(v_string input, const char *f, int l, int c) {
    v_float_parse p = v_parse_float(input, f, l, c); return p.ok && isfinite(p.value);
}
static double v_float_literal(v_string input, const char *f, int l, int c) {
    v_float_parse p = v_parse_float(input, f, l, c);
    if (!p.ok || !isfinite(p.value)) v_panic(f, l, c, "Float64 literal out of range");
    return p.value;
}
static double v_float_from_int(int64_t n) { return (double)n; }
static v_parse_result v_float_to_int(double n) {
    v_parse_result r;
    if (!isfinite(n) || n < -9223372036854775808.0 || n >= 9223372036854775808.0)
        return v_parse_error("Float64 is outside Int range");
    r.ok = 1; r.value = (int64_t)n; r.error = v_text("", 0); return r;
}
static double v_float_floor(double n) { return floor(n); }
static double v_float_ceil(double n) { return ceil(n); }
static double v_float_round(double n) { return round(n); }
static int v_float_is_finite(double n) { return isfinite(n) != 0; }
static int v_float_is_nan(double n) { return isnan(n) != 0; }
static v_string v_float_to_string(double n, const char *f, int l, int c) {
    char buffer[64]; int length; char *copy;
    if (isnan(n)) return v_text("nan", 3);
    if (isinf(n)) return n < 0 ? v_text("-inf", 4) : v_text("inf", 3);
#ifdef _WIN32
    {
        _locale_t locale = _create_locale(LC_NUMERIC, "C");
        if (!locale) v_panic(f, l, c, "cannot create numeric locale");
        length = _snprintf_l(buffer, sizeof(buffer), "%.17g", locale, n); _free_locale(locale);
    }
#else
    {
        locale_t locale = newlocale(LC_NUMERIC_MASK, "C", (locale_t)0), previous;
        if (!locale) v_panic(f, l, c, "cannot create numeric locale");
        previous = uselocale(locale); length = snprintf(buffer, sizeof(buffer), "%.17g", n);
        uselocale(previous); freelocale(locale);
    }
#endif
    if (length < 0 || (size_t)length >= sizeof(buffer)) v_panic(f, l, c, "Float64 formatting failed");
    copy = (char *)v_allocate((size_t)length + 1, f, l, c);
    memcpy(copy, buffer, (size_t)length + 1); return v_text(copy, (size_t)length);
}
static uint8_t v_print_Float64(double n, const char *f, int l, int c) {
    return v_print_String(v_float_to_string(n, f, l, c), f, l, c);
}
static uint8_t v_assert_true(int condition, v_string message, const char *f, int l, int c) {
    if (!condition) {
        fprintf(stderr, "%s:%d:%d: assertion failed: ", f, l, c);
        if (message.length) fwrite(message.data, 1, message.length, stderr);
        fputc('\n', stderr); exit(70);
    }
    return 0;
}

typedef struct { int kind; v_string value; } v_bounded_read;
static v_bounded_read v_read_file_bounded(v_string path, int64_t limit, const char *f, int l, int c) {
    v_bounded_read r = {2, {"cannot read file", 16}};
    FILE *file; char buffer[8192], *data; size_t count, used = 0, capacity = 0;
    if (limit < 0 || limit > 268435456) { r.kind = 1; return r; }
    file = v_open(path, 0, f, l, c); if (!file) return r;
    data = NULL;
    for (;;) {
        size_t remaining = (size_t)limit - used, request = remaining < sizeof(buffer) ? remaining + 1 : sizeof(buffer);
        count = fread(buffer, 1, request, file);
        if (!count) break;
        if (count > remaining) { fclose(file); free(data); r.kind = 1; return r; }
        if (used + count > capacity) {
            size_t next = capacity ? capacity * 2 : sizeof(buffer); char *grown;
            if (next > (size_t)limit) next = (size_t)limit;
            grown = (char *)realloc(data, next);
            if (!grown) { fclose(file); free(data); v_panic(f, l, c, "out of memory"); }
            data = grown; capacity = next;
        }
        memcpy(data + used, buffer, count); used += count;
    }
    if (ferror(file)) { fclose(file); free(data); return r; }
    if (fclose(file)) { free(data); return r; }
    {
        char *owned = (char *)v_allocate(used, f, l, c);
        if (used) memcpy(owned, data, used); free(data);
        r.kind = 0; r.value = v_text(owned, used); return r;
    }
}
typedef struct { int kind; int64_t code; v_string message; } v_process_result;
static v_process_result v_process_run_at(v_string_list *args, v_string cwd, v_string out, v_string err, int64_t timeout, const char *f, int l, int c) {
    v_process_result r = {0};
    if (v_string_eq(out, err)) { r.kind = 2; r.message = v_text("output files must differ", 24); return r; }
    r.code = v_process_execute_extended(args, 0, &out, &err, timeout, &cwd, f, l, c);
    if (r.code == -2) r.kind = 1;
    else if (r.code < 0) { r.kind = 2; r.message = v_text("cannot launch or supervise process", 34); }
    return r;
}

/* ABI 1. The compiler validates C signatures; these are storage/loader primitives. */
typedef struct { const char *data; uint64_t length; } VelaBytes;
typedef void (*v_foreign_proc)(void);
typedef struct v_foreign_library {
    void *module;
    char name[129];
    struct v_foreign_library *next;
} v_foreign_library;
typedef struct { void *pointer; v_foreign_library *owner; int closed; } v_foreign_handle;
static v_foreign_library *v_foreign_libraries;
static int v_foreign_name(v_string name, int library) {
    size_t i, n = name.length;
    if (!n || n > 128) return 0;
    if (library) {
        if (n < 5 || memcmp(name.data + n - 4, ".dll", 4)) return 0;
        n -= 4;
    }
    for (i = 0; i < n; ++i) {
        unsigned char b = (unsigned char)name.data[i];
        if (!((b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || b == '_' ||
              ((library || i) && b >= '0' && b <= '9') || (library && b == '-'))) return 0;
    }
    return 1;
}
static void v_foreign_shutdown(void) {
#if defined(_WIN32) && defined(_M_X64)
    v_foreign_library *p;
    /* Unload before region metadata. Resource destructors are never inferred. */
    for (p = v_foreign_libraries; p; p = p->next) FreeLibrary((HMODULE)p->module);
#endif
}
static v_foreign_library *v_foreign_open(v_string name, const char **error, const char *f, int l, int c) {
    v_foreign_library *p;
    *error = "foreign loading requires Windows x64/MSVC";
    if (!v_foreign_name(name, 1)) { *error = "invalid foreign DLL basename"; return NULL; }
    for (p = v_foreign_libraries; p; p = p->next)
        if (strlen(p->name) == name.length && !memcmp(p->name, name.data, name.length)) return p;
#if defined(_WIN32) && defined(_M_X64)
    {
        wchar_t path[32768]; DWORD count; size_t end, i; HMODULE module;
        int32_t (*abi)(void); int32_t version = 0; fenv_t environment;
        count = GetModuleFileNameW(NULL, path, 32768);
        if (!count || count >= 32768) { *error = "cannot resolve executable directory"; return NULL; }
        end = count;
        while (end && path[end - 1] != L'\\' && path[end - 1] != L'/') --end;
        if (!end || end + name.length >= 32768) { *error = "foreign library path too long"; return NULL; }
        for (i = 0; i < name.length; ++i) path[end + i] = (unsigned char)name.data[i];
        path[end + name.length] = 0;
        if (fegetenv(&environment)) { *error = "cannot save floating-point environment"; return NULL; }
        module = LoadLibraryExW(path, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (module) {
            abi = (int32_t (*)(void))GetProcAddress(module, "vela_ffi_abi_version");
            if (abi) version = abi();
            if (version != 1) { FreeLibrary(module); module = NULL; *error = "foreign library ABI version mismatch"; }
        } else *error = "cannot load foreign library from executable directory";
        if (fesetenv(&environment)) v_panic(f,l,c,"cannot restore floating-point environment");
        if (!module) return NULL;
        for (p = v_foreign_libraries; p; p = p->next) {
            if (p->module == (void*)module) { FreeLibrary(module); return p; }
        }
        p = (v_foreign_library*)v_allocate(sizeof(*p),f,l,c);
        p->module = module; memcpy(p->name, name.data, name.length); p->name[name.length] = 0;
        p->next = v_foreign_libraries; v_foreign_libraries = p;
        return p;
    }
#else
    return NULL;
#endif
}
static v_io_result v_ffi_load(v_string name, const char *f, int l, int c) {
    const char *error;
    return v_foreign_open(name,&error,f,l,c) ? v_io(1,v_text("",0)) : v_io_error(error);
}
static v_foreign_library *v_foreign_require(const char *name, const char *f, int l, int c) {
    const char *error; v_foreign_library *p = v_foreign_open(v_text(name,strlen(name)),&error,f,l,c);
    if (!p) v_panic(f,l,c,error);
    return p;
}
static v_foreign_proc v_foreign_find(v_foreign_library *library, const char *name) {
#if defined(_WIN32) && defined(_M_X64)
    return (v_foreign_proc)GetProcAddress((HMODULE)library->module,name);
#else
    (void)library; (void)name; return NULL;
#endif
}
static v_foreign_proc v_foreign_symbol(v_foreign_library *library, const char *name, const char *f, int l, int c) {
    v_foreign_proc p = v_foreign_find(library,name);
    if (!p) v_panic(f,l,c,"missing foreign symbol");
    return p;
}
static v_foreign_handle *v_foreign_wrap(void *pointer, v_foreign_library *library, const char *f, int l, int c) {
    v_foreign_handle *h = (v_foreign_handle*)v_allocate(sizeof(*h),f,l,c);
    h->pointer = pointer; h->owner = library; h->closed = 0; return h;
}
static void *v_foreign_unwrap(v_foreign_handle *h, v_foreign_library *library, const char *f, int l, int c) {
    if (!h) v_panic(f,l,c,"invalid foreign handle");
    if (h->pointer && h->closed) v_panic(f,l,c,"foreign handle is closed");
    if (h->pointer && h->owner != library) v_panic(f,l,c,"foreign handle belongs to another library");
    return h->pointer;
}
static int v_ffi_is_null(v_foreign_handle *h) { return !h || !h->pointer; }
static v_io_result v_ffi_close(v_foreign_handle *h, v_string name, const char *f, int l, int c) {
    v_foreign_proc destructor; fenv_t environment;
    if (!h || !h->pointer) return v_io(1,v_text("",0));
    if (h->closed) return v_io_error("foreign handle already closed");
    if (!v_foreign_name(name,0)) return v_io_error("invalid foreign destructor name");
    destructor = v_foreign_find(h->owner,v_c_string(name,f,l,c));
    if (!destructor) return v_io_error("missing foreign destructor");
    if (fegetenv(&environment)) return v_io_error("cannot save floating-point environment");
    ((void (*)(void*))destructor)(h->pointer);
    h->closed = 1;
    if (fesetenv(&environment)) v_panic(f,l,c,"cannot restore floating-point environment");
    return v_io(1,v_text("",0));
}
static v_parse_result v_int32_from_int(int64_t value, const char *f, int l, int c) {
    v_parse_result r; (void)f; (void)l; (void)c;
    if (value < INT32_MIN || value > INT32_MAX) return v_parse_error("Int32 value out of range");
    r.ok = 1; r.value = value; r.error = v_text("",0); return r;
}
static int64_t v_int32_to_int(int32_t value) { return (int64_t)value; }
