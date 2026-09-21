# MaiaJS Full ES8 Roadmap

Last updated: 2026-09-20

## Objective

Move MaiaJS from its current strict, executable ES8 subset to a complete ES8
runtime contract: every supported construct must lower through C++98, MaiaCpp,
MaiaC, and WebAssembly and be verified by behavior, not merely by parsing or
successful compilation.

The current release remains valid for its documented strict corpus. This roadmap
tracks the additional language and runtime work required before claiming full
ES8 compatibility.

## Delivery Rules

- [ ] Each feature begins with a minimal source fixture and an expected runtime
  marker or value.
- [ ] Each feature has strict-lowering diagnostics for unsupported edge cases.
- [ ] Each feature is tested through JS -> C++98 -> C -> WASM in Node.
- [ ] Browser-host coverage is added whenever scheduling, callbacks, host
  objects, or shared memory are involved.
- [ ] Changes to parser grammars or parser-generator templates follow the Maia
  synchronization protocol: MaiaCC -> MaiaWASM -> MaiaC -> MaiaCpp -> MaiaJS.
- [ ] A feature is not advertised as supported until generated C++ and C are
  inspected for placeholder/stub lowering and its behavior gate passes.

## Phase 1: Function Values and Closures

This is the foundational phase. Promise executors, callbacks, iterator methods,
and many library APIs depend on real function values.

- [ ] Specify a C++98-compatible callable representation: code entry point,
  captured environment, parameter metadata, and return channel.
- [ ] Lower function expressions and arrow functions used as values, including
  calls through local variables, object properties, and arguments.
- [x] Lower direct calls to non-capturing top-level synchronous arrow bindings
  as concrete C++ functions. The regression `increment(4)` is validated through
  JS -> C++98 -> C -> WASM and prints `result 5` in the Node runner. This is a
  narrow first milestone, not yet general function-value or closure support.
- [x] Invoke a non-capturing top-level function declaration as a callback in
  statically lowered `Array.prototype.forEach`. The complete pipeline preserves
  element arguments and prints `item 2` and `item 4`; dynamic callback values,
  storage, and captured state remain outside this milestone.
- [x] Lower an inline non-capturing synchronous arrow callback in statically
  lowered `Array.prototype.forEach` to a concrete helper function. The WASM
  behavior gate prints `item 2` and `item 4`; this does not yet make arbitrary
  arrow values, capture environments, or async arrows generally callable.
- [ ] Capture lexical locals by value and by shared mutable cell where JavaScript
  semantics require subsequent writes to be visible.
- [ ] Preserve lexical `this` for arrow functions; preserve call-site receiver
  semantics for ordinary functions.
- [ ] Support callback return values and exceptions/diagnostics across the
  callable boundary.
- [ ] Add lifetime management for captured environments and callable values;
  test nested closures, escaping callbacks, and repeated invocation.
- [ ] Add behavior gates for `map`, `filter`, `reduce`, higher-order callbacks,
  nested closures, and callback calls after an async suspension.

Exit gate: callbacks can be passed, stored, invoked, and capture local state
through the complete WASM pipeline without generated stubs.

## Phase 2: General Promise Semantics

- [ ] Lower `new Promise(function (resolve, reject) { ... })` and arrow executor
  equivalents using Phase 1 callable values.
- [ ] Implement once-only settlement, resolution assimilation, rejection, and
  propagation through `then`, `catch`, and `finally`.
- [ ] Support callback-returned values and callback-returned promises.
- [ ] Preserve FIFO microtask ordering in Node and browser-host runners.
- [ ] Define and test uncaught rejection reporting without silently losing the
  failure in the C++/WASM boundary.
- [ ] Extend async/await lowering to consume the general Promise implementation,
  rather than only its current constrained runtime forms.

Exit gate: chained fulfillment/rejection behavior and `await` match source
markers in Node and browser hosts.

## Phase 3: Iteration Protocol and Generators

- [ ] Implement iterator objects with `next()`, `{ value, done }`, and ordinary
  `for...of` consumption.
- [ ] Lower generator declarations and expressions into resumable state
  machines, preserving yielded values, completion values, and local state.
- [ ] Implement `yield`, `yield*`, `return`, and `throw` interaction at the
  iterator boundary.
- [ ] Define generator cleanup semantics for `return()` and `throw()`.
- [ ] Add runtime behavior gates for arrays, custom iterators, nested generators,
  generator exceptions, and generator use around async code where supported.

Exit gate: source and WASM executions agree on the full sequence of yielded,
returned, and thrown values.

## Phase 4: Shared Memory and Atomics

This phase requires an explicit platform decision. Browser WebAssembly threads
and Node worker environments have different deployment and security conditions.

- [ ] Define supported hosts, required flags/headers, memory ownership, and
  feature detection for `SharedArrayBuffer`.
- [ ] Map typed-array views over shared memory into the C++98/C/WASM runtime.
- [ ] Implement `Atomics.load`, `store`, `add`, `sub`, `and`, `or`, `xor`,
  `exchange`, and `compareExchange` with defined integer conversion behavior.
- [ ] Specify `Atomics.wait`, `notify`, and timeout behavior per supported host,
  or diagnose them explicitly where WebAssembly deployment cannot support them.
- [ ] Add deterministic single-worker tests plus multi-worker integration tests
  for visibility, contention, and notification ordering.
- [ ] Document unsupported memory orders or host restrictions rather than
  providing simulated success.

Exit gate: each advertised atomic operation has repeatable cross-worker behavior
tests in every supported runtime host.

## Phase 5: ES8 Conformance Closure

- [ ] Inventory every syntax and built-in exercised by `compiler/examples/es8_test.js`.
- [ ] Classify each item as implemented, intentionally unsupported with a stable
  diagnostic, or deferred with a linked issue/roadmap item.
- [ ] Convert the broad syntax demonstrator into focused behavioral fixtures.
- [ ] Run strict lowering over the resulting complete ES8 corpus.
- [ ] Run Node and browser-host behavior-marker suites for the corpus.
- [ ] Update public documentation from "strict ES8 subset" to "ES8 compatible"
  only when all required features have executable conformance coverage.

## Suggested Execution Order

1. Phase 1 callable representation and non-capturing function values.
2. Capturing closures and receiver semantics.
3. General Promise executors and chaining.
4. Iterator protocol, then generators.
5. Shared-memory platform decision and Atomics.
6. Final inventory and conformance pass.

## Current Status

- [x] Strict MaiaJS release subset is published and behavior-validated through
  C++98, C, and WASM.
- [ ] Full ES8 runtime compatibility is not yet claimed.
- [~] Phase 1 is in progress; only direct non-capturing calls and a static
  `forEach` callback case are behavior-validated so far.
