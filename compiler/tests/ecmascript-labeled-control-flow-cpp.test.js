'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-label-'));
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

test('labeled statements: label preserves identifier', () => {
  const cpp = runCompilerCpp(`
    myLabel:
    const x = 1;
  `);

  assert.match(cpp, /myLabel\s*:/, 'Should have label identifier in output');
});

test('labeled statements: multiple labels', () => {
  const cpp = runCompilerCpp(`
    label1:
    const x = 1;
    label2:
    const y = 2;
  `);

  assert.match(cpp, /label1\s*:/, 'Should have first label');
  assert.match(cpp, /label2\s*:/, 'Should have second label');
});

test('labeled statements: break works in switch', () => {
  const cpp = runCompilerCpp(`
    switch (x) {
      case 1:
        console.log('one');
        break;
      case 2:
        console.log('two');
        break;
    }
  `);

  assert.match(cpp, /break\s*;/, 'Should have break statements in switch');
  assert.doesNotMatch(cpp, /\/\/ \[.*not yet lowered\]/, 'Should not have placeholder comments');
});

test('labeled statements: while loop with break', () => {
  const cpp = runCompilerCpp(`
    while (true) {
      if (someCondition) break;
    }
  `);

  assert.match(cpp, /break\s*;/, 'Should have break statement in while loop');
  assert.doesNotMatch(cpp, /\/\/ \[.*not yet lowered\]/, 'Should not have placeholder comments');
});

test('labeled statements: break in nested blocks', () => {
  const cpp = runCompilerCpp(`
    switch (x) {
      case 1:
        {
          console.log('nested');
          break;
        }
    }
  `);

  assert.match(cpp, /break\s*;/, 'Should have break in nested block');
});
