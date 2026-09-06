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
  assert.match(cpp, /case 0: \/\* initial state \*\//, 'resume must have initial state case');
  assert.match(cpp, /void noop\(void\) \{[\s\S]*__async_noop__resume\(__sm\);/, 'async declarations must emit a callable starter');
});

test('async C++ emission: struct emits one suspend point per await', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); }\n');

  assert.match(cpp, /struct __async_load \{/, 'C++ must emit state machine struct');
  assert.match(cpp, /case 0:[\s\S]*\/\* await checkpoint 1: __fetch\(\) \*\//, 'must emit checkpoint for first await');
  assert.match(cpp, /__sm->__state = 1;[\s\S]*__async_schedule\(\(void\*\)__sm, 1\);/, 'must schedule the resumed state');
  assert.match(cpp, /case 1: \/\* resumed after await 1 \*\//, 'must resume after the first await');
});

test('async C++ emission: two awaits produce two suspend points', () => {
  const cpp = runCompilerCpp('async function run() { await step1(); await step2(); }\n');

  assert.match(cpp, /case 0:[\s\S]*\/\* await checkpoint 1: __step1\(\) \*\//, 'must emit first checkpoint');
  assert.match(cpp, /case 1:[\s\S]*\/\* await checkpoint 2: __step2\(\) \*\//, 'must emit second checkpoint');
  assert.match(cpp, /case 2: \/\* resumed after await 2 \*\/[\s\S]*__async_complete\(\(void\*\)__sm\);/, 'final resumed state must notify completion');
});

test('async C++ emission: struct includes parameter fields', () => {
  const cpp = runCompilerCpp('async function send(url, data) { await post(url, data); }\n');

  assert.match(cpp, /int url;/, 'struct must include url parameter field');
  assert.match(cpp, /int data;/, 'struct must include data parameter field');
});

test('async C++ emission: locals are retained in the state machine across await', () => {
  const cpp = runCompilerCpp(
    'async function retain() { let value = 7; await Promise.resolve(0); value = value + 1; console.log(value); }\n'
  );

  assert.match(cpp, /double __local_value;/, 'async local must be stored in the state struct');
  assert.match(cpp, /__sm->__local_value = 7;/, 'initial declaration must initialize the state field');
  assert.match(cpp, /__sm->__local_value = __sm->__local_value \+ 1;/, 'resumed assignment must use the state field');
  assert.match(cpp, /__console__log\(__sm->__local_value\);/, 'resumed read must use the state field');
});

test('async C++ emission: Promise.resolve result initializes its target after resume', () => {
  const cpp = runCompilerCpp(
    'async function load() { const marker = await Promise.resolve("await result retained"); console.log(marker); }\n'
  );

  assert.match(cpp, /const char\* __local_marker;/, 'await target must use the resolved value type');
  assert.match(cpp, /case 0:[\s\S]*__Promise__resolve\("await result retained"\);/, 'initial state must await Promise.resolve');
  assert.match(cpp, /case 1:[\s\S]*__sm->__local_marker = "await result retained";/, 'resumed state must materialize the resolved value');
  assert.match(cpp, /__console__log\(__sm->__local_marker\);/, 'resumed code must consume the assigned value');
});

test('async C++ emission: dynamic await result uses the scalar runtime ABI', () => {
  const cpp = runCompilerCpp(
    'async function load() { const status = await getStatus(); console.log(status); }\n'
  );

  assert.match(cpp, /__async_prepare_await\(\(void\*\)__sm, 1\);/, 'dynamic await must register its runtime context before the host call');
  assert.match(cpp, /case 1:[\s\S]*__sm->__local_status = __async_take_i32\(\(void\*\)__sm\);/, 'resumed state must read the fulfilled scalar');
  assert.match(cpp, /extern int __async_take_i32\(void\* sm\);/, 'generated C++ must declare the scalar runtime ABI');
});

test('async C++ emission: dynamic await handles lower string and object reads through the runtime ABI', () => {
  const cpp = runCompilerCpp(
    'async function load() { const response = await getResponse(); if (response.status === 201) { console.log("ok"); } if (response.meta.status === 202) { console.log("nested"); } const message = await getMessage(); console.log(message); }\n'
  );

  assert.match(cpp, /__async_handle_get_i32\(__sm->__local_response, \(const char\*\)"status"\)/, 'object property must read from the dynamic handle');
  assert.match(cpp, /__async_handle_get_i32\(__async_handle_get_handle\(__sm->__local_response, \(const char\*\)"meta"\), \(const char\*\)"status"\)/, 'nested object property must retain and read through an intermediate handle');
  assert.match(cpp, /__console__log\(__async_handle_get_string\(__sm->__local_message\)\);/, 'string handle must convert to C string for console output');
  assert.match(cpp, /extern int __async_handle_get_handle\(int handle, const char\* key\);/, 'generated C++ must declare the nested-handle ABI');
  assert.match(cpp, /extern const char\* __async_handle_get_string\(int handle\);/, 'generated C++ must declare the string handle ABI');
});

test('async C++ emission: rejected await resumes into its catch handler state', () => {
  const cpp = runCompilerCpp(
    'async function load() { try { await failLater(); } catch (err) { console.log("rejection caught"); } }\n'
  );

  assert.match(cpp, /case 1:[\s\S]*if \(__exc_active\(\)\)[\s\S]*async exception frame[\s\S]*__exc_matches\(__exc_type\(\), 1\)/, 'resumed state must route an async rejection through its exception frame');
  assert.match(cpp, /async catch handler \*\/[\s\S]*const char\* err = __async_handle_get_string\(__exc_data\(\)\);[\s\S]*__exc_clear\(\);[\s\S]*__console__log\("rejection caught"\);/, 'catch state must bind the rejection before clearing the exception');
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
  assert.equal(ir.asyncRuntime.resumeBridges[0].bridgeSymbol, 'async_fetch_resume__pv', 'bridge metadata must provide the MaiaCpp-lowered resume ABI symbol');
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

  assert.match(cpp, /case 0:[\s\S]*\/\* await checkpoint 1:/, 'must emit checkpoint 1');
  assert.doesNotMatch(cpp, /if \(__exc_active\(\)\)/, 'checkpoint outside try must not check exception');
  assert.match(cpp, /__async_schedule\(\(void\*\)__sm, 1\);\s+return;/s, 'checkpoint must suspend after scheduling its continuation');
});

test('async C++ emission: await inside try emits exception checks', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (e) { } }\n');

  assert.match(cpp, /if \(__exc_active\(\)\)/, 'checkpoint inside try must emit exception check');
  assert.match(cpp, /exception frame depth: 1/, 'must annotate try depth level');
  assert.match(cpp, /__sm->__state =[^\n]+;\s+__async_run__resume\(__sm\);\s+return;/s, 'exception check must enter the target state before returning');
});

test('async C++ emission: nested try levels emit nested exception depth', () => {
  const cpp = runCompilerCpp('async function run() { try { try { await fetch(); } catch (e1) { } } catch (e2) { } }\n');

  assert.match(cpp, /if \(__exc_active\(\)\)/, 'nested checkpoint must emit exception check');
  assert.match(cpp, /exception frame depth: 2/, 'must annotate nested try depth level');
});

test('async C++ emission: nested finally continues into an outer catch frame', () => {
  const cpp = runCompilerCpp('async function run() { try { try { await fetch(); } finally { cleanup(); } } catch (err) { report(err); } }\n');

  assert.match(cpp, /async finally handler[\s\S]*cleanup\(\);[\s\S]*__sm->__state = \d+;[\s\S]*__async_run__resume\(__sm\);/,
    'the inner finally must resume exception routing instead of clearing the rejection');
  assert.match(cpp, /async exception frame 1[\s\S]*catch handler for err/,
    'the outer exception frame must receive the rejection after the inner finally');
});

test('async C++ emission: a handled rejection runs its sibling finally before resuming', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (err) { report(err); } finally { cleanup(); } afterCleanup(); }\n');

  assert.match(cpp, /async catch handler[\s\S]*report\(err\);[\s\S]*__sm->__state = \d+;[\s\S]*__async_run__resume\(__sm\);/,
    'the catch handler must continue instead of completing the machine');
  assert.match(cpp, /async finally handler[\s\S]*cleanup\(\);[\s\S]*__sm->__state = 1;[\s\S]*__async_run__resume\(__sm\);/,
    'the sibling finally must target the post-await continuation state');
  assert.match(cpp, /case 1:[\s\S]*__afterCleanup\(\);/,
    'the post-await continuation must contain statements after the complete try form');
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

  assert.match(cpp, /host resume bridge symbol: async_load_resume__pv/, 'must annotate bridge ABI symbol name');
  assert.match(cpp, /extern "C" void __async_load__resume_bridge\(void\* __smv\)/, 'must emit C bridge signature for host dispatch');
  assert.match(cpp, /__async_load__resume\(\(struct __async_load\*\)__smv\);/, 'bridge must forward to typed resume function');
});

test('async C++ emission: await checkpoints call __async_schedule', () => {
  const cpp = runCompilerCpp('async function load() { await fetch(); await save(); }\n');

  assert.ok(cpp.includes('__async_schedule((void*)__sm, 1);'), 'checkpoint 1 must schedule continuation');
  assert.ok(cpp.includes('__async_schedule((void*)__sm, 2);'), 'checkpoint 2 must schedule continuation');
});

test('async C++ emission: await in an if branch guards scheduling and lowers else', () => {
  const cpp = runCompilerCpp('async function run() { let enabled = 0; if (enabled) { await fetch(); } else { fallback(); } afterBranch(); }\n');

  assert.match(cpp, /if \(!\(__sm->__local_enabled\)\) \{[\s\S]*__fallback\(\);[\s\S]*__sm->__state = 1;[\s\S]*__async_run__resume\(__sm\);/,
    'a false condition must lower the else branch and resume without scheduling the await');
  assert.match(cpp, /if \(!\(__sm->__local_enabled\)\) \{[\s\S]*\}[\s\S]*__async_prepare_await\(\(void\*\)__sm, 1\);[\s\S]*__fetch\(\);/,
    'the await preparation and host call must remain after the guard');
  assert.match(cpp, /case 1:[\s\S]*__afterBranch\(\);/,
    'the resumed state must retain statements after the if form');
});

test('async C++ emission: if branch retains statements around its await', () => {
  const cpp = runCompilerCpp('async function run() { let enabled = 1; if (enabled) { beforeAwait(); await fetch(); afterAwait(); } afterBranch(); }\n');

  assert.match(cpp, /if \(!\(__sm->__local_enabled\)\)[\s\S]*__beforeAwait\(\);[\s\S]*__sm->__branch = 1;[\s\S]*__fetch\(\);/,
    'the true branch must emit statements before its await before scheduling it');
  assert.match(cpp, /case 1:[\s\S]*if \(__sm->__branch == 1\)[\s\S]*__afterAwait\(\);[\s\S]*__afterBranch\(\);/,
    'the resumed branch must emit its post-await statements before outer continuation');
});

test('async C++ emission: if branch keeps its marker through sequential awaits', () => {
  const cpp = runCompilerCpp('async function run() { let enabled = 1; if (enabled) { await first(); betweenAwaits(); await second(); afterSecond(); } afterBranch(); }\n');

  assert.match(cpp, /__sm->__branch = 1;[\s\S]*__first\(\);/, 'the first await must activate the true-branch marker');
  assert.match(cpp, /case 1:[\s\S]*await checkpoint 2:[\s\S]*__betweenAwaits\(\);[\s\S]*__second\(\);/,
    'the first resume must preserve the branch interval while it reaches the second await');
  assert.match(cpp, /case 2:[\s\S]*if \(__sm->__branch == 1\)[\s\S]*__sm->__branch = 0;[\s\S]*__afterSecond\(\);[\s\S]*__afterBranch\(\);/,
    'the final resume must clear the marker after its branch-local statements');
});

test('async C++ emission: while body returns to its await checkpoint after resume', () => {
  const cpp = runCompilerCpp('async function repeat() { let count = 0; while (count < 2) { await tick(); count = count + 1; } console.log("done"); }\n');
  assert.match(cpp, /int __loop;/, 'state machine must retain loop progress');
  assert.match(cpp, /if \(!\(__sm->__local_count < 2\)\)[\s\S]*__sm->__loop = 0/, 'checkpoint must exit when the loop condition becomes false');
  assert.match(cpp, /if \(__sm->__loop == 1\)[\s\S]*__sm->__local_count = __sm->__local_count \+ 1;[\s\S]*__sm->__state = 0/, 'resumption must run the loop tail and return to its condition');
});

test('async C++ emission: for body initializes, increments, and rechecks around await', () => {
  const cpp = runCompilerCpp('async function repeat() { for (let index = 0; index < 2; index++) { await tick(); afterAwait(); } afterLoop(); }\n');

  assert.match(cpp, /double __local_index;/, 'the lexical for binding must be retained in the state machine');
  assert.match(cpp, /if \(__sm->__loop == 0\) \{[\s\S]*__sm->__local_index = 0;/, 'the initializer must run only for the first iteration');
  assert.match(cpp, /if \(__sm->__loop == 2\) \{[\s\S]*__sm->__local_index\+\+;/, 'the resumed loop must perform its increment before rechecking the condition');
  assert.match(cpp, /if \(!\(__sm->__local_index < 2\)\)[\s\S]*__sm->__loop = 3;/, 'the condition must exit into the post-loop continuation');
  assert.match(cpp, /case 1:[\s\S]*__afterAwait\(\);[\s\S]*__sm->__loop = 2;[\s\S]*__sm->__state = 0;/, 'the resumed body must complete before returning to the for header');
});

test('async C++ emission: while body retains an iteration through sequential awaits', () => {
  const cpp = runCompilerCpp('async function repeat() { let count = 0; while (count < 2) { await first(); between(); await second(); count = count + 1; } }\n');
  assert.match(cpp, /case 1:[\s\S]*__between\(\);[\s\S]*__second\(\);/, 'first resume must reach the second await in the same iteration');
  assert.match(cpp, /case 2:[\s\S]*__sm->__local_count = __sm->__local_count \+ 1;[\s\S]*__sm->__state = 0/, 'last resume must run the loop tail before restarting its condition');
});

test('async C++ emission: if branch inside while resumes before the loop tail', () => {
  const cpp = runCompilerCpp('async function repeat() { let count = 0; while (count < 2) { if (count === 0) { await tick(); afterAwait(); } else { alternate(); } count = count + 1; } }\n');
  assert.match(cpp, /case 1:[\s\S]*if \(__sm->__branch == 1\)[\s\S]*__afterAwait\(\);[\s\S]*__sm->__local_count = __sm->__local_count \+ 1;/, 'branch continuation must run before the enclosing loop tail');
});

test('async C++ emission: if and else awaits inside while retain their own loop continuation', () => {
  const cpp = runCompilerCpp('async function repeat() { let count = 0; while (count < 2) { if (count === 0) { await first(); afterFirst(); } else { await second(); afterSecond(); } count = count + 1; } }\n');

  assert.match(cpp, /__sm->__branch = 1;[\s\S]*__first\(\);/, 'the consequent await must select its branch marker');
  assert.match(cpp, /__sm->__branch = 2;[\s\S]*__second\(\);/, 'the alternate await must select its distinct branch marker');
  assert.match(cpp, /case 1:[\s\S]*__sm->__loop == 1 && __sm->__branch == 1[\s\S]*await checkpoint 2:/, 'the first resume must not advance the loop after selecting the alternate branch');
  assert.match(cpp, /case 2:[\s\S]*if \(__sm->__branch == 2\)[\s\S]*__afterSecond\(\);[\s\S]*__sm->__loop == 1 && __sm->__branch == 2[\s\S]*__sm->__local_count = __sm->__local_count \+ 1;/, 'the alternate resume must run its branch continuation and then the loop tail');
});

test('async C++ emission: if and else awaits inside for retain their own loop continuation', () => {
  const cpp = runCompilerCpp('async function repeat() { for (let index = 0; index < 2; index++) { if (index === 0) { await first(); afterFirst(); } else { await second(); afterSecond(); } } }\n');

  assert.match(cpp, /__sm->__branch = 1;[\s\S]*__first\(\);/, 'the consequent await must select its branch marker');
  assert.match(cpp, /__sm->__branch = 2;[\s\S]*__second\(\);/, 'the alternate await must select its distinct branch marker');
  assert.match(cpp, /case 1:[\s\S]*__sm->__loop == 1 && __sm->__branch == 1[\s\S]*await checkpoint 2:/, 'the first resume must wait for the alternate branch instead of incrementing');
  assert.match(cpp, /case 2:[\s\S]*if \(__sm->__branch == 2\)[\s\S]*__afterSecond\(\);[\s\S]*__sm->__loop == 1 && __sm->__branch == 2[\s\S]*__sm->__loop = 2;[\s\S]*__sm->__state = 0;/, 'the alternate resume must complete before returning to the for increment');
});

test('async C++ emission: break after await exits a for through state routing', () => {
  const cpp = runCompilerCpp('async function stop() { for (let index = 0; index < 3; index++) { await tick(); break; } afterLoop(); }\n');

  assert.match(cpp, /case 1:[\s\S]*if \(__sm->__loop == 1\)[\s\S]*__sm->__loop = 0;[\s\S]*__sm->__state = 1;[\s\S]*__async_stop__resume\(__sm\);/, 'the resumed break must route directly to the post-loop state');
  assert.match(cpp, /case 1:[\s\S]*__afterLoop\(\);/, 'the post-loop continuation must run after the async break');
});

test('async C++ emission: continue after await returns to a for increment', () => {
  const cpp = runCompilerCpp('async function repeat() { for (let index = 0; index < 2; index++) { await tick(); continue; } afterLoop(); }\n');

  assert.match(cpp, /case 1:[\s\S]*if \(__sm->__loop == 1\)[\s\S]*__sm->__loop = 2;[\s\S]*__sm->__state = 0;[\s\S]*__async_repeat__resume\(__sm\);/, 'the resumed continue must return through the for increment state');
  assert.match(cpp, /if \(__sm->__loop == 2\) \{[\s\S]*__sm->__local_index\+\+;/, 'the next initial state must perform the increment after continue');
});

test('async C++ emission: break after await exits a while through state routing', () => {
  const cpp = runCompilerCpp('async function repeat() { while (1) { await tick(); break; } afterLoop(); }\n');
  assert.match(cpp, /__sm->__loop = 0;[\s\S]*__sm->__state = 1;[\s\S]*__afterLoop\(\);/, 'break must resume the post-loop continuation');
  assert.doesNotMatch(cpp, /case 1:[\s\S]*\bbreak;/, 'resumed state must not emit a raw break outside a C++ loop');
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
  assert.match(cpp, /case \d+: \{ \/\* async finally handler \*\/[\s\S]*cleanup\(\);[\s\S]*__exc_clear\(\);/,
    'finally transition must target a materialized state that executes its body');
});

test('async C++ emission: try/catch/finally emits catch routing and finally transition', () => {
  const cpp = runCompilerCpp('async function run() { try { await fetch(); } catch (e) { } finally { cleanup(); } }\n');

  assert.ok(cpp.includes('__exc_matches(__exc_type(), 1)'), 'must still emit catch type matching');
  assert.ok(cpp.includes('catch handler for e'), 'must emit catch handler annotation');
  assert.ok(cpp.includes('finally handler transition'), 'must emit finally transition annotation');
});
