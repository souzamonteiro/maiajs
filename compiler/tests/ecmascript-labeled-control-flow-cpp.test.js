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

test('labeled statements: break exits the labelled statement', () => {
  const cpp = runCompilerCpp(`
    outer: {
      break outer;
    }
  `);

  assert.match(cpp, /goto __maia_break_outer_\d+;/, 'Should lower break label to its unique exit target');
  assert.match(cpp, /__maia_break_outer_\d+:\s*;/, 'Should emit the exit target after the labelled statement');
  assert.doesNotMatch(cpp, /break-label-unsupported/, 'Should not report a supported labelled break');
});

test('labeled statements: nested labels retain distinct break targets', () => {
  const cpp = runCompilerCpp(`
    outer: {
      inner: {
        break outer;
      }
    }
  `);

  assert.match(cpp, /goto __maia_break_outer_\d+;/, 'Should resolve the enclosing label rather than the nearest block');
  assert.match(cpp, /__maia_break_inner_\d+:\s*;/, 'Should retain an independent inner target');
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

test('labeled statements: continue targets the labelled outer loop', () => {
  const cpp = runCompilerCpp(`
    outer: while (true) {
      while (true) {
        continue outer;
      }
    }
  `);

  assert.match(cpp, /goto __maia_continue_outer_\d+;/, 'Should lower labelled continue to the outer loop continuation target');
  assert.match(cpp, /__maia_continue_outer_\d+:\s*;/, 'Should emit the continuation target inside the outer loop');
  assert.equal((cpp.match(/__maia_continue_outer_\d+:\s*;/g) || []).length, 1, 'Should not duplicate the outer continuation target in nested loops');
  assert.doesNotMatch(cpp, /continue-label-unsupported/, 'Should not report a supported labelled continue');
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
