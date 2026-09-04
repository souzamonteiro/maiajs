#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_JS="$SCRIPT_DIR/async_await_result.js"
APP_NAME="async_await_result"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-async-await-result.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

CPP_OUT="$WORK_DIR/$APP_NAME.cpp"
DIST_DIR="$WORK_DIR/dist"
EXPECTED_MARKERS=(
  'async await result retained'
  '[node-runner] program returned: 0'
)

SOURCE_OUTPUT="$(node "$SOURCE_JS")"
if ! grep -Fqx -- "${EXPECTED_MARKERS[0]}" <<<"$SOURCE_OUTPUT"; then
  echo "[async-await-result] source marker mismatch" >&2
  printf '%s\n' "$SOURCE_OUTPUT" >&2
  exit 1
fi

"$REPO_ROOT/bin/webjs.sh" --file "$SOURCE_JS" --cpp-out "$CPP_OUT" \
  --out-dir "$DIST_DIR" --name "$APP_NAME" --dist

RUNTIME_OUTPUT="$(node "$DIST_DIR/node-runner.js")"
for marker in "${EXPECTED_MARKERS[@]}"; do
  if ! grep -Fqx -- "$marker" <<<"$RUNTIME_OUTPUT"; then
    echo "[async-await-result] compiled runtime marker mismatch: $marker" >&2
    printf '%s\n' "$RUNTIME_OUTPUT" >&2
    exit 1
  fi
done

echo "[async-await-result] source and WASM markers match"
