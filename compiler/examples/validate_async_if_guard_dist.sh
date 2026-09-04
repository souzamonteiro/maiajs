#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-if-guard.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

"$ROOT_DIR/bin/webjs.sh" \
  --file "$ROOT_DIR/compiler/examples/async_if_guard.js" \
  --dist \
  --out-dir "$TMP_DIR/dist" \
  --name async_if_guard

OUTPUT="$(node -e "globalThis.ready = () => Promise.resolve(1); globalThis.shouldNotRun = () => { throw new Error('disabled branch called await'); }; require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'enabled branch continued' <<<"$OUTPUT"
grep -Fq 'enabled before await' <<<"$OUTPUT"
grep -Fq 'enabled after await' <<<"$OUTPUT"
grep -Fq 'disabled else ran' <<<"$OUTPUT"
grep -Fq 'disabled branch continued' <<<"$OUTPUT"
if grep -Fq 'enabled else should not run' <<<"$OUTPUT"; then
  exit 1
fi
if grep -Fq 'disabled before await should not run' <<<"$OUTPUT" || grep -Fq 'disabled after await should not run' <<<"$OUTPUT"; then
  exit 1
fi
echo '[async-if-guard] await follows the selected if branch and preserves continuation'
