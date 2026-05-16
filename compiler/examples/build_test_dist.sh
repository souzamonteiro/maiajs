#!/bin/bash
# Build/test script for compiler/examples/test.cpp
# Run from the project root: bash compiler/examples/build_test_dist.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

rm -rf "$SCRIPT_DIR/dist"
rm -rf "$SCRIPT_DIR/out"

cd "$SCRIPT_DIR"

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

echo "==> webjs: compile"
"$ROOT_DIR/bin/webjs.sh" \
	--file "$ROOT_DIR/compiler/examples/full_es8_test.js" \
	--cpp-out "$SCRIPT_DIR/full_es8_test.cpp" \
	--no-webcpp

echo "==> webjs: create dist (browser + node)"
"$ROOT_DIR/bin/webjs.sh" "$ROOT_DIR/compiler/examples/full_es8_test.js" --dist --out-dir dist --name test

echo "==> dist node runner"
DIST_TIMEOUT="${DIST_TIMEOUT:-20}"
if ! run_timed "$DIST_TIMEOUT" bash dist/node-runner.sh; then
	echo "ERROR: dist runner timeout/failure after ${DIST_TIMEOUT}s" >&2
	exit 1
fi

echo "==> All steps OK"
