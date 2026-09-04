#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-concurrent.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_concurrent_rejections.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_concurrent_rejections

OUTPUT="$(node -e "globalThis.failFirst = () => Promise.reject('first rejection retained'); globalThis.failSecond = () => Promise.reject('second rejection retained'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'first rejection retained' <<<"$OUTPUT"
grep -Fq 'second rejection retained' <<<"$OUTPUT"
echo '[async-concurrent-rejections] both rejected promises reached their own catch handlers'
