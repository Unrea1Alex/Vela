set -eu
root=/mnt/g/Vela
work=$(mktemp -d /tmp/vela123.XXXXXXXX)
trap 'case "$work" in /tmp/vela123.*) rm -rf -- "$work";; esac' EXIT
cc -std=c11 -O2 -static -ffp-contract=off "$root/build/stage12/compiler123-linux.c" -lm -o "$work/vela"
mkdir "$work/other cwd"
cd "$work/other cwd"
for kind in cli library; do
    target="$work/новый проект $kind"
    "$work/vela" init "$target" --kind "$kind" --json
    "$work/vela" check "$target/vela.project" --json
    "$work/vela" build "$target/vela.project" -o "$target/app"
    test "$("$target/app")" = 42
    "$work/vela" test "$target/vela.project" --json > "$work/tests.json"
    grep '"passed":1,"failed":0' "$work/tests.json"
    before=$(sha256sum "$target/vela.project")
    if "$work/vela" init "$target" --json > "$work/conflict.json"; then exit 1; fi
    grep E225 "$work/conflict.json"
    test "$before" = "$(sha256sum "$target/vela.project")"
done
"$work/vela" init 'relative app' --json
test -f 'relative app/vela.project'
if "$work/vela" init "$work/bad" --name my-project --json > "$work/name.json"; then exit 1; fi
grep my_project "$work/name.json"
mkdir "$work/empty"
if "$work/vela" init "$work/empty" --json > "$work/empty.json"; then exit 1; fi
test -z "$(ls -A "$work/empty")"
printf preserved > "$work/file"
if "$work/vela" init "$work/file" --json > "$work/file.json"; then exit 1; fi
test "$(cat "$work/file")" = preserved
(set +e; "$work/vela" init "$work/race" --json > "$work/race-a.json"; echo $? > "$work/a.code") &
a=$!
(set +e; "$work/vela" init "$work/race" --json > "$work/race-b.json"; echo $? > "$work/b.code") &
b=$!
wait "$a"
wait "$b"
test "$(cat "$work/a.code" "$work/b.code" | sort | tr '\n' ' ')" = '0 1 '
echo 'Linux scaffold check/build/test/Unicode/cwd/conflict passed'
