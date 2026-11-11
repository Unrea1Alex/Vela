#ifndef VELA_HTTP_POOL_H
#define VELA_HTTP_POOL_H

#include <stddef.h>
#include <stdint.h>

typedef struct vh_pool vh_pool;
typedef struct vh_request vh_request;

typedef enum {
    VH_PENDING, VH_OK, VH_CANCELLED, VH_TIMEOUT, VH_CONNECT_TIMEOUT,
    VH_LIMIT, VH_TRANSFER, VH_STORAGE, VH_DRIVER
} vh_outcome;
typedef enum { VH_GET, VH_HEAD, VH_POST, VH_PUT, VH_DELETE } vh_method;

typedef struct {
    unsigned connections;
    unsigned per_origin;
    unsigned idle_seconds;
    const unsigned char *ca;
    size_t ca_size;
} vh_settings;
typedef struct {
    const char *url;
    vh_method method;
    const char *headers;
    const unsigned char *upload;
    size_t upload_size;
    size_t body_limit;
    uint64_t deadline_ms;
    unsigned connect_ms;
} vh_input;
typedef struct {
    vh_outcome outcome;
    long status;
    int transport_code;
    const char *message;
    const unsigned char *headers;
    size_t headers_size;
    const unsigned char *body;
    size_t body_size;
} vh_result;
typedef struct { unsigned live, slots; size_t reserved_body; } vh_counts;

const char *vh_version(void);
int vh_supported(void);
uint64_t vh_now(void);
vh_pool *vh_open(vh_settings settings);
vh_request *vh_start(vh_pool *pool, const vh_input *input, vh_outcome *failure);
int vh_cancel(vh_request *request);
int vh_tick(vh_pool *pool);
int vh_wait(vh_pool *pool, int milliseconds);
vh_result vh_read(const vh_request *request);
vh_counts vh_stats(const vh_pool *pool);
int vh_release(vh_request *request);
int vh_close(vh_pool **owner);

#ifdef VELA_HTTP_TEST_FAULTS
void vh_test_failure(vh_pool *owner, vh_outcome failure);
void vh_test_network(vh_pool *owner, const char *dns, int send_buffer);
#endif

#endif
