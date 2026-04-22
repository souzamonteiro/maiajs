const { spawnSync } = require('child_process');
const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

function runCompiler(sourceCode, flag = '--cpp-out') {
  const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-sample-'));
  const inputFile = path.join(tempDir, 'input.js');
  const outFile = path.join(tempDir, flag === '--ir-json-out' ? 'out.ir.json' : 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const result = spawnSync(process.execPath, [COMPILER, '--file', inputFile, flag, outFile], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf-8'
  });

  if (result.status !== 0) {
    console.error('Compiler stderr:', result.stderr);
    console.error('Compiler stdout:', result.stdout);
  }

  assert.equal(result.status, 0, 'Compiler must succeed');
  assert.ok(fs.existsSync(outFile), `Output file must exist: ${outFile}`);

  const content = fs.readFileSync(outFile, 'utf-8');
  if (flag === '--ir-json-out') {
    return JSON.parse(content);
  }
  return content;
}

const { test } = require('node:test');

test('async/await sample: simple async function with single await', () => {
  const sample = `
    async function fetchUser(id) {
      const resp = await fetch(id);
      return resp;
    }
  `;

  const cpp = runCompiler(sample);

  // Verify struct generation
  assert.ok(cpp.includes('struct __async_fetchUser'), 'must generate state machine struct');
  assert.ok(cpp.includes('int __state'), 'must include state field');
  assert.ok(cpp.includes('__async_fetchUser__resume'), 'must generate resume function');

  // Verify await checkpoint
  assert.ok(cpp.includes('case 1:'), 'must generate suspend point for await');
  assert.ok(cpp.includes('case 0: /* initial state */'), 'must generate initial state');

  console.log('✓ Simple async/await compiles to state machine');
});

test('async/await sample: async with try/catch handler', () => {
  const sample = `
    async function tryFetch() {
      try {
        const data = await fetch();
        return data;
      } catch (err) {
        return null;
      }
    }
  `;

  const cpp = runCompiler(sample);

  // Verify exception handling infrastructure
  assert.ok(cpp.includes('__exc_active()'), 'must check for active exceptions');
  assert.ok(cpp.includes('__exc_matches(__exc_type(), 1)'), 'must emit type matching for catch');
  assert.ok(cpp.includes('catch handler for err'), 'must annotate catch parameter');
  assert.ok(cpp.includes('exception frame depth: 1'), 'must track try/catch depth');

  console.log('✓ Async/await with try/catch generates exception routing');
});

test('async/await sample: nested try/catch handlers', () => {
  const sample = `
    async function nestedTry() {
      try {
        try {
          const x = await fetch();
        } catch (inner) {
          return 1;
        }
      } catch (outer) {
        return 2;
      }
    }
  `;

  const cpp = runCompiler(sample);

  // Verify nested exception handling
  assert.ok(cpp.includes('exception frame depth: 2'), 'must track nested try depth');
  assert.ok(cpp.includes('__exc_matches(__exc_type(), 1)'), 'must emit type routing for nested handler');

  console.log('✓ Nested try/catch generates multi-level exception routing');
});

test('async/await sample: IR output includes catch handler info', () => {
  const sample = `
    async function tracked() {
      try {
        await fetch();
      } catch (e) {
      }
    }
  `;

  const ir = runCompiler(sample, '--ir-json-out');

  // Verify IR structure
  assert.ok(ir.asyncIR, 'must include asyncIR in IR root');
  assert.ok(ir.asyncIR.asyncFunctions, 'must include asyncFunctions in asyncIR');
  const machine = ir.asyncIR.asyncFunctions[0];
  assert.ok(machine, 'must have at least one async machine');
  assert.ok(machine.body, 'machine must have body array');
  
  const suspendPoint = machine.body[0];
  assert.ok(suspendPoint.catchHandlers, 'must include catchHandlers array in suspend point');
  assert.equal(suspendPoint.catchHandlers.length, 1, 'must have one catch handler');
  assert.equal(suspendPoint.catchHandlers[0].paramName, 'e', 'must record catch parameter name');

  console.log('✓ IR includes catch handler annotation for runtime');
});
