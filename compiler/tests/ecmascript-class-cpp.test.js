'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-class-cpp-'));
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

test('class lowering: emits constructor and method stubs', () => {
  const cpp = runCompilerCpp('class Point { constructor(x, y) { this.x = x; } length(v) { return v; } }\n');

  assert.match(cpp, /struct Point \{/, 'C++ must emit struct for class declaration');
  assert.match(cpp, /void Point_ctor_init\(Point\* self, int x, int y\) \{/, 'C++ must emit constructor init wrapper with typed parameters');
  assert.match(cpp, /self->x = x;/, 'constructor body must lower this-member assignment');
  assert.match(cpp, /int Point_meth_length\(Point\* self, int v\) \{/, 'C++ must emit class method wrapper signature');
  assert.match(cpp, /return \(int\)\(v\);/, 'class method body must lower return statement');
});

test('class lowering: emits default constructor when none is declared', () => {
  const cpp = runCompilerCpp('class Empty { ping() {} }\n');

  assert.match(cpp, /struct Empty \{/, 'C++ must emit struct for class declaration');
  assert.match(cpp, /void Empty_ctor_init\(Empty\* self\) \{/, 'C++ must emit default constructor init wrapper when source has no constructor');
  assert.match(cpp, /int Empty_meth_ping\(Empty\* self\) \{/, 'C++ must emit method stub wrapper with receiver param');
});

test('class lowering: records extends as explicit non-lowered note', () => {
  const cpp = runCompilerCpp('class Child extends Base { run() {} }\n');

  assert.match(cpp, /struct Child : public Base \{/, 'C++ must emit derived struct for extends');
  assert.match(cpp, /Base_ctor_init__pv\(\(Base\*\)self\);/, 'C++ must route default base initialization through the generated base init wrapper');
});

test('class lowering: top-level class declaration is not emitted as unsupported statement in main', () => {
  const cpp = runCompilerCpp('class A { constructor(){} }\n');

  assert.doesNotMatch(cpp, /\[statement not yet lowered\]/, 'class declaration must not leak into main statement fallback');
});
