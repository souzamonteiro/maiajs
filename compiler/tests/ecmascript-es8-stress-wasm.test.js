const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMPILER_PATH = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
const WEBCPP_SH = path.resolve(__dirname, '..', '..', 'maiacpp', 'bin', 'webcpp.sh');

function runJsVsWasm(source, name = 'es8_stress') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `maiajs-${name}-`));
  const jsFile = path.join(dir, `${name}.js`);
  const cppFile = path.join(dir, `${name}.cpp`);
  const distDir = path.join(dir, 'dist');
  fs.writeFileSync(jsFile, source, 'utf8');

  const nodeOut = execFileSync('node', [jsFile], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);

  execFileSync('node', [COMPILER_PATH, '--strict-lowering', '--file', jsFile, '--cpp-out', cppFile], {
    stdio: 'pipe'
  });
  execFileSync('bash', [WEBCPP_SH, cppFile, '--dist', '--out-dir', distDir, '--name', name], {
    stdio: 'pipe'
  });

  const runnerOut = execFileSync('node', [path.join(distDir, 'node-runner.js')], { encoding: 'utf8' });
  const wasmLines = runnerOut
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith('[node-runner]'));

  assert.match(runnerOut, /\[node-runner\] program returned: 0/);
  return { nodeOut, wasmLines };
}

test('WASM e2e ES8 stress: edge operators (-1 >>> 0, **, in), dynamic properties, try/finally, tagged template', () => {
  const src = `
    console.log(-1 >>> 0);
    console.log(5 >>> 1);
    console.log(2 ** 10);

    const obj = { a: 1, b: 2 };
    obj.c = 3;
    obj.d = 4;
    console.log(obj.c);
    console.log(obj.d);
    console.log('a' in obj ? 1 : 0);
    console.log('missing' in obj ? 1 : 0);

    function fmt(strings, x, y) {
      return x + y;
    }
    console.log(fmt\`sum:\${15}+\${27}\`);
  `;
  const { nodeOut, wasmLines } = runJsVsWasm(src, 'es8_ops');
  assert.deepStrictEqual(wasmLines, nodeOut);
});

test('WASM e2e ES8 stress: Set & Map dynamic capacity (>64 items), delete, has, and Map.forEach closure', () => {
  const src = `
    const s = new Set();
    let i = 0;
    while (i < 80) {
      s.add(i);
      s.add(i);
      i = i + 1;
    }
    console.log(s.size);
    console.log(s.has(0));
    console.log(s.has(79));
    console.log(s.has(80));
    s.delete(42);
    console.log(s.size);
    console.log(s.has(42));

    const m = new Map();
    let k = 0;
    while (k < 80) {
      m.set(k, k * 10);
      k = k + 1;
    }
    console.log(m.size);
    console.log(m.get(75));
    m.delete(75);
    console.log(m.size);
    console.log(m.has(75));

    const small = new Map();
    small.set('a', 10);
    small.set('b', 25);
    let total = 0;
    small.forEach(function(val, key) {
      total = total + val;
    });
    console.log(total);
  `;
  const { nodeOut, wasmLines } = runJsVsWasm(src, 'es8_coll');
  assert.deepStrictEqual(wasmLines, nodeOut);
});

test('WASM e2e ES8 stress: combined async/await, Promise.all, generator yield*, closure, Set/Map, and Atomics', () => {
  const src = `
    function* inner() {
      yield 10;
      yield 20;
    }
    function* outer() {
      yield* inner();
      yield 30;
    }
    let genSum = 0;
    for (const v of outer()) {
      genSum = genSum + v;
    }
    console.log(genSum);

    function makeAcc(start) {
      let n = start;
      return function(delta) {
        n = n + delta;
        return n;
      };
    }
    const acc = makeAcc(5);
    console.log(acc(3));
    console.log(acc(7));

    const sab = new SharedArrayBuffer(64);
    const view = new Int32Array(sab);
    Atomics.store(view, 0, 100);
    const oldVal = Atomics.add(view, 0, 23);
    console.log(oldVal);
    console.log(Atomics.load(view, 0));

    async function computeAsync() {
      const a = await Promise.resolve(11);
      const b = await Promise.resolve(31);
      return a + b;
    }
    computeAsync().then(function(res) {
      console.log(res);
    });
  `;
  const { nodeOut, wasmLines } = runJsVsWasm(src, 'es8_combo');
  assert.deepStrictEqual(wasmLines, nodeOut);
});
