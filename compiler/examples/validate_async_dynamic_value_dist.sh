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

OUTPUT="$(node -e "globalThis.getResponse = () => Promise.resolve({ status: 201, meta: { status: 202 }, score: 3.5, makeMeta() { return { status: this.meta.status, score: 3.5, label: 'ready' }; }, describe(prefix) { return prefix + this.status; }, combine(prefix, meta, scale) { return prefix + (meta.status * scale); }, scale(value) { return this.status * value; }, count(a, b) { return a + b; } }); globalThis.getMessage = () => Promise.resolve('async dynamic string retained'); require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'async dynamic object retained' <<<"$OUTPUT"
grep -Fq 'async dynamic nested object retained' <<<"$OUTPUT"
grep -Fq 'async dynamic method object retained' <<<"$OUTPUT"
grep -Fq 'async dynamic method fractional property retained' <<<"$OUTPUT"
grep -Fq 'async dynamic method string property retained' <<<"$OUTPUT"
grep -Fq 'ready' <<<"$OUTPUT"
grep -Fq 'async dynamic fractional object retained' <<<"$OUTPUT"
grep -Fq 'dynamic status: 201' <<<"$OUTPUT"
grep -Fq 'dynamic meta: 505' <<<"$OUTPUT"
grep -Fq 'async dynamic string method result retained' <<<"$OUTPUT"
grep -Fq 'async dynamic fractional method result retained' <<<"$OUTPUT"
grep -Fq 'async dynamic integer method result retained' <<<"$OUTPUT"
grep -Fq '502.5' <<<"$OUTPUT"
grep -Fq 'async dynamic string retained' <<<"$OUTPUT"
echo '[async-dynamic-value] dynamic promise nested object and string reached resumed states'
