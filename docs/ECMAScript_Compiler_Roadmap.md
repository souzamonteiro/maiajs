# ECMAScript Compiler Roadmap (ES8 -> C++98 -> WASM)

Last updated: 2026-04-23

## Progress Snapshot

- Overall status: Phase 3 — catch/finally routing in async checkpoints DONE
- Estimated completion: 99%
- Test baseline: 224 passing, 0 failing (`node --test compiler/tests/*.test.js`)
- Current focus: full closure object/runtime semantics beyond the current local capture-payload fallback MVP + runtime packaging hardening for generated dist

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

## Infrastructure Status

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
- Semantic guarantees (current):
  - `function_id` is deterministic per lowered lambda hook signature.
  - `capture_count` returned by helper APIs is canonical and env-first.
  - capture reads by index are env-first and return `0` for invalid/out-of-range indexes.
  - function-object metadata helpers return `0` for null payload pointers.
  - invocation bridge helpers return `0` for invalid call-shapes (null payload, arity mismatch, async mismatch).
  - capture-aware top-level identifier calls in expression statements are lowered through the invocation selector bridge.
  - selector-based call lowering excludes no-capture lambda bindings.
  - selector-based call lowering propagates async-call flag from capture-aware async lambda bindings.
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
