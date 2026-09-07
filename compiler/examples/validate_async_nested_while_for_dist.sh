#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-nested-while-for.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_nested_while_for.js" --dist --out-dir "$TMP_DIR/dist" --name async_nested_while_for
OUTPUT="$(node -e "globalThis.tick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
test "$(grep -Fxc 'async nested while for iteration' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested while for resumed' <<<"$OUTPUT")" -eq 2
test "$(grep -Fxc 'async nested while for outer tail' <<<"$OUTPUT")" -eq 2
grep -Fq 'async nested while for done' <<<"$OUTPUT"
echo '[async-nested-while-for] inner loop returned through the outer condition path'
