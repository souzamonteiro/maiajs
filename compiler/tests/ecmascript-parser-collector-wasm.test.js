const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMPILER_PATH = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
const PTC_PATH = path.resolve(__dirname, '..', 'parse-tree-collector.js');
const REGEX_RUNTIME_C = path.resolve(__dirname, '..', 'ecmascript', 'regex_runtime.c');
const WEBCPP_SH = path.resolve(__dirname, '..', '..', 'maiacpp', 'bin', 'webcpp.sh');
const WEBC_SH = path.resolve(__dirname, '..', '..', 'maiac', 'bin', 'webc.sh');
const LINKER_PATH = path.resolve(__dirname, '..', '..', 'maiawasm', 'assembler', 'wasm-linker.js');

test('WASM e2e: parse-tree-collector.js + regex_runtime.c compile and link statically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-ptc-regex-'));
  const regexStem = path.join(dir, 'regex_runtime');
  const regexWasm = `${regexStem}.wasm`;
  const ptcCpp = path.join(dir, 'ptc.cpp');
  const ptcWasm = path.join(dir, 'ptc.wasm');
  const linkedWasm = path.join(dir, 'ptc_linked.wasm');

  execFileSync('bash', [WEBC_SH, REGEX_RUNTIME_C, '-o', regexStem], { stdio: 'pipe' });
  assert.ok(fs.existsSync(regexWasm), 'regex_runtime.wasm should be generated');

  execFileSync('node', [COMPILER_PATH, '--library', '--strict-lowering', '--file', PTC_PATH, '--cpp-out', ptcCpp], { stdio: 'pipe' });
  execFileSync('bash', [WEBCPP_SH, ptcCpp, '--wasm-out', ptcWasm], { stdio: 'pipe' });
  assert.ok(fs.existsSync(ptcWasm), 'ptc.wasm should be generated');

  execFileSync('node', [LINKER_PATH, '--static', ptcWasm, regexWasm, '-w', linkedWasm], { stdio: 'pipe' });
  assert.ok(fs.existsSync(linkedWasm), 'linked WASM should be generated');

  const compiled = await WebAssembly.compile(fs.readFileSync(linkedWasm));
  const importNames = new Set(WebAssembly.Module.imports(compiled).map((imp) => imp.name));
  const exportNames = new Set(WebAssembly.Module.exports(compiled).map((exp) => exp.name));

  for (const sym of ['__maiaregex__new', '__maiaregex__test', '__maiaregex__replace', '__maiaregex__match', '__maia_array_join']) {
    assert.ok(!importNames.has(sym), `import ${sym} should be resolved statically`);
  }
  assert.ok(exportNames.has('xmlEscape'), 'xmlEscape should be exported');
  assert.ok(exportNames.has('getNodeLabel'), 'getNodeLabel should be exported');
});
