'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const COMPILER = path.join(ROOT_DIR, 'compiler', 'ecmascript-compiler.js');
const WEBCPP_SH = path.join(ROOT_DIR, 'maiacpp', 'bin', 'webcpp.sh');

function compileAndRunWasm(sourceCode, appName = 'promise_test') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-promises-wasm-'));
  try {
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
    }).trim();

    return { wasmOut, nodeOut };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('WASM e2e: new Promise once-only settlement, then/catch/finally chaining', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    const p1 = new Promise((resolve, reject) => {
      resolve(10);
      resolve(99);
      reject(88);
    });
    p1
      .then((x) => x + 5)
      .then((y) => {
        console.log(y);
        return y * 2;
      })
      .finally(() => {
        console.log("finally1");
      })
      .then((z) => {
        console.log(z);
      });

    const p2 = new Promise((resolve, reject) => {
      reject(404);
      resolve(200);
    });
    p2
      .then((v) => v + 1)
      .catch((err) => {
        console.log(err);
        return 7;
      })
      .then((v) => console.log(v));
  `);
  assert.equal(wasmOut, nodeOut);
});

test('WASM e2e: Promise assimilation, Promise.all, and Promise.race', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    Promise.resolve(1)
      .then((v) => new Promise((resolve) => resolve(v + 41)))
      .then((v) => console.log(v));

    const a = Promise.resolve(10);
    const b = new Promise((resolve) => resolve(20));
    const c = Promise.resolve(30);
    Promise.all([a, b, c]).then((res) => {
      console.log(res[0] + res[1] + res[2]);
    });

    const slow = new Promise((resolve) => {
      setTimeout(() => resolve(100), 20);
    });
    const fast = new Promise((resolve) => {
      setTimeout(() => resolve(55), 5);
    });
    Promise.race([slow, fast]).then((winner) => {
      console.log(winner);
    });
  `);
  assert.equal(wasmOut, nodeOut);
});

test('WASM e2e: FIFO microtask queue vs setTimeout timer ordering', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    console.log("sync1");
    setTimeout(() => {
      console.log("timer1");
      Promise.resolve(1).then(() => console.log("micro_in_timer"));
    }, 10);
    setTimeout(() => {
      console.log("timer2");
    }, 0);
    Promise.resolve(1).then(() => {
      console.log("micro1");
      Promise.resolve(2).then(() => console.log("micro2"));
    });
    Promise.resolve(3).then(() => console.log("micro3"));
    console.log("sync2");
  `);
  assert.equal(wasmOut, nodeOut);
});

test('WASM e2e: async/await with real Promises and try/catch', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    function delayedAdd(x, ms) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(x + 1), ms);
      });
    }

    async function compute(start) {
      const a = await delayedAdd(start, 5);
      const b = await Promise.resolve(a * 2);
      return a + b;
    }

    async function withErrorHandling() {
      let recovered = 0;
      try {
        await Promise.reject(123);
      } catch (e) {
        recovered = e + 1;
      }
      return recovered;
    }

    compute(10).then((res) => console.log(res));
    withErrorHandling().then((res) => console.log(res));
  `);
  assert.equal(wasmOut, nodeOut);
});
