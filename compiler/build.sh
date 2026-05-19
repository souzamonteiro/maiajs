#!/bin/sh

set -eu

# Build the parser for EcmaScript using tREx.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TREX_LOCAL="$REPO_DIR/maiacc/bin/tREx.sh"

if [ -x "$TREX_LOCAL" ]; then
	TREX="$TREX_LOCAL"
else
	echo "Erro: tREx.sh nao encontrado no submodulo requerido '$TREX_LOCAL'." >&2
	exit 127
fi

"$TREX" "$REPO_DIR/grammar/EcmaScript.ebnf" "$SCRIPT_DIR/ecmascript-parser.js"
