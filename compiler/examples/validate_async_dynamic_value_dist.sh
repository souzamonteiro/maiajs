#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-dynamic.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_dynamic_value.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_dynamic_value

OUTPUT="$(node -e "globalThis.getResponse = () => Promise.resolve({ status: 201 }); globalThis.getMessage = () => Promise.resolve('async dynamic string retained'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'async dynamic object retained' <<<"$OUTPUT"
grep -Fq 'async dynamic string retained' <<<"$OUTPUT"
echo '[async-dynamic-value] dynamic promise object and string reached resumed states'
