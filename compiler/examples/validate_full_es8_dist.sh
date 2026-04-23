#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_JS="$REPO_ROOT/compiler/examples/full_es8_test.js"
DIST_RUNNER="$REPO_ROOT/dist/node-runner.js"
APP_NAME="full_es8_test"

if [[ ! -f "$SOURCE_JS" ]]; then
  echo "[validate-full-es8] source file not found: $SOURCE_JS" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/validate-full-es8.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SOURCE_LOG="$TMP_DIR/source.log"
PIPELINE_LOG="$TMP_DIR/pipeline.log"
DIST_LOG="$TMP_DIR/dist.log"

echo "[validate-full-es8] running source JS in Node"
node "$SOURCE_JS" 2>&1 | tee "$SOURCE_LOG" >/dev/null

echo "[validate-full-es8] building dist with webjs (includes full compiler suite gate)"
(
  cd "$REPO_ROOT"
  bin/webjs.sh --file "$SOURCE_JS" --name "$APP_NAME" --dist-run
) 2>&1 | tee "$PIPELINE_LOG" >/dev/null

if [[ ! -f "$DIST_RUNNER" ]]; then
  echo "[validate-full-es8] dist runner not found: $DIST_RUNNER" >&2
  exit 1
fi

echo "[validate-full-es8] running compiled dist node runner"
node "$DIST_RUNNER" 2>&1 | tee "$DIST_LOG" >/dev/null

# Required source markers that indicate the ES8 scenario actually executed.
required_markers=(
  "ES8 SYNTAX TESTER - Running comprehensive tests"
  "SECTION 1: LITERALS & OPERATORS"
  "SECTION 8: PROMISES & ASYNC/AWAIT (ES8)"
  "ES8 SYNTAX TEST COMPLETE"
  "All syntax elements validated successfully!"
)

missing_markers=0
for marker in "${required_markers[@]}"; do
  if grep -Fq "$marker" "$SOURCE_LOG"; then
    if ! grep -Fq "$marker" "$DIST_LOG"; then
      echo "[validate-full-es8] missing dist marker: $marker" >&2
      missing_markers=$((missing_markers + 1))
    fi
  fi
done

if [[ $missing_markers -gt 0 ]]; then
  echo "[validate-full-es8] FAIL: dist output does not reproduce source runtime markers." >&2
  echo "[validate-full-es8] source log: $SOURCE_LOG" >&2
  echo "[validate-full-es8] dist log:   $DIST_LOG" >&2
  echo "[validate-full-es8] pipeline log: $PIPELINE_LOG" >&2
  exit 2
fi

echo "[validate-full-es8] PASS: dist output reproduced required source runtime markers."
