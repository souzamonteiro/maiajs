#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

export BROWSER_SOURCE_JS="$SCRIPT_DIR/es8_promise_object_computed_test.js"
export BROWSER_APP_NAME='es8_promise_object_computed_test'
export BROWSER_REQUIRED_MARKERS=$'es8 promise object: 7 22 ready\n[webc] program returned: 0'

exec bash "$SCRIPT_DIR/validate_full_es8_browser.sh"
