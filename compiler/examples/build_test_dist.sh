#!/bin/bash
# Build/test script for compiler/examples/test.js
# Run from the project root: bash compiler/examples/build_test_dist.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
PROJECTS_ROOT="$(cd "$ROOT_DIR/.." && pwd -P)"

resolve_webcpp() {
	local local_path="$1"
	local sibling_path="$2"
	if [[ -f "$local_path" ]]; then
		echo "$local_path"
		return 0
	fi
	if [[ -f "$sibling_path" ]]; then
		echo "$sibling_path"
		return 0
	fi
	return 1
}

WEBCPP_SH="$(resolve_webcpp "$ROOT_DIR/maiacpp/bin/webcpp.sh" "$PROJECTS_ROOT/maiacpp/bin/webcpp.sh" || true)"

if [[ -z "$WEBCPP_SH" ]]; then
	echo "ERROR: webcpp.sh not found (checked local and sibling MaiaCpp checkouts)." >&2
	exit 1
fi

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
	--file "$ROOT_DIR/compiler/examples/test.js" \
	--cpp-out "$SCRIPT_DIR/test.cpp" \
	--no-webcpp

echo "==> webcpp: create dist (browser + node)"
"$WEBCPP_SH" "$SCRIPT_DIR/test.cpp" --dist --out-dir dist --name test

echo "==> dist node runner"
DIST_TIMEOUT="${DIST_TIMEOUT:-20}"
if ! run_timed "$DIST_TIMEOUT" bash dist/node-runner.sh; then
	echo "ERROR: dist runner timeout/failure after ${DIST_TIMEOUT}s" >&2
	exit 1
fi

echo "==> All steps OK"
