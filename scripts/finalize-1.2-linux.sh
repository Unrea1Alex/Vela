#!/bin/sh
# Repackage final acceptance documents; preserve every tested non-doc byte.
set -eu
root=$1
candidate=$2
archive=$3
test ! -e "$archive"
test ! -e "$archive.pending"
work=$(mktemp -d /tmp/vela120-docs.XXXXXXXX)
trap 'case "$work" in /tmp/vela120-docs.*) rm -rf -- "$work";; esac' EXIT
tar -xzf "$candidate" -C "$work"
(cd "$work/Vela" && sha256sum -c SHA256SUMS.txt) > "$work/candidate-checks.txt"
(cd "$work/Vela" && find . -type f ! -path './docs/*' ! -path './SHA256SUMS.txt' -print0 | sort -z | xargs -0 sha256sum) > "$work/non-doc-before.txt"
cp -R "$root/docs/." "$work/Vela/docs/"
(cd "$work/Vela" && find . -type f ! -path './docs/*' ! -path './SHA256SUMS.txt' -print0 | sort -z | xargs -0 sha256sum) > "$work/non-doc-after.txt"
cmp "$work/non-doc-before.txt" "$work/non-doc-after.txt"
(cd "$work/Vela" && find . -type f ! -path './SHA256SUMS.txt' -print0 | sort -z | xargs -0 sha256sum) > "$work/hashes.txt"
cp "$work/hashes.txt" "$work/Vela/SHA256SUMS.txt"
tar -czf "$archive.pending" -C "$work" Vela
mkdir "$work/Поставка Vela 🌿"
tar -xzf "$archive.pending" -C "$work/Поставка Vela 🌿"
relocated="$work/Поставка Vela 🌿/Vela"
(cd "$relocated" && sha256sum -c SHA256SUMS.txt) > "$work/final-checks.txt"
test "$(env -i PATH=/usr/bin:/bin "$relocated/bin/vela" --version)" = 'Vela 1.2.0 (self-hosted)'
env -i PATH=/usr/bin:/bin "$relocated/bin/vela-api" "$relocated/docs/api-index.json" "$relocated/docs/api-purpose.json" std/algorithms:sort name 0 1 8192 1.2.0 '' > "$work/api.json"
grep -q 'std/algorithms:sort' "$work/api.json"
mkdir "$work/input"
printf 'a\n\377\000z' > "$work/input/binary"
env -i PATH=/usr/bin:/bin "$relocated/apps/tree-index/app" "$work/input" "$work/index.json" --repeat 3
test "$(cat "$work/index.json")" = '{"files":[{"path":"binary","bytes":5,"lines":2}],"total_bytes":5,"total_lines":2}'
printf '%s\n' '{"service":"x","level":2,"value":7,"ignored":1e9999}' > "$work/input.ndjson"
env -i PATH=/usr/bin:/bin "$relocated/apps/log-summary/app" "$work/input.ndjson" "$work/logs.json" --repeat 3
test "$(cat "$work/logs.json")" = '{"count":1,"sum":7,"services":[{"name":"x","count":1,"sum":7,"min":7,"max":7}]}'
mv "$archive.pending" "$archive"
sha256sum "$archive"
printf '%s\n' 'Final Linux archive: all digests, unchanged non-doc bytes, native API and Unicode/empty-environment console runs passed.'
