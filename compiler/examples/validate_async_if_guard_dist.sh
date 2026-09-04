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

OUTPUT="$(node -e "globalThis.ready = () => Promise.resolve(1); globalThis.readySecond = () => Promise.resolve(2); globalThis.shouldNotRun = () => { throw new Error('disabled branch called first await'); }; globalThis.shouldNotRunSecond = () => { throw new Error('disabled branch called second await'); }; require(process.argv[1]);" "$TMP_DIR/dist/node-runner.js" 2>&1)"
printf '%s\n' "$OUTPUT"
grep -Fq 'enabled branch continued' <<<"$OUTPUT"
grep -Fq 'enabled before await' <<<"$OUTPUT"
grep -Fq 'enabled after first await' <<<"$OUTPUT"
grep -Fq 'enabled after second await' <<<"$OUTPUT"
test "$(grep -Fxc 'enabled after first await' <<<"$OUTPUT")" -eq 1
test "$(grep -Fxc 'enabled after second await' <<<"$OUTPUT")" -eq 1
grep -Fq 'disabled else ran' <<<"$OUTPUT"
grep -Fq 'disabled branch continued' <<<"$OUTPUT"
if grep -Fq 'enabled else should not run' <<<"$OUTPUT"; then
  exit 1
fi
if grep -Fq 'disabled before await should not run' <<<"$OUTPUT" || grep -Fq 'disabled after first await should not run' <<<"$OUTPUT" || grep -Fq 'disabled after second await should not run' <<<"$OUTPUT"; then
  exit 1
fi
echo '[async-if-guard] await follows the selected if branch and preserves continuation'
