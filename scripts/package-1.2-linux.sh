#!/bin/sh
set -eu

root=$1
seed=$2
bundle=$3
archive=$4
test ! -e "$archive"
test ! -e "$archive.pending"
work=$(mktemp -d /tmp/vela120-release.XXXXXXXX)
trap 'case "$work" in /tmp/vela120-release.*) rm -rf -- "$work";; esac' EXIT
mkdir -p "$work/Vela/bin" "$work/Vela/bootstrap" "$work/Vela/docs/contracts"
cp "$bundle" "$work/compiler.vela"
cp "$seed" "$work/recovery.c"
cd "$work"

cc -std=c11 -O2 -static -ffp-contract=off recovery.c -lm -o recovery
test "$(./recovery --version)" = 'Vela 1.2.0 (self-hosted)'
./recovery emit-c compiler.vela --source-name compiler.vela -o first.c
cc -std=c11 -O2 -static -ffp-contract=off first.c -lm -o Vela/bin/vela
Vela/bin/vela emit-c compiler.vela --source-name compiler.vela -o second.c
cmp first.c second.c
cp first.c Vela/bootstrap/velac.c
cp "$root/LICENSE" Vela/
mkdir -p Vela/selfhost
cp "$bundle" Vela/selfhost/compiler.vela
printf '%s\n' '# Linux C recovery' '' \
  'Compile with: cc -std=c11 -O2 -ffp-contract=off bootstrap/velac.c -lm -o recovery' \
  'Then: ./recovery emit-c selfhost/compiler.vela -o compiler.c' \
  'Then: cc -std=c11 -O2 -ffp-contract=off compiler.c -lm -o vela' \
  'No Python, Node, older Vela or compiler source downloads are required.' > Vela/bootstrap/README.md
cp -R "$root/std" Vela/
cp -R "$root/docs" Vela/
mkdir -p Vela/tools Vela/examples
cp -R "$root/examples/recipes" Vela/examples/
cp "$root/tools/api.vela" Vela/tools/
Vela/bin/vela emit-c Vela/tools/api.vela -o api-helper.c
cc -std=c11 -O2 -static -ffp-contract=off api-helper.c -lm -o Vela/bin/vela-api
Vela/bin/vela-api Vela/docs/api-index.json Vela/docs/api-purpose.json std/algorithms:sort name 0 1 8192 1.2.0 '' > api.json
grep -q 'std/algorithms:sort' api.json
mkdir fresh-client
Vela/bin/vela init fresh-client/application --name installed_cli --json > init.json
Vela/bin/vela check fresh-client/application/vela.project
Vela/bin/vela test fresh-client/application/vela.project --json > fresh-tests.json
grep -q '"passed":1,"failed":0' fresh-tests.json
Vela/bin/vela build fresh-client/application/vela.project -o fresh-client/app
test "$(fresh-client/app)" = 42
test "$(Vela/bin/vela run fresh-client/application/vela.project)" = 42
mkdir -p Vela/apps/tree-index Vela/apps/log-summary
for name in tree-index log-summary; do
    cp "$root/apps/$name/main.vela" "$root/apps/$name/README.md" "Vela/apps/$name/"
    Vela/bin/vela emit-c "Vela/apps/$name/main.vela" -o "$name.c"
    cc -std=c11 -O2 -static -ffp-contract=off "$name.c" -lm -o "Vela/apps/$name/app"
done
printf '%s\n' 'Vela 1.2.0' 'Linux x86-64, GCC 14.2 and musl 1.2.5' \
  'Run bin/vela --version. Build applications with a local C11 compiler.' \
  'Example hello.vela: fn main()->Unit effects{io}{print("Hello");}' \
  'Compile: bin/vela build hello.vela -o hello; run: ./hello' \
  'Import modules explicitly from std/. Compiler source: selfhost/compiler.vela.' \
  'This is the compiler/console target. Windows GUI, DLL FFI, process workers, fibers and HTTP adapters are not supported here.' \
  'Full language/API and migration documentation: https://github.com/Unrea1Alex/Vela/tree/main/docs' > Vela/README.txt

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
cp "$root/tests/cases/enum-equality-owner.vela" fixture/
cp "$root/tests/cases/v101e_enum_equality.vela" fixture/enum.vela
Vela/bin/vela build fixture/enum.vela -o enum-check
test "$(./enum-check)" = 'enum equality passed'
printf 'changed' > 'fixture/Данные.bin'
if Vela/bin/vela check fixture/vela.project --json > stale.json; then
    printf '%s\n' 'Changed resource lock was accepted' >&2
    exit 1
fi
grep -q E226 stale.json

mkdir index-input
printf 'a\n\377\000z' > index-input/binary
Vela/apps/tree-index/app index-input index.json --repeat 3
test "$(cat index.json)" = '{"files":[{"path":"binary","bytes":5,"lines":2}],"total_bytes":5,"total_lines":2}'
printf '%s\n' '{"service":"x","level":2,"value":7,"ignored":1e9999}' > input.ndjson
Vela/apps/log-summary/app input.ndjson logs.json --repeat 3
test "$(cat logs.json)" = '{"count":1,"sum":7,"services":[{"name":"x","count":1,"sum":7,"min":7,"max":7}]}'

(cd Vela && find . -type f -print0 | sort -z | xargs -0 sha256sum) > hashes.txt
cp hashes.txt Vela/SHA256SUMS.txt
tar -czf "$archive.pending" Vela
mkdir unpack
tar -xzf "$archive.pending" -C unpack
(cd unpack/Vela && sha256sum -c SHA256SUMS.txt)
env -i PATH=/usr/bin:/bin "$work/unpack/Vela/bin/vela" --version
env -i PATH=/usr/bin:/bin "$work/unpack/Vela/apps/tree-index/app" "$work/index-input" "$work/relocated-index.json"
cmp index.json relocated-index.json
env -i PATH=/usr/bin:/bin "$work/unpack/Vela/apps/log-summary/app" "$work/input.ndjson" "$work/relocated-logs.json"
cmp logs.json relocated-logs.json
mv "$archive.pending" "$archive"
sha256sum "$archive"
printf '%s\n' 'Linux C recovery, emitted C fixed point, resource lock, test and Unicode relocation passed.'
