#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_JS="$SCRIPT_DIR/full_es8_test.js"
WEBCPP_SH="$REPO_ROOT/maiacpp/bin/webcpp.sh"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
REQUESTED_PORT="${BROWSER_PORT:-0}"
APP_NAME="full_es8_test"
RUN_WAIT_MS="${BROWSER_RUN_WAIT_MS:-12000}"
VIRTUAL_TIME_MS="${BROWSER_VIRTUAL_TIME_MS:-20000}"

for required in "$SOURCE_JS" "$WEBCPP_SH" "$CHROME_BIN"; do
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
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CPP_OUT="$TMP_DIR/$APP_NAME.cpp"
DIST_DIR="$TMP_DIR/dist"
HARNESS="$DIST_DIR/browser-headless-harness.html"
SERVER_LOG="$TMP_DIR/http.log"
CHROME_LOG="$TMP_DIR/chrome.log"
DOM_OUT="$TMP_DIR/browser-dom.html"

echo "[validate-full-es8-browser] transpiling JS -> C++98"
"$REPO_ROOT/bin/webjs.sh" --file "$SOURCE_JS" --cpp-out "$CPP_OUT" --no-webcpp

echo "[validate-full-es8-browser] building browser dist"
"$WEBCPP_SH" "$CPP_OUT" --dist --out-dir "$DIST_DIR" --name "$APP_NAME"

cat > "$HARNESS" <<HTML
<!doctype html>
<meta charset="utf-8">
<iframe id="runner" src="./browser-runner.html?app=full_es8_test"></iframe>
<pre id="result">waiting</pre>
<script>
  const frame = document.getElementById('runner');
  frame.addEventListener('load', () => setTimeout(() => {
    const runnerDocument = frame.contentDocument;
    runnerDocument.getElementById('run').click();
    setTimeout(() => {
      document.getElementById('result').textContent =
        runnerDocument.getElementById('status').textContent + '\n' +
        runnerDocument.getElementById('output').textContent;
    }, $RUN_WAIT_MS);
  }, 0));
</script>
HTML

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
if ! curl --fail --silent --show-error "http://127.0.0.1:$PORT/browser-headless-harness.html" >/dev/null; then
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
  --virtual-time-budget="$VIRTUAL_TIME_MS" \
  --dump-dom \
  "http://127.0.0.1:$PORT/browser-headless-harness.html" \
  >"$DOM_OUT" 2>"$CHROME_LOG"

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
