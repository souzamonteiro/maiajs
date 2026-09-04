#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-catch-finally.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_catch_finally.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_catch_finally

OUTPUT="$(node -e "globalThis.failLater = () => Promise.reject('local catch received rejection'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
CATCH_LINE="$(grep -n -F 'local catch received rejection' <<<"$OUTPUT" | head -n1 | cut -d: -f1)"
FINALLY_LINE="$(grep -n -F 'finally after catch' <<<"$OUTPUT" | head -n1 | cut -d: -f1)"
CONTINUE_LINE="$(grep -n -F 'continued after catch finally' <<<"$OUTPUT" | head -n1 | cut -d: -f1)"
test -n "$CATCH_LINE"
test -n "$FINALLY_LINE"
test -n "$CONTINUE_LINE"
test "$CATCH_LINE" -lt "$FINALLY_LINE"
test "$FINALLY_LINE" -lt "$CONTINUE_LINE"
echo '[async-catch-finally] local catch, finally, and post-try continuation ran in order'
