/* Vela runtime. Embedded into each generated standalone C11 translation unit. */
#define VELA_RUNTIME_ABI 2
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
#include <sys/stat.h>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

typedef struct { const char *data; size_t length; const void *owner; } v_string;
typedef struct { int ok; int64_t value; v_string error; } v_parse_result;
static int v_argc;
static char **v_argv;

static v_string v_text(const char *data, size_t length) {
    v_string value = {data, length, NULL}; return value;
}
static v_string v_owned_text(const char *data, size_t length) {
    v_string value = {data, length, data}; return value;
}

#ifdef VELA_DEBUG_INSTRUMENTED
typedef struct v_debug_record {
    const char *name, *file;
    int line, column;
    uint64_t calls, completed, elapsed_us;
    struct v_debug_record *next;
} v_debug_record;
typedef struct v_debug_frame {
    struct v_debug_frame *previous;
    v_debug_record *record;
    uint64_t started;
} v_debug_frame;
static v_debug_frame *v_debug_top;
static v_debug_record *v_debug_records;
static int v_trace_enabled, v_profile_enabled;
static uint64_t v_debug_now(void);

static void v_debug_enter(v_debug_frame *frame, v_debug_record *record) {
    if (!v_trace_enabled && !v_profile_enabled) return;
    frame->previous = v_debug_top;
    frame->record = record;
    v_debug_top = frame;
    if (!v_profile_enabled) return;
    if (!record->calls) {
        record->next = v_debug_records;
        v_debug_records = record;
    }
    if (record->calls != UINT64_MAX) ++record->calls;
    frame->started = v_debug_now();
}
static void v_debug_leave(v_debug_frame *frame) {
    v_debug_record *record;
    uint64_t now, elapsed;
    if (!v_trace_enabled && !v_profile_enabled) return;
    v_debug_top = frame->previous;
    if (!v_profile_enabled) return;
    record = frame->record;
    if (record->completed != UINT64_MAX) ++record->completed;
    now = v_debug_now();
    if (!frame->started || now < frame->started) return;
    elapsed = now - frame->started;
    record->elapsed_us += elapsed <= UINT64_MAX - record->elapsed_us
        ? elapsed : UINT64_MAX - record->elapsed_us;
}
static void v_debug_json(const char *value) {
    const unsigned char *p = (const unsigned char *)value;
    fputc('"', stderr);
    for (; *p; ++p) {
        if (*p == '"' || *p == '\\') fputc('\\', stderr);
        if (*p < 32) fprintf(stderr, "\\u%04x", (unsigned)*p);
        else fputc(*p, stderr);
    }
    fputc('"', stderr);
}
static void v_debug_report(void) {
    const v_debug_record *record;
    fputs("{\"vela_profile\":1,\"functions\":[", stderr);
    for (record = v_debug_records; record; record = record->next) {
        if (record != v_debug_records) fputc(',', stderr);
        fputs("{\"name\":", stderr);
        v_debug_json(record->name);
        fputs(",\"file\":", stderr);
        v_debug_json(record->file);
        fprintf(stderr, ",\"line\":%d,\"column\":%d,\"calls\":%" PRIu64
            ",\"completed\":%" PRIu64 ",\"inclusive_us\":%" PRIu64 "}",
            record->line, record->column, record->calls, record->completed, record->elapsed_us);
    }
    fputs("]}\n", stderr);
}
static void v_debug_trace(void) {
    const v_debug_frame *frame = v_debug_top;
    unsigned depth = 0;
    if (!v_trace_enabled || !frame) return;
    fputs("Vela stack:\n", stderr);
    for (; frame && depth < 64; frame = frame->previous, ++depth) {
        const v_debug_record *record = frame->record;
        fprintf(stderr, "  at %s (%s:%d:%d)\n",
            record->name, record->file, record->line, record->column);
    }
    if (frame) fputs("  ...\n", stderr);
}
static int v_debug_setup(void) {
    const char *trace = getenv("VELA_TRACE"), *profile = getenv("VELA_PROFILE");
    v_trace_enabled = trace && strcmp(trace, "1") == 0;
    v_profile_enabled = profile && strcmp(profile, "1") == 0;
    return !v_profile_enabled || atexit(v_debug_report) == 0;
}
#else
#define v_debug_trace() ((void)0)
#endif

static void v_panic(const char *file, int line, int column, const char *message) {
    fprintf(stderr, "%s:%d:%d: runtime error: %s\n", file, line, column, message);
    v_debug_trace();
    exit(70);
}
static uint8_t v_user_panic(v_string message, const char *file, int line, int column) {
    fprintf(stderr, "%s:%d:%d: panic: ", file, line, column);
    if (message.length) fwrite(message.data, 1, message.length, stderr);
    fputc('\n', stderr);
    v_debug_trace();
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

/* ABI 2. Older emitted C uses this heap without activating collection. */
#include <errno.h>
#include <limits.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <process.h>
#include <wchar.h>
#else
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <signal.h>
#include <time.h>
#include <dirent.h>
#if defined(__linux__)
#include <sys/syscall.h>
#endif
#endif

typedef void (*v_gc_visit)(const void *);
typedef struct v_allocation {
    struct v_allocation *next, *gray;
    size_t bytes;
    v_gc_visit visit;
    int marked;
    /* Every managed Vela layout aligns to one of these scalar types. */
    union { void *pointer; double number; int64_t integer; } alignment;
} v_allocation;
typedef struct v_gc_root {
    const void *slot;
    v_gc_visit visit;
    struct v_gc_root *previous;
} v_gc_root;
typedef struct {
    const void *data;
    size_t count, size;
    v_gc_visit visit;
} v_gc_snapshot;
static v_allocation *v_allocations;
static v_allocation *v_gc_gray;
static v_gc_root *v_gc_roots;
static size_t v_gc_bytes, v_gc_peak, v_gc_collections;
static size_t v_gc_limit = 1024 * 1024;
static int v_gc_enabled, v_gc_stress, v_gc_report;
static void v_gc_trace_native(void);

static void v_gc_mark(const void *base) {
    v_allocation *a;
    if (!base) return;
    a = (v_allocation *)base - 1;
    if (a->marked) return;
    a->marked = 1;
    if (a->visit) { a->gray = v_gc_gray; v_gc_gray = a; }
}
static void v_gc_string(const void *slot) {
    v_gc_mark(((const v_string *)slot)->owner);
}
static void v_gc_items(const void *data, size_t count, size_t size, v_gc_visit visit) {
    const unsigned char *p = (const unsigned char *)data;
    size_t i;
    v_gc_mark(data);
    if (visit) for (i = 0; i < count; ++i) visit(p + i * size);
}
static void v_gc_snapshot_value(const void *slot) {
    const v_gc_snapshot *s = (const v_gc_snapshot *)slot;
    v_gc_items(s->data, s->count, s->size, s->visit);
}
static void v_gc_collect(void) {
    v_gc_root *root;
    v_allocation **link;
    for (root = v_gc_roots; root; root = root->previous) root->visit(root->slot);
    v_gc_trace_native();
    while (v_gc_gray) {
        v_allocation *a = v_gc_gray;
        v_gc_gray = a->gray;
        a->visit(a + 1);
    }
    link = &v_allocations;
    while (*link) {
        v_allocation *a = *link;
        if (a->marked) { a->marked = 0; link = &a->next; }
        else { *link = a->next; v_gc_bytes -= a->bytes; free(a); }
    }
    v_gc_limit = v_gc_bytes > SIZE_MAX / 2 ? SIZE_MAX : v_gc_bytes * 2;
    if (v_gc_limit < 1024 * 1024) v_gc_limit = 1024 * 1024;
    ++v_gc_collections;
}
static void v_gc_poll(void) {
    if (v_gc_enabled && (v_gc_stress || v_gc_bytes >= v_gc_limit)) v_gc_collect();
}
static void v_gc_enable(void) {
    const char *stress = getenv("VELA_GC_STRESS"), *report = getenv("VELA_GC_REPORT");
    v_gc_stress = stress && !strcmp(stress, "1");
    v_gc_report = report && !strcmp(report, "1");
    v_gc_enabled = 1;
}
static void v_gc_push(v_gc_root *root, const void *slot, v_gc_visit visit) {
    root->slot = slot; root->visit = visit; root->previous = v_gc_roots;
    v_gc_roots = root;
}
typedef struct { int64_t length, capacity; int64_t *data; } v_int_list;
typedef struct { int64_t length, capacity; v_string *data; } v_string_list;
static void v_gc_ints_value(const void *slot) { v_gc_mark(*(v_int_list *const *)slot); }
static void v_gc_strings_value(const void *slot) { v_gc_mark(*(v_string_list *const *)slot); }
static void v_gc_ints_object(const void *data) {
    v_gc_mark(((const v_int_list *)data)->data);
}
static void v_gc_strings_object(const void *data) {
    const v_string_list *list = (const v_string_list *)data;
    v_gc_items(list->data, (size_t)list->length, sizeof(v_string), v_gc_string);
}
typedef struct { int ok; v_string value; } v_io_result;
#ifdef _WIN32
static wchar_t **v_wargv;
static HMODULE v_shell_module;
static DWORD v_callback_thread;
#endif

static void v_foreign_shutdown(void);
static void v_runtime_free(void) {
    if (v_gc_report)
        fprintf(stderr, "vela gc: collections=%zu peak=%zu bytes=%zu\n", v_gc_collections, v_gc_peak, v_gc_bytes);
    v_foreign_shutdown();
    while (v_allocations) {
        v_allocation *allocation = v_allocations;
        v_allocations = allocation->next;
        free(allocation);
    }
#ifdef _WIN32
    if (v_wargv) LocalFree(v_wargv);
    if (v_shell_module) FreeLibrary(v_shell_module);
#endif
}

static void *v_allocate(size_t size, const char *f, int l, int c) {
    v_allocation *allocation;
    size_t payload = size ? size : 1, bytes;
    if (payload > SIZE_MAX - sizeof(v_allocation) ||
        payload + sizeof(v_allocation) > SIZE_MAX - v_gc_bytes)
        v_panic(f, l, c, "allocation size overflow");
    bytes = payload + sizeof(v_allocation);
    allocation = (v_allocation *)malloc(bytes);
    if (!allocation) v_panic(f, l, c, "out of memory");
    allocation->bytes = bytes; allocation->visit = NULL; allocation->marked = 0;
    allocation->next = v_allocations; v_allocations = allocation;
    v_gc_bytes += bytes;
    if (v_gc_bytes > v_gc_peak) v_gc_peak = v_gc_bytes;
    return allocation + 1;
}
static void v_gc_describe(void *base, v_gc_visit visit) {
    ((v_allocation *)base - 1)->visit = visit;
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
    out[64]=0; return v_owned_text(out,64);
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
    v_string slice = {value.data + start, (size_t)(end - start), value.owner};
    return slice;
}
static v_string v_str_concat(v_string a, v_string b, const char *f, int l, int c) {
    size_t size = v_size_add(a.length, b.length, f, l, c);
    char *data = (char *)v_allocate(size, f, l, c);
    memcpy(data, a.data, a.length); memcpy(data + a.length, b.data, b.length);
    return v_owned_text(data, size);
}
static v_string v_str_from_byte(int64_t byte, const char *f, int l, int c) {
    char *data;
    if (byte < 0 || byte > 255) v_panic(f, l, c, "byte must be between 0 and 255");
    data = (char *)v_allocate(1, f, l, c); data[0] = (char)byte; return v_owned_text(data, 1);
}
static v_string v_int_to_string(int64_t value, const char *f, int l, int c) {
    char *data = (char *)v_allocate(32, f, l, c);
    int length = snprintf(data, 32, "%" PRId64, value);
    if (length < 0 || length >= 32) v_panic(f, l, c, "integer formatting failed");
    return v_owned_text(data, (size_t)length);
}

#define V_LIST(PREFIX, LIST, ITEM) \
static LIST *v_##PREFIX##_new(const char *f, int l, int c) { \
    LIST *list = (LIST *)v_allocate(sizeof(LIST), f, l, c); \
    v_gc_describe(list, v_gc_##PREFIX##_object); \
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
    return v_owned_text(data, size);
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
    return v_owned_text(data, (size_t)length - 1);
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
        v_strings_push(chunks, v_owned_text(data, count), f, l, c);
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
static v_io_result v_install_file(v_string from, v_string to, const char *f, int l, int c) {
    int ok;
    if (memchr(from.data, 0, from.length) || memchr(to.data, 0, to.length))
        return v_io_error("NUL byte in file path");
#ifdef _WIN32
    ok = MoveFileExW(v_wide(from, f, l, c), v_wide(to, f, l, c), 0) != 0;
#else
    const char *source = v_c_string(from, f, l, c);
    const char *destination = v_c_string(to, f, l, c);
    struct stat info;
    if (lstat(source, &info) == 0 && S_ISDIR(info.st_mode)) {
#if defined(__linux__) && defined(SYS_renameat2)
        /* RENAME_NOREPLACE=1: never fall back to an overwriting rename. */
        ok = syscall(SYS_renameat2, -100, source, -100, destination, 1) == 0;
#else
        ok = 0;
#endif
    } else {
        ok = link(source, destination) == 0;
    }
#endif
    return ok ? v_io(1, v_text("", 0)) : v_io_error("cannot install file without replacing");
}
static v_io_result v_executable_path(const char *f, int l, int c) {
#ifdef _WIN32
    wchar_t path[32768];
    DWORD length = GetModuleFileNameW(NULL, path, (DWORD)(sizeof(path) / sizeof(*path)));
    if (!length || length >= sizeof(path) / sizeof(*path))
        return v_io_error("cannot read executable path");
    return v_io(1, v_utf8(path, f, l, c));
#elif defined(__linux__)
    char path[32768];
    ssize_t length = readlink("/proc/self/exe", path, sizeof(path));
    if (length <= 0 || (size_t)length >= sizeof(path))
        return v_io_error("cannot read executable path");
    return v_io(1, v_str_concat(v_text(path, (size_t)length), v_text("", 0), f, l, c));
#else
    (void)f; (void)l; (void)c;
    return v_io_error("executable path is unavailable on this platform");
#endif
}
static v_io_result v_canonical_path(v_string path, int regular_file, const char *f, int l, int c) {
    if (!path.length || memchr(path.data, 0, path.length)) return v_io_error("invalid path");
#ifdef _WIN32
    wchar_t resolved[32768];
    BY_HANDLE_FILE_INFORMATION info;
    DWORD size;
    HANDLE file = CreateFileW(v_wide(path, f, l, c), FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
        OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, NULL);
    if (file == INVALID_HANDLE_VALUE) return v_io_error("cannot open path");
    if (GetFileType(file) != FILE_TYPE_DISK || !GetFileInformationByHandle(file, &info)
            || (!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) != !!regular_file) {
        CloseHandle(file);
        return v_io_error("unexpected file type");
    }
    size = GetFinalPathNameByHandleW(file, resolved, (DWORD)(sizeof(resolved) / sizeof(*resolved)),
        FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    if (!size && GetLastError() == ERROR_ACCESS_DENIED) {
        /* AppContainer cannot query the Mount Manager. Keep handle-based
           normalization and return a reopenable Win32 NT namespace path. */
        static const wchar_t prefix[] = L"\\\\?\\GLOBALROOT";
        DWORD prefix_size = (DWORD)(sizeof(prefix) / sizeof(*prefix) - 1);
        DWORD remaining = (DWORD)(sizeof(resolved) / sizeof(*resolved)) - prefix_size;
        size = GetFinalPathNameByHandleW(file, resolved + prefix_size, remaining,
            FILE_NAME_NORMALIZED | VOLUME_NAME_NT);
        if (size && size < remaining) {
            memcpy(resolved, prefix, prefix_size * sizeof(*resolved));
            size += prefix_size;
        } else size = 0;
    }
    CloseHandle(file);
    if (!size || size >= sizeof(resolved) / sizeof(*resolved)) return v_io_error("cannot resolve path");
    return v_io(1, v_utf8(resolved, f, l, c));
#else
    struct stat info;
    v_string value;
    char *resolved = realpath(v_c_string(path, f, l, c), NULL);
    if (!resolved) return v_io_error("cannot resolve path");
    if (stat(resolved, &info) || (regular_file ? !S_ISREG(info.st_mode) : !S_ISDIR(info.st_mode))) {
        free(resolved);
        return v_io_error("unexpected file type");
    }
    value = v_str_concat(v_text(resolved, strlen(resolved)), v_text("", 0), f, l, c);
    free(resolved);
    return v_io(1, value);
#endif
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
#ifdef _WIN32
/* Protect temporary inheritable streams from other runtime launchers. */
static SRWLOCK v_process_inheritance = SRWLOCK_INIT;
static wchar_t *v_process_command(v_string_list *arguments, const char *f, int l, int c) {
    size_t capacity = 1, pos = 0; int64_t i; char *command;
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
    command[pos] = 0; return v_wide(v_text(command, pos), f, l, c);
}
#endif
static int64_t v_process_execute_extended(v_string_list *arguments, int redirect, const v_string *out_path, const v_string *err_path, int64_t timeout, const v_string *cwd, const char *f, int l, int c) {
    if (arguments->length == 0) v_panic(f, l, c, "process argument list is empty");
    if (timeout < 0 || timeout > 2147483647) v_panic(f, l, c, "invalid process timeout");
#ifdef _WIN32
    STARTUPINFOW startup; PROCESS_INFORMATION process; DWORD code;
    HANDLE out_file = INVALID_HANDLE_VALUE, err_file = INVALID_HANDLE_VALUE, job = NULL;
    wchar_t *wide = v_process_command(arguments, f, l, c);
    memset(&startup, 0, sizeof(startup)); startup.cb = sizeof(startup);
    if (redirect) {
        startup.dwFlags = STARTF_USESTDHANDLES;
        startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        startup.hStdOutput = GetStdHandle(STD_ERROR_HANDLE);
        startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    }
    AcquireSRWLockExclusive(&v_process_inheritance);
    if (out_path) {
        SECURITY_ATTRIBUTES sa = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
        out_file = CreateFileW(v_wide(*out_path, f, l, c), GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        err_file = CreateFileW(v_wide(*err_path, f, l, c), GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (out_file == INVALID_HANDLE_VALUE || err_file == INVALID_HANDLE_VALUE) {
            if (out_file != INVALID_HANDLE_VALUE) CloseHandle(out_file);
            if (err_file != INVALID_HANDLE_VALUE) CloseHandle(err_file);
            ReleaseSRWLockExclusive(&v_process_inheritance); return -1;
        }
        startup.dwFlags = STARTF_USESTDHANDLES; startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        startup.hStdOutput = out_file; startup.hStdError = err_file;
        job = CreateJobObjectW(NULL, NULL); memset(&limits, 0, sizeof(limits));
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
            CloseHandle(out_file); CloseHandle(err_file); if (job) CloseHandle(job);
            ReleaseSRWLockExclusive(&v_process_inheritance); return -1;
        }
    }
    memset(&process, 0, sizeof(process));
    if (!CreateProcessW(NULL, wide, NULL, NULL, TRUE, out_path ? CREATE_SUSPENDED : 0, NULL, cwd ? v_wide(*cwd, f, l, c) : NULL, &startup, &process)) {
        if (out_path) { CloseHandle(out_file); CloseHandle(err_file); CloseHandle(job); }
        ReleaseSRWLockExclusive(&v_process_inheritance); return -1;
    }
    if (out_path) { CloseHandle(out_file); CloseHandle(err_file); }
    ReleaseSRWLockExclusive(&v_process_inheritance);
    if (out_path) {
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
#ifdef _WIN32
    v_callback_thread = GetCurrentThreadId();
#endif
    if (atexit(v_runtime_free)) v_panic("runtime", 0, 0, "cannot register memory teardown");
#ifdef VELA_DEBUG_INSTRUMENTED
    if (!v_debug_setup()) v_panic("runtime", 0, 0, "cannot register profile report");
#endif
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
    {
        int attempt;
        for (attempt = 0; attempt < 32; ++attempt) {
            DWORD error;
            if (!GetTempFileNameW(directory, L"vla", 0, name)) return v_io_error("cannot create temporary name");
            if (!DeleteFileW(name)) return v_io_error("cannot create temporary directory");
            if (CreateDirectoryW(name, NULL)) return v_io(1, v_utf8(name, f, l, c));
            error = GetLastError();
            /* The reservation no longer belongs to us. Never unlink a rival. */
            if (error != ERROR_ALREADY_EXISTS && error != ERROR_FILE_EXISTS && error != ERROR_ACCESS_DENIED)
                return v_io_error("cannot create temporary directory");
        }
        return v_io_error("cannot create temporary directory");
    }
#else
    v_string base = parent.length ? parent : v_text("/tmp", 4);
    char *name = v_c_string(v_str_concat(base, v_text("/vela-XXXXXX", 12), f, l, c), f, l, c);
    extern char *mkdtemp(char *);
    if (!mkdtemp(name)) return v_io_error("cannot create temporary directory");
    return v_io(1, v_owned_text(name, strlen(name)));
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
typedef struct { size_t size; int64_t length, capacity; unsigned char *data; v_gc_visit element; } v_list;
static void v_gc_list_value(const void *slot) { v_gc_mark(*(v_list *const *)slot); }
static void v_gc_list_object(const void *data) {
    const v_list *list = (const v_list *)data;
    v_gc_items(list->data, (size_t)list->length, list->size, list->element);
}
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
static v_list *v_list_new_traced(size_t size, v_gc_visit element, const char *f, int l, int c) {
    v_list *v = v_list_new(size, f, l, c);
    v->element = element; v_gc_describe(v, v_gc_list_object); return v;
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
typedef struct { size_t key_size, value_size, capacity, used, count; int key_kind; v_entry *entries; v_gc_visit key, value; } v_dict;
static void v_gc_dict_value(const void *slot) { v_gc_mark(*(v_dict *const *)slot); }
static void v_gc_dict_object(const void *data) {
    const v_dict *d = (const v_dict *)data;
    size_t i;
    v_gc_mark(d->entries);
    for (i = 0; i < d->capacity; ++i) if (d->entries[i].state == 1) {
        const v_entry *e = &d->entries[i];
        v_gc_mark(e->key); v_gc_mark(e->value);
        if (d->key) d->key(e->key);
        if (d->value) d->value(e->value);
    }
}
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
static v_dict *v_dict_new_traced(size_t key_size, size_t value_size, int key_kind,
    v_gc_visit key, v_gc_visit value, const char *f, int l, int c) {
    v_dict *d = v_dict_new(key_size, value_size, key_kind, f, l, c);
    d->key = key; d->value = value; v_gc_describe(d, v_gc_dict_object); return d;
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
static v_float_parse v_float_sqrt(double n, const char *f, int l, int c) {
    v_float_parse r = {0};
    (void)f; (void)l; (void)c;
    if (isnan(n) || n < 0.0) return v_float_error("square root requires a nonnegative Float64");
    r.ok = 1; r.value = sqrt(n); r.error = v_text("", 0); return r;
}
static int v_float_is_finite(double n) { return isfinite(n) != 0; }
static int v_float_is_nan(double n) { return isnan(n) != 0; }
static v_string v_format_float(double n, int digits, const char *f, int l, int c) {
    char buffer[384]; int length; char *copy;
    if (isnan(n)) return v_text("nan", 3);
    if (isinf(n)) return n < 0 ? v_text("-inf", 4) : v_text("inf", 3);
#ifdef _WIN32
    {
        _locale_t locale = _create_locale(LC_NUMERIC, "C");
        if (!locale) v_panic(f, l, c, "cannot create numeric locale");
        length = digits < 0 ? _snprintf_l(buffer, sizeof(buffer), "%.17g", locale, n)
                            : _snprintf_l(buffer, sizeof(buffer), "%.*f", locale, digits, n);
        _free_locale(locale);
    }
#else
    {
        locale_t locale = newlocale(LC_NUMERIC_MASK, "C", (locale_t)0), previous;
        if (!locale) v_panic(f, l, c, "cannot create numeric locale");
        previous = uselocale(locale);
        length = digits < 0 ? snprintf(buffer, sizeof(buffer), "%.17g", n)
                            : snprintf(buffer, sizeof(buffer), "%.*f", digits, n);
        uselocale(previous); freelocale(locale);
    }
#endif
    if (length < 0 || (size_t)length >= sizeof(buffer)) v_panic(f, l, c, "Float64 formatting failed");
    copy = (char *)v_allocate((size_t)length + 1, f, l, c);
    memcpy(copy, buffer, (size_t)length + 1); return v_owned_text(copy, (size_t)length);
}
static v_string v_float_to_string(double n, const char *f, int l, int c) {
    return v_format_float(n, -1, f, l, c);
}
static v_io_result v_float_to_fixed(double n, int64_t digits, const char *f, int l, int c) {
    int rounding;
    v_string text;
    if (digits < 0 || digits > 18) return v_io_error("fixed precision must be 0..18");
    rounding = fegetround();
    if (rounding < 0 || (rounding != FE_TONEAREST && fesetround(FE_TONEAREST)))
        v_panic(f, l, c, "cannot select nearest rounding");
    text = v_format_float(n, (int)digits, f, l, c);
    if (rounding != FE_TONEAREST && fesetround(rounding))
        v_panic(f, l, c, "cannot restore rounding");
    return v_io(1, text);
}
static uint8_t v_print_Float64(double n, const char *f, int l, int c) {
    return v_print_String(v_float_to_string(n, f, l, c), f, l, c);
}
static uint8_t v_assert_true(int condition, v_string message, const char *f, int l, int c) {
    if (!condition) {
        fprintf(stderr, "%s:%d:%d: assertion failed: ", f, l, c);
        if (message.length) fwrite(message.data, 1, message.length, stderr);
        fputc('\n', stderr);
        v_debug_trace();
        exit(70);
    }
    return 0;
}

typedef struct { int kind; v_string value; } v_bounded_read;
static v_bounded_read v_read_stdin(int64_t limit, int line, const char *f, int l, int c) {
    v_bounded_read result = {2, {"End of input or truncated message.", 34}};
    size_t count = 0;
    char *data;
    if (limit < 0 || limit > 4194304 || (line && !limit)) { result.kind = 1; return result; }
#ifdef _WIN32
    if (_setmode(_fileno(stdin), _O_BINARY) == -1) return result;
#endif
    data = (char *)v_allocate((size_t)limit, f, l, c);
    if (line) {
        while (count < (size_t)limit) {
            int byte = fgetc(stdin);
            if (byte == EOF) return result;
            data[count++] = (char)byte;
            if (byte == '\n') break;
        }
        if (data[count - 1] != '\n') { result.kind = 1; return result; }
    } else if ((count = fread(data, 1, (size_t)limit, stdin)) != (size_t)limit) {
        return result;
    }
    result.kind = 0;
    result.value = v_owned_text(data, count);
    return result;
}
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
        r.kind = 0; r.value = v_owned_text(owned, used); return r;
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
typedef struct v_foreign_handle {
    void *pointer;
    v_foreign_library *owner;
    struct v_foreign_handle *retained_next;
    int closed;
} v_foreign_handle;
typedef struct {
    uint32_t version;
    uint32_t reserved;
    uint64_t token;
    int32_t (*invoke)(uint64_t, int64_t, int64_t *);
} VelaCallback;
typedef struct {
    VelaCallback descriptor;
    v_foreign_handle *owner;
    void (*code)(void);
    void *environment;
    unsigned in_flight;
} v_callback_entry;
typedef struct { v_callback_entry *entry; v_string error; } v_callback_result;
static v_callback_entry v_callbacks[1024];
static size_t v_callback_count;
static unsigned v_callback_depth;
static v_foreign_library *v_foreign_libraries;
static v_foreign_handle *v_foreign_roots;
static v_foreign_library v_stream_owner;
static v_foreign_library v_writer_owner;
static size_t v_stream_count;
static v_foreign_library v_directory_owner;
static size_t v_directory_count;
typedef struct {
#ifdef _WIN32
    HANDLE handle;
    unsigned char buffer[65536];
    size_t offset;
    int buffered;
#else
    DIR *handle;
#endif
    int done;
} v_directory;
static int v_directory_dispose(v_directory *directory) {
#ifdef _WIN32
    int failed = !CloseHandle(directory->handle);
#else
    int failed = closedir(directory->handle) != 0;
#endif
    free(directory);
    return failed;
}
static v_foreign_library v_process_owner;
static v_foreign_library v_fiber_owner;
#ifdef _WIN32
typedef struct v_fiber {
    void *stack, *environment;
    void (*code)(void);
    v_gc_root *roots;
#ifdef VELA_DEBUG_INSTRUMENTED
    v_debug_frame *debug_frames;
#endif
    struct v_fiber *next;
    int64_t delay;
    int started, done, cancelled;
} v_fiber;
static v_fiber *v_fibers, *v_active_fiber;
static v_gc_root *v_fiber_host_roots;
#ifdef VELA_DEBUG_INSTRUMENTED
static v_debug_frame *v_fiber_host_frames;
#endif
static void *v_fiber_host;
static size_t v_fiber_count;
static void v_fiber_destroy(v_fiber *fiber) {
    DeleteFiber(fiber->stack);
    free(fiber);
}
typedef struct {
    HANDLE launcher, process, job;
    volatile LONG cancel_launch;
    int cancelling;
    const char *error;
    wchar_t *executable, *command, *directory, *output, *errors;
} v_child_process;
static size_t v_process_count;
static void v_process_destroy(v_child_process *child) {
    if (child->launcher) CloseHandle(child->launcher);
    if (child->job) CloseHandle(child->job);
    if (child->process) CloseHandle(child->process);
    free(child->executable);
    free(child->command);
    free(child->directory);
    free(child->output);
    free(child->errors);
    free(child);
}
static void v_process_shutdown(v_child_process *child) {
    if (WaitForSingleObject(child->launcher, 0) == WAIT_OBJECT_0) {
        v_process_destroy(child);
    } else {
        InterlockedExchange(&child->cancel_launch, 1);
        CancelSynchronousIo(child->launcher);
        /* The process is exiting. An active launcher still owns its storage. */
    }
}
#endif
static void v_gc_handle_value(const void *slot) { v_gc_mark(*(v_foreign_handle *const *)slot); }
static void v_gc_trace_native(void) {
    v_foreign_library *p;
    v_foreign_handle *h;
    size_t i;
    for (p = v_foreign_libraries; p; p = p->next) v_gc_mark(p);
    for (h = v_foreign_roots; h; h = h->retained_next) v_gc_mark(h);
#ifdef _WIN32
    {
        v_fiber *fiber;
        v_gc_root *root;
        for (root = v_fiber_host_roots; root; root = root->previous) root->visit(root->slot);
        for (fiber = v_fibers; fiber; fiber = fiber->next) {
            v_gc_mark(fiber->environment);
            if (fiber != v_active_fiber)
                for (root = fiber->roots; root; root = root->previous) root->visit(root->slot);
        }
    }
#endif
    for (i = 0; i < v_callback_count; ++i) {
        const v_callback_entry *entry = &v_callbacks[i];
        if (!entry->owner) continue;
        v_gc_mark(entry->owner);
        v_gc_mark(entry->environment);
    }
}
static int32_t v_callback_invoke(uint64_t token, int64_t input, int64_t *output) {
#if defined(_WIN32) && defined(_M_X64)
    v_callback_entry *entry;
    fenv_t native_environment;
    int64_t value;
    if (GetCurrentThreadId() != v_callback_thread) return 2;
    if (!token || token > v_callback_count || !v_callbacks[token - 1].owner) return 1;
    if (!output) return 4;
    if (v_callback_depth >= 32) return 3;
    if (fegetenv(&native_environment)) return 4;
    if (fesetenv(FE_DFL_ENV)) {
        (void)fesetenv(&native_environment);
        return 4;
    }
    entry = &v_callbacks[token - 1];
    ++v_callback_depth;
    ++entry->in_flight;
    value = ((int64_t (*)(void *, int64_t))entry->code)(entry->environment, input);
    --entry->in_flight;
    --v_callback_depth;
    if (fesetenv(&native_environment)) return 4;
    *output = value;
    return 0;
#else
    (void)token; (void)input; (void)output;
    return 2;
#endif
}
static v_callback_result v_ffi_callback_register(v_foreign_handle *owner, void (*code)(void), void *environment, const char *f, int l, int c) {
    v_callback_result result = {0};
    (void)f; (void)l; (void)c;
#if defined(_WIN32) && defined(_M_X64)
    v_callback_entry *entry;
    if (!owner || !owner->pointer || owner->closed || owner->owner == &v_stream_owner || owner->owner == &v_writer_owner || owner->owner == &v_directory_owner || owner->owner == &v_process_owner || owner->owner == &v_fiber_owner) {
        result.error = v_text("callback requires a live DLL resource", 37);
        return result;
    }
    if (v_callback_count >= sizeof(v_callbacks) / sizeof(v_callbacks[0])) {
        result.error = v_text("callback registration limit reached", 35);
        return result;
    }
    entry = &v_callbacks[v_callback_count++];
    entry->descriptor = (VelaCallback){1, 0, (uint64_t)v_callback_count, v_callback_invoke};
    entry->owner = owner;
    entry->code = code;
    entry->environment = environment;
    result.entry = entry;
#else
    (void)owner; (void)code; (void)environment;
    result.error = v_text("callbacks require Windows x64/MSVC", 34);
#endif
    return result;
}
static const VelaCallback *v_callback_require(v_callback_entry *entry, v_foreign_library *library, const char *f, int l, int c) {
    if (!entry || !entry->owner) v_panic(f, l, c, "callback registration is closed");
    if (entry->owner->owner != library) v_panic(f, l, c, "callback belongs to another library");
    return &entry->descriptor;
}
static v_io_result v_ffi_callback_cancel(v_callback_entry *entry, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
    if (!entry || !entry->owner) return v_io_error("callback registration is closed");
    if (entry->in_flight) return v_io_error("callback registration is active");
    entry->owner = NULL;
    entry->code = NULL;
    entry->environment = NULL;
    return v_io(1, v_text("", 0));
}
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
    v_foreign_handle *handle;
    for (handle = v_foreign_roots; handle; handle = handle->retained_next) {
        if (handle->owner == &v_stream_owner || handle->owner == &v_writer_owner) fclose((FILE *)handle->pointer);
        else if (handle->owner == &v_directory_owner) v_directory_dispose((v_directory *)handle->pointer);
#ifdef _WIN32
        else if (handle->owner == &v_process_owner) v_process_shutdown((v_child_process *)handle->pointer);
        else if (handle->owner == &v_fiber_owner && handle->pointer != v_active_fiber)
            v_fiber_destroy((v_fiber *)handle->pointer);
#endif
    }
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
    h->pointer = pointer; h->owner = library; h->retained_next = NULL;
    h->closed = 0; return h;
}
static void *v_foreign_unwrap(v_foreign_handle *h, v_foreign_library *library, const char *f, int l, int c) {
    if (!h) v_panic(f,l,c,"invalid foreign handle");
    if (h->pointer && h->closed) v_panic(f,l,c,"foreign handle is closed");
    if (h->pointer && h->owner != library) v_panic(f,l,c,"foreign handle belongs to another library");
    return h->pointer;
}
static int v_ffi_is_null(v_foreign_handle *h) { return !h || !h->pointer; }
static v_foreign_handle **v_foreign_root_slot(v_foreign_handle *h) {
    v_foreign_handle **slot = &v_foreign_roots;
    while (*slot && *slot != h) slot = &(*slot)->retained_next;
    return slot;
}
static int v_foreign_unroot(v_foreign_handle *h) {
    v_foreign_handle **slot = v_foreign_root_slot(h);
    if (!*slot) return 0;
    *slot = h->retained_next; h->retained_next = NULL;
    return 1;
}
static v_io_result v_ffi_retain(v_foreign_handle *h, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
    if (!h || !h->pointer || h->closed) return v_io_error("retain requires a live foreign handle");
    if (h->owner == &v_directory_owner) return v_io_error("directory handles have explicit ownership");
    if (h->owner == &v_stream_owner) return v_io_error("stream handles have explicit stream ownership");
    if (h->owner == &v_writer_owner) return v_io_error("writer handles have explicit stream ownership");
    if (h->owner == &v_process_owner) return v_io_error("process handles have explicit process ownership");
    if (h->owner == &v_fiber_owner) return v_io_error("fiber handles have explicit task ownership");
    if (*v_foreign_root_slot(h)) return v_io_error("foreign handle already retained");
    h->retained_next = v_foreign_roots; v_foreign_roots = h;
    return v_io(1, v_text("", 0));
}
static v_io_result v_ffi_release(v_foreign_handle *h, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
    if (!h || !h->pointer || h->closed) return v_io_error("release requires a live foreign handle");
    if (h->owner == &v_directory_owner) return v_io_error("directory handles have explicit ownership");
    if (h->owner == &v_stream_owner) return v_io_error("stream handles have explicit stream ownership");
    if (h->owner == &v_writer_owner) return v_io_error("writer handles have explicit stream ownership");
    if (h->owner == &v_process_owner) return v_io_error("process handles have explicit process ownership");
    if (h->owner == &v_fiber_owner) return v_io_error("fiber handles have explicit task ownership");
    if (!v_foreign_unroot(h)) return v_io_error("foreign handle is not retained");
    return v_io(1, v_text("", 0));
}
static v_io_result v_ffi_close(v_foreign_handle *h, v_string name, const char *f, int l, int c) {
    v_foreign_proc destructor; fenv_t environment;
    size_t i;
    if (!h || !h->pointer) return v_io(1,v_text("",0));
    if (h->closed) return v_io_error("foreign handle already closed");
    if (h->owner == &v_directory_owner) return v_io_error("directory handles require directory_close");
    if (h->owner == &v_stream_owner) return v_io_error("stream handles require stream_close");
    if (h->owner == &v_writer_owner) return v_io_error("writer handles require stream_write_close");
    if (h->owner == &v_process_owner) return v_io_error("process handles require process_close");
    if (h->owner == &v_fiber_owner) return v_io_error("fiber handles require fiber_close");
    for (i = 0; i < v_callback_count; ++i)
        if (v_callbacks[i].owner == h) return v_io_error("cancel owner callbacks before closing");
    if (!v_foreign_name(name,0)) return v_io_error("invalid foreign destructor name");
    destructor = v_foreign_find(h->owner,v_c_string(name,f,l,c));
    if (!destructor) return v_io_error("missing foreign destructor");
    if (fegetenv(&environment)) return v_io_error("cannot save floating-point environment");
    ((void (*)(void*))destructor)(h->pointer);
    h->closed = 1;
    (void)v_foreign_unroot(h);
    if (fesetenv(&environment)) v_panic(f,l,c,"cannot restore floating-point environment");
    return v_io(1,v_text("",0));
}
typedef struct { int kind; v_foreign_handle *handle; v_string error; } v_stream_result;
static v_stream_result v_stream_open_large(v_string path, int64_t limit, const char *f, int l, int c) {
    v_stream_result result = {2, NULL, v_text("cannot open stream", 18)};
    FILE *file;
#ifdef _WIN32
    struct _stat64 info;
#else
    struct stat info;
#endif
    if (limit < 1) { result.kind = 1; return result; }
    if (v_stream_count >= 128) {
        result.error = v_text("too many open streams", 21);
        return result;
    }
    file = v_open(path, 0, f, l, c);
    if (!file) return result;
#ifdef _WIN32
    if (_fstat64(_fileno(file), &info) || (info.st_mode & _S_IFMT) != _S_IFREG) {
#else
    if (fstat(fileno(file), &info) || !S_ISREG(info.st_mode)) {
#endif
        fclose(file);
        result.error = v_text("expected regular file", 21);
        return result;
    }
    if (info.st_size > limit) { fclose(file); result.kind = 1; return result; }
    result.kind = 0;
    result.handle = v_foreign_wrap(file, &v_stream_owner, f, l, c);
    result.handle->retained_next = v_foreign_roots;
    v_foreign_roots = result.handle;
    ++v_stream_count;
    return result;
}
static v_stream_result v_stream_open(v_string path, int64_t limit, const char *f, int l, int c) {
    if (limit < 1 || limit > 268435456) {
        v_stream_result result = {1, NULL, v_text("", 0)};
        return result;
    }
    return v_stream_open_large(path, limit, f, l, c);
}
static v_stream_result v_stream_create(v_string path, const char *f, int l, int c) {
    v_stream_result result = {2, NULL, v_text("cannot create stream", 20)};
    FILE *file;
    if (v_stream_count >= 128) { result.error = v_text("too many open streams", 21); return result; }
    file = v_open(path, 1, f, l, c);
    if (!file) return result;
    result.kind = 0;
    result.handle = v_foreign_wrap(file, &v_writer_owner, f, l, c);
    result.handle->retained_next = v_foreign_roots;
    v_foreign_roots = result.handle;
    ++v_stream_count;
    return result;
}
static v_parse_result v_stream_write(v_foreign_handle *h, v_string data) {
    v_parse_result result = {0};
    size_t count;
    result.error = v_text("invalid or closed writer", 24);
    if (!h || h->owner != &v_writer_owner || h->closed) return result;
    if (data.length > 65536) { result.error = v_text("write exceeds buffer limit", 26); return result; }
    count = fwrite(data.data, 1, data.length, (FILE *)h->pointer);
    if (ferror((FILE *)h->pointer)) { result.error = v_text("cannot write stream", 19); return result; }
    result.ok = 1;
    result.value = (int64_t)count;
    return result;
}
static v_io_result v_stream_write_close(v_foreign_handle *h, const char *f, int l, int c) {
    int status;
    (void)f; (void)l; (void)c;
    if (!h || h->owner != &v_writer_owner || h->closed) return v_io_error("invalid or closed writer");
    status = fclose((FILE *)h->pointer);
    h->closed = 1;
    (void)v_foreign_unroot(h);
    --v_stream_count;
    return status ? v_io_error("cannot close writer") : v_io(1, v_text("", 0));
}
/* OS enumeration and storage only. Envelope decoding and traversal are Vela. */
static v_stream_result v_directory_open(v_string path, const char *f, int l, int c) {
    v_stream_result result = {2, NULL, v_text("cannot open directory", 21)};
    v_directory *directory;
    if (!path.length || memchr(path.data, 0, path.length)) return result;
#ifdef _WIN32
    while (path.length > 1 && (path.data[path.length - 1] == '/' || path.data[path.length - 1] == '\\')
        && !(path.length == 3 && path.data[1] == ':')) --path.length;
#else
    while (path.length > 1 && path.data[path.length - 1] == '/') --path.length;
#endif
    if (v_directory_count >= 128) { result.kind = 1; return result; }
    directory = (v_directory *)calloc(1, sizeof(*directory));
    if (!directory) { result.error = v_text("directory storage exhausted", 27); return result; }
#ifdef _WIN32
    {
        BY_HANDLE_FILE_INFORMATION info;
        directory->handle = CreateFileW(v_wide(path,f,l,c), FILE_LIST_DIRECTORY,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
        if (directory->handle == INVALID_HANDLE_VALUE) { free(directory); return result; }
        if (!GetFileInformationByHandle(directory->handle, &info) ||
            !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
            (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
            v_directory_dispose(directory); return result;
        }
    }
#else
    {
        int fd = open(v_c_string(path,f,l,c), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (fd < 0) { free(directory); return result; }
        directory->handle = fdopendir(fd);
        if (!directory->handle) { close(fd); free(directory); return result; }
    }
#endif
    result.kind = 0;
    result.handle = v_foreign_wrap(directory, &v_directory_owner, f,l,c);
    result.handle->retained_next = v_foreign_roots;
    v_foreign_roots = result.handle;
    ++v_directory_count;
    return result;
}
static v_bounded_read v_directory_next(v_foreign_handle *h, const char *f, int l, int c) {
    v_bounded_read result = {2, v_text("invalid or closed directory", 27)};
    v_directory *directory;
    char prefix[128], kind;
    size_t length;
    int count;
    int64_t size, modified;
    char *output;
    if (!h || h->owner != &v_directory_owner || h->closed) return result;
    directory = (v_directory *)h->pointer;
    if (directory->done) { result.kind = 0; result.value = v_text("",0); return result; }
    for (;;) {
#ifdef _WIN32
        FILE_ID_BOTH_DIR_INFO *info;
        int name_bytes;
        ULARGE_INTEGER ticks;
        if (!directory->buffered) {
            if (!GetFileInformationByHandleEx(directory->handle, FileIdBothDirectoryInfo,
                directory->buffer, sizeof(directory->buffer))) {
                if (GetLastError() == ERROR_NO_MORE_FILES) {
                    directory->done = 1; result.kind = 0; result.value = v_text("",0); return result;
                }
                result.value = v_text("cannot read directory", 21); return result;
            }
            directory->offset = 0;
        }
        info = (FILE_ID_BOTH_DIR_INFO *)(directory->buffer + directory->offset);
        directory->buffered = info->NextEntryOffset != 0;
        directory->offset += info->NextEntryOffset;
        if ((info->FileNameLength == 2 && info->FileName[0] == L'.') ||
            (info->FileNameLength == 4 && info->FileName[0] == L'.' && info->FileName[1] == L'.')) continue;
        name_bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, info->FileName,
            (int)(info->FileNameLength / sizeof(wchar_t)), NULL, 0, NULL, NULL);
        if (name_bytes <= 0) { result.value = v_text("invalid directory name UTF-16", 28); return result; }
        length = (size_t)name_bytes;
        kind = (info->FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? 'l' :
            (info->FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? 'd' :
            (info->FileAttributes & FILE_ATTRIBUTE_DEVICE) ? 'o' : 'f';
        size = kind == 'f' ? info->EndOfFile.QuadPart : 0;
        ticks.QuadPart = (uint64_t)info->LastWriteTime.QuadPart;
        modified = (int64_t)(ticks.QuadPart / UINT64_C(10000000)) - INT64_C(11644473600);
#else
        struct dirent *entry;
        struct stat info;
        errno = 0;
        entry = readdir(directory->handle);
        if (!entry) {
            if (errno) { result.value = v_text("cannot read directory",21); return result; }
            directory->done = 1; result.kind = 0; result.value = v_text("",0); return result;
        }
        if (!strcmp(entry->d_name,".") || !strcmp(entry->d_name,"..")) continue;
        if (fstatat(dirfd(directory->handle),entry->d_name,&info,AT_SYMLINK_NOFOLLOW)) {
            result.value = v_text("cannot query directory entry metadata",37); return result;
        }
        length = strlen(entry->d_name);
        kind = S_ISLNK(info.st_mode) ? 'l' : S_ISDIR(info.st_mode) ? 'd' : S_ISREG(info.st_mode) ? 'f' : 'o';
        size = kind == 'f' ? (int64_t)info.st_size : 0;
        modified = (int64_t)info.st_mtime;
#endif
        if (size < 0) { result.value = v_text("directory size outside Int range",32); return result; }
        count = snprintf(prefix,sizeof(prefix),"%c\t%" PRId64 "\t%" PRId64 "\t",kind,size,modified);
        if (count < 0 || (size_t)count >= sizeof(prefix)) return result;
        output = (char *)v_allocate(v_size_add((size_t)count,length,f,l,c),f,l,c);
        memcpy(output,prefix,(size_t)count);
#ifdef _WIN32
        if (!WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, info->FileName,
            (int)(info->FileNameLength / sizeof(wchar_t)),output + count,name_bytes,NULL,NULL)) return result;
#else
        memcpy(output + count,entry->d_name,length);
#endif
        result.kind = 0; result.value = v_owned_text(output,(size_t)count + length); return result;
    }
}
static v_io_result v_directory_close(v_foreign_handle *h, const char *f, int l, int c) {
    int failed;
    (void)f; (void)l; (void)c;
    if (!h || h->owner != &v_directory_owner || h->closed) return v_io_error("invalid or closed directory");
    failed = v_directory_dispose((v_directory *)h->pointer);
    h->closed = 1;
    (void)v_foreign_unroot(h);
    --v_directory_count;
    return failed ? v_io_error("cannot close directory") : v_io(1,v_text("",0));
}
static v_bounded_read v_stream_next(v_foreign_handle *h, int64_t limit, const char *f, int l, int c) {
    v_bounded_read result = {2, v_text("invalid or closed stream", 24)};
    char buffer[8192], *copy;
    FILE *file;
    size_t count;
    if (!h || h->owner != &v_stream_owner || h->closed) return result;
    if (limit < 1 || limit > (int64_t)sizeof(buffer)) { result.kind = 1; return result; }
    file = (FILE *)h->pointer;
    count = fread(buffer, 1, (size_t)limit, file);
    if (ferror(file)) { result.value = v_text("cannot read stream", 18); return result; }
    result.kind = 0;
    result.value = v_text("", 0);
    if (count) {
        copy = (char *)v_allocate(count, f, l, c);
        memcpy(copy, buffer, count);
        result.value = v_owned_text(copy, count);
    }
    return result;
}
static v_io_result v_stream_close(v_foreign_handle *h, const char *f, int l, int c) {
    int status;
    (void)f; (void)l; (void)c;
    if (!h || h->owner != &v_stream_owner || h->closed) return v_io_error("invalid or closed stream");
    status = fclose((FILE *)h->pointer);
    h->closed = 1;
    (void)v_foreign_unroot(h);
    --v_stream_count;
    return status ? v_io_error("cannot close stream") : v_io(1, v_text("", 0));
}
typedef struct { v_foreign_handle *handle; v_string error; } v_spawn_result;
#ifdef _WIN32
static void v_fiber_leave(v_fiber *fiber) {
    fiber->roots = v_gc_roots;
    v_gc_roots = v_fiber_host_roots;
#ifdef VELA_DEBUG_INSTRUMENTED
    fiber->debug_frames = v_debug_top;
    v_debug_top = v_fiber_host_frames;
#endif
    SwitchToFiber(v_fiber_host);
}
static VOID WINAPI v_fiber_entry(void *argument) {
    v_fiber *fiber = (v_fiber *)argument;
    (void)((uint8_t (*)(void *))fiber->code)(fiber->environment);
    fiber->done = 1;
    fiber->environment = NULL;
    v_fiber_leave(fiber);
    abort();
}
static void v_fiber_enter(v_fiber *fiber) {
    v_fiber_host_roots = v_gc_roots;
    v_gc_roots = fiber->roots;
#ifdef VELA_DEBUG_INSTRUMENTED
    v_fiber_host_frames = v_debug_top;
    v_debug_top = fiber->debug_frames;
#endif
    v_active_fiber = fiber;
    fiber->started = 1;
    SwitchToFiber(fiber->stack);
    v_active_fiber = NULL;
    v_fiber_host_roots = NULL;
#ifdef VELA_DEBUG_INSTRUMENTED
    v_fiber_host_frames = NULL;
#endif
}
static v_fiber *v_fiber_owned(v_foreign_handle *handle) {
    if (!handle || handle->closed || handle->owner != &v_fiber_owner) return NULL;
    return (v_fiber *)handle->pointer;
}
#endif
static v_spawn_result v_fiber_open(void (*code)(void), void *environment,
        const char *f, int l, int c) {
    v_spawn_result result = {0};
#ifdef _WIN32
    v_fiber *fiber;
    const char *error = "cannot create task stack";
    if (v_active_fiber || v_fiber_count >= 128) {
        error = "nested task launch or task limit exceeded"; goto reject;
    }
    if (!v_fiber_host) {
        if (IsThreadAFiber()) {
            error = "task loop requires ownership of the host thread"; goto reject;
        }
        v_fiber_host = ConvertThreadToFiberEx(NULL, FIBER_FLAG_FLOAT_SWITCH);
        if (!v_fiber_host) goto reject;
    }
    fiber = (v_fiber *)calloc(1, sizeof(*fiber));
    if (!fiber) goto reject;
    fiber->stack = CreateFiberEx(0, 33554432, FIBER_FLAG_FLOAT_SWITCH, v_fiber_entry, fiber);
    if (!fiber->stack) { free(fiber); goto reject; }
    fiber->code = code;
    fiber->environment = environment;
    result.handle = v_foreign_wrap(fiber, &v_fiber_owner, f, l, c);
    result.handle->retained_next = v_foreign_roots;
    v_foreign_roots = result.handle;
    fiber->next = v_fibers;
    v_fibers = fiber;
    ++v_fiber_count;
    return result;
reject:
    result.error = v_text(error, strlen(error));
#else
    (void)code; (void)environment; (void)f; (void)l; (void)c;
    result.error = v_text("typed tasks require Windows", sizeof("typed tasks require Windows") - 1);
#endif
    return result;
}
static void v_fiber_suspend(int64_t delay, const char *f, int l, int c) {
#ifdef _WIN32
    v_fiber *fiber = v_active_fiber;
    if (!fiber) v_panic(f, l, c, "await outside a running task");
    if (delay < 0 || delay > 2147483647) v_panic(f, l, c, "invalid await delay");
    fiber->delay = delay;
    v_fiber_leave(fiber);
#else
    (void)delay; v_panic(f, l, c, "typed tasks require Windows");
#endif
}
static int v_fiber_cancelled(void) {
#ifdef _WIN32
    return v_active_fiber && v_active_fiber->cancelled;
#else
    return 0;
#endif
}
static v_parse_result v_fiber_step(v_foreign_handle *handle) {
#ifdef _WIN32
    v_fiber *fiber = v_fiber_owned(handle);
    v_parse_result result = {1, -1, {0}};
    if (!fiber || v_active_fiber) return v_parse_error("invalid or reentrant task step");
    if (!fiber->done) v_fiber_enter(fiber);
    if (!fiber->done) result.value = fiber->delay;
    return result;
#else
    (void)handle; return v_parse_error("typed tasks require Windows");
#endif
}
static v_io_result v_fiber_cancel(v_foreign_handle *handle, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
#ifdef _WIN32
    v_fiber *fiber = v_fiber_owned(handle);
    if (!fiber || v_active_fiber) return v_io_error("invalid or reentrant task cancellation");
    fiber->cancelled = 1;
    if (!fiber->started) fiber->done = 1;
    if (!fiber->done) v_fiber_enter(fiber);
    if (!fiber->done) return v_io_error("task did not acknowledge cancellation");
    return v_io(1, v_text("", 0));
#else
    (void)handle; return v_io_error("typed tasks require Windows");
#endif
}
static v_io_result v_fiber_close(v_foreign_handle *handle, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
#ifdef _WIN32
    v_fiber *fiber = v_fiber_owned(handle);
    v_fiber **slot = &v_fibers;
    if (!fiber || v_active_fiber || !fiber->done) return v_io_error("task is invalid or still active");
    while (*slot != fiber) slot = &(*slot)->next;
    *slot = fiber->next;
    v_fiber_destroy(fiber);
    handle->pointer = NULL;
    handle->closed = 1;
    (void)v_foreign_unroot(handle);
    --v_fiber_count;
    return v_io(1, v_text("", 0));
#else
    (void)handle; return v_io_error("typed tasks require Windows");
#endif
}
#ifdef _WIN32
static int v_process_text_valid(v_string value) {
    if (!value.length) return 1;
    return value.length <= 32767 && !memchr(value.data, 0, value.length)
        && MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data, (int)value.length, NULL, 0) > 0;
}
static int v_process_path_valid(v_string path) {
    if (!v_process_text_valid(path) || path.length < 3) return 0;
    if (path.data[1] == ':' && (path.data[2] == '/' || path.data[2] == '\\'))
        return (path.data[0] >= 'A' && path.data[0] <= 'Z') ||
            (path.data[0] >= 'a' && path.data[0] <= 'z');
    return path.length >= 5 && path.data[0] == '\\' && path.data[1] == '\\'
        && path.data[2] != '.' && path.data[2] != '?';
}
static int v_process_regular(HANDLE file) {
    BY_HANDLE_FILE_INFORMATION info;
    return file != INVALID_HANDLE_VALUE && GetFileType(file) == FILE_TYPE_DISK
        && GetFileInformationByHandle(file, &info) && !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY);
}
static int v_process_empty(v_child_process *child) {
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
    DWORD exited;
    if (!child->job) return 1;
    if (!QueryInformationJobObject(child->job, JobObjectBasicAccountingInformation,
            &accounting, sizeof(accounting), NULL)) return -1;
    if (accounting.ActiveProcesses != 0) return 0;
    exited = WaitForSingleObject(child->process, 0);
    if (exited == WAIT_OBJECT_0) return 1;
    return exited == WAIT_TIMEOUT ? 0 : -1;
}
static v_child_process *v_process_owned(v_foreign_handle *handle) {
    if (!handle || handle->closed || handle->owner != &v_process_owner) return NULL;
    return (v_child_process *)handle->pointer;
}
static int v_process_launch_cancelled(v_child_process *child) {
    return InterlockedCompareExchange(&child->cancel_launch, 0, 0) != 0;
}
static unsigned __stdcall v_process_launch(void *operation) {
    v_child_process *child = (v_child_process *)operation;
    STARTUPINFOEXW startup = {0};
    PROCESS_INFORMATION process = {0};
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    HANDLE streams[3] = {INVALID_HANDLE_VALUE, INVALID_HANDLE_VALUE, INVALID_HANDLE_VALUE};
    HANDLE executable_file = INVALID_HANDLE_VALUE, job = NULL;
    LPPROC_THREAD_ATTRIBUTE_LIST attrs = NULL;
    SIZE_T attrs_size = 0;
    int attrs_ready = 0, inheritance_locked = 0, i;
    child->error = "cannot start process";
    if (v_process_launch_cancelled(child)) goto done;
    executable_file = CreateFileW(child->executable, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (!v_process_regular(executable_file) || v_process_launch_cancelled(child)) goto done;
    streams[0] = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
    if (v_process_launch_cancelled(child)) goto done;
    streams[1] = CreateFileW(child->output, GENERIC_WRITE, FILE_SHARE_READ, NULL, OPEN_ALWAYS, 0, NULL);
    if (v_process_launch_cancelled(child)) goto done;
    streams[2] = CreateFileW(child->errors, GENERIC_WRITE, FILE_SHARE_READ, NULL, OPEN_ALWAYS, 0, NULL);
    if (streams[0] == INVALID_HANDLE_VALUE || !v_process_regular(streams[1]) || !v_process_regular(streams[2])) {
        child->error = "cannot open distinct process output files"; goto done;
    }
    if (v_process_launch_cancelled(child)) goto done;
    if (!SetEndOfFile(streams[1]) || !SetEndOfFile(streams[2])) goto done;
    InitializeProcThreadAttributeList(NULL, 2, 0, &attrs_size);
    if (!attrs_size) goto done;
    attrs = (LPPROC_THREAD_ATTRIBUTE_LIST)malloc(attrs_size);
    if (!attrs || !InitializeProcThreadAttributeList(attrs, 2, 0, &attrs_size)) goto done;
    attrs_ready = 1;
    if (!UpdateProcThreadAttribute(attrs, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, streams, sizeof(streams), NULL, NULL)) goto done;
    job = CreateJobObjectW(NULL, NULL);
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) goto done;
    if (!UpdateProcThreadAttribute(attrs, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job, sizeof(job), NULL, NULL)) goto done;
    startup.StartupInfo.cb = sizeof(startup);
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = streams[0];
    startup.StartupInfo.hStdOutput = streams[1];
    startup.StartupInfo.hStdError = streams[2];
    startup.lpAttributeList = attrs;
    AcquireSRWLockExclusive(&v_process_inheritance);
    inheritance_locked = 1;
    if (v_process_launch_cancelled(child)) goto done;
    for (i = 0; i < 3; ++i)
        if (!SetHandleInformation(streams[i], HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) goto done;
    if (!CreateProcessW(child->executable, child->command, NULL, NULL, TRUE,
            CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT,
            NULL, child->directory, &startup.StartupInfo, &process)) goto done;
    child->process = process.hProcess;
    child->job = job;
    if (v_process_launch_cancelled(child) || ResumeThread(process.hThread) == (DWORD)-1)
        TerminateJobObject(job, 124);
    else
        child->error = NULL;
done:
    if (process.hThread) CloseHandle(process.hThread);
    for (i = 0; i < 3; ++i) if (streams[i] != INVALID_HANDLE_VALUE) CloseHandle(streams[i]);
    if (inheritance_locked) ReleaseSRWLockExclusive(&v_process_inheritance);
    if (executable_file != INVALID_HANDLE_VALUE) CloseHandle(executable_file);
    if (attrs_ready) DeleteProcThreadAttributeList(attrs);
    free(attrs);
    if (job && !child->job) CloseHandle(job);
    if (v_process_launch_cancelled(child) && child->error) child->error = "process launch cancelled";
    return 0;
}
static wchar_t *v_process_copy(const wchar_t *text) {
    size_t bytes = (wcslen(text) + 1) * sizeof(wchar_t);
    wchar_t *copy = (wchar_t *)malloc(bytes);
    if (copy) memcpy(copy, text, bytes);
    return copy;
}
#endif
static v_spawn_result v_process_spawn(v_string_list *args, v_string cwd, v_string out, v_string err,
        const char *f, int l, int c) {
    v_spawn_result result = {0};
#ifdef _WIN32
    const char *error;
    v_child_process *child;
    size_t length = 0;
    int64_t i;
    if (v_process_count >= 128) {
        error = "too many live processes"; goto rejected;
    }
    if (args->length < 1 || args->length > 1024 || !v_process_path_valid(args->data[0])
            || !v_process_path_valid(cwd) || !v_process_path_valid(out) || !v_process_path_valid(err)) {
        error = "process requires absolute paths and a nonempty argument list"; goto rejected;
    }
    if (v_string_eq(out, err)) { error = "process output files must differ"; goto rejected; }
    for (i = 0; i < args->length; ++i) {
        v_string arg = args->data[i];
        if (!v_process_text_valid(arg) || arg.length > 32767 - length) {
            error = "invalid or oversized process arguments"; goto rejected;
        }
        length += arg.length;
    }
    child = (v_child_process *)calloc(1, sizeof(*child));
    if (!child) { error = "cannot allocate process launch"; goto rejected; }
    child->executable = v_process_copy(v_wide(args->data[0], f, l, c));
    child->command = v_process_copy(v_process_command(args, f, l, c));
    child->directory = v_process_copy(v_wide(cwd, f, l, c));
    child->output = v_process_copy(v_wide(out, f, l, c));
    child->errors = v_process_copy(v_wide(err, f, l, c));
    if (!child->executable || !child->command || !child->directory || !child->output || !child->errors) {
        v_process_destroy(child); error = "cannot copy process launch arguments"; goto rejected;
    }
    result.handle = v_foreign_wrap(child, &v_process_owner, f, l, c);
    child->launcher = (HANDLE)_beginthreadex(NULL, 262144, v_process_launch, child,
        STACK_SIZE_PARAM_IS_A_RESERVATION, NULL);
    if (!child->launcher) {
        v_process_destroy(child); result.handle = NULL;
        error = "cannot create process launch worker"; goto rejected;
    }
    result.handle->retained_next = v_foreign_roots;
    v_foreign_roots = result.handle;
    ++v_process_count;
    return result;
rejected:
    result.error = v_text(error, strlen(error));
#else
    (void)args; (void)cwd; (void)out; (void)err; (void)f; (void)l; (void)c;
    result.error = v_text("process_spawn requires Windows", sizeof("process_spawn requires Windows") - 1);
#endif
    return result;
}
static v_parse_result v_process_poll(v_foreign_handle *handle) {
#ifdef _WIN32
    v_child_process *child = v_process_owned(handle);
    v_parse_result result = {1, -1, {0}};
    DWORD code;
    DWORD launch;
    int empty;
    if (!child) return v_parse_error("invalid or closed process");
    launch = WaitForSingleObject(child->launcher, 0);
    if (launch == WAIT_TIMEOUT) return result;
    if (launch != WAIT_OBJECT_0) return v_parse_error("cannot observe process launch");
    if (child->error) return v_parse_error(child->error);
    empty = v_process_empty(child);
    if (empty < 0) return v_parse_error("cannot query process job");
    if (!empty) return result;
    if (!GetExitCodeProcess(child->process, &code)) return v_parse_error("cannot read process exit code");
    result.value = (int64_t)code;
    return result;
#else
    (void)handle; return v_parse_error("process_poll requires Windows");
#endif
}
static v_io_result v_process_cancel(v_foreign_handle *handle, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
#ifdef _WIN32
    v_child_process *child = v_process_owned(handle);
    DWORD launch;
    if (!child) return v_io_error("invalid or closed process");
    InterlockedExchange(&child->cancel_launch, 1);
    launch = WaitForSingleObject(child->launcher, 0);
    if (launch == WAIT_TIMEOUT) {
        CancelSynchronousIo(child->launcher);
        return v_io(1, v_text("", 0));
    }
    if (launch != WAIT_OBJECT_0) return v_io_error("cannot observe process launch");
    if (!child->cancelling && v_process_empty(child) != 1) {
        if (!TerminateJobObject(child->job, 124) && v_process_empty(child) != 1)
            return v_io_error("cannot terminate process job");
        child->cancelling = 1;
    }
    return v_io(1, v_text("", 0));
#else
    (void)handle; return v_io_error("process_cancel requires Windows");
#endif
}
static v_io_result v_process_close(v_foreign_handle *handle, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
#ifdef _WIN32
    v_child_process *child = v_process_owned(handle);
    if (!child) return v_io_error("invalid or closed process");
    if (WaitForSingleObject(child->launcher, 0) != WAIT_OBJECT_0)
        return v_io_error("process launch is still in progress");
    if (v_process_empty(child) != 1) return v_io_error("process job has not drained");
    v_process_destroy(child);
    handle->closed = 1;
    handle->pointer = NULL;
    (void)v_foreign_unroot(handle);
    --v_process_count;
    return v_io(1, v_text("", 0));
#else
    (void)handle; return v_io_error("process_close requires Windows");
#endif
}
static v_parse_result v_monotonic_millis(void) {
    v_parse_result result = {1, 0, {0}};
#ifdef _WIN32
    ULONGLONG milliseconds = GetTickCount64();
    if (milliseconds > INT64_MAX) return v_parse_error("monotonic clock out of range");
    result.value = (int64_t)milliseconds;
#else
    struct timespec time;
    if (clock_gettime(CLOCK_MONOTONIC, &time)) return v_parse_error("cannot read monotonic clock");
    if (time.tv_sec < 0 || (uint64_t)time.tv_sec > (INT64_MAX - 999) / 1000)
        return v_parse_error("monotonic clock out of range");
    result.value = (int64_t)time.tv_sec * 1000 + time.tv_nsec / 1000000;
#endif
    return result;
}
#ifdef VELA_DEBUG_INSTRUMENTED
static uint64_t v_debug_now(void) {
#ifdef _WIN32
    static LARGE_INTEGER frequency;
    LARGE_INTEGER now;
    long double micros;
    if (!frequency.QuadPart && !QueryPerformanceFrequency(&frequency)) return 0;
    if (!QueryPerformanceCounter(&now) || now.QuadPart < 0) return 0;
    micros = (long double)now.QuadPart * 1000000.0L / (long double)frequency.QuadPart;
    return micros >= (long double)UINT64_MAX ? UINT64_MAX : (uint64_t)micros;
#else
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) || now.tv_sec < 0
            || (uint64_t)now.tv_sec >= UINT64_MAX / 1000000) return 0;
    return (uint64_t)now.tv_sec * 1000000 + (uint64_t)now.tv_nsec / 1000;
#endif
}
#endif
static v_parse_result v_clock_millis(void) {
    v_parse_result result = {1, 0, {0}};
#ifdef _WIN32
    FILETIME time;
    uint64_t ticks;
    GetSystemTimeAsFileTime(&time);
    ticks = ((uint64_t)time.dwHighDateTime << 32) | time.dwLowDateTime;
    result.value = (int64_t)(ticks / 10000) - INT64_C(11644473600000);
#else
    struct timespec time;
    int64_t seconds;
    if (clock_gettime(CLOCK_REALTIME, &time)) return v_parse_error("cannot read wall clock");
    seconds = (int64_t)time.tv_sec;
    if (seconds < INT64_MIN / 1000 || seconds > (INT64_MAX - 999) / 1000)
        return v_parse_error("wall clock out of range");
    result.value = seconds * 1000 + time.tv_nsec / 1000000;
#endif
    return result;
}
static v_io_result v_host_sleep(int64_t ms, const char *f, int l, int c) {
    (void)f; (void)l; (void)c;
    if (ms < 0 || ms > 1000) return v_io_error("host_sleep requires 0..1000 ms");
#ifdef _WIN32
    Sleep((DWORD)ms);
#else
    struct timespec delay = { (time_t)(ms / 1000), (long)((ms % 1000) * 1000000) };
    while (nanosleep(&delay, &delay)) {
        if (errno != EINTR) return v_io_error("cannot wait on host clock");
    }
#endif
    return v_io(1, v_text("", 0));
}
static v_parse_result v_entropy_u32(void) {
    uint32_t value;
    v_parse_result result = {1, 0, {0}};
#ifdef _WIN32
    typedef LONG (WINAPI *v_random_bytes)(void *, unsigned char *, ULONG, ULONG);
    HMODULE module = LoadLibraryExW(L"bcrypt.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    v_random_bytes random;
    LONG status;
    if (!module) return v_parse_error("cannot load system entropy provider");
    random = (v_random_bytes)GetProcAddress(module, "BCryptGenRandom");
    status = random ? random(NULL, (unsigned char *)&value, sizeof(value), 2) : -1;
    FreeLibrary(module);
    if (status < 0) return v_parse_error("cannot read system entropy");
#else
    FILE *file = fopen("/dev/urandom", "rb");
    size_t count;
    int status;
    if (!file) return v_parse_error("cannot open system entropy provider");
    count = fread(&value, 1, sizeof(value), file);
    status = fclose(file);
    if (status || count != sizeof(value)) return v_parse_error("cannot read system entropy");
#endif
    result.value = (int64_t)value;
    return result;
}
static v_parse_result v_int32_from_int(int64_t value, const char *f, int l, int c) {
    v_parse_result r; (void)f; (void)l; (void)c;
    if (value < INT32_MIN || value > INT32_MAX) return v_parse_error("Int32 value out of range");
    r.ok = 1; r.value = value; r.error = v_text("",0); return r;
}
static int64_t v_int32_to_int(int32_t value) { return (int64_t)value; }
