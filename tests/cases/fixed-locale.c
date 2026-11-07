#include "../../vela/backends/runtime.h"

int main(int argc, char **argv) {
    v_io_result formatted;
    v_argc = argc;
    v_argv = argv;
    v_runtime_init();
    if (!setlocale(LC_NUMERIC, "de-DE") || strcmp(localeconv()->decimal_point, ",")) return 1;
    if (fesetround(FE_DOWNWARD)) return 2;
    formatted = v_float_to_fixed(2.375, 2, __FILE__, __LINE__, 1);
    if (!formatted.ok || !v_string_eq(formatted.value, v_text("2.38", 4))) return 3;
    if (fegetround() != FE_DOWNWARD || strcmp(localeconv()->decimal_point, ",")) return 4;
    puts("fixed locale passed");
    return 0;
}
