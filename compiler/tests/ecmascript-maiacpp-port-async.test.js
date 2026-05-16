'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-port-async-'));
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

test('MaiaCpp port async: async and try/catch/finally emit state machine and exception routing', () => {
  const cpp = runCompilerCpp(
    'async function run(value) {\n'
    + '  try {\n'
    + '    await fetch(value);\n'
    + '    return value;\n'
    + '  } catch (err) {\n'
    + '    console.log(err);\n'
    + '  } finally {\n'
    + '    console.log("done");\n'
    + '  }\n'
    + '}\n'
  );

  assert.match(cpp, /struct __async_run \{/, 'async function must emit a state machine struct');
  assert.match(cpp, /case 1: \/\* await checkpoint 1: __fetch\(value\) \*\//, 'await must emit a suspend checkpoint');
  assert.match(cpp, /if \(__exc_active\(\)\)/, 'await inside try must emit exception checks');
  assert.match(cpp, /__exc_matches\(__exc_type\(\), 1\)/, 'catch block must emit exception type matching');
  assert.match(cpp, /catch handler for err/, 'catch handler annotation must include the parameter name');
  assert.match(cpp, /finally handler transition/, 'finally block must emit transition annotation');
  assert.match(cpp, /__async_schedule\(\(void\*\)__sm, 1\);/, 'await checkpoint must schedule the continuation');
});

test('MaiaCpp port async: schedule IDs remain non-overlapping across async machines', () => {
  const cpp = runCompilerCpp(
    'async function first() { await one(); await two(); }\n'
    + 'async function second() { await three(); }\n'
  );

  assert.match(cpp, /__async_first__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 1\);/, 'first machine must schedule state 1');
  assert.match(cpp, /__async_first__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 2\);/, 'first machine must schedule state 2');
  assert.match(cpp, /__async_second__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 3\);/, 'second machine must continue at state 3');
});