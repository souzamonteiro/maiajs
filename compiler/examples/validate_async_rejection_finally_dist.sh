#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-rejection-finally.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_rejection_finally.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_rejection_finally

OUTPUT="$(node -e "globalThis.failLater = () => Promise.reject('expected failure'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'async rejection finally' <<<"$OUTPUT"
echo '[async-rejection-finally] rejected promise executed the async finally handler'
