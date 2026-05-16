# MaiaCpp Test Port Backlog for MaiaJS ES8

This backlog turns the MaiaCpp regression style into MaiaJS ES8 coverage.

## Porting Rules

- Keep MaiaJS tests grammar-first and ES8-only.
- Port behavior, not C89/C++-specific syntax or runtime internals.
- Prefer fixture-driven coverage for parser and lowering slices.
- Use one test file per feature cluster when the source shape is shared.

## Priority 1: High-value transpiler regressions

1. Control flow bundle.
   - MaiaCpp analogs: selection and iteration diagnostics.
   - MaiaJS target: `if`, `while`, `do`, `for`, `switch`, `break`, `continue`.
   - Suggested coverage: C++ emission assertions and fixture roundtrips.

2. Local function routing.
   - MaiaCpp analogs: function definition and prototype linkage diagnostics.
   - MaiaJS target: top-level function declarations, local calls, host-call exclusion.
   - Suggested coverage: ensure local calls stay local and do not become `__host` symbols.

3. Host interop routing.
   - MaiaCpp analogs: runtime host symbol tests.
   - MaiaJS target: `console.log`, `setTimeout`, and member-call host mapping.
   - Suggested coverage: AST-first classification plus generated C++ assertions.

## Priority 2: Structural transpiler regressions

4. Arrays and objects.
   - MaiaCpp analogs: initializer and literal diagnostics.
   - MaiaJS target: array/object literal lowering, helper emission, and fallback avoidance.

5. Classes and constructors.
   - MaiaCpp analogs: function prototype linkage and constructor semantics.
   - MaiaJS target: `class`, `new`, constructor helper emission, and method lowering.

6. Async and exception routing.
   - MaiaCpp analogs: setjmp/bootstrap/resume regressions.
   - MaiaJS target: `async`, `await`, `try/catch/finally`, and IR/runtime wrapper checks.

## Priority 3: Parser regression matrix

7. Capability matrix.
   - MaiaCpp analogs: phase-by-phase parser diagnostics.
   - MaiaJS target: explicit supported/unsupported grammar slices in `compiler/tests/fixtures`.

## First Port Targets

- `ecmascript-parser-supported.test.js`
- `ecmascript-parser-capability-matrix.test.js`
- `ecmascript-host-interop-ast.test.js`
- `ecmascript-call-chain-new-cpp.test.js`
- `ecmascript-class-cpp.test.js`
- `ecmascript-array-cpp.test.js`
- `ecmascript-object-cpp.test.js`
- `ecmascript-async-cpp.test.js`

## Implemented In Current Cycle

- Dedicated sync matrix: `compiler/tests/ecmascript-maiacpp-port-matrix.test.js`
- Dedicated async matrix: `compiler/tests/ecmascript-maiacpp-port-async.test.js`
- Fixture ports added and validated:
   - `compiler/tests/fixtures/211_transpiler_local_function_routing.*`
   - `compiler/tests/fixtures/212_transpiler_control_flow_bundle.*`
   - `compiler/tests/fixtures/213_transpiler_async_try_catch_finally.*`
   - `compiler/tests/fixtures/214_transpiler_function_return_type_propagation.*`
   - `compiler/tests/fixtures/215_transpiler_forward_prototype_cross_call.*`
   - `compiler/tests/fixtures/216_transpiler_recursive_function.*`
   - `compiler/tests/fixtures/217_parser_optional_chaining_not_supported.*`
   - `compiler/tests/fixtures/218_parser_nullish_coalescing_not_supported.*`
   - `compiler/tests/fixtures/219_parser_private_field_not_supported.*`
   - `compiler/tests/fixtures/220_transpiler_function_return_type_three_hops.*`
   - `compiler/tests/fixtures/221_transpiler_parameter_shadowing_binding.*`
   - `compiler/tests/fixtures/222_parser_bigint_literal_not_supported.*`
   - `compiler/tests/fixtures/223_parser_logical_assignment_not_supported.*`
   - `compiler/tests/fixtures/224_parser_dynamic_import_not_supported.*`
   - `compiler/tests/fixtures/225_transpiler_function_return_type_three_hops_conditional.*`
   - `compiler/tests/fixtures/226_transpiler_nested_block_shadowing_baseline.*`

## Next Fixture Candidates

- Negative parser case mirroring nested-function rejection semantics.
- Function-parameter shadowing and local binding diagnostics for ES8 lowering.
- Additional prototype/return-type propagation chains across 3+ function hops.

Status after this update:
- Post-ES8 parser-negative guardrails are now covered for `?.`, `??`, and private fields.
- Function return-type propagation is now covered across 1-hop and 3-hop chains.
- Parameter-shadowing lowering baseline is covered in fixture form.
- Additional parser-negative guardrails are covered for BigInt literals, logical assignment, and dynamic import.
- Conditional return-type propagation across a 3-hop chain is covered.
- Nested block shadowing currently lowered baseline is captured explicitly for regression tracking.
