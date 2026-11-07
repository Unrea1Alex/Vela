# Foreign handle roots

Contract for 0.8.5. `ffi_retain(handle)` registers an explicit collector root
for the shared metadata of a live non-null `ForeignHandle`. `ffi_release(handle)`
removes that root. Both return `WriteResult` and require `state`. One registration
exists per handle identity. A copied handle addresses the same registration.
Null, closed, duplicate retain and release without registration return errors.

Releasing a root leaves the resource open. Successful `ffi_close` unregisters
the root and invalidates all aliases. A failed close leaves the registration
and the live resource unchanged. Keep a reachable alias to perform explicit
release or close. The collector never executes a native destructor.

The internal registry traces wrapper metadata only. Library records are held
until process teardown. DLL ABI 1 is unchanged, including the borrowed byte
view and its call-bound lifetime. Retaining a handle does not retain arbitrary
managed buffers. No DLL unload occurs during execution.
Use the separate [callback registration](CALLBACKS.md) to root a callable
environment and its owner from dev.9.
