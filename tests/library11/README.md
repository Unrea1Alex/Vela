# Library 1.1 acceptance

`oracle/fixtures.mjs` and `oracle/validate.mjs` are byte-identical copies of
the historical pilot's independent checks. Their original hashes, tasks,
toolchain versions and application artifacts are frozen in
[1.1.1 evidence](../../docs/stage1111-evidence.json).
Never update the pilot to make a new implementation pass.

Native regressions are registered in `../cases/cases.tsv` and run by
`vela-dev.cmd verify`. Case source is expanded in the runner's temporary
directory, hence its relative imports and `@TMP@` placeholders.
Every run case requires `.vela`, `.args` (possibly empty) and `.out`.

`directory-platform.vela` receives a directory and a link root to reject.
It exercises no-follow metadata, a trailing slash and concurrent deletion.
`directory-host.c` independently injects OS close failure, rejects FFI
ownership transfer, repeats 2048 opens/closes and receives an access-denied
directory as its second argument. On Windows it compares actual OS handle
counts. On Linux run it as an unprivileged user against mode 000. These are
integration probes; compiler, native runner and Vela applications do not
depend on this C host harness, Node or a shell at runtime.

The optional frozen app oracle can be run with Node:

```text
node tests/library11/oracle/validate.mjs index ABSOLUTE_EXE ABSOLUTE_WORKDIR maintenance
```

Use `logs` or `http` for the other tasks. Maintenance includes the unchanged
baseline: index 12/26, logs 30/46, HTTP 29/44. Work directories belong in
`build/stage11`, never in the historical pilot. Full VelaBench is still 1.4.6.
