#!/bin/sh
# Alpine x86-64, GCC and musl. Use absolute paths for both arguments.
set -eu
root=$1
archive=$2
acceptance_docs=${3:-}
version=1.3.0
test ! -e "$archive"
test ! -e "$archive.pending"
work=$(mktemp -d /tmp/vela130-release.XXXXXXXX)
trap 'case "$work" in /tmp/vela130-release.*) rm -rf -- "$work";; esac' EXIT
cd "$work"
mkdir -p Vela/bin Vela/bootstrap Vela/selfhost Vela/tools Vela/examples Vela/apps
cp "$root/bootstrap/velac.c" "$root/bootstrap/README.md" Vela/bootstrap/
cp "$root/selfhost/compiler.vela" Vela/selfhost/
cp "$root/tools/api.vela" Vela/tools/
cp -R "$root/std" "$root/docs" Vela/
if [ -n "$acceptance_docs" ]; then
    cp -R "$acceptance_docs/." Vela/docs/
fi
cp -R "$root/examples/recipes" "$root/examples/agent-idioms" Vela/examples/
cp "$root/LICENSE" Vela/

compile() { cc -std=c11 -O2 -static -ffp-contract=off "$1" -lm -o "$2"; }
compile Vela/bootstrap/velac.c recovery
test "$(./recovery --version)" = "Vela $version (self-hosted)"
./recovery emit-c Vela/selfhost/compiler.vela --source-name compiler.vela -o first.c
cmp Vela/bootstrap/velac.c first.c
compile first.c Vela/bin/vela
Vela/bin/vela emit-c Vela/selfhost/compiler.vela --source-name compiler.vela -o second.c
cmp first.c second.c
Vela/bin/vela emit-c Vela/tools/api.vela -o api.c
compile api.c Vela/bin/vela-api
Vela/bin/vela check Vela/examples/agent-idioms/main.vela

for name in tree-index log-summary build-lens; do
    app="Vela/apps/$name"
    mkdir "$app"
    cp "$root/apps/$name/"*.vela "$root/apps/$name/README.md" "$app/"
    Vela/bin/vela emit-c "$app/main.vela" -o "$name.c"
    compile "$name.c" "$app/app"
done
for file in CONTRACT.md demo.jsonl preview.png vela.project vela.project.lock; do
    cp "$root/apps/build-lens/$file" Vela/apps/build-lens/
done
cat > Vela/apps/build-lens/README.md <<'EOF'
# BuildLens on Linux

From this directory, run `./app demo.jsonl --output report.json` or
`./app demo.jsonl --format html --output report.html`. Run `./app --help`
for filters and exit codes. See the [input and output contract](CONTRACT.md).

Build from source with `../../bin/vela build vela.project -o buildlens`.
Run named tests with `../../bin/vela test vela.project --json`.
EOF

cat > Vela/README.txt <<'EOF'
Vela 1.3.0 for Linux x86-64 (GCC 14.2 and musl 1.2.5)
Run bin/vela --version. Build applications with a local C11 compiler.
Try bin/vela init demo --name demo; bin/vela run demo/vela.project.
The example executables are apps/tree-index/app, apps/log-summary/app and
apps/build-lens/app. Each accepts --help.
Import standard modules explicitly from std/.
See bootstrap/README.md for recovery and docs/VALIDATION-1.3.md for platform scope.
EOF

(cd Vela && find . -type f -print0 | sort -z | xargs -0 sha256sum) > hashes.txt
cp hashes.txt Vela/SHA256SUMS.txt
tar -czf "$archive.pending" Vela
moved="$work/Поставка Vela 🌿"
mkdir "$moved"
tar -xzf "$archive.pending" -C "$moved"
sdk="$moved/Vela"
(cd "$sdk" && sha256sum -c SHA256SUMS.txt) > verified.txt
test "$(find "$sdk" -type f | wc -l)" -eq "$(($(wc -l < hashes.txt) + 1))"
run() { env -i PATH=/usr/bin:/bin "$@"; }
vela="$sdk/bin/vela"
test "$(run "$vela" --version)" = "Vela $version (self-hosted)"
run "$sdk/bin/vela-api" "$sdk/docs/api-index.json" "$sdk/docs/api-purpose.json" std/algorithms:sort name 0 1 8192 "$version" '' > api.json
grep -q '"id":"std/algorithms:sort"' api.json
run "$vela" emit-c "$sdk/selfhost/compiler.vela" --source-name compiler.vela -o moved.c
cmp "$sdk/bootstrap/velac.c" moved.c
run "$vela" init 'Новый проект' --name installed_cli --json > init.json
project='Новый проект/vela.project'
run "$vela" check "$project"
run "$vela" test "$project" --json > fresh-tests.json
grep -q '"passed":1,"failed":0' fresh-tests.json
run "$vela" build "$project" -o fresh-app
test "$(run ./fresh-app)" = 42
test "$(run "$vela" run "$project")" = 42

mkdir -p fixture/stdlib out
cp "$root/tests/tooling/resource-probe.vela" fixture/probe.vela
cp "$sdk/std/path.vela" "$sdk/std/text.vela" fixture/stdlib/
printf 'Vela\000\377' > 'fixture/Данные.bin'
printf '%s\n' 'vela-project|1' 'name|resource_probe' 'entry|probe.vela' 'test|probe.vela' \
    'resource|assets/tables/check.bin|Данные.bin' > fixture/vela.project
run "$vela" lock fixture/vela.project
run "$vela" build fixture/vela.project -o out/probe
cmp 'fixture/Данные.bin' out/assets/tables/check.bin
run "$vela" test fixture/vela.project --json > tests.json
grep -q '"passed":1,"failed":0' tests.json
mv out 'Ресурсы 🌿'
run "$work/Ресурсы 🌿/probe" > resource.txt
test "$(sed -n '1p' resource.txt)" = "$work/Ресурсы 🌿/probe"
test "$(sed -n '2p' resource.txt)" = "$(sha256sum 'fixture/Данные.bin' | cut -d ' ' -f 1)"
printf 'changed' > 'fixture/Данные.bin'
if run "$vela" check fixture/vela.project --json > stale.json; then
    echo 'Changed resource lock was accepted' >&2
    exit 1
fi
grep -q E226 stale.json

mkdir index-input
printf 'a\n\377\000z' > index-input/binary
run "$sdk/apps/tree-index/app" index-input index.json --repeat 3
test "$(cat index.json)" = '{"files":[{"path":"binary","bytes":5,"lines":2}],"total_bytes":5,"total_lines":2}'
printf '%s\n' '{"service":"x","level":2,"value":7,"ignored":1e9999}' > input.ndjson
run "$sdk/apps/log-summary/app" input.ndjson logs.json --repeat 3
test "$(cat logs.json)" = '{"count":1,"sum":7,"services":[{"name":"x","count":1,"sum":7,"min":7,"max":7}]}'
run "$sdk/apps/build-lens/app" "$sdk/apps/build-lens/demo.jsonl" --output buildlens.json
cmp "$root/apps/build-lens/demo-report.json" buildlens.json
run "$vela" test "$sdk/apps/build-lens/vela.project" --json > buildlens-tests.json
grep -q '"passed":10,"failed":0' buildlens-tests.json

mv "$archive.pending" "$archive"
sha256sum "$archive"
printf 'Linux release passed: %s verified files, canonical C, API, projects, resources, three applications.\n' "$(wc -l < verified.txt)"
