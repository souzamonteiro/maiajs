#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_JS="${BROWSER_SOURCE_JS:-$SCRIPT_DIR/full_es8_test.js}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
REQUESTED_PORT="${BROWSER_PORT:-0}"
APP_NAME="${BROWSER_APP_NAME:-full_es8_test}"
RUN_WAIT_MS="${BROWSER_RUN_WAIT_MS:-12000}"
VIRTUAL_TIME_MS="${BROWSER_VIRTUAL_TIME_MS:-20000}"

for required in "$SOURCE_JS" "$REPO_ROOT/bin/webjs.sh" "$CHROME_BIN"; do
  if [[ ! -e "$required" ]]; then
    echo "[validate-full-es8-browser] required file not found: $required" >&2
    exit 1
  fi
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "[validate-full-es8-browser] python3 is required to serve the temporary dist." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/validate-full-es8-browser.XXXXXX)"
SERVER_PID=""
CHROME_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CHROME_PID" ]]; then
    kill "$CHROME_PID" >/dev/null 2>&1 || true
    wait "$CHROME_PID" >/dev/null 2>&1 || true
  fi
  if [[ "${KEEP_TMP:-0}" == "1" ]]; then
    echo "[validate-full-es8-browser] keeping temp dir: $TMP_DIR" >&2
  else
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

CPP_OUT="$TMP_DIR/$APP_NAME.cpp"
DIST_DIR="$TMP_DIR/dist"
SERVER_LOG="$TMP_DIR/http.log"
CHROME_LOG="$TMP_DIR/chrome.log"
DOM_OUT="$TMP_DIR/browser-dom.html"

echo "[validate-full-es8-browser] building browser dist through MaiaJS"
"$REPO_ROOT/bin/webjs.sh" --file "$SOURCE_JS" --cpp-out "$CPP_OUT" \
  --out-dir "$DIST_DIR" --name "$APP_NAME" --dist

echo "[validate-full-es8-browser] serving temporary dist"
python3 -u -m http.server "$REQUESTED_PORT" --directory "$DIST_DIR" >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"
PORT=""
for _ in {1..50}; do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    cat "$SERVER_LOG" >&2 || true
    exit 1
  fi
  PORT="$(sed -n 's/.*port \([0-9][0-9]*\).*/\1/p' "$SERVER_LOG" | tail -n 1)"
  if [[ -n "$PORT" ]]; then
    break
  fi
  sleep 0.1
done
if [[ -z "$PORT" ]]; then
  echo "[validate-full-es8-browser] server did not report its listening port." >&2
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi
if ! curl --fail --silent --show-error "http://127.0.0.1:$PORT/browser-runner.html" >/dev/null; then
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi

echo "[validate-full-es8-browser] running Chrome headless"
"$CHROME_BIN" \
  --headless=new \
  --disable-gpu \
  --disable-background-networking \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$TMP_DIR/chrome-profile" \
  --remote-debugging-port=0 \
  about:blank > /dev/null 2>"$CHROME_LOG" &
CHROME_PID="$!"

CDP_BASE_URL=""
for _ in {1..50}; do
  CDP_WS_URL="$(sed -n 's/DevTools listening on \(ws:\/\/[^ ]*\).*/\1/p' "$CHROME_LOG" | tail -n 1)"
  if [[ -n "$CDP_WS_URL" ]]; then
    CDP_BASE_URL="${CDP_WS_URL/ws:\/\//http:\/\/}"
    CDP_BASE_URL="${CDP_BASE_URL%%/devtools/*}"
    break
  fi
  sleep 0.1
done
if [[ -z "$CDP_BASE_URL" ]]; then
  echo "[validate-full-es8-browser] Chrome did not expose DevTools." >&2
  cat "$CHROME_LOG" >&2 || true
  exit 1
fi

if ! node "$SCRIPT_DIR/validate_browser_runner_cdp.js" \
  "$CDP_BASE_URL" "http://127.0.0.1:$PORT/browser-runner.html?app=$APP_NAME" "$RUN_WAIT_MS" \
  >"$DOM_OUT" 2>>"$CHROME_LOG"; then
  echo "[validate-full-es8-browser] Chrome runner probe failed." >&2
  cat "$CHROME_LOG" >&2 || true
  exit 1
fi

if [[ -n "${BROWSER_REQUIRED_MARKERS:-}" ]]; then
  IFS=$'\n' read -r -d '' -a required_markers <<<"$BROWSER_REQUIRED_MARKERS" || true
else
  required_markers=(
    "ES8 SYNTAX TESTER - compatibility mode"
    "--- SECTION 1: OPERATORS ---"
    "--- SECTION 8: PROMISES ---"
    "--- SECTION 13: REFLECT + COLLECTIONS ---"
    "promise chain result: 13"
    "promise result: AB"
    "ES8 SYNTAX TEST COMPLETE (compatibility mode)"
    "[webc] program returned: 0"
  )
fi

missing=0
for marker in "${required_markers[@]}"; do
  if ! grep -Fq -- "$marker" "$DOM_OUT"; then
    echo "[validate-full-es8-browser] missing browser marker: $marker" >&2
    missing=$((missing + 1))
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "[validate-full-es8-browser] FAIL: browser runner output did not reproduce all required markers." >&2
  echo "[validate-full-es8-browser] browser DOM: $DOM_OUT" >&2
  echo "[validate-full-es8-browser] Chrome log: $CHROME_LOG" >&2
  exit 1
fi

echo "[validate-full-es8-browser] PASS: Chrome headless reproduced all required markers."
