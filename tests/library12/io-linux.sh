#!/bin/sh
set -eu
root=/mnt/g/Vela
work=$(mktemp -d /tmp/vela126a.XXXXXX)
trap 'case "$work" in /tmp/vela126a.*) rm -rf -- "$work";; esac' EXIT
gcc -O2 "$root/build/stage12/io126a-linux.c" -o "$work/focus" -lm
gcc -O2 "$root/build/stage12/io-probe126a-linux.c" -o "$work/probe" -lm
gcc -O2 "$root/tests/library12/io-host.c" -o "$work/host" -lm
gcc -O2 "$root/tests/library12/io-large-fixture.c" -o "$work/fixture"
"$work/focus"
"$work/host" "$root/tests/library12/io-probe.vela" "$work/owner-output"
for mb in 27 270; do
 "$work/fixture" "$work/вход-尾" "$mb"
 total=$((mb*1048576))
 VELA_GC_REPORT=1 "$work/probe" file-copy "$work/вход-尾" "$work/выход-😀" 8192 "$total"
 a=$(sha256sum "$work/вход-尾"); b=$(sha256sum "$work/выход-😀")
 test "${a%% *}" = "${b%% *}"
 VELA_GC_REPORT=1 "$work/probe" file-lines "$work/вход-尾" "$work/выход-😀" 8192 "$total"
done
for count in 1280 12800; do
 for mode in memory memory-lines; do
  VELA_GC_REPORT=1 "$work/probe" "$mode" "$count" "$work/memory-output" 8192 "$((count*37))"
 done
done
echo 'Linux streams large-file SHA256 and matrix passed'
