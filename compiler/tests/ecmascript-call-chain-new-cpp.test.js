'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-call-chain-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const args = [COMPILER, '--file', inputFile, '--cpp-out', cppOut];
  if (options.strictLowering) {
    args.push('--strict-lowering');
  }
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(cppOut), 'Expected C++ output file');

  return fs.readFileSync(cppOut, 'utf8');
}

test('call-chain lowering: static Promise.then() chains lower to concrete C++ output', () => {
  const cpp = runCompilerCpp('Promise.resolve(5).then(x => x).then(y => y);\n');

  assert.doesNotMatch(cpp, /__Promise__resolve\(5\);/, 'static promise chains should fold instead of keeping the host resolve call');
  assert.doesNotMatch(cpp, /\.then\(/, 'JS-only .then() chain must not appear in C++ output');
  assert.match(cpp, /5;/, 'folded result should be emitted directly');
});

test('new-expression lowering: lowers constructor call to __new__ helper symbol', () => {
  const cpp = runCompilerCpp('new Animal("Rex");\n');

  assert.match(cpp, /__new__Animal\("Rex"\);/, 'C++ must lower constructor expression to __new__ helper style call');
});

test('constructor function expressions: reject bare calls instead of emitting undefined C++ symbols', () => {
  const source = [
    'const Animal = function(value) { this.value = value; };',
    'const animal = new Animal(2);',
    'Animal(3);'
  ].join('\n');
  const cpp = runCompilerCpp(source);

  assert.match(cpp, /\n  0;\n/, 'non-strict lowering must leave a C++-valid placeholder for the unsupported bare constructor call');
  assert.doesNotMatch(cpp, /\bAnimal\(3\);/, 'non-strict lowering must not emit an undefined bare constructor symbol');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-call-chain-strict-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');
  fs.writeFileSync(inputFile, source, 'utf8');
  const result = spawnSync(process.execPath, [COMPILER, '--file', inputFile, '--cpp-out', cppOut, '--strict-lowering'], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0, 'strict lowering must reject a bare constructor-style call');
  assert.match(
    result.stderr || result.stdout,
    /constructor-call-without-new/,
    'strict lowering must report the constructor call diagnostic'
  );
});
