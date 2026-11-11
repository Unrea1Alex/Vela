import assert from 'node:assert/strict';

export function swap(text, anchor, replacement) {
    const i = text.indexOf(anchor);
    assert.ok(i >= 0 && text.indexOf(anchor, i + anchor.length) < 0, 'single instrumentation anchor: ' + anchor);
    return text.replace(anchor, replacement);
}
export function allocationCounters(text) {
    const declaration = 'static size_t v_gc_bytes, v_gc_peak, v_gc_collections;';
    text = swap(text, declaration, declaration + `
static uint64_t audit_allocations, audit_allocated, audit_polls;
static uint64_t audit_pause_total, audit_pause_max;
static uint64_t audit_clock_ns(void) {
#ifdef _WIN32
    static LARGE_INTEGER frequency;
    LARGE_INTEGER time;
    if ((!frequency.QuadPart && !QueryPerformanceFrequency(&frequency)) ||
        !QueryPerformanceCounter(&time)) abort();
    return (uint64_t)((double)time.QuadPart * 1000000000.0 / (double)frequency.QuadPart);
#else
    struct timespec time;
    if (clock_gettime(CLOCK_MONOTONIC, &time)) abort();
    return (uint64_t)time.tv_sec * UINT64_C(1000000000) + (uint64_t)time.tv_nsec;
#endif
}`);
    text = swap(text, '    v_gc_bytes += bytes;', '    v_gc_bytes += bytes;\n    ++audit_allocations;\n    audit_allocated += bytes;');
    text = swap(text, 'static void v_gc_poll(void) {', 'static void v_gc_poll(void) {\n    ++audit_polls;');
    text = swap(text, 'static void v_gc_collect(void) {',
        'static void v_gc_collect(void) {\n    uint64_t audit_begin = audit_clock_ns();');
    text = swap(text, '    ++v_gc_collections;', `    ++v_gc_collections;
    uint64_t audit_elapsed = audit_clock_ns() - audit_begin;
    audit_pause_total += audit_elapsed;
    if (audit_elapsed > audit_pause_max) audit_pause_max = audit_elapsed;`);
    return swap(text, 'static void v_runtime_free(void) {', 'static void v_runtime_free(void) {\n'
        + '    fprintf(stderr, "codegen allocations=%" PRIu64 " allocated=%" PRIu64 " polls=%" PRIu64 " pause_total_ns=%" PRIu64 " pause_max_ns=%" PRIu64 "\\n",\n'
        + '        audit_allocations, audit_allocated, audit_polls, audit_pause_total, audit_pause_max);');
}
export function readCounters(stderr) {
    const alloc = /codegen allocations=(\d+) allocated=(\d+) polls=(\d+) pause_total_ns=(\d+) pause_max_ns=(\d+)/.exec(stderr);
    const gc = /vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(stderr);
    assert.ok(alloc && gc, stderr);
    return { allocations: +alloc[1], allocated_bytes: +alloc[2], executed_polls: +alloc[3],
        gc_pause_total_ns: +alloc[4], gc_pause_max_ns: +alloc[5],
        gc_collections: +gc[1], peak_managed_bytes: +gc[2], before_teardown_bytes: +gc[3] };
}
