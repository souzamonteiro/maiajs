# MaiaJS Runtime Libraries

This directory contains WebAssembly (WAT/WASM) runtime modules that are included in distribution packages.

## Structure

- `*.wasm` — Compiled WebAssembly modules (binary format)
- `*.js` — Optional JavaScript wrappers for host imports/exports

## Current Modules

- **exception.wasm** — Exception + async scheduler runtime for async/await support
  - Exception ABI: `__exc_push`, `__exc_pop`, `__exc_active`, `__exc_type`, `__exc_data`, `__exc_throw`, `__exc_matches`, `__exc_clear`
  - Async scheduler hooks: `__async_schedule(void* sm, int state_id)`, `__async_complete(void* sm)`
  - Optional diagnostics: `__async_pending_count()`, `__async_last_state()`

- **exception.js** — Optional wrapper helper to instantiate `exception.wasm` and build `env` imports

## Distribution Process

When `webjs.sh --dist` or `webjs.sh --dist-run` is invoked:

1. `bin/webjs.sh` runs the full MaiaJS compiler suite (`node --test compiler/tests/*.test.js`)
2. MaiaCpp webcpp.sh generates C++ → WAT → WASM
3. `bin/webjs.sh` detects `--dist` flag
4. `copy_dist_wasm_libs()` copies all `.wasm` files from this directory to the dist folder
5. `patch_manifest_copied_libs()` updates manifest.json with the list of included libraries

## Adding New Runtime Modules

To add a new runtime module:

1. Add `module-name.wat`/`module-name.wasm` in this directory
2. Optionally add `module-name.js` wrapper if needed
3. The next `webjs.sh --dist` invocation will include `.wasm` and matching `.js` wrapper automatically

## References

- MaiaCpp lib: `/Volumes/External_SSD/Documentos/Projects/maiacpp/lib/`
- MaiaC lib: `/Volumes/External_SSD/Documentos/Projects/maiac/lib/`
