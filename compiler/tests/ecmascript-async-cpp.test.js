'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-async-cpp-'));
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

function runCompilerIR(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-async-ir-'));
  const inputFile = path.join(tempDir, 'input.js');
  const irOut = path.join(tempDir, 'out.ir.json');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const result = spawnSync(process.execPath, [COMPILER, '--file', inputFile, '--ir-json-out', irOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  return JSON.parse(fs.readFileSync(irOut, 'utf8'));
}

test('async C++ emission: struct is generated for async function with no await', () => {
  const cpp = runCompilerCpp('async function noop() {}\n');

  assert.match(cpp, /struct __async_noop \{/, 'C++ must emit state machine struct');
  assert.match(cpp, /int __state;/, 'struct must have __state field');
  assert.match(cpp, /int __result;/, 'struct must have __result field');
  assert.match(cpp, /static void __async_noop__resume\(struct __async_noop\* __sm\) \{/, 'C++ must emit resume function');
  assert.match(cpp, /case 0: \/\* initial state \*\/ break;/, 'resume must have initial state case');
});

test('async C++ emission: struct emits one suspend point per await', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.match(cpp, /struct __async_load \{/, 'C++ must emit state machine struct');
  assert.match(cpp, /case 1: \/\* await checkpoint 1: __fetch\(\) \*\//, 'must emit checkpoint for first await');
  assert.doesNotMatch(cpp, /case 2:/, 'must not emit checkpoint 2 for single await');
});

test('async C++ emission: two awaits produce two suspend points', () => {
  const cpp = runCompilerCpp('async function run() { await step1(); await step2(); }\n');

  assert.match(cpp, /case 1: \/\* await checkpoint 1: __step1\(\) \*\//, 'must emit first checkpoint');
  assert.match(cpp, /case 2: \/\* await checkpoint 2: __step2\(\) \*\//, 'must emit second checkpoint');
  assert.match(cpp, /default:\s+__async_complete\(\(void\*\)__sm\);\s+__sm->__state = 3;\s+return;/s, 'default must notify completion and point past last state');
});

test('async C++ emission: struct includes parameter fields', () => {
  const cpp = runCompilerCpp('async function send(url, data) { await post(url, data); }\n');

  assert.match(cpp, /int url;/, 'struct must include url parameter field');
  assert.match(cpp, /int data;/, 'struct must include data parameter field');
});

test('async C++ emission: multiple async functions each get their own struct', () => {
  const cpp = runCompilerCpp('async function a() {}\nasync function b() {}\n');

  assert.match(cpp, /struct __async_a \{/, 'C++ must emit struct for async a');
  assert.match(cpp, /struct __async_b \{/, 'C++ must emit struct for async b');
  assert.match(cpp, /static void __async_a__resume/, 'must emit resume for a');
  assert.match(cpp, /static void __async_b__resume/, 'must emit resume for b');
});

test('async C++ emission: sync functions do not produce async structs', () => {
  const cpp = runCompilerCpp('function sync() { return 1; }\n');

  assert.doesNotMatch(cpp, /struct __async_/, 'sync function must not generate async struct');
  assert.doesNotMatch(cpp, /__resume/, 'sync function must not generate resume function');
});

test('async IR JSON includes asyncIR manifest in --ir-json-out', () => {
  const ir = runCompilerIR('async function fetch() { await doGet(); }\n');

  assert.ok(ir.asyncIR, 'IR JSON must include asyncIR key');
  assert.ok(Array.isArray(ir.asyncIR.asyncFunctions), 'asyncIR must have asyncFunctions array');
  assert.equal(ir.asyncIR.asyncFunctions.length, 1, 'must detect one async function');
  assert.equal(ir.asyncIR.asyncFunctions[0].name, 'fetch', 'must record function name');
  assert.equal(ir.asyncIR.asyncFunctions[0].suspendPointCount, 1, 'must count suspend points');
  assert.equal(ir.asyncIR.asyncFunctions[0].body[0].awaitedExpr, '__doGet()', 'must lower await operand into async IR');
  assert.ok(ir.asyncRuntime, 'IR JSON must include asyncRuntime metadata');
  assert.ok(Array.isArray(ir.asyncRuntime.resumeBridges), 'asyncRuntime must include resumeBridges array');
  assert.equal(ir.asyncRuntime.resumeBridges[0].functionName, 'fetch', 'bridge metadata must reference async function name');
  assert.equal(ir.asyncRuntime.resumeBridges[0].bridgeSymbol, '__async_fetch__resume_bridge', 'bridge metadata must provide resume bridge symbol');
  assert.equal(ir.asyncRuntime.resumeBridges[0].machineId, 1, 'bridge metadata must include stable machine identity');
  assert.equal(ir.asyncRuntime.resumeBridges[0].scheduleStateStart, 1, 'bridge metadata must include schedule state range start');
  assert.equal(ir.asyncRuntime.resumeBridges[0].scheduleStateEnd, 1, 'bridge metadata must include schedule state range end');
});

test('async IR JSON assigns non-overlapping schedule state ranges across machines', () => {
  const ir = runCompilerIR('async function a() { await one(); await two(); }\nasync function b() { await three(); }\n');

  assert.equal(ir.asyncRuntime.resumeBridges.length, 2, 'must emit bridge metadata for both async functions');
  assert.equal(ir.asyncRuntime.resumeBridges[0].functionName, 'a', 'first bridge metadata entry must match first function');
  assert.equal(ir.asyncRuntime.resumeBridges[0].scheduleStateStart, 1, 'first machine must start schedule range at 1');
  assert.equal(ir.asyncRuntime.resumeBridges[0].scheduleStateEnd, 2, 'first machine range must include two suspend points');
  assert.equal(ir.asyncRuntime.resumeBridges[1].functionName, 'b', 'second bridge metadata entry must match second function');
  assert.equal(ir.asyncRuntime.resumeBridges[1].scheduleStateStart, 3, 'second machine range must continue after first machine');
  assert.equal(ir.asyncRuntime.resumeBridges[1].scheduleStateEnd, 3, 'second machine range must include its single suspend point');
});

test('async C++ emission: await outside try has no exception checks', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.match(cpp, /case 1: \/\* await checkpoint 1:/, 'must emit checkpoint 1');
  assert.doesNotMatch(cpp, /if \(__exc_active\(\)\)/, 'checkpoint outside try must not check exception');
  assert.match(cpp, /case 1:.*break;/s, 'checkpoint must have break statement');
});

test('async C++ emission: await inside try emits exception checks', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (e) { } }\n');

  assert.match(cpp, /if \(__exc_active\(\)\)/, 'checkpoint inside try must emit exception check');
  assert.match(cpp, /exception frame depth: 1/, 'must annotate try depth level');
  assert.match(cpp, /__sm->__state =[^\n]+;\s+return;/s, 'exception check must transition state and return');
});

test('async C++ emission: nested try levels emit nested exception depth', () => {
  const cpp = runCompilerCpp('async function run() { try { try { await fetch(); } catch (e1) { } } catch (e2) { } }\n');

  assert.match(cpp, /if \(__exc_active\(\)\)/, 'nested checkpoint must emit exception check');
  assert.match(cpp, /exception frame depth: 2/, 'must annotate nested try depth level');
});

test('async C++ emission: catch handler emits __exc_matches type routing', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (err) { } }\n');

  assert.ok(cpp.includes('__exc_active()'), 'must check if exception is active');
  assert.ok(cpp.includes('__exc_matches(__exc_type(), 1)'), 'must emit __exc_matches() for catch type code 1');
  assert.ok(cpp.includes('catch handler for err'), 'must annotate handler parameter name');
});

test('async C++ emission: emits scheduler hook declarations for async runtime', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.match(cpp, /extern void __async_schedule\(void\* sm, int state_id\);/, 'must declare schedule hook');
  assert.match(cpp, /extern void __async_complete\(void\* sm\);/, 'must declare completion hook');
});

test('async C++ emission: emits host resume bridge symbol per async machine', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.match(cpp, /host resume bridge symbol: __async_load__resume_bridge/, 'must annotate bridge symbol name');
  assert.match(cpp, /extern "C" void __async_load__resume_bridge\(void\* __smv\)/, 'must emit C bridge signature for host dispatch');
  assert.match(cpp, /__async_load__resume\(\(struct __async_load\*\)__smv\);/, 'bridge must forward to typed resume function');
});

test('async C++ emission: await checkpoints call __async_schedule', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); await save(); }\n');

  assert.ok(cpp.includes('__async_schedule((void*)__sm, 1);'), 'checkpoint 1 must schedule continuation');
  assert.ok(cpp.includes('__async_schedule((void*)__sm, 2);'), 'checkpoint 2 must schedule continuation');
});

test('async C++ emission: multiple machines use non-overlapping schedule IDs', () => {
  const cpp = runCompilerCpp('async function first() { await a(); await b(); }\nasync function second() { await c(); }\n');

  assert.match(cpp, /__async_first__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 1\);/, 'first machine must use schedule ID 1');
  assert.match(cpp, /__async_first__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 2\);/, 'first machine must use schedule ID 2');
  assert.match(cpp, /__async_second__resume[\s\S]*__async_schedule\(\(void\*\)__sm, 3\);/, 'second machine must continue with schedule ID 3');
});

test('async C++ emission: default branch calls __async_complete', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.ok(cpp.includes('__async_complete((void*)__sm);'), 'default state must notify completion hook');
});

test('async C++ emission: await inside try/finally emits finally transition', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } finally { cleanup(); } }\n');

  assert.ok(cpp.includes('__exc_active()'), 'must check active exception in try/finally checkpoint');
  assert.ok(cpp.includes('finally handler transition'), 'must emit finally transition annotation');
});

test('async C++ emission: try/catch/finally emits catch routing and finally transition', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (e) { } finally { cleanup(); } }\n');

  assert.ok(cpp.includes('__exc_matches(__exc_type(), 1)'), 'must still emit catch type matching');
  assert.ok(cpp.includes('catch handler for e'), 'must emit catch handler annotation');
  assert.ok(cpp.includes('finally handler transition'), 'must emit finally transition annotation');
});
