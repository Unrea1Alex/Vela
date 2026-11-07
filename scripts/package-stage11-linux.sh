#!/bin/sh
set -eu

root=$1
seed=$2
bundle=$3
archive=$4
test ! -e "$archive"
test ! -e "$archive.pending"
work=$(mktemp -d /tmp/vela11-release.XXXXXXXX)
trap 'case "$work" in /tmp/vela11-release.*) rm -rf -- "$work";; esac' EXIT
mkdir -p "$work/Vela/bin" "$work/Vela/bootstrap" "$work/Vela/docs/contracts"
cp "$bundle" "$work/compiler.vela"
cp "$seed" "$work/recovery.c"
cd "$work"

cc -std=c11 -O2 -static -ffp-contract=off recovery.c -lm -o recovery
test "$(./recovery --version)" = 'Vela 0.11.0 (self-hosted)'
./recovery emit-c compiler.vela --source-name compiler.vela -o first.c
cc -std=c11 -O2 -static -ffp-contract=off first.c -lm -o Vela/bin/vela
Vela/bin/vela emit-c compiler.vela --source-name compiler.vela -o second.c
cmp first.c second.c
cp first.c Vela/bootstrap/velac.c
cp "$root/LICENSE" Vela/
cp "$root/bootstrap/README.md" Vela/bootstrap/
cp "$root/docs/contracts/PLATFORM-SUPPORT.md" "$root/docs/contracts/PACKAGING.md" Vela/docs/contracts/
cp -R "$root/std" Vela/
printf '%s\n' 'Vela 0.11.0' 'Linux x86-64, GCC 14.2 and musl 1.2.5' \
  'Run bin/vela --version. Build applications with a local C11 compiler.' > Vela/README.txt

mkdir -p fixture/stdlib out
cp "$root/tests/tooling/resource-probe.vela" fixture/probe.vela
cp "$root/std/path.vela" "$root/std/text.vela" fixture/stdlib/
printf 'Vela\000\377' > 'fixture/Данные.bin'
printf '%s\n' 'vela-project|1' 'name|resource_probe' 'entry|probe.vela' 'test|probe.vela' \
  'resource|assets/tables/check.bin|Данные.bin' > fixture/vela.project
Vela/bin/vela lock fixture/vela.project
Vela/bin/vela build fixture/vela.project -o out/probe
cmp 'fixture/Данные.bin' out/assets/tables/check.bin
Vela/bin/vela test fixture/vela.project --json > tests.json
grep -q '"passed":1,"failed":0' tests.json
grep -q '"artifact_dir":""' tests.json
mv out 'Перенос Vela 🌿'
hash=$(sha256sum 'fixture/Данные.bin' | cut -d ' ' -f 1)
env -i PATH=/usr/bin:/bin "$work/Перенос Vela 🌿/probe" > relocated.txt
test "$(sed -n '1p' relocated.txt)" = "$work/Перенос Vela 🌿/probe"
test "$(sed -n '2p' relocated.txt)" = "$hash"
Vela/bin/vela check "$root/examples/agent-idioms/main.vela"
printf 'changed' > 'fixture/Данные.bin'
if Vela/bin/vela check fixture/vela.project --json > stale.json; then
    printf '%s\n' 'Changed resource lock was accepted' >&2
    exit 1
fi
grep -q E226 stale.json

(cd Vela && find . -type f -print0 | sort -z | xargs -0 sha256sum) > hashes.txt
cp hashes.txt Vela/SHA256SUMS.txt
tar -czf "$archive.pending" Vela
mkdir unpack
tar -xzf "$archive.pending" -C unpack
(cd unpack/Vela && sha256sum -c SHA256SUMS.txt)
env -i PATH=/usr/bin:/bin "$work/unpack/Vela/bin/vela" --version
mv "$archive.pending" "$archive"
sha256sum "$archive"
printf '%s\n' 'Linux C recovery, emitted C fixed point, resource lock, test and Unicode relocation passed.'
