#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "pool.h"

#define CHECK(expr) do { if (!(expr)) { fprintf(stderr, "line %d: %s\n", __LINE__, #expr); exit(1); } } while (0)

static vh_pool *owner(unsigned max, unsigned per_origin, unsigned idle, const unsigned char *ca, size_t size) {
    vh_settings settings = { max, per_origin, idle, ca, size };
    vh_pool *pool = vh_open(settings);
    CHECK(pool != NULL);
    return pool;
}
static vh_request *start(vh_pool *pool, const char *base, const char *path, unsigned timeout,
                         size_t limit, const char *headers) {
    char url[512];
    vh_outcome error;
    vh_request *request;
    vh_input input = { url, VH_GET, headers, NULL, 0, limit, vh_now() + timeout, 1500 };
    int written = snprintf(url, sizeof(url), "%s%s", base, path);
    CHECK(written > 0 && (size_t)written < sizeof(url));
    request = vh_start(pool, &input, &error);
    if (!request) fprintf(stderr, "start failure %d: %s\n", (int)error, url);
    CHECK(request != NULL);
    return request;
}
static vh_result wait_result(vh_pool *pool, vh_request *request) {
    const uint64_t end = vh_now() + 10000;
    vh_result result;
    do {
        CHECK(vh_tick(pool));
        result = vh_read(request);
        if (result.outcome != VH_PENDING) return result;
        CHECK(vh_now() < end);
        Sleep(1);
    } while (1);
}
static void expect(vh_pool *pool, vh_request *request, vh_outcome wanted, long status, size_t bytes) {
    vh_result result = wait_result(pool, request);
    if (result.outcome != wanted) {
        fprintf(stderr, "wanted %d, got %d, libcurl code %d, HTTP %ld: %s\n",
                (int)wanted, (int)result.outcome, result.transport_code, result.status, result.message);
    }
    CHECK(result.outcome == wanted && result.status == status && result.body_size == bytes);
    if (wanted != VH_OK) CHECK(!result.body && !result.headers && !result.headers_size);
    CHECK(vh_read(request).outcome == wanted);
    CHECK(!vh_cancel(request));
    CHECK(vh_release(request));
}
static void empty(const vh_pool *pool) {
    const vh_counts s = vh_stats(pool);
    CHECK(!s.live && !s.slots && !s.reserved_body);
}
static unsigned char *read_ca(const char *path, size_t *size) {
    FILE *f = NULL;
    unsigned char *data;
    long count;
    CHECK(fopen_s(&f, path, "rb") == 0 && f);
    CHECK(fseek(f, 0, SEEK_END) == 0);
    count = ftell(f);
    CHECK(count > 0 && count <= 1024 * 1024);
    CHECK(fseek(f, 0, SEEK_SET) == 0);
    *size = (size_t)count;
    data = malloc(*size);
    CHECK(data && fread(data, 1, *size, f) == *size && fclose(f) == 0);
    return data;
}
static void ten(vh_pool *pool, const char *base) {
    for (int i = 0; i < 10; i++) {
        vh_request *request = start(pool, base, "/reuse", 3000, 64, NULL);
        vh_result result;
        CHECK(!vh_release(request));
        result = wait_result(pool, request);
        CHECK(result.outcome == VH_OK && result.status == 200 && result.body_size == 64 && result.headers_size > 0);
        for (size_t j = 0; j < result.body_size; j++) CHECK(result.body[j] == 'x');
        CHECK(vh_release(request));
    }
    empty(pool);
}
static void reuse(const char *base) {
    vh_pool *pool = owner(2, 1, 1, NULL, 0);
    ten(pool, base);
    Sleep(1200);
    CHECK(vh_tick(pool));
    expect(pool, start(pool, base, "/after-idle", 3000, 64, NULL), VH_OK, 200, 64);
    expect(pool, start(pool, base, "/auth", 3000, 64, "Authorization: Basic alpha"), VH_OK, 200, 64);
    expect(pool, start(pool, base, "/auth", 3000, 64, "Authorization: Basic beta"), VH_OK, 200, 64);
    expect(pool, start(pool, base, "/body-limit", 3000, 63, NULL), VH_LIMIT, 0, 0);
    expect(pool, start(pool, base, "/redirect", 3000, 64, NULL), VH_OK, 302, 64);
    empty(pool);
    CHECK(vh_close(&pool));
    CHECK(vh_close(&pool));
}
static void limits(const char *first, const char *other) {
    vh_pool *pool = owner(2, 1, 30, NULL, 0);
    vh_request *requests[5];
    for (unsigned i = 0; i < 5; i++) requests[i] = start(pool, i < 3 ? first : other, "/bound", 3000, 64, NULL);
    CHECK(vh_stats(pool).slots == 5);
    for (unsigned i = 0; i < 5; i++) expect(pool, requests[i], VH_OK, 200, 64);
    empty(pool);
    CHECK(vh_close(&pool));
}
static void reservation_limits(const char *base) {
    vh_pool *pool = owner(1, 1, 30, NULL, 0);
    vh_request *held[128];
    vh_input overflow = { base, VH_GET, NULL, NULL, 0, 1, vh_now() + 5000, 1500 };
    vh_outcome failure;
    for (unsigned i = 0; i < 4; i++) held[i] = start(pool, base, "/reserve-must-not-start", 3000, 16 * 1024 * 1024, NULL);
    CHECK(vh_stats(pool).reserved_body == 64 * 1024 * 1024);
    CHECK(!vh_start(pool, &overflow, &failure) && failure == VH_LIMIT);
    for (unsigned i = 0; i < 4; i++) CHECK(vh_cancel(held[i]));
    for (unsigned i = 0; i < 4; i++) expect(pool, held[i], VH_CANCELLED, 0, 0);
    empty(pool);
    for (unsigned i = 0; i < 128; i++) held[i] = start(pool, base, "/reserve-must-not-start", 3000, 0, NULL);
    CHECK(vh_stats(pool).slots == 128);
    CHECK(!vh_start(pool, &overflow, &failure) && failure == VH_LIMIT);
    for (unsigned i = 0; i < 128; i++) CHECK(vh_cancel(held[i]));
    for (unsigned i = 0; i < 128; i++) expect(pool, held[i], VH_CANCELLED, 0, 0);
    empty(pool);
    CHECK(vh_close(&pool));
}
static void cancellation(const char *first, const char *other, const char *closed) {
    vh_pool *pool = owner(2, 1, 30, NULL, 0);
    vh_request *slow = start(pool, first, "/cancel", 3000, 64, NULL);
    vh_request *peer = start(pool, other, "/peer", 3000, 64, NULL);
    vh_request *queued, *simultaneous;
    uint64_t started, duration;
    CHECK(vh_tick(pool));
    Sleep(40);
    CHECK(vh_tick(pool));
    started = vh_now();
    queued = start(pool, first, "/queue-must-not-start", 70, 64, NULL);
    expect(pool, queued, VH_TIMEOUT, 0, 0);
    duration = vh_now() - started;
    CHECK(duration >= 70 && duration <= 120);
    CHECK(vh_cancel(slow) && !vh_cancel(slow));
    expect(pool, slow, VH_CANCELLED, 0, 0);
    expect(pool, peer, VH_OK, 200, 64);
    simultaneous = start(pool, first, "/race-must-not-start", 70, 64, NULL);
    Sleep(90);
    CHECK(vh_cancel(simultaneous));
    expect(pool, simultaneous, VH_CANCELLED, 0, 0);
    simultaneous = start(pool, first, "/deadline-beats-response", 170, 64, NULL);
    CHECK(vh_tick(pool));
    Sleep(30);
    CHECK(vh_tick(pool));
    CHECK(vh_read(simultaneous).outcome == VH_PENDING);
    Sleep(160);
    expect(pool, simultaneous, VH_TIMEOUT, 0, 0);
    expect(pool, start(pool, closed, "/refused", 3000, 64, NULL), VH_TRANSFER, 0, 0);
    expect(pool, start(pool, first, "/after-cancel", 3000, 64, NULL), VH_OK, 200, 64);
    empty(pool);
    CHECK(start(pool, first, "/close-active", 3000, 64, NULL) != NULL);
    CHECK(vh_tick(pool));
    Sleep(30);
    CHECK(vh_tick(pool));
    CHECK(vh_close(&pool));
    printf("queued_deadline_ms=%llu\n", (unsigned long long)duration);
}
static void tls(const char *base, const char *good, const char *bad) {
    size_t good_size, bad_size;
    unsigned char *good_ca = read_ca(good, &good_size);
    unsigned char *bad_ca = read_ca(bad, &bad_size);
    vh_pool *trusted = owner(2, 1, 30, good_ca, good_size);
    vh_pool *untrusted = owner(2, 1, 30, bad_ca, bad_size);
    memset(good_ca, 0, good_size);
    memset(bad_ca, 0, bad_size);
    free(good_ca);
    free(bad_ca);
    expect(trusted, start(trusted, base, "/tls", 4000, 64, NULL), VH_OK, 200, 64);
    expect(untrusted, start(untrusted, base, "/untrusted", 4000, 64, NULL), VH_TRANSFER, 0, 0);
    expect(trusted, start(trusted, base, "/tls", 4000, 64, NULL), VH_OK, 200, 64);
    empty(trusted);
    empty(untrusted);
    CHECK(vh_close(&untrusted));
    CHECK(vh_close(&trusted));
}
static void connect_timeout(const char *url) {
    vh_pool *pool = owner(1, 1, 30, NULL, 0);
    const uint64_t start = vh_now();
    const vh_input input = { url, VH_GET, NULL, NULL, 0, 64, start + 2500, 100 };
    vh_outcome failure;
    vh_request *request = vh_start(pool, &input, &failure);
    CHECK(request);
    expect(pool, request, VH_CONNECT_TIMEOUT, 0, 0);
    CHECK(vh_now() - start < 500);
    empty(pool);
    CHECK(vh_close(&pool));
}
static void transfer_timeouts(const char *base) {
    vh_pool *pool = owner(1, 1, 30, NULL, 0);
    char url[512];
    int written = snprintf(url, sizeof(url), "%s/timeout-header", base);
    CHECK(written > 0 && (size_t)written < sizeof(url));
    for (unsigned i = 0; i < 8; i++) {
        const vh_input input = { url, VH_GET, NULL, NULL, 0, 64, vh_now() + 100,
                                 i % 2 ? 75 : 1500 };
        vh_outcome failure;
        vh_request *request = vh_start(pool, &input, &failure);
        CHECK(request);
        expect(pool, request, VH_TIMEOUT, 0, 0);
    }
    empty(pool);
    CHECK(vh_close(&pool));
}
#ifdef VELA_HTTP_TEST_FAULTS
static void hold(vh_pool *pool, vh_request *request, unsigned duration) {
    const uint64_t end = vh_now() + duration;
    do {
        CHECK(vh_tick(pool));
        CHECK(vh_read(request).outcome == VH_PENDING);
        Sleep(1);
    } while (vh_now() < end);
}
static void phase_cancel(vh_pool *pool, vh_request *request, unsigned duration) {
    hold(pool, request, duration);
    CHECK(vh_cancel(request) && !vh_cancel(request));
    expect(pool, request, VH_CANCELLED, 0, 0);
    empty(pool);
}
static void phases(const char *dns, const char *stall, const char *upload, const char *http) {
    vh_pool *pool = owner(2, 1, 30, NULL, 0);
    vh_request *request;
    unsigned char *bytes = malloc(1024 * 1024);
    vh_outcome failure;
    CHECK(bytes != NULL);
    memset(bytes, 42, 1024 * 1024);
    vh_test_network(pool, dns, 0);
    phase_cancel(pool, start(pool, "http://cancel.fixture.invalid", "/never", 2500, 64, NULL), 110);
    {
        const vh_input input = { "http://deadline.fixture.invalid", VH_GET, NULL, NULL, 0,
                                 64, vh_now() + 2500, 100 };
        request = vh_start(pool, &input, &failure);
        CHECK(request != NULL);
        expect(pool, request, VH_CONNECT_TIMEOUT, 0, 0);
    }
    empty(pool);
    vh_test_network(pool, NULL, 0);
    phase_cancel(pool, start(pool, stall, "/never", 2500, 64, NULL), 110);
    vh_test_network(pool, NULL, 4096);
    {
        const vh_input input = { upload, VH_POST, NULL, bytes, 1024 * 1024, 64, vh_now() + 2500, 1000 };
        request = vh_start(pool, &input, &failure);
        CHECK(request != NULL);
        phase_cancel(pool, request, 150);
    }
    free(bytes);
    vh_test_network(pool, NULL, 0);
    phase_cancel(pool, start(pool, http, "/phase-download", 2500, 64, NULL), 110);
    expect(pool, start(pool, http, "/phase-peer", 2500, 64, NULL), VH_OK, 200, 64);
    empty(pool);
    CHECK(vh_close(&pool));
    puts("DNS, TLS, upload and download cancellation passed");
}
static void faults(const char *base) {
    vh_pool *pool = owner(2, 1, 30, NULL, 0);
    vh_request *a, *b;
    vh_test_failure(pool, VH_STORAGE);
    expect(pool, start(pool, base, "/injected-storage", 3000, 64, NULL), VH_STORAGE, 0, 0);
    empty(pool);
    expect(pool, start(pool, base, "/after-storage", 3000, 64, NULL), VH_OK, 200, 64);
    a = start(pool, base, "/driver-must-not-start", 3000, 64, NULL);
    b = start(pool, base, "/driver-must-not-start", 3000, 64, NULL);
    vh_test_failure(pool, VH_DRIVER);
    CHECK(!vh_tick(pool));
    CHECK(vh_read(a).outcome == VH_DRIVER && vh_read(b).outcome == VH_DRIVER);
    CHECK(!vh_cancel(a) && !vh_cancel(b));
    CHECK(vh_release(a) && vh_release(b));
    empty(pool);
    CHECK(vh_close(&pool));
    CHECK(vh_close(&pool));
    puts("injected storage and driver cleanup passed");
}
#endif
int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--version")) { puts(vh_version()); return 0; }
#ifdef VELA_HTTP_TEST_FAULTS
    if (argc == 3 && !strcmp(argv[1], "--faults")) { faults(argv[2]); return 0; }
    if (argc == 6 && !strcmp(argv[1], "--phases")) { phases(argv[2], argv[3], argv[4], argv[5]); return 0; }
#endif
    if (argc == 3 && !strcmp(argv[1], "--serial")) {
        vh_pool *pool = owner(2, 1, 30, NULL, 0);
        ten(pool, argv[2]);
        CHECK(vh_close(&pool));
        puts("ten responses passed");
        return 0;
    }
    CHECK(argc == 8);
    CHECK(vh_supported());
    reuse(argv[1]);
    limits(argv[1], argv[2]);
    reservation_limits(argv[1]);
    cancellation(argv[1], argv[2], argv[3]);
    tls(argv[4], argv[5], argv[6]);
    connect_timeout(argv[7]);
    transfer_timeouts(argv[1]);
    puts("http multi prototype passed");
    return 0;
}
