'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-try-'));
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

test('try/catch/finally: basic try-catch structure', () => {
  const cpp = runCompilerCpp(`
    try {
      const x = 42;
    } catch (e) {
      console.log(e);
    }
  `);

  assert.match(cpp, /try\s*\{/, 'Should have try block');
  assert.match(cpp, /catch\s*\(\s*const char\*/, 'Should have catch with const char* parameter');
  assert.doesNotMatch(cpp, /\/\/ \[.*not yet lowered\]/, 'Should not have placeholder comments');
});

test('try/catch/finally: try-catch-finally all three parts', () => {
  const cpp = runCompilerCpp(`
    try {
      throw 'error';
    } catch (e) {
      console.log('caught');
    } finally {
      console.log('finally');
    }
  `);

  assert.match(cpp, /try\s*\{/, 'Should have try block');
  assert.match(cpp, /catch\s*\(\s*const char\*/, 'Should have catch block');
  assert.match(cpp, /__console__log\(\s*"finally"\s*\)/, 'Should have finally statements');
  assert.doesNotMatch(cpp, /\[finally.*lowered\]/, 'Should not have finally placeholder');
});

test('try/catch/finally: try-finally without catch', () => {
  const cpp = runCompilerCpp(`
    try {
      console.log('try');
    } finally {
      console.log('finally');
    }
  `);

  assert.match(cpp, /try\s*\{/, 'Should have try block');
  assert.match(cpp, /__console__log\(\s*"finally"\s*\)/, 'Should have finally statements');
});

test('try/catch/finally: nested try blocks', () => {
  const cpp = runCompilerCpp(`
    try {
      try {
        throw 'inner';
      } catch (e) {
        console.log(e);
      }
    } catch (e) {
      console.log('outer');
    }
  `);

  assert.match(cpp, /try\s*\{/, 'Should have outer try block');
  assert.match(cpp, /catch\s*\(\s*const char\*/, 'Should have outer catch block');
  assert.doesNotMatch(cpp, /\/\/ \[.*not yet lowered\]/, 'Should not have placeholder comments');
});

test('try/catch/finally: multiple statements in finally', () => {
  const cpp = runCompilerCpp(`
    try {
      console.log('try');
    } finally {
      console.log('finally1');
      console.log('finally2');
    }
  `);

  assert.match(cpp, /__console__log\(\s*"finally1"\s*\)/, 'Should have first finally statement');
  assert.match(cpp, /__console__log\(\s*"finally2"\s*\)/, 'Should have second finally statement');
});
