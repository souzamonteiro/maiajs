'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const COMPILER = path.join(ROOT_DIR, 'compiler', 'ecmascript-compiler.js');
const WEBCPP_SH = path.join(ROOT_DIR, 'maiacpp', 'bin', 'webcpp.sh');

function compileAndRunWasm(sourceCode, appName = 'closure_test') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-closures-wasm-'));
  const inputJs = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'input.cpp');
  const distDir = path.join(tempDir, 'dist');

  fs.writeFileSync(inputJs, sourceCode, 'utf8');

  execFileSync(process.execPath, [COMPILER, '--file', inputJs, '--cpp-out', cppOut, '--strict-lowering'], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });

  execFileSync('bash', [WEBCPP_SH, cppOut, '--dist', '--out-dir', distDir, '--name', appName], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });

  const runnerJs = path.join(distDir, 'node-runner.js');
  const rawWasmOut = execFileSync(process.execPath, [runnerJs], {
    cwd: distDir,
    encoding: 'utf8'
  });
  const wasmOut = rawWasmOut
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('[node-runner] program returned:'))
    .join('\n')
    .trim();

  const nodeOut = execFileSync(process.execPath, [inputJs], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });

  return { wasmOut, nodeOut: nodeOut.trim(), cppOut };
}

test('WASM e2e: mutable closure factory maintains independent state', () => {
  const source = [
    'function makeCounter(start) {',
    '  let count = start;',
    '  return function(step) {',
    '    count = count + step;',
    '    return count;',
    '  };',
    '}',
    'const c1 = makeCounter(10);',
    'const c2 = makeCounter(100);',
    'console.log(c1(5));',
    'console.log(c1(3));',
    'console.log(c2(7));',
    'console.log(c1(2));'
  ].join('\n');

  const { wasmOut, nodeOut } = compileAndRunWasm(source, 'counter_wasm');
  assert.equal(wasmOut, nodeOut);
  assert.equal(wasmOut, '15\n18\n107\n20');
});

test('WASM e2e: curried closure, IIFE, and functionExpression callback', () => {
  const source = [
    'const makeAdder = (a) => (b) => a + b;',
    'console.log(makeAdder(5)(3));',
    'const iife1 = ((a, b) => a * b + 1)(4, 5);',
    'console.log(iife1);',
    'const iife2 = (function(n) { let s = n + 2; return s * 3; })(5);',
    'console.log(iife2);',
    'function applyTwice(fn, x) { return fn(fn(x)); }',
    'const inc = function(v) { return v + 10; };',
    'console.log(applyTwice(inc, 3));'
  ].join('\n');

  const { wasmOut, nodeOut } = compileAndRunWasm(source, 'curry_iife_wasm');
  assert.equal(wasmOut, nodeOut);
  assert.equal(wasmOut, '8\n21\n21\n23');
});

test('WASM e2e: nested functionDeclaration and dynamic Array HOFs with closures', () => {
  const source = [
    'function outer(base) {',
    '  let acc = base;',
    '  function addToAcc(x) {',
    '    acc += x;',
    '    return acc;',
    '  }',
    '  console.log(addToAcc(4));',
    '  console.log(addToAcc(6));',
    '}',
    'outer(10);',
    'const factor = 3;',
    'const nums = [1, 2, 3, 4, 5];',
    'const mapped = nums.map((x) => x * factor);',
    'const filtered = mapped.filter((x) => x > 6);',
    'const total = filtered.reduce((acc, x) => acc + x, 0);',
    'console.log(total);',
    'let sum = 0;',
    'nums.forEach((x) => { sum += x * 2; });',
    'console.log(sum);',
    'console.log(nums.find((x) => x > 3));',
    'console.log(nums.findIndex((x) => x === 4));',
    'console.log(nums.some((x) => x === 5) ? 1 : 0);',
    'console.log(nums.every((x) => x > 0) ? 1 : 0);'
  ].join('\n');

  const { wasmOut, nodeOut } = compileAndRunWasm(source, 'array_hof_wasm');
  assert.equal(wasmOut, nodeOut);
});
