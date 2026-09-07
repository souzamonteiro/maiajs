#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-nested-for-while-break.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_nested_for_while_break.js" --dist --out-dir "$TMP_DIR/dist" --name async_nested_for_while_break
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async nested break before await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested break after await' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested break outer tail' <<<"$OUTPUT")" -eq 2
grep -Fq 'async nested break done' <<<"$OUTPUT"
echo '[async-nested-for-while-break] inner break resumed through the outer increment path'
