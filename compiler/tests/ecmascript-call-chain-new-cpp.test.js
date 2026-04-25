'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-call-chain-'));
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

test('call-chain lowering: JS-runtime .then() chain is truncated (not emitted as C++)', () => {
  const cpp = runCompilerCpp('Promise.resolve(5).then(x => x).then(y => y);\n');

  assert.match(cpp, /__Promise__resolve\(5\);/, 'base host call must still be emitted after chain truncation');
  assert.doesNotMatch(cpp, /\.then\(/, 'JS-only .then() chain must not appear in C++ output');
});

test('new-expression lowering: lowers constructor call to __new__ helper symbol', () => {
  const cpp = runCompilerCpp('new Animal("Rex");\n');

  assert.match(cpp, /__new__Animal\("Rex"\);/, 'C++ must lower constructor expression to __new__ helper style call');
});
