#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <curl/curl.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include "pool.h"

enum {
    VH_SLOT_MAX = 128, VH_HEADER_MAX = 64 * 1024, VH_UPLOAD_MAX = 1024 * 1024,
    VH_CA_MAX = 1024 * 1024, VH_BODY_MAX = 16 * 1024 * 1024,
    VH_POOL_BODY_MAX = 64 * 1024 * 1024
};
typedef struct {
    unsigned char *bytes;
    size_t length, capacity, limit;
} vh_buffer;
struct vh_pool {
    CURLM *multi;
    vh_request *first;
    unsigned connections, per_origin, idle_seconds;
    unsigned live, slots;
    size_t reserved_body;
    unsigned char *ca;
    size_t ca_size;
    uint64_t idle_since;
#ifdef VELA_HTTP_TEST_FAULTS
    vh_outcome test_failure;
    const char *test_dns;
    int test_send_buffer;
#endif
};
struct vh_request {
    vh_pool *owner;
    vh_request *next;
    CURL *easy;
    struct curl_slist *sent_headers;
    unsigned char *upload;
    vh_buffer headers, body;
    uint64_t deadline;
    long budget_ms;
    CURLINFO connection_time;
    vh_outcome outcome, callback_error;
    long status;
    int code;
    int cancelled;
    int shorter_connect_budget;
    char error[CURL_ERROR_SIZE];
};

const char *vh_version(void) { return curl_version(); }
int vh_supported(void) {
    const curl_version_info_data *v = curl_version_info(CURLVERSION_NOW);
    return v && v->version_num == 0x081700 && (v->features & CURL_VERSION_ASYNCHDNS)
        && v->ares && !strcmp(v->ares, "1.34.8") && v->ssl_version
        && !strcmp(v->ssl_version, "OpenSSL/3.5.9");
}
uint64_t vh_now(void) { return (uint64_t)GetTickCount64(); }

static CURLM *new_multi(const vh_pool *pool) {
    CURLM *m = curl_multi_init();
    if (!m) return NULL;
    if (curl_multi_setopt(m, CURLMOPT_MAX_TOTAL_CONNECTIONS, (long)pool->connections) != CURLM_OK
        || curl_multi_setopt(m, CURLMOPT_MAX_HOST_CONNECTIONS, (long)pool->per_origin) != CURLM_OK
        || curl_multi_setopt(m, CURLMOPT_MAXCONNECTS, (long)pool->connections) != CURLM_OK
        || curl_multi_setopt(m, CURLMOPT_PIPELINING, CURLPIPE_NOTHING) != CURLM_OK) {
        curl_multi_cleanup(m);
        return NULL;
    }
    return m;
}
vh_pool *vh_open(vh_settings s) {
    vh_pool *pool;
    if (!s.connections || s.connections > 16 || !s.per_origin || s.per_origin > s.connections
        || !s.idle_seconds || s.idle_seconds > 3600 || s.ca_size > VH_CA_MAX || (s.ca_size && !s.ca)) return NULL;
    if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK) return NULL;
    if (!vh_supported()) { curl_global_cleanup(); return NULL; }
    pool = calloc(1, sizeof(*pool));
    if (!pool) { curl_global_cleanup(); return NULL; }
    pool->connections = s.connections;
    pool->per_origin = s.per_origin;
    pool->idle_seconds = s.idle_seconds;
    if (s.ca_size) {
        pool->ca = malloc(s.ca_size);
        if (!pool->ca) { vh_close(&pool); return NULL; }
        memcpy(pool->ca, s.ca, s.ca_size);
        pool->ca_size = s.ca_size;
    }
    pool->multi = new_multi(pool);
    if (!pool->multi) { vh_close(&pool); return NULL; }
    return pool;
}

static void clear_buffer(vh_buffer *buffer) {
    free(buffer->bytes);
    buffer->bytes = NULL;
    buffer->length = 0;
    buffer->capacity = 0;
}
static size_t receive(vh_request *r, vh_buffer *buffer, const char *input, size_t size, size_t count) {
    size_t n, needed, next;
    unsigned char *replacement;
    if (size && count > SIZE_MAX / size) { r->callback_error = VH_LIMIT; return 0; }
    n = size * count;
    if (n > buffer->limit - buffer->length) { r->callback_error = VH_LIMIT; return 0; }
    if (!n) return 0;
    needed = buffer->length + n;
    if (needed > buffer->capacity) {
#ifdef VELA_HTTP_TEST_FAULTS
        if (r->owner->test_failure == VH_STORAGE) {
            r->owner->test_failure = VH_PENDING;
            r->callback_error = VH_STORAGE;
            return 0;
        }
#endif
        next = buffer->capacity ? buffer->capacity : 4096;
        while (next < needed) next *= 2;
        if (next > buffer->limit) next = buffer->limit;
        replacement = realloc(buffer->bytes, next);
        if (!replacement) { r->callback_error = VH_STORAGE; return 0; }
        buffer->bytes = replacement;
        buffer->capacity = next;
    }
    memcpy(buffer->bytes + buffer->length, input, n);
    buffer->length += n;
    return n;
}
static size_t body_callback(char *data, size_t size, size_t count, void *context) {
    vh_request *r = context;
    return receive(r, &r->body, data, size, count);
}
static size_t header_callback(char *data, size_t size, size_t count, void *context) {
    vh_request *r = context;
    return receive(r, &r->headers, data, size, count);
}
static int request_headers(vh_request *r, const char *headers) {
    const char *start = headers;
    size_t left = strlen(headers);
    char *line;
    if (left > VH_HEADER_MAX) return 0;
    if (!left) return 1;
    line = malloc(left + 1);
    if (!line) return 0;
    while (left) {
        const char *end = memchr(start, '\n', left);
        const size_t bytes = end ? (size_t)(end - start) : left;
        struct curl_slist *next;
        if (!bytes || memchr(start, '\r', bytes)) { free(line); return 0; }
        memcpy(line, start, bytes);
        line[bytes] = 0;
        next = curl_slist_append(r->sent_headers, line);
        if (!next) { free(line); return 0; }
        r->sent_headers = next;
        if (!end) break;
        start = end + 1;
        left -= bytes + 1;
    }
    free(line);
    return 1;
}
static void free_easy(vh_request *r) {
    if (r->easy) { curl_easy_cleanup(r->easy); r->easy = NULL; }
    curl_slist_free_all(r->sent_headers);
    r->sent_headers = NULL;
    free(r->upload);
    r->upload = NULL;
}
#ifdef VELA_HTTP_TEST_FAULTS
static int test_socket(void *context, curl_socket_t socket, curlsocktype purpose) {
    vh_pool *pool = context;
    (void)purpose;
    return setsockopt(socket, SOL_SOCKET, SO_SNDBUF, (const char *)&pool->test_send_buffer,
                      (int)sizeof(pool->test_send_buffer)) == 0 ? CURL_SOCKOPT_OK : CURL_SOCKOPT_ERROR;
}
#endif
static int configure(vh_request *r, const vh_input *input, long budget) {
    CURL *easy = r->easy;
    long connect = input->connect_ms < (unsigned)budget ? (long)input->connect_ms : budget;
    struct curl_blob ca = { r->owner->ca, r->owner->ca_size, CURL_BLOB_COPY };
#define VH_SET(option, value) if (curl_easy_setopt(easy, (option), (value)) != CURLE_OK) return 0
    VH_SET(CURLOPT_URL, input->url);
    VH_SET(CURLOPT_PROTOCOLS_STR, "http,https");
    VH_SET(CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    VH_SET(CURLOPT_FOLLOWLOCATION, 0L);
    VH_SET(CURLOPT_NOSIGNAL, 1L);
    VH_SET(CURLOPT_TIMEOUT_MS, budget);
    VH_SET(CURLOPT_CONNECTTIMEOUT_MS, connect);
    VH_SET(CURLOPT_MAXAGE_CONN, (long)r->owner->idle_seconds);
    VH_SET(CURLOPT_SSL_VERIFYPEER, 1L);
    VH_SET(CURLOPT_SSL_VERIFYHOST, 2L);
    VH_SET(CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_2);
    VH_SET(CURLOPT_CAINFO, (const char *)NULL);
    VH_SET(CURLOPT_CAPATH, (const char *)NULL);
    if (ca.len) {
        VH_SET(CURLOPT_SSL_OPTIONS, CURLSSLOPT_NO_PARTIALCHAIN);
        VH_SET(CURLOPT_CAINFO_BLOB, &ca);
    } else {
        VH_SET(CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    VH_SET(CURLOPT_PRIVATE, r);
    VH_SET(CURLOPT_ERRORBUFFER, r->error);
    VH_SET(CURLOPT_WRITEFUNCTION, body_callback);
    VH_SET(CURLOPT_WRITEDATA, r);
    VH_SET(CURLOPT_HEADERFUNCTION, header_callback);
    VH_SET(CURLOPT_HEADERDATA, r);
#ifdef VELA_HTTP_TEST_FAULTS
    if (r->owner->test_dns) { VH_SET(CURLOPT_DNS_SERVERS, r->owner->test_dns); }
    if (r->owner->test_send_buffer) {
        VH_SET(CURLOPT_SOCKOPTFUNCTION, test_socket);
        VH_SET(CURLOPT_SOCKOPTDATA, r->owner);
    }
#endif
    // libcurl can replay a transfer on a reused HTTP/1.1 socket with no reply.
    if (r->sent_headers || (input->method != VH_GET && input->method != VH_HEAD)) {
        VH_SET(CURLOPT_FRESH_CONNECT, 1L);
    }
    if (r->sent_headers) {
        VH_SET(CURLOPT_HTTPHEADER, r->sent_headers);
        VH_SET(CURLOPT_FORBID_REUSE, 1L);
        VH_SET(CURLOPT_SSL_SESSIONID_CACHE, 0L);
    }
    if (input->method == VH_HEAD) {
        VH_SET(CURLOPT_NOBODY, 1L);
    } else if (input->method == VH_POST || input->method == VH_PUT || (input->method == VH_DELETE && input->upload_size)) {
        VH_SET(CURLOPT_POSTFIELDSIZE_LARGE, (curl_off_t)input->upload_size);
        VH_SET(CURLOPT_POSTFIELDS, r->upload ? (const char *)r->upload : "");
        if (input->method == VH_PUT) { VH_SET(CURLOPT_CUSTOMREQUEST, "PUT"); }
        if (input->method == VH_DELETE) { VH_SET(CURLOPT_CUSTOMREQUEST, "DELETE"); }
    } else if (input->method == VH_DELETE) {
        VH_SET(CURLOPT_CUSTOMREQUEST, "DELETE");
    }
#undef VH_SET
    return 1;
}

vh_request *vh_start(vh_pool *pool, const vh_input *input, vh_outcome *failure) {
    vh_request *r;
    uint64_t now = vh_now(), remaining;
    long budget;
    *failure = VH_DRIVER;
    if (!pool || !pool->multi || !input || !input->url || !input->connect_ms
        || input->method < VH_GET || input->method > VH_DELETE) return NULL;
    if (input->deadline_ms <= now) { *failure = VH_TIMEOUT; return NULL; }
    if (pool->slots == VH_SLOT_MAX || input->body_limit > VH_BODY_MAX
        || input->body_limit > VH_POOL_BODY_MAX - pool->reserved_body
        || input->upload_size > VH_UPLOAD_MAX) { *failure = VH_LIMIT; return NULL; }
    if (input->upload_size && (!input->upload || (input->method != VH_POST && input->method != VH_PUT && input->method != VH_DELETE))) return NULL;
    remaining = input->deadline_ms - now;
    budget = remaining > LONG_MAX ? LONG_MAX : (long)remaining;
    r = calloc(1, sizeof(*r));
    if (!r) { *failure = VH_STORAGE; return NULL; }
    r->owner = pool;
    r->deadline = input->deadline_ms;
    r->budget_ms = budget;
    r->shorter_connect_budget = input->connect_ms < (unsigned long)budget;
    r->connection_time = !_strnicmp(input->url, "https://", 8)
        ? CURLINFO_APPCONNECT_TIME_T : CURLINFO_CONNECT_TIME_T;
    r->headers.limit = VH_HEADER_MAX;
    r->body.limit = input->body_limit;
    r->easy = curl_easy_init();
    if (!r->easy) goto storage;
    if (input->upload_size) {
        r->upload = malloc(input->upload_size);
        if (!r->upload) goto storage;
        memcpy(r->upload, input->upload, input->upload_size);
    }
    if (input->headers && !request_headers(r, input->headers)) goto storage;
    if (!configure(r, input, budget) || curl_multi_add_handle(pool->multi, r->easy) != CURLM_OK) goto failed;
    r->next = pool->first;
    pool->first = r;
    pool->slots++;
    pool->live++;
    pool->reserved_body += input->body_limit;
    pool->idle_since = 0;
    return r;
storage:
    *failure = VH_STORAGE;
failed:
    free_easy(r);
    free(r);
    return NULL;
}

static void settle(vh_request *r, vh_outcome outcome, CURLcode code) {
    vh_pool *pool = r->owner;
    free_easy(r);
    if (outcome != VH_OK) {
        clear_buffer(&r->headers);
        clear_buffer(&r->body);
        r->status = 0;
    }
    r->code = (int)code;
    r->outcome = outcome;
    if (!--pool->live) pool->idle_since = vh_now();
}
static int fail_driver(vh_pool *pool) {
    vh_request *r;
    // The pinned libcurl detaches any remaining easy handles during cleanup.
    // Keep ownership if the driver cannot confirm detachment.
    if (curl_multi_cleanup(pool->multi) != CURLM_OK) return 0;
    pool->multi = NULL;
    for (r = pool->first; r; r = r->next)
        if (r->outcome == VH_PENDING) settle(r, VH_DRIVER, CURLE_FAILED_INIT);
    return 0;
}
static int finish(vh_request *r, vh_outcome outcome, CURLcode code) {
    vh_pool *pool = r->owner;
    if (outcome == VH_OK && curl_easy_getinfo(r->easy, CURLINFO_RESPONSE_CODE, &r->status) != CURLE_OK) outcome = VH_DRIVER;
    if (curl_multi_remove_handle(pool->multi, r->easy) != CURLM_OK) return fail_driver(pool);
    settle(r, outcome, code);
    return 1;
}
int vh_cancel(vh_request *r) {
    if (!r || r->outcome != VH_PENDING || r->cancelled) return 0;
    r->cancelled = 1;
    return 1;
}
static vh_outcome timeout_outcome(const vh_request *r) {
    curl_off_t connected = 0, elapsed = 0;
    if (!r->shorter_connect_budget
        || curl_easy_getinfo(r->easy, r->connection_time, &connected) != CURLE_OK
        || connected > 0
        || curl_easy_getinfo(r->easy, CURLINFO_TOTAL_TIME_T, &elapsed) != CURLE_OK
        || elapsed >= (curl_off_t)r->budget_ms * 1000) return VH_TIMEOUT;
    return VH_CONNECT_TIMEOUT;
}
int vh_tick(vh_pool *pool) {
    int running, messages;
    uint64_t now = vh_now();
    CURLMsg *message;
    vh_request *r;
    if (!pool || !pool->multi) return 0;
    for (r = pool->first; r; r = r->next) {
        if (r->outcome != VH_PENDING) continue;
        if (r->cancelled) {
            if (!finish(r, VH_CANCELLED, CURLE_ABORTED_BY_CALLBACK)) return 0;
        } else if (r->deadline <= now) {
            if (!finish(r, VH_TIMEOUT, CURLE_OPERATION_TIMEDOUT)) return 0;
        }
    }
    if (!pool->live) {
        if (pool->idle_since && now >= pool->idle_since && now - pool->idle_since >= (uint64_t)pool->idle_seconds * 1000) {
            CURLM *next = new_multi(pool);
            if (!next) return 0;
            if (curl_multi_cleanup(pool->multi) != CURLM_OK) {
                curl_multi_cleanup(next);
                return 0;
            }
            pool->multi = next;
            pool->idle_since = 0;
        }
        return 1;
    }
#ifdef VELA_HTTP_TEST_FAULTS
    if (pool->test_failure == VH_DRIVER) return fail_driver(pool);
#endif
    if (curl_multi_perform(pool->multi, &running) != CURLM_OK) return fail_driver(pool);
    now = vh_now();
    while ((message = curl_multi_info_read(pool->multi, &messages)) != NULL) {
        char *context = NULL;
        CURLcode code;
        vh_outcome outcome;
        if (message->msg != CURLMSG_DONE) continue;
        code = message->data.result;
        if (curl_easy_getinfo(message->easy_handle, CURLINFO_PRIVATE, &context) != CURLE_OK || !context) return fail_driver(pool);
        r = (vh_request *)context;
        if (r->deadline <= now) outcome = VH_TIMEOUT;
        else if (r->callback_error != VH_PENDING) outcome = r->callback_error;
        else if (code == CURLE_OK) outcome = VH_OK;
        else if (code == CURLE_OPERATION_TIMEDOUT) outcome = timeout_outcome(r);
        else outcome = VH_TRANSFER;
        if (!finish(r, outcome, code)) return 0;
    }
    return 1;
}
int vh_wait(vh_pool *pool, int milliseconds) {
    if (!pool || !pool->multi || milliseconds < 1 || milliseconds > 10) return 0;
    if (!pool->live) {
        Sleep((DWORD)milliseconds);
        return 1;
    }
    return curl_multi_poll(pool->multi, NULL, 0, milliseconds, NULL) == CURLM_OK;
}
vh_result vh_read(const vh_request *r) {
    vh_result value = { VH_DRIVER, 0, 0, "", NULL, 0, NULL, 0 };
    if (!r) return value;
    value.outcome = r->outcome;
    value.status = r->status;
    value.transport_code = r->code;
    value.message = r->error[0] ? r->error : curl_easy_strerror((CURLcode)r->code);
    if (r->outcome == VH_OK) {
        value.headers = r->headers.bytes;
        value.headers_size = r->headers.length;
        value.body = r->body.bytes;
        value.body_size = r->body.length;
    }
    return value;
}
vh_counts vh_stats(const vh_pool *pool) {
    vh_counts out = { pool->live, pool->slots, pool->reserved_body };
    return out;
}
int vh_release(vh_request *r) {
    vh_pool *pool;
    vh_request **link;
    if (!r || r->outcome == VH_PENDING) return 0;
    pool = r->owner;
    link = &pool->first;
    while (*link != r) link = &(*link)->next;
    *link = r->next;
    pool->slots--;
    pool->reserved_body -= r->body.limit;
    clear_buffer(&r->headers);
    clear_buffer(&r->body);
    free(r);
    return 1;
}
int vh_close(vh_pool **owner) {
    vh_pool *pool;
    if (!owner || !*owner) return 1;
    pool = *owner;
    if (pool->multi && curl_multi_cleanup(pool->multi) != CURLM_OK) return 0;
    pool->multi = NULL;
    while (pool->first) {
        vh_request *r = pool->first;
        if (r->outcome == VH_PENDING) settle(r, VH_CANCELLED, CURLE_ABORTED_BY_CALLBACK);
        vh_release(r);
    }
    free(pool->ca);
    free(pool);
    *owner = NULL;
    curl_global_cleanup();
    return 1;
}

#ifdef VELA_HTTP_TEST_FAULTS
void vh_test_failure(vh_pool *owner, vh_outcome failure) { owner->test_failure = failure; }
void vh_test_network(vh_pool *owner, const char *dns, int send_buffer) {
    owner->test_dns = dns;
    owner->test_send_buffer = send_buffer;
}
#endif
