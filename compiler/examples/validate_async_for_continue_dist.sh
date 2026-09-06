#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-for-continue.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_for_continue.js" --dist --out-dir "$TMP_DIR/dist" --name async_for_continue
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async for continue before await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async for continue after await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async for continue after loop' <<<"$OUTPUT")" -eq 1
echo '[async-for-continue] continue resumed through the increment path'
