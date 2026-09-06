#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-for-break.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_for_break.js" --dist --out-dir "$TMP_DIR/dist" --name async_for_break
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async for break before await' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async for break after await' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'async for break after loop' <<<"$OUTPUT")" -eq 1
echo '[async-for-break] break resumed into the post-loop continuation'
