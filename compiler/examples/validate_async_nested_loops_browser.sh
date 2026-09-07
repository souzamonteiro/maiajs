#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

run_case() {
  local source_file="$1"
  local app_name="$2"
  local markers="$3"

  echo "[async-nested-loops-browser] validating $app_name"
  BROWSER_SOURCE_JS="$SCRIPT_DIR/$source_file" \
  BROWSER_APP_NAME="$app_name" \
  BROWSER_RUN_WAIT_MS="${BROWSER_RUN_WAIT_MS:-4000}" \
  BROWSER_VIRTUAL_TIME_MS="${BROWSER_VIRTUAL_TIME_MS:-8000}" \
  BROWSER_REQUIRED_MARKERS="$markers" \
  bash "$SCRIPT_DIR/validate_full_es8_browser.sh"
}

run_case 'async_nested_for_while.js' 'async_nested_for_while' $'async nested for while iteration\nasync nested for while resumed\nasync nested for while outer tail\nasync nested for while done\n[webc] program returned: 0'
run_case 'async_nested_while_for.js' 'async_nested_while_for' $'async nested while for iteration\nasync nested while for resumed\nasync nested while for outer tail\nasync nested while for done\n[webc] program returned: 0'
run_case 'async_nested_for_while_break.js' 'async_nested_for_while_break' $'async nested break before await\nasync nested break after await\nasync nested break outer tail\nasync nested break done\n[webc] program returned: 0'
run_case 'async_nested_for_while_continue.js' 'async_nested_for_while_continue' $'async nested continue before await\nasync nested continue after await\nasync nested continue outer tail\nasync nested continue done\n[webc] program returned: 0'

echo '[async-nested-loops-browser] all nested async loop cases passed in Chrome headless'
