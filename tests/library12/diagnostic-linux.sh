#!/bin/sh
set -eu
work=$(mktemp -d /tmp/vela128.XXXXXX)
trap 'case "$work" in /tmp/vela128.*) rm -rf -- "$work";; esac' EXIT
gcc -O0 "${1:-/mnt/g/Vela/build/stage12/compiler128-linux.c}" -o "$work/velac" -lm
digest() { sha256sum "$1" | cut -d' ' -f1; }
revision() { printf %s "$(digest "$1")" | sha256sum | cut -d' ' -f1; }
check() { status=0; "$work/velac" query "$1" --json > "$work/query.json" || status=$?; test "$status" = 1; grep -q '"code":"'"$2"'"' "$work/query.json"; }
preview() { "$work/velac" plan "$1" "$(revision "$1")" 0 diagnose > "$work/plan.json"; grep -q '"validated":'"$2" "$work/plan.json"; }
printf 'fn main()->Unit { print(7); }\n' > "$work/main.vela"
before=$(digest "$work/main.vela")
check "$work/main.vela" E209
preview "$work/main.vela" true
test "$(digest "$work/main.vela")" = "$before"
grep -q 'effects {io}' "$work/plan.json"
printf 'fn main()->Int { let label="я😀"; return true; }\n' > "$work/main.vela"
check "$work/main.vela" E201
preview "$work/main.vela" false
grep -q '"expected":"Int"' "$work/plan.json"
printf 'fn main()->Int { return 0; }\n' > "$work/main.vela"
printf 'vela-project|1\nname|bad-name\nentry|main.vela\n' > "$work/vela.project"
check "$work/vela.project" E225
preview "$work/vela.project" true
grep -q 'bad_name' "$work/plan.json"
printf ' fn main()->Int { return math::answer(); }\n' > "$work/main.vela"
printf 'pub fn answer()->Int { return 7; }\n' > "$work/math.vela"
check "$work/main.vela" E200
preview "$work/main.vela" true
grep -q 'math.vela' "$work/plan.json"
printf 'pub fn answer()->Int{return 42;}\n' > "$work/Int.vela"
printf 'fn main()->Int{return Int::answer();}\n' > "$work/main.vela"
check "$work/main.vela" E200
preview "$work/main.vela" false
grep -q '"changes":\[\]' "$work/plan.json"
printf 'pub fn answer()->Int{return 42;}\n' > "$work/T.vela"
printf 'fn wrong<T>(value:T)->Int{return T::answer();} fn main()->Int{return wrong(4);}\n' > "$work/main.vela"
check "$work/main.vela" E200
preview "$work/main.vela" false
grep -q '"changes":\[\]' "$work/plan.json"
mkdir "$work/help"
(cd "$work/help"; "$work/velac" init --help --json > "$work/help.json")
test "$(find "$work/help" -mindepth 1 | wc -l)" = 0
grep -q '"help":' "$work/help.json"
echo 'Linux native diagnostic effects/types/project/import/Unicode/known-type refusal/no-write help passed'
