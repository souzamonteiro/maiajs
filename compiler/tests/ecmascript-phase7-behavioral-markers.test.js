'use strict';

/**
 * Phase 7 – End-to-end behavioral marker validation.
 *
 * Goal: move from structural success to behavioral parity.
 *
 * PIPELINE STATUS (as of Phase 7 authoring):
 *
 *   JS source → C++ (MaiaJS)       ✅  Validated by this test suite (Phases 1-6)
 *   C++ → C   (MaiaCpp)            ⚠️  PARTIAL – simple externs/declarations OK,
 *                                        but function bodies with sequential statements
 *                                        fall into stub-fallback (no-supported-lowering).
 *                                        main() always becomes `return 0` without emitting
 *                                        any host calls. Blocked on MaiaCpp body lowering.
 *   C  → WASM (MaiaC)              ✅  Compiles correctly given valid C input.
 *   WASM host bridge (MaiaC webc)  ✅  const-char* params → readCString; validated by
 *                                        host-env-builder.test.js in MaiaC repo.
 *   WASM → behavioral output       ❌  Zero output: stub-fallback bodies never call
 *                                        __console__log or any other host import.
 *
 * Tests in this file cover what CAN be validated from the MaiaJS side:
 *   1. C++ output structure for marker statements (extern decl + call form)
 *   2. IR hostInterop detectedCalls for a console.log section header
 *   3. Explicit diagnostic tests confirming the known unsupported forms that
 *      currently produce structured (not silent) output
 *
 * When MaiaCpp body lowering is completed, remove the "stub-fallback" notes and
 * add real WASM execution assertions using node-runner.js from the dist.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-p7-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const result = spawnSync(process.execPath, [COMPILER, '--file', inputFile, '--cpp-out', cppOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(cppOut), 'Expected C++ output file');

  return fs.readFileSync(cppOut, 'utf8');
}

function runCompilerIR(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-p7ir-'));
  const inputFile = path.join(tempDir, 'input.js');
  const irOut = path.join(tempDir, 'out.ir.json');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const result = spawnSync(
    process.execPath,
    [COMPILER, '--file', inputFile, '--ir-json-out', irOut],
    {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(irOut), 'Expected IR JSON output file');

  return JSON.parse(fs.readFileSync(irOut, 'utf8'));
}

// ---------------------------------------------------------------------------
// Section 1: C++ structural markers for console.log calls
// ---------------------------------------------------------------------------

test('Phase 7 marker: console.log string literal → const char* extern + call in main', () => {
  const cpp = runCompilerCpp(`console.log('MARKER_START');\n`);

  // Must emit the extern with const char* param (not void*)
  assert.match(cpp, /extern void __console__log\(const char\*\)/,
    'console.log must produce extern void __console__log(const char*)');

  // Must emit the call in main with the literal
  assert.match(cpp, /__console__log\("MARKER_START"\)/,
    'main must call __console__log with the string literal');
});

test('Phase 7 marker: consecutive console.log calls all emit in main body', () => {
  const cpp = runCompilerCpp([
    'console.log("SECTION_START");',
    'console.log("SECTION_END");',
  ].join('\n') + '\n');

  assert.match(cpp, /__console__log\("SECTION_START"\)/,
    'first console.log must appear in main');
  assert.match(cpp, /__console__log\("SECTION_END"\)/,
    'second console.log must appear in main');

  // Only one extern declaration (deduplicated)
  const externCount = (cpp.match(/extern void __console__log/g) || []).length;
  assert.equal(externCount, 1, 'extern __console__log must be declared exactly once');
});

test('Phase 7 marker: console.log with string concat emits extern and call with concat expression', () => {
  // CURRENT STATE: string + numeric-var concat emits void* extern (not const char*).
  // The call emits the inlined JS-style concat "value: " + x.
  // MaiaCpp will handle the C++ string concat via its own runtime.
  const cpp = runCompilerCpp(`var x = 5;\nconsole.log("value: " + x);\n`);

  // The extern must be present (void* for mixed-type concat)
  assert.match(cpp, /extern void __console__log\(/,
    'extern __console__log must appear');

  // The call must appear with the concat expression
  assert.match(cpp, /__console__log\("value: " \+ x\)/,
    '__console__log must emit the string-concat expression as its argument');
});

test('Phase 7 marker: section headers from full_es8_test.js produce correct C++ calls', () => {
  const sectionLines = [
    "console.log('--- SECTION 1: OPERATORS ---');",
    "console.log('--- SECTION 2: DECLARATIONS ---');",
    "console.log('--- SECTION 9: EXCEPTIONS ---');",
  ].join('\n') + '\n';

  const cpp = runCompilerCpp(sectionLines);

  assert.match(cpp, /__console__log\("--- SECTION 1: OPERATORS ---"\)/,
    'section 1 header must emit correctly');
  assert.match(cpp, /__console__log\("--- SECTION 2: DECLARATIONS ---"\)/,
    'section 2 header must emit correctly');
  assert.match(cpp, /__console__log\("--- SECTION 9: EXCEPTIONS ---"\)/,
    'section 9 header must emit correctly');
});

// ---------------------------------------------------------------------------
// Section 2: IR hostInterop detectedCalls structure
// ---------------------------------------------------------------------------

test('Phase 7 IR: detectedCalls populated for console.log markers', () => {
  const ir = runCompilerIR(`console.log('MARKER_A');\nconsole.log('MARKER_B');\n`);

  assert.ok(ir.hostInterop, 'IR must contain hostInterop section');
  assert.ok(Array.isArray(ir.hostInterop.detectedCalls),
    'hostInterop.detectedCalls must be an array');

  const consoleCalls = ir.hostInterop.detectedCalls.filter(
    (c) => c.host === '__console__log'
  );
  assert.ok(consoleCalls.length >= 2,
    'detectedCalls must contain at least 2 __console__log entries for 2 console.log calls');

  // Each entry must carry source and host fields
  for (const entry of consoleCalls) {
    assert.equal(entry.source, 'console.log', 'detectedCall source must be console.log');
    assert.equal(entry.host, '__console__log', 'detectedCall host must be __console__log');
    assert.ok(Number.isInteger(entry.callIndex), 'detectedCall must carry a callIndex');
  }
});

test('Phase 7 IR: hostInterop strategy uses dynamic-prefix mode', () => {
  const ir = runCompilerIR(`console.log('x');\n`);

  const strategy = ir.hostInterop && ir.hostInterop.strategy;
  assert.ok(strategy, 'IR must have hostInterop.strategy');
  assert.equal(strategy.mode, 'dynamic-prefix',
    'strategy mode must be dynamic-prefix');
  assert.equal(strategy.hostPrefix, '__',
    'strategy hostPrefix must be __');
  assert.equal(strategy.separator, '__',
    'strategy separator must be __');
});

// ---------------------------------------------------------------------------
// Section 3: Explicit diagnostics for currently unsupported ES8 forms
// ---------------------------------------------------------------------------

test('Phase 7 diagnostic: WeakMap new expression emits __new__WeakMap helper', () => {
  const cpp = runCompilerCpp(`const _private = new WeakMap();\n`);

  assert.match(cpp, /__new__WeakMap\(\)/,
    'new WeakMap() must emit __new__WeakMap() helper call');
  assert.doesNotMatch(cpp, /\bnew WeakMap\b/,
    'raw JS-style new WeakMap must not appear in C++ output');
});

test('Phase 7 diagnostic: constructor pattern emits __new__Name helper', () => {
  const cpp = runCompilerCpp(
    'function Animal(name) { this.name = name; }\nconst a = new Animal("Rex");\n'
  );

  assert.match(cpp, /__new__Animal\(/,
    'new Animal(...) must emit __new__Animal helper call');
});

test('Phase 7 diagnostic: arrow function in array callback emits lambda helper', () => {
  const cpp = runCompilerCpp(`const nums = [1, 2, 3];\nconst doubled = nums.map(n => n * 2);\n`);

  // The lambda must be emitted via __maia_lambda helper, not as raw JS arrow syntax
  assert.doesNotMatch(cpp, /=>/,
    'arrow syntax must not appear in C++ output');
  assert.match(cpp, /__maia_lambda/,
    'arrow function must be lowered to __maia_lambda helper');
});

test('Phase 7 diagnostic: try/catch/finally structure emits C++ try/catch with throw helper', () => {
  // CURRENT STATE: try/catch/finally is lowered to native C++ syntax.
  // - throw new Error(...) → throw __new__Error(...)
  // - catch(e) → catch(const char* e) with the catch body
  // - finally body is inlined after the catch block
  // Note: exc_ ABI calls (__exc_push/__exc_pop) are emitted by the MaiaCpp
  // C++ → C lowering layer, not by MaiaJS itself.
  const cpp = runCompilerCpp(
    `try { throw new Error("oops"); } catch(e) { console.log("caught"); } finally { console.log("done"); }\n`
  );

  assert.match(cpp, /throw __new__Error\("oops"\)/,
    'throw new Error must emit throw __new__Error(...)');
  assert.match(cpp, /catch \(/,
    'C++ catch must appear');
  assert.match(cpp, /__console__log\("caught"\)/,
    'catch body must emit __console__log("caught")');
  assert.match(cpp, /__console__log\("done"\)/,
    'finally body content must appear after catch');
});

test('Phase 7 diagnostic: Promise.resolve chain emits __Promise__resolve extern', () => {
  const cpp = runCompilerCpp(
    `Promise.resolve(5).then(n => n * 2).then(n => console.log(n));\n`
  );

  assert.match(cpp, /extern.*__Promise__resolve/,
    'Promise.resolve must emit extern __Promise__resolve');
});

// ---------------------------------------------------------------------------
// Section 4: Behavioral gate documentation
// ---------------------------------------------------------------------------

test('Phase 7 behavioral gate: pipeline bottleneck is documented (MaiaCpp stub-fallback)', () => {
  // This test documents the current state of the end-to-end pipeline.
  // It does NOT execute WASM (behavioral output is not yet achievable).
  //
  // Blocked on: MaiaCpp cpp-compiler.js function body lowering.
  //   - For sequential-statement function bodies (e.g. main() that calls
  //     __console__log then returns 0), all patterns return null:
  //     simpleReturnExpr, simpleReturnCall, simpleIfReturn, etc.
  //   - Result: stub-fallback (no-supported-lowering) → body becomes `return 0`
  //   - WASM runs successfully (exit 0) but produces no output
  //
  // Expected runtime markers once MaiaCpp body lowering is complete:
  const EXPECTED_MARKERS = [
    '============================================================',
    'ES8 SYNTAX TESTER - compatibility mode',
    '--- SECTION 1: OPERATORS ---',
    '--- SECTION 2: DECLARATIONS ---',
    '--- SECTION 3: FUNCTIONS ---',
    '--- SECTION 4: OBJECTS ---',
    '--- SECTION 5: STRING METHODS ---',
    '--- SECTION 6: ARRAYS ---',
    '--- SECTION 7: CONSTRUCTORS ---',
    '--- SECTION 8: PROMISES ---',
    '--- SECTION 9: EXCEPTIONS ---',
    'Caught: Custom error thrown',
    'Finally executed',
    '--- SECTION 10: TRAILING COMMAS ---',
    '--- SECTION 11: DESTRUCTURING ---',
    '--- SECTION 12: SYMBOLS + ITERATORS ---',
    '--- SECTION 13: REFLECT + COLLECTIONS ---',
    'ES8 SYNTAX TEST COMPLETE (compatibility mode)',
  ];

  // Verify the markers are non-empty and unique (structural sanity check)
  assert.ok(EXPECTED_MARKERS.length > 0, 'expected marker set must be non-empty');
  const unique = new Set(EXPECTED_MARKERS);
  assert.equal(unique.size, EXPECTED_MARKERS.length, 'expected markers must be unique');

  // Verify each marker would appear in the actual node output of full_es8_test.js
  // Run the source directly to capture expected output (not WASM)
  const samplePath = path.resolve(__dirname, '..', 'examples', 'full_es8_test.js');
  const nodeResult = spawnSync(process.execPath, [samplePath], { encoding: 'utf8' });
  assert.equal(nodeResult.status, 0, 'full_es8_test.js must run cleanly under Node.js');
  const nodeOutput = nodeResult.stdout;
  for (const marker of EXPECTED_MARKERS) {
    assert.ok(
      nodeOutput.includes(marker),
      `expected marker "${marker}" must appear in node output of full_es8_test.js`
    );
  }
});
