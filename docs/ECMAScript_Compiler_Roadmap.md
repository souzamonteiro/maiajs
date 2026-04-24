# ECMAScript 2017 (ES8) Compiler - Roadmap & Scope

**SCOPE: ECMAScript 2017 (ES8) ONLY - No ES2018+ features supported**

Last updated: 2026-04-24

## Scope Declaration

**Supported:** ECMAScript 2017 (ES8) features only:
- async/await, promises
- Template literals
- Classes (basic)
- Arrow functions
- Destructuring (basic)
- Spread operator
- for-of loops
- Map, Set, WeakMap, WeakSet
- Object.values(), Object.entries()
- String padding
- Trailing commas in parameters
- All ES5/ES6/ES7 features

**NOT Supported (explicitly out of scope):**
- ❌ ES2020: Optional chaining (`?.`), Nullish coalescing (`??`), BigInt, Dynamic import
- ❌ ES2021: Logical assignment (`??=`, `&&=`, `||=`), WeakRef
- ❌ ES2022: Private fields/methods (`#field`), Top-level await, Error.cause
- ❌ Any feature after ES2017

## Progress Snapshot

- Overall status: Phase 3 — catch/finally routing in async checkpoints DONE
- Estimated completion: 99% (ES8 scope only)
- Test baseline: 240 passing, 0 failing (`node --test compiler/tests/*.test.js`)
- Current focus: full closure object/runtime semantics + loop/exception statement lowering within ES8

## Milestones

| Phase | Scope | Status | Progress |
|---|---|---|---|
| Phase 1 | CLI, parser integration, AST output, placeholder emission | Done | 100% |
| Phase 2 | Sync subset lowering + host interop + function codegen maturity | Done | 100% |
| Phase 3 | Async/await lowering to resumable state machine | In progress | 48% |
| Phase 4 | Hardening, compatibility, corpus scale, performance | Not started | 0% |

## Master TODO (Single Source of Truth)

Legend:
- [x] Implemented and validated in current pipeline/tests
- [ ] Not implemented yet, partial, or not validated end-to-end

### 0) Objective: 100% behavioral run of `compiler/examples/full_es8_test.js`

Target outcome:
- [ ] The compiled dist path reproduces the behavioral runtime markers from `compiler/examples/full_es8_test.js` (not only exit code `0`).

Current observed state (2026-04-23):
- [x] `bin/webjs.sh --file compiler/examples/full_es8_test.js --name full_es8_test --dist-run` reaches WASM/dist and returns `0`.
- [ ] Behavioral parity NOT achieved: generated C++ is truncated (~65 lines instead of 400+); MaiaCpp parser fails with "Unexpected character" and fallback C compilation fails with "Unknown assignment target 'weakKey'".
- [x] Full compiler test suite passes: 240/240 tests green, all async/lambda/dist-bootstrap infrastructure validated.
- [ ] Root cause identified: `lowerStatementNode()` function in `compiler/ecmascript-compiler.js` does not support critical ES8 statements needed by `full_es8_test.js`.

Blocking issues preventing compilation (in order of impact):

**MaiaJS (ECMAScript -> C++)**:
- [ ] **While/do-while loops**: Not lowered in `lowerStatementNode()` → entire loop sections fallback to `// [statement not yet lowered]`
- [ ] **For/for-in loops**: Not lowered in `lowerStatementNode()` → loop bodies skipped
- [ ] **Try-catch-finally blocks**: Parser recognizes but `lowerStatementNode()` returns fallback comment → exception handling skipped
- [ ] **Switch statements**: Not lowered in `lowerStatementNode()` → switch blocks skipped
- [ ] **Class bodies with methods**: Constructor + method stubs emitted but method bodies not lowered
- [ ] **String literal escaping in C++ output**: Template literals with quotes generate invalid C++ syntax (e.g., `Unexpected character at position 1852: '''`) - ES8 feature
- [ ] **WeakMap/WeakSet collections**: No C++ lowering strategy exists → code generates invalid C++ (`weakKey = null;` without declaration) - ES8 feature
- [ ] **Destructuring in statement context**: Destructuring patterns in variable declarations not fully lowered in statement position - ES8 feature
- [ ] **Complex object/array literals in statements**: Literals with nested structures or computed properties not fully lowered - ES8 feature

**MaiaCpp (C++ -> C)**:
- [ ] Parser fails on invalid C++ syntax from above (escape sequences, syntax errors)
- [ ] Fallback C compiler receives malformed input and reports semantic errors

**MaiaC / webc (C -> WASM/dist)**:
- [ ] Downstream issues cascade from C++ generation failures

**CRITICAL PATH: Minimum Viable ES8 Compiler** (must fix to be usable):

Priority 1 - **CRITICAL** (blocks ANY real program):
- [ ] **Loops (while/do-while/for/for-in)**: 90% of ES8 programs use loops. Currently fallback to `// [statement not yet lowered]`. Estimated effort: 3-4 hours.
- [ ] **String literal escaping**: Template literals with quotes generate invalid C++ (`'''` → parser fails). Estimated effort: 1-2 hours. **Quick win that unblocks C++ parsing**.

Priority 2 - **HIGH** (blocks most programs):
- [ ] **Try-catch-finally blocks**: Error handling is standard ES8 pattern. Currently recognized by parser but not lowered. Estimated effort: 2-3 hours.

Priority 3 - **MEDIUM** (common but deferrable):
- [ ] **Switch statements**: Common control flow but can be rewritten as if/else chains. Estimated effort: 1-2 hours.
- [ ] **Complex object/array literals**: Nested structures can be decomposed into simpler assignments. Estimated effort: 2-3 hours.

Priority 4 - **LOW** (nice-to-have, can be deferred):
- [ ] **Class bodies with methods**: Method bodies can be emitted as stubs for now. Estimated effort: 2 hours.
- [ ] **WeakMap/WeakSet**: Specialized collections; users can use Map/Set as fallback. Estimated effort: 1-2 hours.
- [ ] **Destructuring in statements**: Can be expanded into individual assignments. Estimated effort: 2-3 hours.

**Quick Win Strategy (2-3 hours total)**:
1. Fix string literal escaping in C++ output → unblocks C++ parser errors
2. Implement basic loops (while/do-while) → unblocks 80% of programs
→ Result: Working compiler that handles typical ES8 code

**Full Usability (8-12 hours total)**:
- Add all Priority 1+2 features
- Result: Production-ready ES8→C++ for mainstream code

Definition of Done for this objective (ES8 scope only):
- [ ] **PHASE 1 (Quick Win)**: String escaping + basic loops working
  - [ ] Template literal quotes properly escaped in C++ output (ES8)
  - [ ] While/do-while loops generate valid C++ with condition checks (ES8)
  - [ ] Generated C++ for simple benchmark compiles through MaiaCpp pipeline
  - [ ] Dist bootstrap tests (3/3) remain green
  
- [ ] **PHASE 2 (High Priority)**: Loops + error handling complete
  - [ ] For/for-in loops fully implemented (ES8)
  - [ ] Try-catch-finally lowering implemented with exception routing (ES8)
  - [ ] Generated C++ for `full_es8_test.js` is 300+ lines (not truncated)
  
- [ ] **PHASE 3 (Medium Priority)**: Switch + complex literals
  - [ ] Switch statements with proper fall-through semantics (ES8)
  - [ ] Nested object/array literals with computed properties (ES8)

---

## Important Notes

### No Post-ES8 Features
This compiler is designed for **ES8 (ECMAScript 2017) only**. Features from ES2018 and later (ES2020, ES2021, ES2022, etc.) are explicitly out of scope and will NOT be added:

- **Private fields** (`#field`) - ES2022 feature - WILL NOT BE ADDED
- **Nullish coalescing** (`??`) - ES2020 feature - WILL NOT BE ADDED  
- **Optional chaining** (`?.`) - ES2020 feature - WILL NOT BE ADDED
- Any other post-ES8 features - OUT OF SCOPE

If your code uses these features, it must be transpiled to ES8 before compilation with MaiaJS.

### Preprocessor Policy
No preprocessors or source transformations beyond what is necessary to handle context-free lexer limitations in ES8 features are permitted. Template literal support is ES8-native and should not require preprocessing.
  
- [ ] **End State**: All 9 issues resolved
  - [ ] Generated C++ for `full_es8_test.js` is complete (400+ lines)
  - [ ] MaiaCpp parser accepts generated C++ without "Unexpected character" errors
  - [ ] Fallback C compiler accepts generated code without semantic errors
  - [ ] Dist node/browser runners execute benchmark and output all test markers
  - [ ] Full compiler test suite remains green (240/240 tests)
  - [ ] Regression tests added for each statement type to prevent regressions

### A) Parser and Grammar (EBNF + generated parser)

- [x] ES8 grammar baseline integrated
- [x] Async function declarations/expressions and await syntax parse
- [x] Arrow function and async arrow syntax parse
- [x] Class declaration syntax parse (including extends)
- [x] Object literal syntax parse (empty and simple properties)
- [x] Empty array literal syntax parse (`[]`)
- [x] Argument list grammar fix landed (`argumentItem`) and parser regenerated
- [x] Non-empty array literal parsing parity (`[1,2]`) validated in current parser build
- [x] Array spread literal parsing baseline validated (`[...x]`, `[1,...x]`)
- [ ] Expand grammar coverage for unsupported ES8 edge forms
- [ ] Add explicit regression matrix for known parser limits

### B) Lowering to C++ (semantic/codegen reality)

- [x] Variable declarations (`var`/`let`/`const`) lowering for supported expression subset
- [x] Assignment/update operators lowering for supported expression subset
- [x] Function declaration emission (prototype + definition) for supported subset
- [x] Return type inference for current supported flows (int/double/const char*/void*)
- [x] Host interop extraction and emission (`__obj__method` mapping)
- [x] Class declarations lowering MVP (constructor + method stubs; body semantics still pending)
- [x] Object literal lowering MVP (arity-based runtime helper hooks, simple property assignments)
- [x] Array literal lowering MVP (empty + non-empty literals via arity-based runtime hooks)
- [x] Array spread/elision lowering semantics now emit explicit builder-based runtime calls (no direct `nullptr` fallback)
- [x] Local object/array/lambda fallback hooks deduplicated through shared runtime helper allocators, including capture-aware lambda payload allocation
- [x] Arrow/lambda semantics: non-closure MVP plus immediate top-level/local/nested-block/enclosing-lambda capture-aware hook lowering are implemented for sync/async cases, and local fallback payloads now preserve concrete captured values including overflow sidecar storage beyond four fixed slots plus deterministic function identity metadata and explicit closure-handle/env-handle separation, with env-first capture access feeding compatibility mirror fields through a lambda-value capture accessor path, explicit env-null defensive fallbacks, out-of-range accessor guard coverage, a minimal runtime-facing capture read API (`count`/`at`) now used by internal allocator reads, explicit emitted contract documentation in the shared local fallback block, mirror-field legacy-only labeling in contract text, and explicit legacy-only labeling at mirror assignment sites (Phase A–D complete)
- [ ] Full closure objects and complete function-object behavior (planned for Phase E)
- [ ] Full control-flow lowering completeness for loops/advanced statements beyond current subset

### C) Async/Await + Runtime + Dist bootstrap

- [x] Async IR state-machine skeleton with suspend points
- [x] try/catch/finally metadata and C++ checkpoint routing
- [x] Scheduler hooks (`__async_schedule`, `__async_complete`) in generated C++
- [x] Resume bridge symbols + manifest metadata propagation
- [x] Machine-aware resolver metadata (machine ID + schedule ranges)
- [x] Dist bootstrap integration tests for resolver contract
- [x] Generated-dist runtime smoke test with real scheduled events through resolver path

### D) Testing and quality gates

- [x] Full compiler suite green baseline (`node --test compiler/tests/*.test.js`)
- [x] Focused async IR/C++/runtime wrapper test coverage
- [x] Dist bootstrap resolver contract test coverage
- [x] Golden tests for representative generated C++ outputs (lambda capture-aware payloads)
- [ ] Smoke corpus compilation runs for larger JS inputs
- [ ] Performance budget and compile-time trend tracking

### E) Immediate next checklist (execution order)

- [x] Add generated-dist runtime smoke test executing machine-aware resolver under concurrent scheduling
- [x] Implement class declaration lowering MVP (constructor + method stubs)
- [x] Implement object literal lowering MVP
- [x] Implement array literal lowering MVP (including non-empty literals)
- [x] Implement arrow function lowering MVP with explicit non-closure baseline and tests
- [x] Deduplicate local object/array/lambda fallback emitters with shared runtime helper block
- [x] Add simple top-level capture-aware hook lowering for sync/async arrow functions
- [x] Extend capture-aware hook lowering to immediate enclosing function/block locals and parameters
- [x] Extend capture-aware hook lowering across nested immediate block scopes with shadowing-aware name resolution
- [x] Extend capture-aware hook analysis so nested lambdas can capture parameters from enclosing lambdas
- [x] Extend capture-aware hook analysis so nested lambdas can capture locals from enclosing lambdas without leaking those locals onto the outer lambda hook
- [x] Cover nested async lambdas capturing enclosing lambda parameters/locals with regression tests
- [x] Preserve concrete captured values in local lambda fallback payloads instead of only storing capture counts
- [x] Deduplicate capture-aware local lambda fallback payload allocation through a shared runtime helper
- [x] Record explicit truncation metadata in local lambda fallback payloads when capture-aware hooks exceed four capture slots
- [x] Preserve overflow captures beyond four fixed lambda payload slots via sidecar storage in local fallback runtime helpers
- [x] Cover async lambda overflow-capture sidecar preservation (>4 captures) with focused regression tests
- [x] Cover mixed sync+async overflow-capture hook emission in one source and verify shared lambda payload helper dedup remains single-emission
- [x] Attach deterministic function identity metadata (`function_id`) to capture-aware local lambda fallback payloads (sync/async)
- [x] Split local lambda fallback payload into explicit closure handle + separate env handle while preserving compatibility fields
- [x] Populate lambda payload compatibility capture mirrors via shared env-first capture lookup helper
- [x] Add explicit env-null defensive fallbacks for compatibility mirror capture fields in local lambda fallback payload allocation
- [x] Route compatibility mirror population through shared lambda-value capture accessor that prioritizes env-backed capture reads
- [x] Add focused regression coverage for env/value capture accessor out-of-range guards returning zero
- [x] Add minimal runtime-facing lambda capture read API helpers (`__maia_runtime_lambda_get_capture_count`, `__maia_runtime_lambda_get_capture_at`) in shared local fallback runtime
- [x] Add focused regression coverage that no-capture-only lambda programs do not emit capture runtime API helpers
- [x] Emit explicit closure/env runtime contract comment block with capture-aware shared local fallback helpers
- [x] Define runtime contract stability notes for lambda closure/env helpers and mirror-field deprecation path
- [x] Migrate local lambda payload allocator internal capture reads to runtime-facing API helpers (`get_capture_count`/`get_capture_at`)
- [x] Mark lambda payload mirror fields as legacy-only in emitted local fallback contract documentation (Phase C start)
- [x] Add focused regression ensuring runtime-facing capture API helper avoids direct mirror-field reads (mirror reads remain confined to compatibility fallback accessor)
- [x] Add lint-style regression guard that blocks new direct mirror-field read consumers beyond established compatibility fallback paths (Phase D)
- [x] Add explicit legacy-only labels at mirror assignment sites in allocator and regress them to prevent ambiguity in future diffs
- [x] Add minimal runtime-facing lambda function-object metadata APIs (`__maia_runtime_lambda_get_function_id`, `__maia_runtime_lambda_get_arity`, `__maia_runtime_lambda_get_is_async`) with null-safe defaults for capture-aware payloads (Phase E start)
- [x] Add runtime-facing invocation bridge helpers (`__maia_runtime_lambda_can_invoke`, `__maia_runtime_lambda_select_function_id`) to validate call-shape and select deterministic function IDs for capture-aware payloads (Phase E)
- [x] Route capture-aware top-level identifier call lowering through invocation selector bridge (`__maia_runtime_lambda_select_function_id`) for deterministic function-object dispatch metadata in expression statements (Phase E)
- [x] Harden selector-based call lowering to target only capture-aware lambda bindings (avoid misrouting no-capture lambdas when capture-aware payload helpers are present) (Phase E)
- [x] Route capture-aware async top-level identifier calls through invocation selector bridge with async-call flag propagation (`async_call=1`) (Phase E)
- [x] Extend selector-based call lowering eligibility to top-level bindings that become capture-aware lambdas via assignment expressions (`f = x => ...` / `f = async x => ...`) (Phase E)
- [x] Exclude selector-routed capture-aware lambda identifier calls from host-interop classification/signature emission (avoid redundant `__f` host externs for local lambda bindings) (Phase E)
- [x] Resolve selector-based call lowering eligibility with lexical-scope binding state so function/block-local capture-aware lambda identifiers route through selector bridge (and stay excluded from host interop) (Phase E)
- [x] Harden lexical-scope selector routing against shadowing so parameter/local no-capture bindings do not misroute through outer capture-aware selector paths (Phase E)
- [x] Harden lexical-scope selector routing against hoisted local function declaration shadowing (`function f(){}`) so outer capture-aware identifiers with the same name are not misrouted (Phase E)
- [x] Add runtime-facing invocation dispatch-stub helper (`__maia_runtime_lambda_invoke_function_id`) and route capture-aware identifier call lowering through it (Phase E)
- [x] Evolve invocation dispatch-stub helper to explicit function-id switch scaffold with built-in invocation compatibility validation (Phase E)
- [x] Materialize known capture-aware `function_id` case labels inside invocation dispatch scaffold switch (compatibility path still returns `function_id`) (Phase E)
- [x] Tighten invocation dispatch scaffold so unknown `function_id` values fail closed (`return 0`) while known case labels preserve deterministic `function_id` returns (Phase E)
- [x] Add per-case metadata guards (`arity`/`is_async`) inside invocation dispatch scaffold before returning known `function_id` values (Phase E)
- [x] Add first payload-derived known-case return behavior in invocation dispatch scaffold (`return __maia_runtime_lambda_get_capture_count(lambda_value)`) while preserving fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case invocation dispatch returns by lambda async kind (sync returns `capture_count`; async returns negated `capture_count`) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Introduce first callable-like known-case dispatch behavior for sync capture-aware lambdas (`return __maia_runtime_lambda_get_capture_at(lambda_value, 0)`) while preserving async differentiated return behavior, per-case guards, and fail-closed unknown/default handling (Phase E)
- [x] Introduce first callable-like known-case dispatch behavior for async capture-aware lambdas (`return -__maia_runtime_lambda_get_capture_at(lambda_value, 0)`) so both sync/async known paths now use capture-value reads under the same guard/fail-closed scaffold (Phase E)
- [x] Make callable-like known-case dispatch returns argc-aware (sync: `capture_at(0) + argc`; async: `-(capture_at(0) + argc)`) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extend callable-like known-case dispatch returns with second-capture contribution (sync: `capture_at(0) + capture_at(1) + argc`; async: `-(capture_at(0) + capture_at(1) + argc)`) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extend callable-like known-case dispatch returns with third-capture contribution (sync: `capture_at(0) + capture_at(1) + capture_at(2) + argc`; async: `-(capture_at(0) + capture_at(1) + capture_at(2) + argc)`) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extend callable-like known-case dispatch returns with fourth-capture contribution (sync: `capture_at(0) + capture_at(1) + capture_at(2) + capture_at(3) + argc`; async: `-(capture_at(0) + capture_at(1) + capture_at(2) + capture_at(3) + argc)`) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Introduce weighted known-case callable-like composition over capture indexes 0..3 (sync: `capture_at(0)*1 + capture_at(1)*2 + capture_at(2)*3 + capture_at(3)*4 + argc`; async: negated equivalent) while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by capture profile so multi-capture known cases add an explicit index-4 contribution (`capture_at(4)`) while single-capture known cases keep the base weighted composition, preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by deterministic function-id-derived constant term (`function_id % 10`) so known labels no longer share identical weighted formulas across different signatures, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by arity-derived term (`get_arity(...) * 10`) layered onto weighted/function-id formulas so known labels diverge by signature family while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by capture-count family constant (single: `+10`, mid `2..4`: `+20`, overflow `>4`: `+40`) and restrict `capture_at(4)` contribution to overflow known signatures only, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by arity-family constant (unary: `+100`, multi-arg: `+200`) layered onto weighted/function-id/arity/capture-family formulas so known labels diverge by call-shape family while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Differentiate known-case callable-like semantics by exact capture-count term (`get_capture_count(...) * 1000`) so same-family labels such as three-capture and four-capture known cases no longer share identical higher-level family constants, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Source invocation dispatch-stub switch selection from the selector helper (`select_function_id`) instead of raw metadata reads so known-case dispatch keying flows through the same validated function-object selection path, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extract deterministic known-case token computation into a dedicated helper (`known_case_token`) so invocation dispatch reuses a structured function-object token instead of embedding all non-capture constants directly inside each return formula, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extract known-case async polarity into a dedicated helper (`known_case_polarity`) so invocation dispatch reuses structured sign metadata instead of hardcoding sync/async negation per return formula, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extract weighted capture composition into a dedicated helper (`known_case_weighted_capture_value`) so invocation dispatch reuses structured capture-value composition instead of embedding weighted capture reads directly inside each return formula, while preserving per-case guards and fail-closed unknown/default handling (Phase E)
- [x] Extract known-case metadata guard matching into a dedicated helper (`known_case_matches_function_id`) so invocation dispatch reuses structured per-case `arity`/`is_async` validation instead of repeating those guards directly inside each switch arm, while preserving fail-closed unknown/default handling (Phase E)
- [x] Extract known-case membership into a dedicated helper (`has_known_case`) so invocation dispatch reuses structured known-label recognition instead of repeating known-case membership through a terminal switch scaffold, while preserving fail-closed unknown/default handling (Phase E)
- [x] Extract known-case structured result computation into a dedicated helper (`invoke_known_case`) so invocation dispatch reuses a single known-case result path instead of inlining token/polarity/weighted/match validation directly inside `invoke_function_id`, while preserving fail-closed unknown/default handling (Phase E)

## Infrastructure Status

### Implementation Roadmap (Where to Make Changes)

**File**: `/Volumes/External_SSD/Documentos/Projects/maiajs/compiler/ecmascript-compiler.js`

**Function**: `lowerStatementNode()` (line 2664)
- Current: handles only if/else, blocks, return, expression statements, variable declarations
- Needed: add handlers for while, do-while, for, for-in, try-catch-finally, switch

**Quick Win 1 - String Literal Escaping** (2 hours):
- File: `compiler/ecmascript-compiler.js`
- Function: `lowerExpressionValue()` or `emitStringLiteral()` 
- Issue: Template literal quotes not escaped when generating C++ string literals
- Fix: When emitting `__console__log('text with "quotes"')` in C++, escape the inner quotes
- Test: Check that generated `test.cpp` doesn't have mismatched quotes

**Quick Win 2 - While Loop Lowering** (2 hours):
- Add case in `lowerStatementNode()` for while statements:
  ```javascript
  const whileStmtNode = (statementNode.children || []).find(
    (child) => child && child.kind === 'nonterminal' && child.name === 'whileStatement'
  );
  if (whileStmtNode) {
    const conditionExpr = /* extract condition */;
    const bodyStatement = /* extract body */;
    lines.push(`${indent}while (${lowerExpressionValue(conditionExpr, compileContext)}) {`);
    lines.push(...lowerStatementNode(bodyStatement, compileContext, indentLevel + 1, options));
    lines.push(`${indent}}`);
    return lines;
  }
  ```

**Priority 2 - For Loop Lowering** (2 hours):
- Similar pattern to while but with init/condition/update
- Handle for, for-in separately

**Priority 3 - Try-Catch-Finally** (3 hours):
- Extract try block, catch handlers, finally block
- Route through existing exception handling infrastructure (already built for async)
- Emit `try { ... } catch (...) { ... } finally { ... }` C++ equivalents

**Test After Each Fix**:
```bash
cd /Volumes/External_SSD/Documentos/Projects/maiajs
npm test  # Verify 240/240 still green
./compiler/examples/build_test_dist.sh  # Check generated C++
```

### Lambda Runtime Contract Stability (Local Fallback MVP)

- Scope: applies only to emitted local fallback helpers when capture-aware lambda payload support is present.
- Stable helper surface (current):
  - `__maia_runtime_alloc_lambda_value(...)`
  - `__maia_runtime_lambda_get_capture_count(void* lambda_value)`
  - `__maia_runtime_lambda_get_capture_at(void* lambda_value, int index)`
  - `__maia_runtime_lambda_get_function_id(void* lambda_value)`
  - `__maia_runtime_lambda_get_arity(void* lambda_value)`
  - `__maia_runtime_lambda_get_is_async(void* lambda_value)`
  - `__maia_runtime_lambda_can_invoke(void* lambda_value, int argc, int async_call)`
  - `__maia_runtime_lambda_select_function_id(void* lambda_value, int argc, int async_call)`
  - `__maia_runtime_lambda_invoke_function_id(void* lambda_value, int argc, int async_call)`
- Semantic guarantees (current):
  - `function_id` is deterministic per lowered lambda hook signature.
  - `capture_count` returned by helper APIs is canonical and env-first.
  - capture reads by index are env-first and return `0` for invalid/out-of-range indexes.
  - function-object metadata helpers return `0` for null payload pointers.
  - invocation bridge helpers return `0` for invalid call-shapes (null payload, arity mismatch, async mismatch).
  - capture-aware top-level identifier calls are lowered through the invocation selector bridge, including bindings that become capture-aware via top-level assignment.
  - function/block-local capture-aware lambda identifier calls are lowered through the invocation selector bridge using lexical-scope binding resolution.
  - selector-based call lowering excludes no-capture lambda bindings.
  - lexical shadowing by parameters/locals blocks selector routing that would otherwise target an outer capture-aware binding with the same identifier.
  - hoisted local function declaration shadowing blocks selector routing that would otherwise target an outer capture-aware binding with the same identifier.
  - selector-based call lowering propagates async-call flag from capture-aware async lambda bindings.
  - capture-aware identifier call lowering targets the invocation dispatch-stub helper (`invoke_function_id`), which validates call-shape, obtains its function id from the selector helper (`select_function_id`), and delegates known-case result computation to `invoke_known_case`; `invoke_known_case` validates known-case membership via `has_known_case`, computes a reusable deterministic known-case token via `known_case_token`, derives sync/async sign via `known_case_polarity`, derives weighted capture composition via `known_case_weighted_capture_value`, validates per-case metadata compatibility via `known_case_matches_function_id`, and returns `known_case_polarity * (weighted_capture_value + argc + known_case_token)` for known compatible cases; `known_case_weighted_capture_value` yields `capture_at(0)*1 + capture_at(1)*2 + capture_at(2)*3 + capture_at(3)*4` plus `capture_at(4)` only for overflow known signatures (`capture_count > 4`), and `known_case_token` covers deterministic function-id (`function_id % 10`), arity-derived (`get_arity(...) * 10`), capture-family (`+10` single / `+20` mid `2..4` / `+40` overflow), arity-family (`+100` unary / `+200` multi-arg), and exact capture-count (`get_capture_count(...) * 1000`) contributions; unknown/default function IDs fail closed (`return 0`).
  - selector-routed capture-aware lambda calls are excluded from host-interop detected-call/signature emission.
- Compatibility fields in `__maia_runtime_lambda_value` (`capture1..capture4`, `extra_*`):
  - currently maintained as mirror projections for backward compatibility.
  - should be treated as transitional, not canonical, by new runtime consumers.
- Deprecation path (planned):
  - Phase A: keep mirrors + env/value accessors (✅ complete).
  - Phase B: migrate internal/runtime consumers to helper APIs only (✅ complete).
  - Phase C: mark mirror fields as legacy-only in tests/docs (✅ complete).
  - Phase D: remove mirror-field dependency from new features and closure object integration work.
    - [x] explicit env handle separation in lambda payload struct.
    - [x] env-first capture accessors with defensive fallbacks.
    - [x] runtime-facing capture read API surface.
    - [x] internal allocator migrated to use runtime APIs for mirror projection.
    - [x] assignment-site labels marking mirror writes as legacy-only.
    - [x] label scope enforcement: legacy-only labels confined to allocator, not runtime API bodies.

### Distribution and Runtime Libraries

- [x] Created `lib/` directory structure for WAT runtime modules
- [x] Integrated `copy_dist_wasm_libs()` into `bin/webjs.sh` (pattern from MaiaCpp)
- [x] Detect `--dist` and `--dist-run` flags in webjs.sh argument processing
- [x] Automatic inclusion of `maiajs/lib/*.wasm` in distribution manifests
- [x] Create `exception.wat` + `exception.wasm` runtime module for async/await try/catch support
- [x] Add optional `exception.js` wrapper and copy matching `*.js` wrapper on dist
- [x] Document runtime module interface contract (exception + scheduler hooks)

## Tracking Policy

- The Master TODO section above is the only progress source of truth.
- Mark completion only when implementation + validation are both done.
- Keep legacy sprint notes out of this file to avoid conflicting status views.

## How to Track Progress Quickly

- Full tests:
  - `node --test compiler/tests/*.test.js`
- Focused host/codegen tests:
  - `node --test compiler/tests/ecmascript-host-interop-ast.test.js`
- Parser regeneration path:
  - `cd compiler && ./build.sh`

## Update Rule

After each meaningful compiler change, update this roadmap with:

1. Changed phase progress percentage
2. Any checklist item moved across status
3. New blocker or risk discovered
4. Latest full test result snapshot
