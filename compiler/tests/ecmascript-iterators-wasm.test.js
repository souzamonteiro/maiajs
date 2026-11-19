'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPILER_PATH = path.join(ROOT, 'compiler', 'ecmascript-compiler.js');
const WEBCPP_PATH = path.join(ROOT, 'maiacpp', 'bin', 'webcpp.sh');

function compileAndRunWasm(jsSource) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-iterators-wasm-'));
  const jsPath = path.join(workDir, 'input.js');
  const cppPath = path.join(workDir, 'input.cpp');
  const distDir = path.join(workDir, 'dist');
  fs.writeFileSync(jsPath, jsSource, 'utf8');

  try {
    execFileSync('node', [COMPILER_PATH, '--file', jsPath, '--cpp-out', cppPath, '--strict-lowering'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    execFileSync('bash', [WEBCPP_PATH, cppPath, '--dist', '--out-dir', distDir, '--name', 'iter_test'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    const rawWasmOut = execFileSync('node', [path.join(distDir, 'node-runner.js')], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    const wasmOut = rawWasmOut.replace(/\n*\[node-runner\] program returned:.*$/s, '').trim();
    const nodeOut = execFileSync('node', [jsPath], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
    return { wasmOut, nodeOut };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

test('WASM e2e: generator function* yield, return, and next().value / next().done', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    function* generatorFunction() {
      yield 'First value';
      yield 'Second value';
      return 'Done';
    }
    const gen = generatorFunction();
    const r1 = gen.next();
    console.log(r1.value);
    console.log(r1.done ? 1 : 0);
    console.log(gen.next().value);
    const r3 = gen.next();
    console.log(r3.value);
    console.log(r3.done ? 1 : 0);
  `);
  assert.equal(wasmOut, nodeOut);
});

test('WASM e2e: generator yield* delegation, next(val), and for...of over generator & array', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    function* inner(start) {
      yield start;
      yield start + 1;
    }
    function* outer() {
      yield* inner(10);
      yield 20;
    }
    for (const v of outer()) {
      console.log(v);
    }
    const arr = [7, 8, 9];
    let sum = 0;
    for (const n of arr) {
      sum = sum + n;
    }
    console.log(sum);
  `);
  assert.equal(wasmOut, nodeOut);
});

test('WASM e2e: custom [Symbol.iterator] object with this and mutable closure state in for...of', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    const range = {
      from: 1,
      to: 5,
      [Symbol.iterator]: function() {
        let current = this.from;
        const end = this.to;
        return {
          next: function() {
            if (current <= end) {
              return { value: current++, done: false };
            }
            return { done: true };
          }
        };
      }
    };
    for (const num of range) {
      console.log(num);
    }
  `);
  assert.equal(wasmOut, nodeOut);
});
