'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-expr-fallback-'));
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

test('expression fallback: function-expression assignment no longer emits expression placeholder', () => {
  const cpp = runCompilerCpp(
    'const Animal = function(name) { this.name = name; };\n'
    + 'Animal.prototype.speak = function() { return this.name; };\n'
  );

  assert.match(cpp, /int __maia_fn_Animal_prototype_speak\(void\)/, 'function-expression assignment should emit a synthesized callable helper');
  assert.match(cpp, /Animal\.prototype\.speak = __maia_fn_Animal_prototype_speak;/, 'property assignment should point to the synthesized helper instead of nullptr');
  assert.doesNotMatch(cpp, /\[expression not yet lowered\]/, 'C++ output must not contain expression placeholder markers');
});

test('return fallback: unresolved return expression no longer emits return placeholder', () => {
  const cpp = runCompilerCpp(
    'function delay(ms, value) {\n'
    + '  return new Promise(resolve => setTimeout(() => resolve(value), ms));\n'
    + '}\n'
  );

  assert.match(cpp, /int delay\(int ms, int value\)/, 'function must be emitted');
  assert.match(cpp, /return 0;/, 'unresolved return expression should emit default return value');
  assert.doesNotMatch(cpp, /\[return expression not yet lowered\]/, 'C++ output must not contain return placeholder markers');
});

test('call argument lowering: string-literal.repeat(n) constant-folds to C string literal', () => {
  const cpp = runCompilerCpp('console.log("=".repeat(5));\n');

  assert.match(cpp, /__console__log\("====="\);/, 'string-literal.repeat(n) should constant-fold to a repeated C string literal');
  assert.doesNotMatch(cpp, /"="\.repeat\(/, 'constant-folded output must not contain JS .repeat() call');
  assert.doesNotMatch(cpp, /\/\* expr \*\//, 'C++ output must not contain expr placeholder markers');
});

test('top-level function-expression bindings lower to callable local functions', () => {
  const cpp = runCompilerCpp(
    'const expressionFunc = function(param) { return "Function expression: " + param; };\n'
    + 'const Animal = function(name, species) { this.name = name; this.species = species; };\n'
    + 'const trailingCommas = function(a, b, c) { return a + b + c; };\n'
    + 'console.log(expressionFunc("World"));\n'
    + 'const genericAnimal = new Animal("Generic", "Unknown");\n'
    + 'console.log(trailingCommas("a", "b", "c"));\n'
  );

  assert.match(cpp, /const char\* expressionFunc\(int param\)/, 'function-expression binding should emit a callable definition');
  assert.match(cpp, /int trailingCommas\(int a, int b, int c\)/, 'top-level helper binding should emit a callable definition');
  assert.match(cpp, /void\* __new__Animal\(int name, int species\)/, 'constructor-style binding used by new should emit a constructor helper definition');
  assert.match(cpp, /const void\* __maia_this = __maia_obj_literal0\(\);\n  __Reflect\(__maia_this, "name", name\);\n  __Reflect\(__maia_this, "species", species\);/, 'constructor helper should seed and populate a pseudo-object instance');
  assert.match(cpp, /__console__log\(expressionFunc\("World"\)\);/, 'call site should route to the local function symbol');
  assert.match(cpp, /const void\* genericAnimal = __new__Animal\("Generic", "Unknown"\);/, 'new-expression should keep constructor helper lowering');
  assert.doesNotMatch(cpp, /const void\* expressionFunc = nullptr;/, 'top-level function-expression binding must not degrade to nullptr');
  assert.doesNotMatch(cpp, /const void\* Animal = nullptr;/, 'top-level constructor binding must not degrade to nullptr');
  assert.doesNotMatch(cpp, /const void\* trailingCommas = nullptr;/, 'top-level helper binding must not degrade to nullptr');
  assert.doesNotMatch(cpp, /int Animal\(int name, int species\)/, 'constructor-style binding should no longer emit a legacy callable free function');
});

test('inline function expressions in object literals and call arguments lower to synthesized helpers', () => {
  const cpp = runCompilerCpp(
    'const person = { greet: function() { return "Hello"; } };\n'
    + 'const rangeValues = [1, 2, 3];\n'
    + 'rangeValues.forEach(function(num) { console.log(num); });\n'
  );

  assert.match(cpp, /const char\* __maia_fn_person_greet\(void\)/, 'object literal method value should emit a synthesized helper');
  assert.match(cpp, /const void\* person = __maia_obj_literal1\("greet", \(int\)\(__maia_fn_person_greet\)\);/, 'object literal should reference the synthesized helper instead of nullptr');
  assert.match(cpp, /int __maia_fn_arg_rangeValues_forEach_0\(int num\)/, 'inline callback argument should emit a synthesized helper');
  assert.match(cpp, /__rangeValues__forEach\(__maia_fn_arg_rangeValues_forEach_0\);/, 'call argument should reference the synthesized helper instead of nullptr');
  assert.doesNotMatch(cpp, /"greet", \(int\)\(nullptr\)/, 'object literal function value must not degrade to nullptr');
  assert.doesNotMatch(cpp, /__rangeValues__forEach\(nullptr\)/, 'inline callback must not degrade to nullptr');
});

test('method calls on lowered non-path bases stay callable', () => {
  const cpp = runCompilerCpp(
    'const setLike = [1, 2, 3, 3, 4].filter(function(v, i, arr) {\n'
    + '  return arr.indexOf(v) === i;\n'
    + '});\n'
  );

  assert.match(cpp, /int __maia_fn_arg_call_0\(int v, int i, int arr\)/, 'array-literal callback should still emit a synthesized helper');
  assert.match(cpp, /const void\* setLike = __maia_arr_builder_end\([^\n]*\.filter\(__maia_fn_arg_call_0\);/, 'array-literal method call should lower instead of degrading to nullptr');
  assert.doesNotMatch(cpp, /const void\* setLike = nullptr;/, 'non-path base method call must not degrade to nullptr');
});

test('arguments identifier lowers to safe fallback instead of raw JS token', () => {
  const cpp = runCompilerCpp(
    'function variadic() {\n'
    + '  return arguments;\n'
    + '}\n'
  );

  assert.match(cpp, /return \(int\)\(nullptr\);/, 'arguments identifier should lower to a safe fallback value');
  assert.doesNotMatch(cpp, /\barguments\b/, 'raw JS arguments token must not leak into C++ output');
});

test('destructuring lowers to C++98-safe fallback without auto/member indexing tokens', () => {
  const cpp = runCompilerCpp(
    'const [a, b] = sourceArray;\n'
    + 'const { x, y } = sourceObj;\n'
  );

  assert.match(cpp, /\[unsupported array destructuring lowered to default values\]/, 'array destructuring should emit explicit unsupported diagnostic');
  assert.match(cpp, /\[unsupported object destructuring lowered to default values\]/, 'object destructuring should emit explicit unsupported diagnostic');
  assert.doesNotMatch(cpp, /\bauto\s+__arr\d+\s*=\s*/, 'C++11 auto-deduction must not be emitted');
  assert.doesNotMatch(cpp, /\bauto\s+__obj\d+\s*=\s*/, 'C++11 auto-deduction must not be emitted');
  assert.doesNotMatch(cpp, /__arr\d+\s*\[/, 'array-index destructuring temps must not leak into output');
  assert.doesNotMatch(cpp, /__obj\d+\./, 'object-member destructuring temps must not leak into output');
});
