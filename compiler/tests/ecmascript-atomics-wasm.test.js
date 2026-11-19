'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPILER_PATH = path.join(ROOT, 'compiler', 'ecmascript-compiler.js');
const WEBCPP_PATH = path.join(ROOT, 'maiacpp', 'bin', 'webcpp.sh');

function compileAndRunWasm(jsSource) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-atomics-wasm-'));
  const jsPath = path.join(workDir, 'input.js');
  const cppPath = path.join(workDir, 'input.cpp');
  const distDir = path.join(workDir, 'dist');
  fs.writeFileSync(jsPath, jsSource, 'utf8');

  try {
    execFileSync('node', [COMPILER_PATH, '--file', jsPath, '--cpp-out', cppPath, '--strict-lowering'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    execFileSync('bash', [WEBCPP_PATH, cppPath, '--dist', '--out-dir', distDir, '--name', 'atomics_test'], {
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

test('WASM e2e: SharedArrayBuffer, Int32Array, and Atomics add/sub/compareExchange/store/load', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    if (typeof SharedArrayBuffer !== 'undefined') {
      const sab = new SharedArrayBuffer(1024);
      console.log(\`SharedArrayBuffer created: size = \${sab.byteLength} bytes\`);
      const intArray = new Int32Array(sab);
      intArray[0] = 42;
      console.log(\`Initial value at index 0: \${intArray[0]}\`);
      console.log(\`Atomics.add(0, 10): old value = \${Atomics.add(intArray, 0, 10)}\`);
      console.log(\`After Atomics.add: value = \${intArray[0]}\`);
      console.log(\`Atomics.sub(0, 5): old value = \${Atomics.sub(intArray, 0, 5)}\`);
      console.log(\`After Atomics.sub: value = \${intArray[0]}\`);
      console.log(\`Atomics.compareExchange(0, 47, 100): old = \${Atomics.compareExchange(intArray, 0, 47, 100)}\`);
      console.log(\`After compareExchange: \${intArray[0]}\`);
      console.log(\`Atomics.compareExchange(0, 47, 200): old = \${Atomics.compareExchange(intArray, 0, 47, 200)}\`);
      console.log(\`After compareExchange: \${intArray[0]}\`);
      Atomics.store(intArray, 1, 999);
      console.log(\`Atomics.load(1): \${Atomics.load(intArray, 1)}\`);
    }
  `);
  assert.strictEqual(wasmOut, nodeOut);
});

test('WASM e2e: Atomics bitwise/exchange/isLockFree/wait/notify and multi-view TypedArray aliasing', () => {
  const { wasmOut, nodeOut } = compileAndRunWasm(`
    const sab = new SharedArrayBuffer(16);
    const i32 = new Int32Array(sab);
    const u8 = new Uint8Array(sab);
    Atomics.store(i32, 0, 12);
    console.log(Atomics.or(i32, 0, 3));
    console.log(Atomics.load(i32, 0));
    console.log(Atomics.and(i32, 0, 10));
    console.log(Atomics.load(i32, 0));
    console.log(Atomics.xor(i32, 0, 6));
    console.log(Atomics.load(i32, 0));
    console.log(Atomics.exchange(i32, 0, 258));
    console.log(u8[0]);
    console.log(u8[1]);
    console.log(Atomics.isLockFree(4) ? 1 : 0);
    console.log(Atomics.wait(i32, 0, 999, 0));
    console.log(Atomics.wait(i32, 0, 258, 0));
    console.log(Atomics.notify(i32, 0, 1));
  `);
  assert.strictEqual(wasmOut, nodeOut);
});

test('Node worker_threads + shared WebAssembly.Memory & Atomics wait/notify synchronization', async () => {
  const sharedMem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  assert.ok(sharedMem.buffer instanceof SharedArrayBuffer);
  const view = new Int32Array(sharedMem.buffer);
  Atomics.store(view, 0, 0);
  Atomics.store(view, 1, 0);

  const workerCode = `
    const { parentPort, workerData } = require('node:worker_threads');
    const view = new Int32Array(workerData.sharedMem.buffer);
    Atomics.wait(view, 0, 0);
    for (let i = 0; i < 100; i += 1) {
      Atomics.add(view, 1, 1);
    }
    parentPort.postMessage(Atomics.load(view, 1));
  `;

  const worker = new Worker(workerCode, { eval: true, workerData: { sharedMem } });
  await new Promise((resolve) => setTimeout(resolve, 25));
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0, 1);

  const workerResult = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  await worker.terminate();

  assert.strictEqual(workerResult, 100);
  assert.strictEqual(Atomics.load(view, 1), 100);
});
