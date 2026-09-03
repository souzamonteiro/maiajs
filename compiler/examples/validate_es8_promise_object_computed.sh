#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE="$SCRIPT_DIR/es8_promise_object_computed_test.js"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maiajs-es8-promise-object.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

CPP_OUT="$WORK_DIR/es8_promise_object_computed_test.cpp"
DIST_DIR="$WORK_DIR/dist"
EXPECTED_MARKER='es8 promise object: 7 22 ready'

SOURCE_OUTPUT="$(node "$SOURCE")"
if ! grep -Fqx "$EXPECTED_MARKER" <<<"$SOURCE_OUTPUT"; then
  echo "[es8-promise-object] source marker mismatch" >&2
  printf '%s\n' "$SOURCE_OUTPUT" >&2
  exit 1
fi

"$REPO_ROOT/bin/webjs.sh" --file "$SOURCE" --cpp-out "$CPP_OUT" --no-webcpp
"$REPO_ROOT/maiacpp/bin/webcpp.sh" "$CPP_OUT" \
  --dist --out-dir "$DIST_DIR" --name es8_promise_object_computed_test

RUNTIME_OUTPUT="$(node "$DIST_DIR/node-runner.js")"
if ! grep -Fqx "$EXPECTED_MARKER" <<<"$RUNTIME_OUTPUT"; then
  echo "[es8-promise-object] compiled runtime marker mismatch" >&2
  printf '%s\n' "$RUNTIME_OUTPUT" >&2
  exit 1
fi
if ! grep -Fqx '[node-runner] program returned: 0' <<<"$RUNTIME_OUTPUT"; then
  echo "[es8-promise-object] compiled runtime did not return 0" >&2
  printf '%s\n' "$RUNTIME_OUTPUT" >&2
  exit 1
fi

echo "[es8-promise-object] source and WASM markers match"
