#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-for-if.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_for_if_else.js" --dist --out-dir "$TMP_DIR/dist" --name async_for_if_else
OUTPUT="$(node -e "globalThis.firstTick = () => Promise.resolve(0); globalThis.secondTick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async for true branch' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async for true branch resumed' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async for false branch' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async for false branch resumed' <<<"$OUTPUT")" -eq 1
grep -Fq 'async for branches done' <<<"$OUTPUT"
echo '[async-for-if-else] both branches resumed before the for increment'
