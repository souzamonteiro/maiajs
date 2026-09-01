# Maia Suite Correction TODO

Date: 2026-08-15

Purpose:
- consolidate the next correction waves across the Maia Suite;
- reduce commit churn by grouping safe changes inside the owning principal repository;
- preserve the synchronization protocol order:
  1. MaiaCC
  2. MaiaWASM
  3. MaiaC
  4. MaiaCpp
  5. MaiaJS

## Current Baseline

As of 2026-08-15:

- MaiaCC: validation green
- MaiaWASM: validation green
- MaiaC: validation green
- MaiaCpp: validation green, including `ready:full`
- MaiaJS: validation green, including `npm run test:full`

This means the suite currently has a clean, testable baseline. The next work should target real remaining gaps, not emergency breakage.

## Working Rule For The Next Wave

Use larger, repository-owned batches only when all items in the batch share the same principal repository.

Safe batching examples:

- one MaiaJS-only batch touching transpiler lowering, fixtures, and MaiaJS docs
- one MaiaC-only batch touching compiler semantics + diagnostics + conformance docs
- one MaiaCpp-only batch touching lowering/runtime behavior + tier/fixture expectations

Unsafe batching examples:

- changing MaiaC and MaiaCpp before MaiaC is committed and pushed
- changing MaiaCpp and MaiaJS in one uncommitted mixed batch

## Priority 0 - Hygiene Before New Work

These are not feature tasks, but they should remain standard practice:

- keep generated validation artifacts out of commits unless intentionally versioned
- after each large validation pass, restore transient `dist/`, generated manifests, and scratch outputs before staging
- commit only:
  - source changes
  - tests
  - fixtures
  - documentation that reflects real behavior

## Batch A - MaiaJS (Best Next Batch)

Why first:
- MaiaJS is currently green
- it has the largest visible remaining surface area for practical coverage expansion
- it does not require downstream sync after commit because it is last in the chain

### A1. Expand JS port coverage for example suites

Observed gap:
- `compiler/examples/suite`: 11 directories without JS ports
- `compiler/examples/programming_in_javascript_course_en`: 48 C++ examples without matching `.port.js`

Targets:
- add JS ports for the highest-value examples first:
  - control flow
  - functions
  - classes
  - strings
  - pointers/arrays where meaningful

Acceptance:
- reduce "no JS ports found" counts materially
- keep `npm run test:full` green

### A2. Turn current skips into explicit tracked coverage

Observed gap:
- many course/example runs are green only on MaiaCpp/WASM path, while MaiaJS-port coverage is still sparse

Targets:
- add or improve reference outputs where missing
- distinguish:
  - "not ported yet"
  - "ported but not validated"
  - "unsupported by design"

Acceptance:
- diagnostics and run summaries become more actionable
- fewer ambiguous SKIPs

### A3. Continue lowering hardening in documented unsupported zones

Concrete MaiaJS lowering areas still visibly marked as partial/unsupported in code:
- destructuring supports static scalar array bindings and shorthand object
  bindings; dynamic sources, aliases, defaults, nested patterns, and rest
  bindings still use explicit diagnostics rather than incomplete semantics
- [x] labeled `break` / labeled `continue` preserve their labelled targets
- derived constructors forward a single explicit `super(...)` call to the
  matching base initializer wrapper; invalid placement and other class-runtime
  semantics remain explicitly guarded
- several JS-runtime method-chain truncation paths still degrade behavior conservatively

Recommended order inside MaiaJS:
1. [x] labeled control-flow support
2. [~] destructuring semantics beyond safe fallback (static scalar arrays and
   shorthand object bindings done)
3. selected call-chain/runtime-method lowering gaps

Latest completed slice:

- `label: statement`, `break label`, and `continue label` lower through unique
  internal targets. A continuation target is consumed by its labelled loop and
  is not inherited by nested loops.
- A nested-loop runtime probe confirms `continue outer` executes three outer
  iterations, rather than incorrectly continuing the inner loop.
- Static scalar array destructuring and shorthand object destructuring now emit
  typed C++98 scalar declarations and retain their types through `console.log`;
  JS -> C++ -> C -> WASM probes print `values: 10 20` and `point: 10 20`.
- Derived constructors now forward `super(value)` to the arity-matched base
  initializer wrapper, rather than dropping the argument or invoking an
  unavailable zero-argument wrapper.
- Direct numeric fields of known class instances now retain numeric type
  inference through `console.log`; the full WASM probe prints `x: 7` rather
  than the previous pointer placeholder.
- Inherited class methods now resolve to the wrapper owned by the base class;
  a derived instance calling `getValue()` reaches `Base_meth_getValue` and
  preserves its value through the WASM runtime.
- Statically known string call chains now propagate their intermediate model,
  allowing `trim`, case conversion, `startsWith`, and `endsWith` to fold before
  C++ lowering rather than being truncated as runtime method calls.
- Static arrays of scalar values now fold `join(separator)` to a C string
  literal, avoiding a JS-only array method call in generated C++.

Acceptance:
- new positive fixtures
- fewer conservative fallback comments in generated C++
- `npm run test` and `npm run test:full` stay green

### Batch A Status Update (2026-08-15, later pass)

Completed in this MaiaJS-owned wave:

- added first JS ports for:
  - `compiler/examples/suite/02_control_flow/control_flow.port.js`
  - `compiler/examples/suite/03_functions/functions.port.js`
  - `compiler/examples/suite/04_classes/classes.port.js`
  - `compiler/examples/suite/09_strings/strings.port.js`
- added matching `*.js_expected_output.txt` files
- fixed MaiaJS static-model handling for unary negative expressions so:
  - `-4` no longer degrades to `4`
  - `== -6` no longer degrades to `== 6`
- hardened MaiaJS numeric inference enough for `03_functions/functions.port.js` to build through MaiaCpp/WebC into WASM

Current factual result for this wave:

- all four new JS ports now build successfully through the full JS -> C++ -> C -> WASM path
- however, runtime output still does not match the intended expectations

What the current evidence shows:

- the generated MaiaJS C++ is now materially richer and semantically closer to the source
- the remaining semantic loss appears downstream in MaiaCpp/WebC translation, not in the MaiaJS C++ surface for these examples

Concrete evidence already observed:

- `02_control_flow/dist_js/control_flow.port.cpp` contains the full control-flow checks
- but `/tmp/control_flow_port.c` retains only a reduced subset in `main`, effectively collapsing most validations before runtime
- `04_classes/dist_js/classes.port.cpp` contains the expected checks, but `/tmp/classes_port.c` reduces `main` to constructor calls plus a stray `__q(p.x, p.y);` and `ALL PASS`
- `09_strings/dist_js/strings.port.cpp` contains checks, but `/tmp/strings_port.c` reduces `main` to a concat temporary plus `ALL PASS`
- `03_functions` now compiles end-to-end, but runtime still prints only a reduced subset, which again points to downstream body-loss during MaiaCpp/WebC lowering

Implication for the next safe batch:

- MaiaJS has reached a good stopping boundary for this wave
- the next corrective batch should move to the principal `maiacpp` repository and investigate structured body loss / fallback simplification in C lowering
- after that MaiaCpp batch is committed and pushed, the submodule in `maiajs` should be updated per protocol

### Batch A Status Update (2026-08-15, final pass)

Completed after the MaiaCpp principal follow-up:

- principal `maiacpp` was corrected to prefer AST-first lowering for Maia-generated sources instead of falling back too early to simplified analysis
- MaiaJS was corrected so:
  - reserved property names like `set` are preserved in member-call lowering
  - `for` initializers in `NoIn` parser shapes survive lowering into generated C++
  - return-type inference propagates precise parameter types strongly enough for `sqDouble` to remain `double`
  - literal `padStart` / `padEnd` calls are folded directly into C++ string literals
- MaiaCpp call rewriting was corrected so parenthesized unary arguments like `-(4)` no longer block mangled overload resolution in generated C

Validated end-to-end on 2026-08-15:

- `compiler/examples/suite/02_control_flow/control_flow.port.js`
  - PASS through MaiaJS -> MaiaCpp/WebC -> WASM/Node
- `compiler/examples/suite/03_functions/functions.port.js`
  - PASS through MaiaJS -> MaiaCpp/WebC -> WASM/Node
- `compiler/examples/suite/04_classes/classes.port.js`
  - PASS through MaiaJS -> MaiaCpp/WebC -> WASM/Node
- `compiler/examples/suite/09_strings/strings.port.js`
  - PASS through MaiaJS -> MaiaCpp/WebC -> WASM/Node

Net result for this batch:

- the original residual failures in control flow, functions, classes, and strings are closed for these JS ports
- the next efficient step is to move on to the next block of missing or weak Maia suite coverage, rather than revisiting this batch

## Batch B - MaiaC (Best Upstream Semantic Batch)

Why next:
- MaiaC is green now, but still documents real language/runtime gaps
- MaiaCpp and MaiaJS both benefit indirectly from a stronger MaiaC baseline

### B1. Close known preprocessor edge limitations

Concrete known limitations already documented in tests/docs:
- nested macro arithmetic in `#if` not fully expanded
- function-like macros inside `#if` not evaluated
- composed token pasting macro expansion still fails parsing
- nested stringification + global initializer rejection

Primary references:
- `maiac/compiler/tests/test-phase9-preprocessor-advanced-diagnosis.js`
- `maiac/docs/NEXT_STEPS.md`

Acceptance:
- move known limitations to passing diagnostics where feasible
- update conformance/docs immediately after implementation

### B2. Close remaining explicit compiler restrictions with clear semantic value

Concrete restrictions still present in compiler:
- integer minus pointer not supported yet
- variadic calls through function pointers not supported
- assignment to whole struct field object not supported in several paths
- assignment to subarray not supported

Primary references:
- `maiac/compiler/c-compiler.js`

Recommended internal order:
1. restrictions that already have near-complete runtime support
2. restrictions that unlock real examples
3. restrictions that require ABI/runtime redesign last

### B3. Update conformance and TODO docs after real fixes

Primary references:
- `maiac/docs/C89_CONFORMANCE_MATRIX.md`
- `maiac/docs/NEXT_STEPS.md`
- `maiac/docs/TODO.md`

Rule:
- do not postpone doc alignment after the implementation wave; keep docs truthful while context is fresh

## Batch C - MaiaCpp (Largest Practical Payoff Batch)

Why this is high value:
- current tests are green, but MaiaCpp still carries roadmap items and some docs that look older than current behavior
- MaiaJS course/example coverage still depends heavily on MaiaCpp practical expressiveness

### C1. Refresh and reconcile practical-readiness documentation with current reality

Primary references:
- `maiacpp/docs/PRACTICAL_READINESS_TODO.md`
- `maiacpp/docs/CONFORMANCE_MATRIX.md`
- `maiacpp/docs/AST_100_IMPLEMENTATION_TODO.md`

Observed mismatch:
- several docs still describe gaps that the current green tier/equivalence suite has already covered

Acceptance:
- docs no longer understate or overstate current behavior
- roadmap reflects real remaining items only

### C2. Continue reducing fallback/hint dependence in AST-first path

Still-open direction in docs:
- strict lane remains opt-in
- goal is to reduce source-hint / legacy-function-hint dependence

Targets:
- broaden `--ast-strict` passing surface
- broaden `--no-legacy-function-hints` passing subset
- add targeted fixtures before removing any compatibility scaffolding

Acceptance:
- more strict/no-legacy fixtures pass
- default lane remains green

### C3. Focus on practical course/example blockers rather than parser-only work

The most useful MaiaCpp work now is not parser rescue, but practical lowering/runtime expansion for real user code.

Best candidates:
- improve behavior in areas that unblock additional course examples and MaiaJS ports
- prefer concrete semantic/runtime cases over abstract parser milestones

## Batch D - MaiaWASM / MaiaCC (Only If Needed)

These repositories are currently green and are not the highest-value immediate targets.

### MaiaWASM

Remaining TODOs are mostly:
- disassembler output quality
- fixture/round-trip expansion
- CLI ergonomics

Good time to touch MaiaWASM:
- only after a concrete MaiaC/MaiaCpp need appears
- or when intentionally doing a disassembler-focused sprint

### MaiaCC

No urgent gap surfaced in the current validation sweep.

Good time to touch MaiaCC:
- only when grammar/parser-generator changes are required upstream

## Recommended Execution Order

If the goal is maximum practical progress with minimum synchronization pain:

1. MaiaJS batch:
   - JS ports
   - skip classification
   - selected lowering gaps
2. MaiaC batch:
   - preprocessor edge limitations
   - explicit compiler restrictions with real payoff
3. MaiaCpp batch:
   - AST-first/fallback reduction
   - practical course/example unblockers
   - doc reconciliation
4. MaiaWASM / MaiaCC only if newly required

## Commit Strategy

To reduce commit frequency safely:

### Strategy

- one commit per coherent batch in the owning repo
- run the full repository-local validation before commit
- push immediately after the batch is green
- only then sync downstream submodules, in order, if the owner is upstream

### Good commit granularity

- MaiaJS batch commit:
  - several JS ports + related test updates + diagnostics doc updates
- MaiaC batch commit:
  - one preprocessor wave or one semantic restriction wave, not one tiny fix
- MaiaCpp batch commit:
  - one AST-first/fallback-reduction wave with fixtures and readiness docs

### Avoid

- tiny commits for every single fixture edit
- mixing code cleanup with unrelated semantic expansion
- carrying unpushed upstream changes while starting downstream edits

## Suggested Immediate Next Batch

Recommended next batch to start now:

### MaiaJS Port-Coverage Batch

Scope:
- add the first meaningful group of missing `.port.js` examples
- improve run diagnostics so SKIPs are classified clearly
- keep `npm run test:full` green throughout

Suggested first subset:
- `compiler/examples/suite/02_control_flow`
- `compiler/examples/suite/03_functions`
- `compiler/examples/suite/04_classes`
- `compiler/examples/suite/09_strings`

Why this subset:
- broad user-facing value
- easy to verify
- confined to MaiaJS only
- safe to batch before committing
