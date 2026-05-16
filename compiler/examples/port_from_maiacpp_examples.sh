#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIAJS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_ROOT="$(cd "$MAIAJS_ROOT/.." && pwd)"

MAIACPP_EXAMPLES="${1:-$PROJECTS_ROOT/maiacpp/compiler/examples}"

SRC_COURSE="$MAIACPP_EXAMPLES/programming_in_cpp_course_en"
SRC_SUITE="$MAIACPP_EXAMPLES/suite"

DST_COURSE="$MAIAJS_ROOT/compiler/examples/programming_in_javascript_course_en"
DST_SUITE="$MAIAJS_ROOT/compiler/examples/suite"

if [[ ! -d "$SRC_COURSE" ]]; then
  echo "source missing: $SRC_COURSE" >&2
  exit 1
fi

if [[ ! -d "$SRC_SUITE" ]]; then
  echo "source missing: $SRC_SUITE" >&2
  exit 1
fi

mkdir -p "$DST_COURSE" "$DST_SUITE"

copy_tree_files() {
  local src_root="$1"
  local dst_root="$2"

  local copied=0
  while IFS= read -r -d '' src; do
    local rel="${src#$src_root/}"
    local dst="$dst_root/$rel"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    copied=$((copied + 1))
  done < <(find "$src_root" -type f ! -path '*/dist/*' -print0 | sort -z)

  echo "$copied"
}

echo "[port] source: $MAIACPP_EXAMPLES"
echo "[port] destination course: $DST_COURSE"
echo "[port] destination suite:  $DST_SUITE"

course_copied="$(copy_tree_files "$SRC_COURSE" "$DST_COURSE")"
suite_copied="$(copy_tree_files "$SRC_SUITE" "$DST_SUITE")"

course_js_count="$(find "$DST_COURSE" -type f -name '*.js' ! -path '*/dist/*' | wc -l | tr -d ' ')"
suite_js_count="$(find "$DST_SUITE" -type f -name '*.js' ! -path '*/dist/*' | wc -l | tr -d ' ')"
suite_expected_count="$(find "$DST_SUITE" -type f -name 'expected_output.txt' | wc -l | tr -d ' ')"

echo "[port] copied course files: $course_copied"
echo "[port] copied suite files:  $suite_copied"
echo "[port] resulting course js files: $course_js_count"
echo "[port] resulting suite js files:  $suite_js_count"
echo "[port] resulting suite expected files: $suite_expected_count"

echo "[port] done"
