#!/bin/bash
# Build/test script for compiler/examples/test.cpp
# Run from the project root: bash compiler/examples/build_test_dist.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

cd "$SCRIPT_DIR"

echo "==> webjs: compile"
"$ROOT_DIR/bin/webjs.sh" \
	--file "$ROOT_DIR/compiler/examples/full_es8_test.js" \
	--cpp-out "$SCRIPT_DIR/full_es8_test.cpp" \
	--no-webcpp

echo "==> webjs: create dist (browser + node)"
"$ROOT_DIR/bin/webjs.sh" "$ROOT_DIR/compiler/examples/full_es8_test.js" --dist --out-dir dist --name test

echo "==> dist node runner"
bash dist/node-runner.sh

echo "==> All steps OK"
