#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-nested-if.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_nested_if.js" --dist --out-dir "$TMP_DIR/dist" --name async_nested_if
OUTPUT="$(node -e "globalThis.firstTick = () => Promise.resolve(0); globalThis.secondTick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async nested false branch' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async nested false branch resumed' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async nested true branch' <<<"$OUTPUT")" -eq 0
test "$(grep -Fxc 'async nested true branch resumed' <<<"$OUTPUT")" -eq 0
grep -Fq 'async nested if done' <<<"$OUTPUT"
echo '[async-nested-if] selected inner branch resumed correctly'
