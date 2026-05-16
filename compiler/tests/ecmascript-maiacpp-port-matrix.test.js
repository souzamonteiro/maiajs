'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-port-matrix-'));
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

test('MaiaCpp port matrix: control flow bundle lowers to native C++ blocks', () => {
  const cpp = runCompilerCpp(
    'function control(x) {\n'
    + '  if (x) { while (x) { break; } } else { do { x = 0; } while (x); }\n'
    + '  for (var i = 0; i < 3; i++) { console.log(i); }\n'
    + '  switch (x) { case 0: console.log("zero"); break; default: console.log("other"); }\n'
    + '}\n'
  );

  assert.match(cpp, /if \(x\) \{/, 'if statement must lower to native C++');
  assert.match(cpp, /while \(x\) \{/, 'while loop must lower to native C++');
  assert.match(cpp, /do \{/, 'do-while loop must lower to native C++');
  assert.match(cpp, /for \(var i = 0; i < 3; i\+\+\) \{/, 'for loop must lower to native C++');
  assert.match(cpp, /switch \(x\) \{/, 'switch statement must lower to native C++');
  assert.match(cpp, /break;/, 'break statement must remain present');
  assert.match(cpp, /__console__log\(i\);/, 'host call must remain prefixed inside loop');
  assert.match(cpp, /__console__log\("zero"\);/, 'host call must remain prefixed inside switch');
  assert.match(cpp, /__console__log\("other"\);/, 'host call must remain prefixed inside switch default');
});

test('MaiaCpp port matrix: local function routing stays local', () => {
  const cpp = runCompilerCpp(
    'function add(a, b) { return a + b; }\n'
    + 'function wrap(v) { return add(v, 2); }\n'
    + 'wrap(1);\n'
  );

  assert.match(cpp, /int add\(int a, int b\)/, 'local function must emit a definition');
  assert.match(cpp, /int wrap\(int v\)/, 'wrapper function must emit a definition');
  assert.match(cpp, /return \(int\)\(add\(v, 2\)\);/, 'local function call must remain direct inside the wrapper body');
  assert.doesNotMatch(cpp, /__add\(/, 'local function call must not be treated as host interop');
});

test('MaiaCpp port matrix: host interop keeps runtime calls prefixed', () => {
  const cpp = runCompilerCpp('console.log("hello");\nsetTimeout();\n');

  assert.match(cpp, /extern void __console__log\(const char\*\);/, 'console.log must declare a host extern');
  assert.match(cpp, /extern void __setTimeout\(void\);/, 'setTimeout must declare a host extern');
  assert.match(cpp, /__console__log\("hello"\);/, 'console.log call must remain prefixed');
  assert.match(cpp, /__setTimeout\(\);/, 'setTimeout call must remain prefixed');
});

test('MaiaCpp port matrix: classes, arrays, objects, and new expressions stay coherent', () => {
  const cpp = runCompilerCpp(
    'class Point { constructor(x, y) { this.x = x; this.y = y; } length(v) { return v; } }\n'
    + 'let arr = [1, 2];\n'
    + 'let obj = { a: 1, b: 2 };\n'
    + 'new Point(1, 2);\n'
    + 'console.log(arr);\n'
    + 'console.log(obj);\n'
  );

  assert.match(cpp, /struct Point \{/, 'class declaration must emit a struct');
  assert.match(cpp, /Point\(int x, int y\) \{/, 'constructor must emit typed parameters');
  assert.match(cpp, /__maia_arr_literal2\(\(int\)\(1\), \(int\)\(2\)\);/, 'array literal must emit the arity-based helper');
  assert.match(cpp, /__maia_obj_literal2\("a", \(int\)\(1\), "b", \(int\)\(2\)\);/, 'object literal must emit the arity-based helper');
  assert.match(cpp, /__new__Point\(1, 2\);/, 'new expression must use the constructor helper');
  assert.match(cpp, /__console__log\(arr\);/, 'array variable must remain routable through host calls');
  assert.match(cpp, /__console__log\(obj\);/, 'object variable must remain routable through host calls');
});