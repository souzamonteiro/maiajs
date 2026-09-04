#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

export BROWSER_SOURCE_JS="$SCRIPT_DIR/async_state_machine_browser.js"
export BROWSER_APP_NAME="async_state_machine"
export BROWSER_RUN_WAIT_MS="${BROWSER_RUN_WAIT_MS:-4000}"
export BROWSER_VIRTUAL_TIME_MS="${BROWSER_VIRTUAL_TIME_MS:-8000}"
export BROWSER_REQUIRED_MARKERS=$'async start\nasync resumed\n[webc] program returned: 0'

exec bash "$SCRIPT_DIR/validate_full_es8_browser.sh"
