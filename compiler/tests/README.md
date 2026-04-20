# ECMAScript Parser Test Suite

This folder contains the parser validation suite for the generated parser at ../ecmascript-parser.js.

## Files

- parser-test-helpers.js: shared parser/collector helpers used by all tests.
- ecmascript-parser-supported.test.js: stable regression tests for grammar currently accepted by the generated parser.
- ecmascript-parser-capability-matrix.test.js: documents what is currently supported and what is intentionally failing in the baseline.
- ecmascript-es6-target-baseline.test.js: ES2015 feature coverage tests; this file now tracks expanded ES2015 support beyond the initial baseline.
- ecmascript-es8-supported.test.js: ES2017/ES8 support checks (async/await, exponentiation, and related additions).
- ecmascript-host-registry.test.js: host interop mapping contract tests (including required __ host symbol prefix).
- ecmascript-host-interop-ast.test.js: end-to-end AST-first host interop extraction checks from JS input to IR output.

## Run

From repository root:

```sh
node --test compiler/tests/*.test.js
```

## ES6 Upgrade Workflow

1. Update grammar in ../grammar/EcmaScript.ebnf.
2. Regenerate parser with ../compiler/build.sh.
3. Add or move ES2015 cases into supported sections as each feature starts parsing.
