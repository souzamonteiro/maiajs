#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
PROJECTS_ROOT="$(cd "$REPO_ROOT/.." && pwd -P)"

COMPILER_JS="$REPO_ROOT/compiler/ecmascript-compiler.js"

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

WEBCPP_SH="$(resolve_webcpp "$PROJECTS_ROOT/maiacpp/bin/webcpp.sh" "$REPO_ROOT/maiacpp/bin/webcpp.sh" || true)"

usage() {
  cat <<'EOF'
Usage: webjs.sh <input.js> [options]
   or: webjs.sh --file <input.js> [options]

Options:
  --file FILE          Input JavaScript/ECMAScript source file.
  --out-dir DIR        Output directory (default: ./out).
  --ast-show           Print AST tree from JS parser.
  --ast-xml-out FILE   Write AST XML file.
  --ast-json-out FILE  Write AST JSON file.
  --ir-json-out FILE   Write compiler IR JSON (placeholder).
  --cpp-out FILE       Write generated C++ file (default: <out-dir>/<name>.cpp).
  --name NAME          Base output name (default: input filename stem).
  --no-webcpp          Only generate C++ (skip MaiaCpp webcpp.sh invocation).
  -h, --help           Show help.

Dist behavior:
  --dist / --dist-run  First runs the full MaiaJS compiler test suite
                       (`node --test compiler/tests/*.test.js`). Dist output is
                       generated only if that suite passes.

Any unknown options are forwarded to MaiaCpp webcpp.sh (unless --no-webcpp).

Examples:
  webjs.sh ./examples/app.js --ast-show --no-webcpp
  webjs.sh ./examples/app.js --out-dir ./out --wat --wasm-out ./out/app.wasm
  webjs.sh --file ./examples/app.js --name app --dist --run
EOF
}

err() {
  echo "Error: $*" >&2
  exit 1
}

run_full_compiler_suite() {
  echo "[webjs] running full compiler suite before dist build"
  (
    cd "$REPO_ROOT"
    node --test compiler/tests/*.test.js
  )
}

# Distribution support: copy WAT runtime libs from maiajs/lib to dist directory
COPIED_LIB_NAMES=()

copy_dist_wasm_libs() {
  local dist_dir="$1"
  local app_wasm_basename="$2"
  local copied=0
  local skipped=0
  COPIED_LIB_NAMES=()

  mkdir -p "$dist_dir"

  copy_from_lib_dir() {
    local lib_dir="$1"
    local src
    local base
    local stem
    if [[ ! -d "$lib_dir" ]]; then
      return 0
    fi
    for src in "$lib_dir"/*.wasm; do
      [[ -f "$src" ]] || continue
      base="$(basename "$src")"
      stem="${base%.wasm}"
      if [[ "$base" == "$app_wasm_basename" ]]; then
        skipped=$((skipped + 1))
        continue
      fi
      if [[ -f "$dist_dir/$base" ]]; then
        skipped=$((skipped + 1))
        continue
      fi
      cp -f "$src" "$dist_dir/$base"
      if [[ -f "$lib_dir/$stem.js" ]] && [[ ! -f "$dist_dir/$stem.js" ]]; then
        cp -f "$lib_dir/$stem.js" "$dist_dir/$stem.js"
      fi
      COPIED_LIB_NAMES+=("$stem")
      copied=$((copied + 1))
    done
  }

  copy_from_lib_dir "$REPO_ROOT/lib"

  echo "[webjs] dist libs copied: $copied (skipped: $skipped)"
}

patch_manifest_copied_libs() {
  local dist_dir="$1"
  local ir_json_path="$2"
  local manifest="$dist_dir/manifest.json"
  [[ -f "$manifest" ]] || return 0

  local has_patch=0
  local copied_lib_count=0
  if declare -p COPIED_LIB_NAMES >/dev/null 2>&1; then
    copied_lib_count=${#COPIED_LIB_NAMES[@]}
  fi

  if [[ $copied_lib_count -gt 0 ]]; then
    has_patch=1
  fi
  if [[ -f "$ir_json_path" ]]; then
    has_patch=1
  fi
  [[ $has_patch -eq 1 ]] || return 0

  local names_json
  if [[ $copied_lib_count -gt 0 ]]; then
    names_json="$(printf '"%s",' "${COPIED_LIB_NAMES[@]}")"
    names_json="[${names_json%,}]"
  else
    names_json='[]'
  fi

  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const libs = JSON.parse(process.argv[2]);
    const irPath = process.argv[3];
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (libs.length > 0) {
      m.copiedLibraries = libs;
    }
    if (irPath && fs.existsSync(irPath)) {
      const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
      if (ir && ir.asyncRuntime && Array.isArray(ir.asyncRuntime.resumeBridges)) {
        m.asyncRuntime = {
          resumeBridges: ir.asyncRuntime.resumeBridges
        };
      }
    }
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\\n');
  " "$manifest" "$names_json" "$ir_json_path"

  if [[ ${#COPIED_LIB_NAMES[@]} -gt 0 ]]; then
    echo "[webjs] manifest patched: copiedLibraries → ${#COPIED_LIB_NAMES[@]} lib(s)"
  fi
  if [[ -f "$ir_json_path" ]]; then
    echo "[webjs] manifest patched: asyncRuntime.resumeBridges from $(basename "$ir_json_path")"
  fi
}

INPUT_FILE=""
OUT_DIR=""
AST_SHOW=0
AST_XML_OUT=""
AST_JSON_OUT=""
IR_JSON_OUT=""
CPP_OUT=""
NAME=""
NO_WEBCPP=0
HAS_DIST=0
FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      [[ $# -ge 2 ]] || err "missing value for --file"
      INPUT_FILE="$2"
      shift 2
      ;;
    --out-dir)
      [[ $# -ge 2 ]] || err "missing value for --out-dir"
      OUT_DIR="$2"
      shift 2
      ;;
    --ast-show)
      AST_SHOW=1
      shift
      ;;
    --ast-xml-out)
      [[ $# -ge 2 ]] || err "missing value for --ast-xml-out"
      AST_XML_OUT="$2"
      shift 2
      ;;
    --ast-json-out)
      [[ $# -ge 2 ]] || err "missing value for --ast-json-out"
      AST_JSON_OUT="$2"
      shift 2
      ;;
    --ir-json-out)
      [[ $# -ge 2 ]] || err "missing value for --ir-json-out"
      IR_JSON_OUT="$2"
      shift 2
      ;;
    --cpp-out)
      [[ $# -ge 2 ]] || err "missing value for --cpp-out"
      CPP_OUT="$2"
      shift 2
      ;;
    --name)
      [[ $# -ge 2 ]] || err "missing value for --name"
      NAME="$2"
      shift 2
      ;;
    --no-webcpp)
      NO_WEBCPP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        FORWARD_ARGS+=("$1")
        shift
      done
      ;;
    -*)
      if [[ "$1" == "--dist" ]] || [[ "$1" == "--dist-run" ]]; then
        HAS_DIST=1
      fi
      FORWARD_ARGS+=("$1")
      shift
      ;;
    *)
      if [[ -z "$INPUT_FILE" ]]; then
        INPUT_FILE="$1"
      else
        FORWARD_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

[[ -n "$INPUT_FILE" ]] || err "missing input file"
[[ -f "$INPUT_FILE" ]] || err "input file not found: $INPUT_FILE"
[[ -f "$COMPILER_JS" ]] || err "compiler not found: $COMPILER_JS"

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="./out"
fi
mkdir -p "$OUT_DIR"

if [[ -z "$NAME" ]]; then
  base_name="$(basename "$INPUT_FILE")"
  NAME="${base_name%.*}"
fi

if [[ -z "$CPP_OUT" ]]; then
  CPP_OUT="$OUT_DIR/$NAME.cpp"
fi

if [[ -z "$AST_XML_OUT" ]]; then
  AST_XML_OUT="$OUT_DIR/$NAME.ast.xml"
fi
if [[ -z "$AST_JSON_OUT" ]]; then
  AST_JSON_OUT="$OUT_DIR/$NAME.ast.json"
fi
if [[ -z "$IR_JSON_OUT" ]]; then
  IR_JSON_OUT="$OUT_DIR/$NAME.ir.json"
fi

compiler_args=(
  --file "$INPUT_FILE"
  --cpp-out "$CPP_OUT"
  --ast-xml-out "$AST_XML_OUT"
  --ast-json-out "$AST_JSON_OUT"
  --ir-json-out "$IR_JSON_OUT"
)

if [[ $AST_SHOW -eq 1 ]]; then
  compiler_args+=(--ast-show)
fi

echo "[webjs] transpiling JS -> C++: $INPUT_FILE"
if [[ $HAS_DIST -eq 1 ]]; then
  run_full_compiler_suite
fi

node "$COMPILER_JS" "${compiler_args[@]}"

echo "[webjs] C++ emitted: $CPP_OUT"

if [[ $NO_WEBCPP -eq 1 ]]; then
  echo "[webjs] --no-webcpp set, stopping after C++ emission"
  exit 0
fi

[[ -n "$WEBCPP_SH" ]] || err "could not find MaiaCpp webcpp.sh"

echo "[webjs] invoking MaiaCpp pipeline: $WEBCPP_SH"
"$WEBCPP_SH" "$CPP_OUT" "${FORWARD_ARGS[@]}"

# If distribution was requested, copy WAT runtime libs to the dist folder
if [[ $HAS_DIST -eq 1 ]]; then
  DIST_DIR="$OUT_DIR"
  if [[ -z "$DIST_DIR" ]]; then
    DIST_DIR="$PWD/dist"
  fi
  DIST_APP_NAME="$NAME"
  if [[ -z "$DIST_APP_NAME" ]]; then
    DIST_APP_NAME="$(basename "$CPP_OUT")"
  fi
  copy_dist_wasm_libs "$DIST_DIR" "$DIST_APP_NAME.wasm"
  patch_manifest_copied_libs "$DIST_DIR" "$IR_JSON_OUT"
fi
