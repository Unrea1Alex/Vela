#include "ffi.h"
#include <math.h>

VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }
/* No allocation or retained Vela data. Domain validated by the Vela wrapper. */
VELA_FFI_EXPORT double measurelab_sqrt(double value) { return sqrt(value); }
