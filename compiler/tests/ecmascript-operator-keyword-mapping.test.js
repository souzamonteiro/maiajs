'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-op-map-'));
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

test('C++ lowering maps strict equality operators to C++-compatible forms', () => {
  const cpp = runCompilerCpp('let a = 1;\nlet eq = a === undefined;\nlet ne = a !== undefined;\n');

  assert.match(cpp, /a == nullptr/, 'C++ must map strict equality to == and undefined to nullptr');
  assert.match(cpp, /a != nullptr/, 'C++ must map strict inequality to != and undefined to nullptr');
  assert.doesNotMatch(cpp, /===|!==/, 'C++ must not contain JS strict operators');
  assert.doesNotMatch(cpp, /\bundefined\b/, 'C++ must not contain raw undefined identifier');
});

test('C++ lowering maps undefined initializer to nullptr', () => {
  const cpp = runCompilerCpp('let value = undefined;\n');

  assert.match(cpp, /void\* value = nullptr;/, 'undefined initializer must lower to nullptr');
  assert.doesNotMatch(cpp, /\bundefined\b/, 'raw undefined identifier must be removed from C++ output');
});
