#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-nested-for-while-continue.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_nested_for_while_continue.js" --dist --out-dir "$TMP_DIR/dist" --name async_nested_for_while_continue
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async nested continue before await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested continue after await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested continue outer tail' <<<"$OUTPUT")" -eq 2
grep -Fq 'async nested continue done' <<<"$OUTPUT"
echo '[async-nested-for-while-continue] inner continue returned to its own condition'
