#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-nested-rejection.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_nested_rejection.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_nested_rejection

OUTPUT="$(node -e "globalThis.failLater = () => Promise.reject('outer catch received rejection'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
FINALLY_LINE="$(grep -n -F 'inner finally ran' <<<"$OUTPUT" | head -n1 | cut -d: -f1)"
CATCH_LINE="$(grep -n -F 'outer catch received rejection' <<<"$OUTPUT" | head -n1 | cut -d: -f1)"
test -n "$FINALLY_LINE"
test -n "$CATCH_LINE"
test "$FINALLY_LINE" -lt "$CATCH_LINE"
echo '[async-nested-rejection] inner finally ran before the outer catch'
