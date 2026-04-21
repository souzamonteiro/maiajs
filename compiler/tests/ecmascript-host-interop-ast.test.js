'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runCompiler(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-host-interop-'));
  const inputFile = path.join(tempDir, 'input.js');
  const irOut = path.join(tempDir, 'out.ir.json');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const compilerPath = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
  const result = spawnSync(process.execPath, [compilerPath, '--file', inputFile, '--ir-json-out', irOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(irOut), 'Expected IR output file');

  return JSON.parse(fs.readFileSync(irOut, 'utf8'));
}

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-cpp-emit-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const compilerPath = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
  const result = spawnSync(process.execPath, [compilerPath, '--file', inputFile, '--cpp-out', cppOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(cppOut), 'Expected C++ output file');

  return fs.readFileSync(cppOut, 'utf8');
}

test('AST-first host interop maps member call to __object__method', () => {
  const ir = runCompiler('console.log("hi");\n');
  const calls = ir.hostInterop.detectedCalls;

  assert.ok(Array.isArray(calls), 'detectedCalls must be an array');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'console.log');
  assert.equal(calls[0].host, '__console__log');
});

test('AST-first host interop maps direct function call to __function', () => {
  const ir = runCompiler('setTimeout();\n');
  const calls = ir.hostInterop.detectedCalls;

  assert.ok(Array.isArray(calls), 'detectedCalls must be an array');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'setTimeout');
  assert.equal(calls[0].host, '__setTimeout');
});

test('C++ lowering emits actual host call statement for console.log string arg', () => {
  const cpp = runCompilerCpp('console.log("hello");\n');

  assert.match(cpp, /__console__log\("hello"\);/, 'C++ body must contain the lowered call');
  assert.match(cpp, /extern void __console__log\(const char\*\);/, 'C++ must declare the host function');
});

test('C++ lowering emits extern void with void params for zero-arg call', () => {
  const cpp = runCompilerCpp('setTimeout();\n');

  assert.match(cpp, /__setTimeout\(\);/, 'C++ body must contain the lowered zero-arg call');
  assert.match(cpp, /extern void __setTimeout\(void\);/, 'C++ must declare zero-arg host function with void');
});

test('C++ lowering emits multiple host calls in program order', () => {
  // Use a string call followed by a zero-arg call to avoid the multi-line string
  // tokenizer ambiguity (StringLiteral spans lines in the current lexer).
  const cpp = runCompilerCpp('console.log("hello");\nsetTimeout();\n');

  const posA = cpp.indexOf('__console__log("hello")');
  const posB = cpp.indexOf('__setTimeout()');
  assert.ok(posA >= 0, 'first call must appear in output');
  assert.ok(posB >= 0, 'second call must appear in output');
  assert.ok(posA < posB, 'calls must appear in program order');
});
