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
  assert.match(cpp, /Point\(int x, int y\) \{/, 'C++ must emit constructor signature with parameters');
  assert.match(cpp, /\/\/ \[constructor body lowering not yet implemented\]/, 'constructor body must be explicit stub');
  assert.match(cpp, /int length\(int v\) \{/, 'C++ must emit class method signature');
  assert.match(cpp, /\/\/ \[class method body lowering not yet implemented\]/, 'class method body must be explicit stub');
  assert.match(cpp, /return 0;/, 'class method stub must return default int value');
});

test('class lowering: emits default constructor when none is declared', () => {
  const cpp = runCompilerCpp('class Empty { ping() {} }\n');

  assert.match(cpp, /struct Empty \{/, 'C++ must emit struct for class declaration');
  assert.match(cpp, /Empty\(void\) \{\}/, 'C++ must emit default constructor when source has no constructor');
  assert.match(cpp, /int ping\(void\) \{/, 'C++ must emit method stub with void params');
});

test('class lowering: records extends as explicit non-lowered note', () => {
  const cpp = runCompilerCpp('class Child extends Base { run() {} }\n');

  assert.match(cpp, /struct Child \{/, 'C++ must emit struct for derived class');
  assert.match(cpp, /extends Base \(inheritance semantics not yet lowered\)/, 'C++ must preserve extends intent as roadmap-safe note');
});

test('class lowering: top-level class declaration is not emitted as unsupported statement in main', () => {
  const cpp = runCompilerCpp('class A { constructor(){} }\n');

  assert.doesNotMatch(cpp, /\[statement not yet lowered\]/, 'class declaration must not leak into main statement fallback');
});
