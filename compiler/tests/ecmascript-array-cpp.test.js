'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-array-cpp-'));
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

test('array literal lowering: emits runtime hook declaration and empty array construction', () => {
  const cpp = runCompilerCpp('let arr = [];\nconsole.log(arr);\n');

  assert.match(cpp, /extern void\* __maia_arr_literal0\(void\);/, 'C++ must declare empty array runtime hook');
  assert.match(cpp, /void\* arr = __maia_arr_literal0\(\);/, 'C++ must lower empty array literal to runtime helper');
  assert.match(cpp, /__console__log\(arr\);/, 'C++ must preserve array variable usage in host call');
});

test('array literal lowering: does not emit unsupported statement fallback for empty array declaration', () => {
  const cpp = runCompilerCpp('let arr = [];\n');

  assert.doesNotMatch(cpp, /\[expression not yet lowered\]/, 'array declaration should not trigger expression fallback comments');
  assert.doesNotMatch(cpp, /\[statement not yet lowered\]/, 'array declaration should not trigger statement fallback comments');
});

test('array literal lowering: lowers non-empty array with literal elements', () => {
  const cpp = runCompilerCpp('let arr = [1, 2];\n');

  assert.match(cpp, /extern void\* __maia_arr_literal2\(int v1, int v2\);/, 'C++ must declare arity-2 array runtime hook');
  assert.match(cpp, /void\* arr = __maia_arr_literal2\(\(int\)\(1\), \(int\)\(2\)\);/, 'C++ must lower non-empty array elements into helper call');
});

test('array literal lowering: lowers identifier element expressions', () => {
  const cpp = runCompilerCpp('let x = 7;\nlet arr = [x];\n');

  assert.match(cpp, /double x = 7;/, 'C++ must preserve declaration used by array literal');
  assert.match(cpp, /void\* arr = __maia_arr_literal1\(\(int\)\(x\)\);/, 'C++ must lower identifier element into array helper call');
});

test('array literal lowering: falls back for unsupported arity > 4', () => {
  const cpp = runCompilerCpp('let arr = [1, 2, 3, 4, 5];\n');

  assert.match(cpp, /extern void\* __maia_arr_builder_begin\(void\);/, 'C++ must declare array builder hooks for advanced array forms');
  assert.match(cpp, /void\* __maia_arr_builder_begin\(void\) \{/, 'C++ must provide local fallback definition for builder begin hook');
  assert.match(cpp, /void\* __maia_arr_builder_end\(void\* builder\) \{/, 'C++ must provide local fallback definition for builder end hook');
  assert.match(cpp, /void\* arr = __maia_arr_builder_end\(/, 'C++ must lower large arity array through builder path');
  assert.match(cpp, /__maia_arr_builder_push_value\(/, 'builder path must push array values');
});

test('array literal lowering: falls back for spread elements in array literal', () => {
  const cpp = runCompilerCpp('let x = [1];\nlet arr = [...x];\n');

  assert.match(cpp, /void\* arr = __maia_arr_builder_end\(/, 'C++ must lower spread array through builder path');
  assert.match(cpp, /__maia_arr_builder_spread\(/, 'builder path must include spread operation');
});

test('array literal lowering: falls back for elision forms in array literal', () => {
  const cpp = runCompilerCpp('let arr = [1,,2];\n');

  assert.match(cpp, /void\* arr = __maia_arr_builder_end\(/, 'C++ must lower elision array through builder path');
  assert.match(cpp, /__maia_arr_builder_push_hole\(/, 'builder path must include hole push operation for elision');
});
