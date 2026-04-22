# ECMAScript Compiler Roadmap (ES8 -> C++98 -> WASM)

Last updated: 2026-04-22

## Progress Snapshot

- Overall status: Phase 3 — catch/finally routing in async checkpoints DONE
- Estimated completion: 99%
- Test baseline: 202 passing, 0 failing (`node --test compiler/tests/*.test.js`)
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
- [ ] Arrow/lambda semantics are partial: non-closure MVP plus immediate top-level/local/nested-block/enclosing-lambda capture-aware hook lowering are implemented for sync/async cases, and local fallback payloads now preserve concrete captured values; full closure objects and complete function-object behavior remain pending
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
- [ ] Golden tests for representative generated C++ outputs
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

## Infrastructure Status

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
