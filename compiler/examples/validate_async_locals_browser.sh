#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

export BROWSER_SOURCE_JS="$SCRIPT_DIR/async_locals_across_await.js"
export BROWSER_APP_NAME="async_locals_across_await"
export BROWSER_RUN_WAIT_MS="${BROWSER_RUN_WAIT_MS:-4000}"
export BROWSER_VIRTUAL_TIME_MS="${BROWSER_VIRTUAL_TIME_MS:-8000}"
export BROWSER_REQUIRED_MARKERS=$'async local start\nasync local retained\n[webc] program returned: 0'

exec bash "$SCRIPT_DIR/validate_full_es8_browser.sh"
