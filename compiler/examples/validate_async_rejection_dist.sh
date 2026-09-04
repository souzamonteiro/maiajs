#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-rejection.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_rejection.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_rejection

OUTPUT="$(node -e "globalThis.failLater = () => Promise.reject('async rejection caught'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'async rejection caught' <<<"$OUTPUT"
echo '[async-rejection] rejected promise reached the async catch handler'
