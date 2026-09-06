#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-while.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_while_loop.js" --dist --out-dir "$TMP_DIR/dist" --name async_while_loop
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); globalThis.elseTick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async while true branch' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async while true branch resumed' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async while false branch' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async while false branch resumed' <<<"$OUTPUT")" -eq 1
grep -Fq 'async while done' <<<"$OUTPUT"
echo '[async-while-loop] loop resumed twice and exited through its condition'
