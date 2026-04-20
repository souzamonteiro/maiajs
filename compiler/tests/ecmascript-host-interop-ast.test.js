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
