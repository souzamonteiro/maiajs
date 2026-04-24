'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-object-cpp-'));
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

test('object literal lowering: emits runtime hook declarations and empty object construction', () => {
  const cpp = runCompilerCpp('let o = {};\nconsole.log(o);\n');

  assert.match(cpp, /extern void\* __maia_obj_literal0\(void\);/, 'C++ must declare empty object literal runtime hook');
  assert.match(cpp, /void\* __maia_obj_literal0\(void\) \{/, 'C++ must provide local fallback definition for empty object hook');
  assert.match(cpp, /void\* o = __maia_obj_literal0\(\);/, 'C++ must lower empty object literal construction');
  assert.match(cpp, /__console__log\(o\);/, 'C++ must preserve object variable usage in host call');
});

test('object literal lowering: lowers simple properties to arity-based runtime helper', () => {
  const cpp = runCompilerCpp('let o = { a: 1, b: 2 };\n');

  assert.match(cpp, /extern void\* __maia_obj_literal2\(const char\* k1, int v1, const char\* k2, int v2\);/, 'C++ must declare arity-2 object hook');
  assert.match(cpp, /void\* o = __maia_obj_literal2\("a", \(int\)\(1\), "b", \(int\)\(2\)\);/, 'C++ must lower object properties to key/value helper call');
});

test('object literal lowering: lowers identifier values in property initializers', () => {
  const cpp = runCompilerCpp('let x = 7;\nlet o = { a: x };\n');

  assert.match(cpp, /double x = 7;/, 'C++ must lower dependency declaration');
  assert.match(cpp, /void\* o = __maia_obj_literal1\("a", \(int\)\(x\)\);/, 'C++ must lower identifier property value through helper call');
});

test('object literal lowering: uses builder for arity > 4', () => {
  const cpp = runCompilerCpp('let o = { a: 1, b: 2, c: 3, d: 4, e: 5 };\n');

  assert.match(cpp, /__maia_obj_builder_begin\(\)/, 'C++ must use builder pattern for object literal arity > 4');
  assert.match(cpp, /__maia_obj_builder_set_key\(/, 'C++ must chain set_key calls for each property');
  assert.match(cpp, /__maia_obj_builder_end\(/, 'C++ must close with builder end');
});
