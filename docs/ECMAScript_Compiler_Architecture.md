# ECMAScript Compiler Architecture (ES8 -> C++98 -> WASM)

## Purpose

This document defines the architecture for a JavaScript/ECMAScript compiler in the Maia ecosystem, following the same operational style as MaiaCpp:

- MaiaCpp compiler: `maiacpp/compiler/cpp-compiler.js`
- MaiaCpp CLI wrapper: `maiacpp/bin/webcpp.sh`

Proposed JavaScript equivalents:

- ECMAScript compiler: `compiler/ecmascript-compiler.js`
- ECMAScript CLI wrapper: `bin/webjs.sh`

The main goal is to compile large ES2017/ES8 codebases (including `async/await`) to WASM through a JS -> C++98 lowering path and the existing MaiaCpp toolchain.

## High-Level Pipeline

1. Parse ECMAScript source
- Input: `.js` source file
- Parser: `compiler/ecmascript-parser.js`
- Tree collector: `compiler/parse-tree-collector.js`
- Output: concrete parse tree + normalized AST

2. Semantic normalization
- Resolve declaration shapes (function/async/generator/class/module forms)
- Normalize binding patterns and destructuring
- Normalize expression forms for lowering (optional chaining/future extensions can be added here)

3. Lowering to async-safe IR
- Build an explicit control-flow IR suitable for C++98 emission
- Desugar ES features to core IR operations
- Critical transform: `async/await` -> resumable state machine

4. C++98 code generation
- Emit C++98 source compatible with MaiaCpp and WASM compilation path
- Generate runtime hooks for:
  - promise/task scheduling
  - continuation resume points
  - exception propagation equivalent semantics

5. WASM build via MaiaCpp
- Invoke `maiacpp/bin/webcpp.sh` with generated C++
- Reuse MaiaCpp dist and packaging flags

6. Host binding by MaiaC
- Preserve MaiaCpp host-call naming conventions in emitted C++ symbols.
- Let MaiaC auto-generate WAT + JS glue for host functions.

## Compiler Components

`compiler/ecmascript-compiler.js` is structured in stages:

- `parseSource(sourceText)`
- `buildAst(parseTree)`
- `analyzeSemantics(ast)`
- `lowerToIr(ast, semanticInfo)`
- `emitCpp(ir, options)`
- `emitMetadata(ir, options)`

Recommended internal module split (future incremental extraction):

- `compiler/ecmascript/ast-builder.js`
- `compiler/ecmascript/semantic-analyzer.js`
- `compiler/ecmascript/ir-builder.js`
- `compiler/ecmascript/lower-async.js`
- `compiler/ecmascript/cpp-emitter.js`
- `compiler/ecmascript/runtime-contract.js`

## Host Interop Contract (Critical)

The transpiler must follow MaiaCpp host interop semantics:

- Any function with `__` prefix is a host function.
- Object method access uses `__` between object and method names instead of `.`.

Example mapping:

- JavaScript: `console.log("Hello")`
- Emitted call: `__console__log("Hello")`

This is not cosmetic; it is the ABI contract expected by the Maia toolchain. MaiaC generates the WAT and JS wrapper code so these host calls work in browser and Node runtimes.

### Lowering Rules for Host Calls

The code generator should apply these rules before C++ emission:

1. Member call lowering
- `obj.method(a, b)` -> `__obj__method(a, b)` when `obj.method` is a host-known API.

2. Global host function lowering
- `hostFn(x)` -> `__hostFn(x)` for configured host entrypoints.

3. Namespace-like chains
- `console.error(x)` -> `__console__error(x)`.

4. Property reads/writes
- Keep regular JS object semantics in runtime structures unless explicitly modeled as host APIs.

### Host Registry

To avoid hardcoding all host functions in the emitter, maintain a registry file (future module) with patterns such as:

- `console.log` -> `__console__log`
- `console.error` -> `__console__error`
- `Math.*` mappings where applicable
- browser and Node host surfaces used by the project

This registry should drive semantic classification of "host call" vs "normal JS object call".

## Async/Await Lowering Strategy

Core idea:

- Each async function becomes a generated state machine object.
- `await expr` becomes:
  - evaluate `expr`
  - register continuation callback with current state id
  - suspend function
  - resume at next state when promise resolves/rejects

Semantic requirements:

- Preserve ordering and microtask-like behavior as closely as possible
- Preserve `try/catch/finally` around await suspension points
- Preserve return/throw mapping to promise resolve/reject

C++98 target constraints:

- No native coroutines
- No native promises
- Runtime shim must provide scheduler + task abstraction

Host interaction during async lowering:

- Await suspension/resume points may cross host boundaries.
- Generated state machine code must preserve host-call ordering and error propagation.

## CLI Design

### `compiler/ecmascript-compiler.js`

Responsibilities:

- Parse JS
- Optionally emit AST XML/JSON
- Emit generated C++ source
- Emit optional IR/manifest artifacts

Suggested options:

- `--file <input.js>`
- `--ast-show`
- `--ast-xml-out <file>`
- `--ast-json-out <file>`
- `--cpp-out <file>`
- `--ir-json-out <file>`

### `bin/webjs.sh`

Responsibilities:

- Front-end CLI for JS users
- Calls `compiler/ecmascript-compiler.js`
- Calls `maiacpp/bin/webcpp.sh` on emitted C++
- Option pass-through to MaiaCpp build/distribution flags

Suggested behavior:

- Default output folder: `./out`
- Auto-generate intermediate C++ in output folder
- Forward `--wat`, `--wasm-out`, `--dist`, `--run`, etc. to `webcpp.sh`

## Artifact Contract

For `input.js` with basename `app`:

- AST XML: `out/app.ast.xml`
- AST JSON: `out/app.ast.json`
- IR JSON: `out/app.ir.json`
- Generated C++: `out/app.cpp`
- WASM artifacts (via MaiaCpp): `out/app.wasm`, `out/app.wat`, etc.
- Host ABI notes (optional): `out/app.host-bindings.json`

## Error Model

Compiler stages should report structured errors:

- parse errors: source position + expected tokens
- semantic errors: node kind + constraint violation
- lowering errors: unsupported construct with stable diagnostic code
- codegen errors: emitter location + IR node context

Recommended format:

- machine-readable JSON diagnostics (optional)
- concise terminal output for CLI users

## Incremental Delivery Plan

Phase 1 (implemented now)

- CLI skeleton
- parser integration
- AST output + placeholder C++ emission
- `webjs.sh` wrapper calling MaiaCpp `webcpp.sh`

Phase 2

- real AST mapping and semantic model
- function/class/module codegen for sync subset
- initial host-call mapping (`obj.method` -> `__obj__method`) for configured APIs

Phase 3

- async/await lowering
- runtime shim integration for suspension/resume
- robust host interop in async state machine paths

Phase 4

- compatibility/performance hardening
- broad corpus testing for thousands of user files

## Testing Strategy

- Parser-level tests (`compiler/tests/*.test.js`) for ES8 syntax
- Compiler golden tests:
  - JS input -> expected IR
  - JS input -> expected C++ snippets
- End-to-end tests:
  - JS input -> WASM -> runtime output assertions

## Integration with Existing Docs

This architecture complements:

- `docs/JS2WASM - A JavaScript to Cpp Transpiler with WebAssembly Backend.md`
- `docs/ECMAScript_2017_Grammar.md`

It defines the concrete implementation surface in this repository for the new JS compiler path.

## Project Restriction: Toolchain Ownership Boundaries

This project adopts a strict ownership rule for bug fixes across the Maia ecosystem.

Rule:

- Do not patch MaiaJS to work around defects that belong to MaiaCpp, MaiaC, MaiaWASM, or MaiaCC.
- If transpiled output fails due to backend/toolchain behavior, fix the responsible project directly.

Mandatory fix location policy:

1. JS frontend/parsing/lowering bugs:
- Fix in MaiaJS.

2. C++ emission/runtime ABI bugs tied to C++ backend expectations:
- Fix in MaiaCpp.

3. C generation / webc / host glue / WAT assembly pipeline bugs:
- Fix in MaiaC.

4. WASM backend/runtime codegen bugs:
- Fix in MaiaWASM.

5. Grammar/parser-generator framework bugs affecting parser generation:
- Fix in MaiaCC.

Submodule workflow policy:

- Commit and push in each altered submodule repository.
- Update submodule pointer in MaiaJS only after submodule commits exist and are pushed.
- Keep commit history explicit about root cause and owning layer.

Rationale:

- Prevent architectural drift and accidental layering violations.
- Preserve long-term maintainability of MaiaJS and the Maia toolchain.
- Ensure fixes are reusable by all projects depending on the same backend components.
