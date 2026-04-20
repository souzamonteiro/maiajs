# ECMAScript Parser Test Suite

This folder contains the parser validation suite for the generated parser at ../ecmascript-parser.js.

## Files

- parser-test-helpers.js: shared parser/collector helpers used by all tests.
- ecmascript-parser-supported.test.js: stable regression tests for grammar currently accepted by the generated parser.
- ecmascript-parser-capability-matrix.test.js: documents what is currently supported and what is intentionally failing in the baseline.
- ecmascript-es6-target-baseline.test.js: ES2015 target cases that must fail today and should be turned into passing tests as ES6 grammar support is implemented.

## Run

From repository root:

```sh
node --test compiler/tests/*.test.js
```

## ES6 Upgrade Workflow

1. Update grammar in ../grammar/EcmaScript.ebnf.
2. Regenerate parser with ../compiler/build.sh.
3. Move individual ES6 cases from "expected fail" to "supported" tests once each feature starts parsing.
