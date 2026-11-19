const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMPILER_PATH = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
const WEBCPP_SH = path.resolve(__dirname, '..', '..', 'maiacpp', 'bin', 'webcpp.sh');
const LINKER_PATH = path.resolve(__dirname, '..', '..', 'maiawasm', 'assembler', 'wasm-linker.js');

test('WASM e2e: --library + wasm-linker.js --static links JS modules and runs cross-module calls', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-lib-link-'));
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const libJs = path.join(dir, 'math_lib.js');
  const appJs = path.join(dir, 'app_main.js');
  fs.writeFileSync(libJs, [
    'function add_nums(a, b) {',
    '  return a + b;',
    '}',
    'function mul_nums(a, b) {',
    '  return a * b;',
    '}'
  ].join('\n'), 'utf8');

  fs.writeFileSync(appJs, [
    'const s = math_lib.add_nums(19, 23);',
    'const p = math_lib.mul_nums(6, 7);',
    'console.log(s);',
    'console.log(p);'
  ].join('\n'), 'utf8');

  const libCpp = path.join(outDir, 'math_lib.cpp');
  const appCpp = path.join(outDir, 'app_main.cpp');
  const libWasm = path.join(outDir, 'math_lib.wasm');
  const appWasm = path.join(outDir, 'app_main.wasm');
  const linkedWasm = path.join(outDir, 'linked.wasm');

  execFileSync('node', [COMPILER_PATH, '--library', '--strict-lowering', '--file', libJs, '--cpp-out', libCpp], { stdio: 'pipe' });
  execFileSync('node', [COMPILER_PATH, '--strict-lowering', '--file', appJs, '--cpp-out', appCpp], { stdio: 'pipe' });

  const libCppText = fs.readFileSync(libCpp, 'utf8');
  assert.match(libCppText, /extern "C" int add_nums\(/);
  assert.doesNotMatch(libCppText, /\bint main\s*\(/);

  execFileSync('bash', [WEBCPP_SH, libCpp, '--wasm-out', libWasm], { stdio: 'pipe' });
  execFileSync('bash', [WEBCPP_SH, appCpp, '--wasm-out', appWasm], { stdio: 'pipe' });
  execFileSync('node', [LINKER_PATH, appWasm, libWasm, '--static', '-w', linkedWasm], { stdio: 'pipe' });

  const logged = [];
  const env = new Proxy({}, {
    get: (_, k) => (k === '__console__log' ? (val) => logged.push(val) : () => 0)
  });
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(linkedWasm), { env });
  instance.exports.main();

  assert.deepStrictEqual(logged, [42, 42]);
});
