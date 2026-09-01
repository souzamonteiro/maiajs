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

  assert.match(cpp, /const char\* __maia_fn_Animal_prototype_speak\(void\* self\)/, 'function-expression assignment should emit a synthesized callable helper');
  assert.match(cpp, /void\* __new__Animal\(int name\)/, 'this-aware function-expression binding should lower as constructor helper');
  assert.doesNotMatch(cpp, /int Animal\(int name\)/, 'constructor-style function-expression binding must not emit invalid legacy free function');
  assert.doesNotMatch(cpp, /\[expression not yet lowered\]/, 'C++ output must not contain expression placeholder markers');
});

test('return fallback: unresolved return expression no longer emits return placeholder', () => {
  const cpp = runCompilerCpp(
    'function delay(ms, value) {\n'
    + '  return new Promise(resolve => setTimeout(() => resolve(value), ms));\n'
    + '}\n'
  );

  assert.match(cpp, /void\* delay\(int ms, int value\)/, 'function must be emitted with its promise result type');
  assert.match(cpp, /return \(void\*\)\(__new__Promise\(/, 'promise construction should remain a concrete runtime expression');
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

  assert.match(cpp, /const char\* expressionFunc\(const char\* param\)/, 'function-expression binding should emit a callable definition');
  assert.match(cpp, /const char\* trailingCommas\(const char\* a, const char\* b, const char\* c\)/, 'top-level helper binding should emit a callable definition');
  assert.match(cpp, /void\* __new__Animal\(const char\* name, const char\* species\)/, 'constructor-style binding used by new should emit a constructor helper definition');
  assert.match(cpp, /void\* __maia_this = __maia_obj_literal0\(\);\n  __Reflect\(__maia_this, "name", name\);\n  __Reflect\(__maia_this, "species", species\);/, 'constructor helper should seed and populate a pseudo-object instance');
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

  assert.match(cpp, /const char\* __maia_fn_person_greet\(void\* self\)/, 'object literal method value should emit a synthesized helper');
  assert.match(cpp, /const void\* person = __maia_obj_literal1\(\(char\*\)"greet", \(long\)\(__maia_fn_person_greet\)\);/, 'object literal should reference the synthesized helper instead of nullptr');
  assert.match(cpp, /int __maia_fn_arg_rangeValues_forEach_0\(double num\)/, 'inline callback argument should emit a synthesized helper');
  assert.match(cpp, /__maia_fn_arg_rangeValues_forEach_0\(1\);/, 'statically lowered forEach should invoke the synthesized helper');
  assert.doesNotMatch(cpp, /"greet", \(int\)\(nullptr\)/, 'object literal function value must not degrade to nullptr');
  assert.doesNotMatch(cpp, /__rangeValues__forEach\(nullptr\)/, 'inline callback must not degrade to nullptr');
});

test('JS-runtime method calls on lowered non-path bases (array literal) are safely dropped', () => {
  const cpp = runCompilerCpp(
    'const setLike = [1, 2, 3, 3, 4].filter(function(v, i, arr) {\n'
    + '  return arr.indexOf(v) === i;\n'
    + '});\n'
  );

  assert.match(cpp, /void\* __maia_fn_arg_call_0\(double v, double i, void\* arr\)/, 'array-literal callback should still emit a synthesized helper');
  assert.match(cpp, /const void\* setLike = __maia_runtime_alloc_value\(2, 4, 0, 0\);/, 'pure literal .filter() may resolve statically to a runtime array shape');
  assert.doesNotMatch(cpp, /\.filter\(/, 'JS-only .filter() on literal must not appear in C++ output');
});

test('arguments identifier lowers to safe fallback instead of raw JS token', () => {
  const cpp = runCompilerCpp(
    'function variadic() {\n'
    + '  return arguments;\n'
    + '}\n'
  );

  assert.match(cpp, /return \(int\)\(0\);/, 'arguments identifier should lower to a safe fallback value');
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

test('static array destructuring lowers bound scalar values and preserves their types', () => {
  const cpp = runCompilerCpp(
    'const values = [10, 20];\n'
    + 'const [first, second] = values;\n'
    + 'console.log(first, second);\n'
  );

  assert.match(cpp, /const double first = 10;/, 'first static array item should become a scalar declaration');
  assert.match(cpp, /const double second = 20;/, 'second static array item should become a scalar declaration');
  assert.match(cpp, /__maia_console_to_cstr_string\(\(const char\*\)\("10"\)\)/, 'first value should retain number formatting at the console call');
  assert.match(cpp, /__maia_console_to_cstr_string\(\(const char\*\)\("20"\)\)/, 'second value should retain number formatting at the console call');
  assert.doesNotMatch(cpp, /unsupported array destructuring/, 'supported static array destructuring must not use the fallback diagnostic');
});

test('static object destructuring lowers shorthand scalar bindings and preserves their types', () => {
  const cpp = runCompilerCpp(
    'const point = { x: 10, y: 20 };\n'
    + 'const { x, y } = point;\n'
    + 'console.log(x, y);\n'
  );

  assert.match(cpp, /const double x = 10;/, 'x static object property should become a scalar declaration');
  assert.match(cpp, /const double y = 20;/, 'y static object property should become a scalar declaration');
  assert.match(cpp, /__maia_console_to_cstr_string\(\(const char\*\)\("10"\)\)/, 'x should retain number formatting at the console call');
  assert.match(cpp, /__maia_console_to_cstr_string\(\(const char\*\)\("20"\)\)/, 'y should retain number formatting at the console call');
  assert.doesNotMatch(cpp, /unsupported object destructuring/, 'supported static object destructuring must not use the fallback diagnostic');
});

test('static string method chains fold before C++ lowering', () => {
  const cpp = runCompilerCpp(
    'const raw = "  MaiaJS  ";\n'
    + 'console.log(raw.trim().toUpperCase(), raw.startsWith("  "), raw.endsWith("  "));\n'
  );

  assert.match(cpp, /__maia_console_to_cstr_string\(\(const char\*\)\("MAIAJS"\)\)/, 'static trim/toUpperCase chain should fold to its final string');
  assert.match(cpp, /__maia_console_to_cstr_number\(\(double\)\(\(double\)\(1\)\)\)/, 'static startsWith/endsWith calls should fold to boolean output values');
  assert.doesNotMatch(cpp, /__raw__trim\(\)/, 'folded string chain must not call a host trim function');
});

test('static array join folds scalar elements before C++ lowering', () => {
  const cpp = runCompilerCpp(
    'const values = [1, "two", true];\n'
    + 'console.log(values.join("|"));\n'
  );

  assert.match(cpp, /__console__log\("1\|two\|true"\);/, 'static array join should lower to its final C string literal');
});
