'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-throw-'));
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

test('throw statement: throw string literal', () => {
  const cpp = runCompilerCpp(`
    function mayFail() {
      throw 'Error message';
    }
  `);

  assert.match(cpp, /throw/, 'Generated C++ should contain throw keyword');
  assert.doesNotMatch(cpp, /\/\/ \[statement not yet lowered\]/, 'Should not contain placeholder for throw');
});

test('throw statement: throw error object', () => {
  const cpp = runCompilerCpp(`
    function mayFail() {
      const err = 'My error';
      throw err;
    }
  `);

  assert.match(cpp, /throw/, 'Generated C++ should contain throw keyword');
  assert.doesNotMatch(cpp, /\/\/ \[statement not yet lowered\]/, 'Should not contain placeholder for throw');
});

test('throw statement: throw in try block', () => {
  const cpp = runCompilerCpp(`
    try {
      throw 'Test error';
    } catch (e) {
      console.log(e);
    }
  `);

  assert.match(cpp, /try/, 'Should have try block');
  assert.match(cpp, /catch/, 'Should have catch block');
  assert.match(cpp, /throw/, 'Should have throw statement');
  assert.doesNotMatch(cpp, /\/\/ \[statement not yet lowered\]/, 'Should not contain placeholder for throw in try block');
});

test('throw statement: throw expression result', () => {
  const cpp = runCompilerCpp(`
    function test(x) {
      if (x < 0) {
        throw x + 1;
      }
    }
  `);

  assert.match(cpp, /throw/, 'Should contain throw keyword');
  assert.doesNotMatch(cpp, /\/\/ \[statement not yet lowered\]/, 'Should not contain throw placeholder');
});
