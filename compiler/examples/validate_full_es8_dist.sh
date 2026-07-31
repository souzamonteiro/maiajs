#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_JS="$REPO_ROOT/compiler/examples/full_es8_test.js"
SUBMODULE_WEBCPP_SH="$REPO_ROOT/maiacpp/bin/webcpp.sh"
WEBCPP_SH="$SUBMODULE_WEBCPP_SH"
APP_NAME="full_es8_test"

if [[ ! -f "$SOURCE_JS" ]]; then
  echo "[validate-full-es8] source file not found: $SOURCE_JS" >&2
  exit 1
fi
if [[ ! -x "$WEBCPP_SH" ]]; then
  echo "[validate-full-es8] MaiaCpp webcpp.sh not found or not executable in MaiaJS submodule: $SUBMODULE_WEBCPP_SH" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/validate-full-es8.XXXXXX)"
if [[ "${KEEP_TMP:-0}" == "1" ]]; then
  trap 'echo "[validate-full-es8] keeping temp dir: $TMP_DIR" >&2' EXIT
else
  trap 'rm -rf "$TMP_DIR"' EXIT
fi

SOURCE_LOG="$TMP_DIR/source.log"
TRANSPILE_LOG="$TMP_DIR/transpile.log"
PIPELINE_LOG="$TMP_DIR/maiacpp.log"
DIST_LOG="$TMP_DIR/dist.log"
CPP_OUT="$TMP_DIR/$APP_NAME.cpp"
DIST_DIR="$TMP_DIR/dist"
DIST_RUNNER="$DIST_DIR/node-runner.js"

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
FAIL_ON_LOWERING_WARNINGS="${FAIL_ON_LOWERING_WARNINGS:-1}"

echo "[validate-full-es8] running source JS in Node (timeout=${SOURCE_TIMEOUT}s)"
if ! run_timed "$SOURCE_TIMEOUT" node "$SOURCE_JS" 2>&1 | tee "$SOURCE_LOG"; then
  echo "[validate-full-es8] FAIL: source execution failed or timed out." >&2
  show_log_tail "$SOURCE_LOG" "source"
  exit 3
fi

echo "[validate-full-es8] transpiling JS -> C++98 with webjs (timeout=${PIPELINE_TIMEOUT}s)"
if ! run_timed "$PIPELINE_TIMEOUT" bash -c '
  cd "$1"
  bin/webjs.sh --file "$2" --cpp-out "$3" --no-webcpp
' _ "$REPO_ROOT" "$SOURCE_JS" "$CPP_OUT" 2>&1 | tee "$TRANSPILE_LOG"; then
  echo "[validate-full-es8] FAIL: JS -> C++ transpile stage failed or timed out." >&2
  show_log_tail "$TRANSPILE_LOG" "transpile"
  exit 4
fi

if [[ ! -f "$CPP_OUT" ]]; then
  echo "[validate-full-es8] generated C++ not found: $CPP_OUT" >&2
  show_log_tail "$TRANSPILE_LOG" "transpile"
  exit 4
fi

if [[ "$FAIL_ON_LOWERING_WARNINGS" == "1" ]]; then
  lowering_warning_count="$(sed -n 's/^\[maiajs\] lowering warnings: \([0-9][0-9]*\)$/\1/p' "$TRANSPILE_LOG" | tail -n 1)"
  if [[ -n "$lowering_warning_count" && "$lowering_warning_count" != "0" ]]; then
    echo "[validate-full-es8] FAIL: transpile completed with ${lowering_warning_count} lowering warning(s)." >&2
    echo "[validate-full-es8] refusing to continue into MaiaCpp because the generated C++ is already semantically degraded." >&2
    show_log_tail "$TRANSPILE_LOG" "transpile"
    echo "[validate-full-es8] temp dir: $TMP_DIR" >&2
    echo "[validate-full-es8] rerun with FAIL_ON_LOWERING_WARNINGS=0 to force the full MaiaCpp/WebC pipeline." >&2
    exit 6
  fi
fi

echo "[validate-full-es8] building MaiaCpp dist (timeout=${PIPELINE_TIMEOUT}s)"
if ! run_timed "$PIPELINE_TIMEOUT" "$WEBCPP_SH" "$CPP_OUT" --dist --out-dir "$DIST_DIR" --name "$APP_NAME" 2>&1 | tee "$PIPELINE_LOG"; then
  echo "[validate-full-es8] FAIL: MaiaCpp dist stage failed or timed out." >&2
  show_log_tail "$PIPELINE_LOG" "MaiaCpp"
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
  show_log_tail "$TRANSPILE_LOG" "transpile"
  show_log_tail "$PIPELINE_LOG" "MaiaCpp"
  exit 5
fi

# Required source markers that indicate the ES8 scenario actually executed.
required_markers=(
  "ES8 SYNTAX TESTER - compatibility mode"
  "--- SECTION 1: OPERATORS ---"
  "--- SECTION 8: PROMISES ---"
  "--- SECTION 13: REFLECT + COLLECTIONS ---"
  "ES8 SYNTAX TEST COMPLETE (compatibility mode)"
  "promise chain result: 13"
  "promise result: AB"
)

missing_markers=0
for marker in "${required_markers[@]}"; do
  if ! grep -Fq -- "$marker" "$SOURCE_LOG"; then
    echo "[validate-full-es8] missing source marker: $marker" >&2
    missing_markers=$((missing_markers + 1))
  elif ! grep -Fq -- "$marker" "$DIST_LOG"; then
    echo "[validate-full-es8] missing dist marker: $marker" >&2
    missing_markers=$((missing_markers + 1))
  fi
done

if [[ $missing_markers -gt 0 ]]; then
  echo "[validate-full-es8] FAIL: dist output does not reproduce source runtime markers." >&2
  echo "[validate-full-es8] source log: $SOURCE_LOG" >&2
  echo "[validate-full-es8] dist log:   $DIST_LOG" >&2
  echo "[validate-full-es8] transpile log: $TRANSPILE_LOG" >&2
  echo "[validate-full-es8] MaiaCpp log:   $PIPELINE_LOG" >&2
  exit 2
fi

echo "[validate-full-es8] PASS: dist output reproduced required source runtime markers."
