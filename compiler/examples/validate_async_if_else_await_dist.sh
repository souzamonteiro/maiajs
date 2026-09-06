#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-if-else.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
"$ROOT_DIR/bin/webjs.sh" --file "$ROOT_DIR/compiler/examples/async_if_else_await.js" --dist --out-dir "$TMP_DIR/dist" --name async_if_else_await
OUTPUT="$(node -e "globalThis.thenTick = () => Promise.resolve(0); globalThis.elseTick = () => Promise.resolve(0); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'async then after' <<<"$OUTPUT"
grep -Fq 'async else after' <<<"$OUTPUT"
if grep -Fq 'should not run' <<<"$OUTPUT"; then exit 1; fi
echo '[async-if-else-await] selected async branches resumed independently'
