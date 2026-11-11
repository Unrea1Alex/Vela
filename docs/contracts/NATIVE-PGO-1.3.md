# Native profile-guided optimization

This optional release-build workflow accepts a source file or the normal
project manifest. It keeps the same entry, checked semantics, runtime ABI and
strict floating-point flags as O2.

```text
vela pgo-instrument ROOT --profile NEW_DIRECTORY
vela pgo-train DIRECTORY -- APPLICATION_ARGS...
vela build ROOT -o OUTPUT --pgo-profile DIRECTORY
```

The parent of the new profile directory must exist. Instrumentation publishes
an isolated training executable and its project companions into a fresh
directory. It retains a bounded plan containing the compiler fingerprint,
checked source graph and manifest identity, project companion digests, emitted
C hash, native toolchain and flag fingerprints, and the training executable
and initial database hashes. The native phase uses relative `program.c`,
`program.exe` and `program.obj` names in a private working directory.

Training runs the selected executable once with the supplied arguments and
the caller's current directory. Use a new profile for a different training
run. It accepts exit zero and a matching nonempty counter file. It writes
the payload and a receipt with its digest and the training argument digest
into a new `trained` subdirectory. No-replace file installation publishes
the plan and trained receipt last. The profile directory needs hard links or
native no-replace file installation. A trainer must first claim an exclusive
lock file. Interrupted training can leave the lock and partial files behind.
Use a fresh directory after interruption. A second concurrent or sequential
trainer cannot replace an accepted result. Profile directories are trusted
local build inputs.

Profile use validates the plan, trained receipt and payload before invoking
the native compiler. The payload is copied into a private build directory.
Changes to source graph, emitted C, compiler, flags, toolchain or project
companions invalidate the profile. Missing, unsupported, malformed, stale and
damaged inputs fail explicitly. The old output remains in place on native
compilation failure. The delivered artifact contains the normal program and
declared companions. It has no training executable, counters or database
dependency.

## Toolchains

- Windows x64, MSVC 19.44.35222 with the 14.44.35207 tool directory. Use
  `/GL /LTCG /GENPROFILE:EXACT,PGD=program.pgd`, direct
  `VCPROFILE_PATH` to the private counter directory, merge the resulting
  `program!1.pgc` with `pgomgr` and link with
  `/LTCG /USEPROFILE:AGGRESSIVE /WX` with the private `program.pgd`.
  The speed strategy was selected on separate validation inputs after the
  default strategy fell inside measurement noise. Run the training command in the
  supported MSVC environment, which supplies the profiling runtime.
  [Instrumentation](https://learn.microsoft.com/en-us/cpp/build/reference/genprofile-fastgenprofile-generate-profiling-instrumented-build?view=msvc-170)
  · [Counter directory](https://learn.microsoft.com/en-us/cpp/build/environment-variables-for-profile-guided-optimizations?view=msvc-170)
  · [Profile use](https://learn.microsoft.com/en-us/cpp/build/reference/useprofile?view=msvc-170).
- Linux x86-64 Alpine musl, GCC 14.2.0. Use
  `-fprofile-generate=%q{VELA_PGO_COUNTER_DIR} -fprofile-update=atomic`
  and `-fprofile-prefix-path=WORK_DIR`. Train with a private counter
  directory. Use `-fprofile-use=WORK_DIR -Werror=missing-profile` and the
  corresponding path prefix. Coverage mismatch remains an error.
  [Instrumentation and relocation](https://gcc.gnu.org/onlinedocs/gcc-14.2.0/gcc/Instrumentation-Options.html).

The optional profile workflow is a local native CLI operation. The MCP
execution host builds ephemeral, separately authorized snapshots and cannot
import local profile directories or train executables under their authority.
It explicitly rejects a request for PGO. Project manifests keep their existing
lock and dependency rules and choose PGO through the CLI invocation.
Debug export and IR comparison are separate modes. Ordinary builds and
bootstrap still use O2. The C cache stores checked generated C, and may be
used by `build --pgo-profile`. Profile validation runs on both cache hits
and misses. Native executable bytes are never retrieved from that cache.
The profile identity binds the generated C, source, toolchain, flags and
trained payload independently of the C cache.

Profiles with native dependencies require explicit target and ABI declarations
in the project manifest. The legacy three-column native record continues to
work for O2. MSVC can report PG0188 after the counters have already been merged
into the supplied database. The linker reports the number of profiled
functions it optimized.

When combining profiling and link-time optimization, follow the
[native LTO contract](NATIVE-LTO-1.3.md) for compatible profile modes.

## Acceptance

Before measuring, fix the primary evaluation inputs to the 1.3.4e authored
compiler project for `check` and the frozen 10,000-record BuildLens JSONL
group. Train the compiler on the FieldDesk CLI source graph (entry
`apps/fielddesk/main.vela`) and BuildLens on a
separately generated 30,000-record dataset with different names, paths and
durations. Record input hashes and exact result oracles. Use the same pinned
O2 and PGO inputs on each toolchain. Compare warmed alternating pairs against
O2 and its repeat noise. The target is at least 3% median wall improvement
beyond noise on a primary workload on each toolchain. Record instrument
build, training, profile use build, CPU, process-tree peak, bytes and
break-even count. See the [optimization budgets](C-OPTIMIZATION-1.3.md).

Check malformed and damaged profiles, source and companion changes, toolchain
and flag mismatch, failed or repeated training, cache hits, packaging
without the profile, and independent compiler, native, fixed-point and
autonomous C recovery gates in addition to the ordinary stage verify.
