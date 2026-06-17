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

run_timed() {
  local secs="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  else
    "$@"
  fi
}

show_log_tail() {
  local file="$1"
  local label="$2"
  if [[ -f "$file" ]]; then
    echo "[validate-full-es8] last lines from $label:" >&2
    tail -n 80 "$file" >&2 || true
  fi
}

SOURCE_TIMEOUT="${SOURCE_TIMEOUT:-120}"
PIPELINE_TIMEOUT="${PIPELINE_TIMEOUT:-1200}"
DIST_TIMEOUT="${DIST_TIMEOUT:-120}"

echo "[validate-full-es8] running source JS in Node (timeout=${SOURCE_TIMEOUT}s)"
if ! run_timed "$SOURCE_TIMEOUT" node "$SOURCE_JS" 2>&1 | tee "$SOURCE_LOG"; then
  echo "[validate-full-es8] FAIL: source execution failed or timed out." >&2
  show_log_tail "$SOURCE_LOG" "source"
  exit 3
fi

echo "[validate-full-es8] building dist with webjs --dist-run (timeout=${PIPELINE_TIMEOUT}s)"
if ! run_timed "$PIPELINE_TIMEOUT" bash -c '
  cd "$1"
  bin/webjs.sh --file "$2" --name "$3" --dist-run
' _ "$REPO_ROOT" "$SOURCE_JS" "$APP_NAME" 2>&1 | tee "$PIPELINE_LOG"; then
  echo "[validate-full-es8] FAIL: pipeline stage failed or timed out." >&2
  show_log_tail "$PIPELINE_LOG" "pipeline"
  exit 4
fi

if [[ ! -f "$DIST_RUNNER" ]]; then
  echo "[validate-full-es8] dist runner not found: $DIST_RUNNER" >&2
  exit 1
fi

echo "[validate-full-es8] running compiled dist node runner (timeout=${DIST_TIMEOUT}s)"
if ! run_timed "$DIST_TIMEOUT" node "$DIST_RUNNER" 2>&1 | tee "$DIST_LOG"; then
  echo "[validate-full-es8] FAIL: dist runner failed or timed out." >&2
  show_log_tail "$DIST_LOG" "dist"
  show_log_tail "$PIPELINE_LOG" "pipeline"
  exit 5
fi

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
