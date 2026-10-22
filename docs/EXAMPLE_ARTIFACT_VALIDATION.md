# Versioned example artifact validation

2026-10-21. The owner requests committing the existing generated example outputs
for GitHub review, including mobile access. This publication includes tracked
outputs from the already passing full MaiaJS build, without changing compiler
source, input examples, release versions or npm packages.

Validation of the pending artifact snapshot:
- 106 generated files: 34 WASM, 22 WAT, 46 JSON manifests and four emitted C files.
- All 34 WASM modules pass WebAssembly.validate; all manifests parse as JSON.
- Every one of the 22 modified WAT files reassembles with this repository's own
  MaiaWASM to exactly the bytes of its paired WASM file.
- `npm run test:suite:run`: PASS, 11/11 C++ examples and 11/11 JavaScript ports,
  no failures or skips, using the existing distribution artifacts.
- The complete `npm run test:full` had passed before this artifact-only
  publication. It need not regenerate timestamps solely to commit that output.

## Existing strict-C diagnostics

An extra syntax check with Clang (`--target=wasm32-unknown-unknown -std=c89
-pedantic-errors -ffreestanding -Werror=implicit-function-declaration
-fsyntax-only`) rejects these legacy generated example C files:

- suite/03_functions/functions.c: return of a void expression in a void function,
  plus undeclared printf calls.
- suite/04_classes/classes.c, suite/06_inheritance/inheritance.c and
  suite/10_casts/casts.c: undeclared printf calls.

The same strict check also fails on each corresponding file from the previous
published HEAD. These are existing generator/legacy-example limitations, not
evidence of strict C89 conformance. The actual Maia Suite distribution executions
above pass. Generated source is preserved as produced, never manually repaired
for publication. A separately scoped owner-compiler correction should add
regressions and regenerate these examples before claiming strict Clang success.

This snapshot publication does not alter the previously validated strict C89
MaiaOS shell build or MaiaGlob library; those follow their own AST-strict builds.
