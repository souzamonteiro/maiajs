# MaiaJS Transpiler Completion Strategy and TODO

Last updated: 2026-09-04
Scope: ECMAScript 2017 (ES8) only, grammar-first workflow.

## Current Baseline (validated)

- Full compiler test suite is green: **327/327 passing**.
- Ported MaiaCpp examples are green: runtime suite **22/22**, course suite **48/48**,
  and MaiaJS transpilation **22/22**.
- `bash compiler/examples/validate_full_es8_dist.sh` validates the complete
  JS -> C++98 -> C -> WASM dist path against source runtime markers.
- The compiled Node runner prints the required ES8 markers and returns `0`.
- Compile-context analysis no longer times out on `compiler/examples/test.js`:
  the representative transpilation takes about five seconds rather than roughly
  99 seconds. AST first-match lookups are memoized and avoid full repeated scans.
- Labelled `break` and `continue` preserve their target semantics through the
  JS -> C++98 -> C -> WASM pipeline using unique internal continuation and exit
  targets, rather than silently retargeting nested loops.

## Remaining Work (post-validation)

The current ES8 compatibility sample and the ported corpus are no longer
blocked. The remaining work is incremental conformance hardening, not a known
failure in the validated pipeline:

- [x] Add a JS -> C++98 -> C -> WASM marker gate for a static
  `Promise.resolve(...).then(...)` callback that consumes an object with a
  computed property: `npm run test:es8:promise-object`.
- [x] Provide a Chrome-headless gate for that same object/Promise marker:
  `npm run test:browser:promise-object`.
- [ ] Implement object spread only as an ES2018+ work item. It is deliberately
  rejected by the ES8 grammar today; do not present it as ES8 compatibility.
- [x] Establish an executable async state-machine baseline through MaiaJS,
  MaiaCpp, MaiaC/WebC, and the Node/browser scheduler bridges. Linear async
  bodies now run before and after `await` rather than emitting a passive
  skeleton.
- [ ] Run the dedicated Chrome-headless smoke gate for the linear async baseline:
  `npm run test:browser:async` verifies that an `await` resumes and the program
  returns `0` in the generated browser runner. The gate is implemented but the
  current console session ends Chrome before its observation window completes.
- [ ] Extend async behavior-marker coverage to control flow and nested error
  propagation.
- [x] Materialize declaration targets for `await Promise.resolve(value)` in the
  resumed state and verify them through Node/WASM:
  `npm run test:async:await-result`.
- [x] Define and validate the scalar scheduler ABI for dynamic promise
  fulfillment: `__async_prepare_await(sm, state)`, `__async_take_i32(sm)`,
  and `__async_take_f64(sm)`. The WebC adapter retains thenables returned by
  `void` host imports, queues their resolution by state-machine pointer, and
  resumes `const value = await dynamicPromise()` through the public pipeline:
  `npm run test:async:dynamic-value`.
- [x] Extend the dynamic promise ABI with opaque handles for strings and host
  objects. Direct string output and one-level scalar property reads are lowered
  through `__async_handle_get_string` and `__async_handle_get_i32`, verified by
  `npm run test:async:dynamic-value` with `{ status: 201 }` and a string.
- [x] Route a rejected dynamic promise through the exception ABI and execute a
  simple async `catch` body in a synthetic state, including the error-value
  binding. The public Node/WASM gate is `npm run test:async:rejection`.
- [x] Isolate concurrent rejected promises by state-machine pointer so each
  queued resume activates only its own exception. The public Node/WASM gate is
  `npm run test:async:concurrent-rejections`.
- [x] Execute an enclosing `finally` state when an awaited promise rejects and
  no local `catch` handles it: `npm run test:async:rejection-finally`.
- [ ] Extend rejection handling to nested `try/finally` plus outer `catch`
  propagation. This needs chained synthetic continuation states so JavaScript
  ordering is preserved (`finally` before the enclosing `catch`).
- [ ] Extend handle lowering to object methods, nested properties and typed
  structured values.
- [x] Preserve top-level local bindings in the async state structure and verify
  their resumed reads through the public Node/WASM distribution path:
  `npm run test:async:locals`.
- [ ] Run the equivalent browser gate: `npm run test:browser:async-locals`.
- [x] Exercise the generated browser runner in Chrome headless as a separate
  gate via `npm run test:browser:es8`; it generates a temporary ES8 dist,
  clicks the runner's `Run` control, and validates behavior markers.
- [ ] Continue replacing intentionally conservative lowering fallbacks with
  native semantics only when a focused source/runtime regression establishes
  the required behavior.
- [ ] Keep compile-context operations memoized when adding new AST analyses;
  validate representative large inputs so analysis cost stays proportional to
  the parsed tree.

## Non-Negotiable Rules

- Never hand-edit generated parser files.
- Parser changes must start in `grammar/EcmaScript.ebnf` and be regenerated with `compiler/build.sh` (tREx).
- Follow ecosystem synchronization protocol in this exact order:
  1. MaiaCC
  2. MaiaWASM
  3. MaiaC
  4. MaiaCpp
  5. MaiaJS
- Fix ownership by layer:
  - MaiaJS: JS parser/lowering/codegen issues
  - MaiaCpp: C++ parser/codegen/backend issues
  - MaiaC/MaiaWASM/MaiaCC: only when root cause is there

## Execution Strategy

Use short, vertical slices with hard gates:

1. Reproduce one failing behavior on `full_es8_test.js`.
2. Add focused test(s) in `compiler/tests` for that behavior.
3. Implement fix in MaiaJS (or owning repo if not MaiaJS).
4. Re-run full suite (`node --test compiler/tests/*.test.js`).
5. Re-run end-to-end sample (`bash compiler/examples/build_test_dist.sh`).
6. If issue is backend-owned, patch backend repo first, then update submodule pointer in MaiaJS.

## Master TODO (check as you go)

### Phase 0 - Guardrails and reproducibility

- [ ] Confirm clean reproducible baseline and capture logs in `compiler/examples/dist`.
- [ ] Freeze ES8-only scope in active branch notes and PR description.
- [ ] Keep this file as the single source of truth for completion status.

### Phase 1 - Remove invalid C++ tokens in MaiaJS output (highest priority)

Goal: eliminate immediate C++ parser breakages generated by MaiaJS.

- [x] Add operator mapping in expression lowering:
  - `===` -> `==`
  - `!==` -> `!=`
  - verify no raw JS-only operators leak to C++.
- [x] Add identifier keyword mapping in lowering:
  - `undefined` -> `nullptr` (or agreed runtime sentinel)
  - ensure `null` handling remains stable.
- [x] Add targeted tests for operator/identifier mapping.
- [x] Validate generated C++ from `full_es8_test.js` contains no raw `===`/`undefined`.

Acceptance gate:

- [x] `node --test compiler/tests/*.test.js` passes.
- [x] `full_es8_test.cpp` has zero occurrences of JS-only operator/keyword leaks.

### Phase 2 - Close expression lowering gaps that still emit placeholders

Goal: remove `// [expression not yet lowered]` and return-expression gaps.

- [ ] Implement/complete lowering for:
  - [x] function expressions (`const f = function(...) { ... }`) (minimum fallback lowering to valid C++)
  - [x] `new` expressions for constructor-style forms used in sample (minimum helper-style lowering)
  - [x] member/call chains that currently become `/* expr */` (incremental chain preservation after first call)
  - [x] promise chain call expressions used in sample (incremental chain preservation)
- [x] Ensure return-expression lowering in helper functions no longer emits placeholder comments.
- [x] Add or update fixture cases under `compiler/tests/fixtures` for each newly supported form.

Acceptance gate:

- [x] No `// [expression not yet lowered]` in generated sample C++.
- [x] No `// [return expression not yet lowered]` in generated sample C++.

### Phase 3 - Complete statement lowering gaps

Goal: remove `// [statement not yet lowered]` in realistic ES8 control flow.

- [x] Finish throw statement lowering in sync path.
- [x] Improve try/catch/finally lowering to avoid semantic drift and placeholder comments.
- [x] Validate labeled/break/continue edge cases in loops/switch.
- [x] Add regression tests for each statement form touched.

Acceptance gate:

- [x] No `// [statement not yet lowered]` in generated sample C++.
- [x] try/catch/finally behavior has deterministic test assertions (5 tests added).

### Phase 4 - Function object and constructor semantics (sample blockers)

Goal: remove major `nullptr` stubs for function/class constructor usage in sample.

- [x] Implement usable lowering for top-level function expressions assigned to variables.
- [x] Implement usable lowering for top-level property assignments whose RHS is a function expression.
- [x] Implement usable lowering for inline function expressions in top-level object literals and callback arguments.
- [ ] Implement minimum viable constructor/new semantics for sample patterns.
  - [x] Emit real `__new__Name(...)` helpers for top-level constructor-style function-expression bindings used by `new`.
  - [ ] Decide whether constructor bindings should keep separate callable/function-object lowering or be normalized onto constructor-helper-only semantics.
- [x] Stabilize top-level call-site lowering so local function-expression bindings are not misrouted to host symbols.
- [x] Stabilize non-path member-call lowering so array/object literal bases do not silently degrade to `nullptr`.
- [x] Add focused tests/fixtures for top-level function-expression bindings, property assignments, inline callbacks/object-literal methods, and constructor call patterns.

Acceptance gate:

- [x] Sample no longer emits key constructor/function bindings as `nullptr` stubs (`expressionFunc`, `Animal`, `Dog`, `trailingCommas`, `Animal.prototype.*`, `Animal.classify`, `Dog.prototype.speak`, `person.greet`, `rangeValues.forEach(callback)`, `setLike`).

### Phase 5 - Destructuring and rest/arguments consistency

Goal: align emitted C++ with currently parsed ES8 forms.

- [x] Replace placeholder destructuring lowering (`auto`/JS-like indexing) with C++98-safe emitted form or runtime helper calls.
- [x] Handle `arguments` safely for supported functions or fail with explicit diagnostic.
- [x] Add tests for array/object destructuring and arguments access in lowered output.

Acceptance gate:

- [x] No invalid C++ tokens from destructuring/arguments paths in generated sample.

### Phase 6 - Host interop and runtime contract hardening

Goal: keep ABI contract stable while expanding lowering coverage.

- [x] Verify host mapping remains `__obj__method` contract-compatible.
- [x] Ensure capture-aware lambda dispatch remains excluded from host extern emission.
- [x] Add regression tests for host vs local-call classification in new lowering paths.
  - function-expression binding NOT emitted as host extern.
  - constructor call uses `__new__Name` helper, not `__Name` host extern.
  - local fn-expr + host call (`console.log`) keep separate routing paths.
  - MaiaC `generateHostEnvSource`: 9 new tests incl. `__new__X → new X(...)` contract.

Acceptance gate:

- [x] Existing host interop tests remain green (36/36 in ecmascript-host-interop-ast.test.js).
- [x] No regressions in lambda/host routing tests.
- [x] Full suite: 270/270 pass.
- [x] End-to-end dist build: `All steps OK`.

### Phase 7 - End-to-end hard gate: real sample behavior

Goal: move from structural success to behavioral parity.

- [x] Define expected runtime markers for `full_es8_test.js` (all 17 section headers + key
  lines); documented in `ecmascript-phase7-behavioral-markers.test.js`.
- [x] Validate node dist output markers, not just exit code 0.
  - **Pipeline bottleneck identified**: MaiaCpp `cpp-compiler.js` cannot lower
    sequential-statement function bodies (all pattern matches — `simpleReturnExpr`,
    `simpleReturnCall`, etc. — return null for bodies with side-effect calls).
  - Result: every `main()` becomes `stub-fallback → return 0`; WASM exits 0 with zero
    output. This is a MaiaCpp-layer issue, not a MaiaJS issue.
  - MaiaJS-side validations that ARE passing: C++ structure (extern decl + call form),
    IR hostInterop detectedCalls, JS wrapper param binding (`const char*` → readCString).
- [x] Record remaining unsupported ES8 forms as explicit diagnostics (never silent fallback).
  - `console.log(str + num)` → `void*` extern + inline concat (not silent 0 placeholder)
  - `try/catch/finally` → native C++ syntax; exc_ ABI generated by MaiaCpp layer
  - `new Constructor()` → `__new__Constructor()` helper (not raw JS new syntax)
  - `arr.map/filter/reduce(arrow)` → `__maia_lambda` helper (no arrow syntax leak)
  - `Promise.resolve()` chain → `__Promise__resolve` extern

Acceptance gate:

- [x] Expected marker set defined and validated against `node full_es8_test.js` output.
- [x] Unsupported constructs emit explicit, structured diagnostics.
- [x] Full suite: 282/282 pass (270 Phases 1-6 + 12 Phase 7).
- [x] Dist node run prints agreed marker set through the MaiaCpp body-lowering path.

## Required Commands Per Slice

Run after each merged slice:

1. `node --test compiler/tests/*.test.js`
2. `node compiler/tests/run_fixtures.js`
3. `bash compiler/examples/build_test_dist.sh`

For parser/grammar changes only:

1. edit `grammar/EcmaScript.ebnf`
2. `cd compiler && ./build.sh`
3. rerun all test commands above

## Cross-Repo Sync Checklist (when parser toolchain changes)

- [ ] MaiaCC updated, parser regenerated, tests pass, commit/push.
- [ ] MaiaWASM pulls MaiaCC, regenerates parser, tests pass, commit/push.
- [ ] MaiaC pulls MaiaCC+MaiaWASM, regenerates parser, tests pass, validates `test.c`, commit/push.
- [ ] MaiaCpp pulls MaiaCC+MaiaWASM+MaiaC, regenerates parser, tests pass, commit/push.
- [ ] MaiaJS pulls all, regenerates parser if grammar changed, tests pass.

## Definition of Done for MaiaJS transpiler completion

- [x] No generated-placeholder comments for supported ES8 subset in flagship sample.
- [x] No JS-only tokens leak into generated C++ for supported subset.
- [x] Full suite green and fixtures green.
- [x] Dist Node path validated by behavior markers (not only exit code).
- [x] Browser runner behavior-marker gate passes in Chrome headless.
- [x] Unsupported items explicitly diagnosed and documented as out of scope.
- [ ] Ecosystem synchronization protocol followed for any parser-generator-impacting changes.
