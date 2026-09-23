'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-lambda-cpp-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const args = [COMPILER, '--file', inputFile, '--cpp-out', cppOut];
  if (options.strictLowering) {
    args.push('--strict-lowering');
  }
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(cppOut), 'Expected C++ output file');

  return fs.readFileSync(cppOut, 'utf8');
}

test('lambda lowering: emits a callable C++ function for a non-capturing top-level arrow', () => {
  const cpp = runCompilerCpp('const f = x => x;\nconsole.log(f(5));\n');

  assert.match(cpp, /extern void\* __maia_lambda1\(void\);/, 'C++ must declare lambda runtime hook for arity-1');
  assert.match(cpp, /void\* __maia_lambda1\(void\) \{/, 'C++ must provide local fallback definition for sync lambda hook');
  assert.match(cpp, /int f\(int x\) \{[\s\S]*return \(int\)\(x\);/, 'C++ must emit the arrow body as a callable function');
  assert.doesNotMatch(cpp, /void\* f = __maia_lambda1\(\);/, 'C++ must not shadow the callable function with an opaque lambda value');
  assert.match(cpp, /__console__log\(f\(5\)\);/, 'C++ must call the generated function directly');
});

test('lambda lowering: non-capturing top-level arrow calls preserve arguments and return values', () => {
  const cpp = runCompilerCpp('const increment = x => x + 1;\nconsole.log("result", increment(4));\n', { strictLowering: true });

  assert.match(cpp, /int increment\(int x\) \{[\s\S]*return \(int\)\(x \+ 1\);/, 'C++ must emit the arrow implementation');
  assert.match(cpp, /__maia_console_value_tmp0 = \(double\)\(increment\(4\)\);/, 'C++ must call the generated function directly');
  assert.doesNotMatch(cpp, /const void\* increment =/, 'C++ must not emit an opaque binding that shadows increment');
});

test('function values: non-capturing top-level function binding receives static forEach callback arguments', () => {
  const cpp = runCompilerCpp([
    'function show(value) { console.log("item", value); }',
    '[2, 4].forEach(show);'
  ].join('\n'), { strictLowering: true });

  assert.match(cpp, /int show\((?:int|double) value\) \{/, 'C++ must emit the callback with a numeric parameter');
  assert.match(cpp, /show\(2\);[\s\S]*show\(4\);/, 'static forEach lowering must pass each array element to the bound callback');
  assert.doesNotMatch(cpp, /show\(\);/, 'callback invocation must not drop its required argument');
});

test('function values: inline non-capturing arrow receives static forEach callback arguments', () => {
  const cpp = runCompilerCpp('[2, 4].forEach(value => console.log("item", value));\n', { strictLowering: true });

  assert.match(cpp, /int __maia_fn_arrow_arg_0\((?:int|double) value\) \{/, 'C++ must emit the inline arrow as a concrete callback function');
  assert.match(cpp, /__maia_fn_arrow_arg_0\(2\);[\s\S]*__maia_fn_arrow_arg_0\(4\);/, 'static forEach lowering must pass each array element to the inline arrow');
  assert.match(cpp, /__console__log\(/, 'the inline arrow body must preserve its side effect');
  assert.doesNotMatch(cpp, /__maia_lambda1\(\)\(2\)/, 'C++ must not call an opaque lambda payload as a function');
});

test('function values: named callbacks drive direct static map, filter, and reduce evaluation', () => {
  const cpp = runCompilerCpp([
    'function doubleValue(value) { return value * 2; }',
    'function isEven(value) { return value % 2 === 0; }',
    'function sum(total, value) { return total + value; }',
    'const doubled = [1, 2, 3].map(doubleValue);',
    'const evens = [1, 2, 3, 4].filter(isEven);',
    'const total = [1, 2, 3].reduce(sum, 0);',
    'console.log("map", doubled[2]);',
    'console.log("filter", evens.length);',
    'console.log("reduce", total);'
  ].join('\n'), { strictLowering: true });

  assert.match(cpp, /const void\* doubled = __maia_arr_literal3\(\(long\)\(2\), \(long\)\(4\), \(long\)\(6\)\);/, 'map must retain statically evaluated elements');
  assert.match(cpp, /const void\* evens = __maia_arr_literal2\(\(long\)\(2\), \(long\)\(4\)\);/, 'filter must retain matching elements');
  assert.match(cpp, /const double total = 6;/, 'reduce must materialize the named callback result');
  assert.doesNotMatch(cpp, /\.map\(|\.filter\(|\.reduce\(/, 'JS collection calls must not leak into C++ output');
});

test('function values: named non-capturing arrows drive direct static map, filter, and reduce evaluation', () => {
  const cpp = runCompilerCpp([
    'const doubleValue = value => value * 2;',
    'const isEven = value => value % 2 === 0;',
    'const sum = (total, value) => total + value;',
    'const doubled = [1, 2, 3].map(doubleValue);',
    'const evens = [1, 2, 3, 4].filter(isEven);',
    'const total = [1, 2, 3].reduce(sum, 0);',
    'console.log("map", doubled[2]);',
    'console.log("filter", evens.length);',
    'console.log("reduce", total);'
  ].join('\n'), { strictLowering: true });

  assert.match(cpp, /int doubleValue\(double value\) \{/, 'C++ must emit the map callback as a concrete arrow function');
  assert.match(cpp, /const void\* doubled = __maia_arr_literal3\(\(long\)\(2\), \(long\)\(4\), \(long\)\(6\)\);/, 'map must evaluate the named arrow callback');
  assert.match(cpp, /const void\* evens = __maia_arr_literal2\(\(long\)\(2\), \(long\)\(4\)\);/, 'filter must evaluate the named arrow callback');
  assert.match(cpp, /const double total = 6;/, 'reduce must evaluate the named arrow callback');
  assert.doesNotMatch(cpp, /__maia_lambda\d+\(\)\(/, 'C++ must not call an opaque lambda payload as a callback');
});

test('lambda lowering: emits parenthesized sync lambda runtime hook by arity', () => {
  const cpp = runCompilerCpp('const add = (x, y) => x + y;\n');

  assert.match(cpp, /extern void\* __maia_lambda2\(void\);/, 'C++ must declare lambda runtime hook for arity-2');
  assert.match(cpp, /int add\(int x, int y\) \{[\s\S]*return \(int\)\(x \+ y\);/, 'C++ must emit the arity-2 arrow as a callable function');
  assert.doesNotMatch(cpp, /void\* add = __maia_lambda2\(\);/, 'C++ must not shadow the arity-2 callable function');
});

test('lambda lowering: emits capture-aware sync lambda hook for simple top-level identifier capture', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst addY = x => x + y;\n');

  assert.match(cpp, /extern void\* __maia_lambda1_capture1\(int c1\);/, 'C++ must declare capture-aware lambda runtime hook');
  assert.match(cpp, /void\* addY = __maia_lambda1_capture1\(\(int\)\(y\)\);/, 'C++ must lower captured identifier into capture-aware lambda helper call');
  assert.match(cpp, /struct __maia_runtime_lambda_value \{[\s\S]*int function_id;[\s\S]*void\* env;[\s\S]*int capture_count;[\s\S]*int truncated_captures;[\s\S]*int capture1;[\s\S]*int capture2;[\s\S]*int capture3;[\s\S]*int capture4;[\s\S]*int extra_capture_count;[\s\S]*int\* extra_captures;[\s\S]*\};/, 'C++ must emit a local lambda runtime payload struct with function identity, explicit env handle, fixed slots, and overflow capture storage');
  assert.match(cpp, /struct __maia_runtime_lambda_env \{[\s\S]*int capture_count;[\s\S]*int truncated_captures;[\s\S]*int capture1;[\s\S]*int capture2;[\s\S]*int capture3;[\s\S]*int capture4;[\s\S]*int extra_capture_count;[\s\S]*int\* extra_captures;[\s\S]*\};/, 'C++ must emit a separate lambda env struct for closure capture storage');
  assert.match(cpp, /void\* __maia_lambda1_capture1\(int c1\) \{[\s\S]*__maia_runtime_alloc_lambda_value\(1001, 1, 0, 1, c1, 0, 0, 0, 0, 0\);/, 'capture-aware lambda fallback must preserve captured values and attach deterministic function identity through the shared payload allocator');
});

test('lambda lowering: capture-aware sync lambda with more than 4 captures preserves overflow capture storage', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    'const f = x => x + a + b + c + d + e;'
  ].join('\n'));

  assert.match(cpp, /extern void\* __maia_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\);/, 'C++ must declare capture-aware lambda hook for 5 captures');
  assert.match(cpp, /void\* __maia_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\) \{[\s\S]*int extra_captures\[1\];[\s\S]*extra_captures\[0\] = c5;[\s\S]*__maia_runtime_alloc_lambda_value\(1005, 1, 0, 5, c1, c2, c3, c4, 1, extra_captures\);/,
    'capture-aware lambda fallback must keep first four captures and preserve overflow captures through sidecar storage');
  assert.match(cpp, /fn->function_id = function_id;[\s\S]*fn->env = \(void\*\)env;[\s\S]*fn->capture_count = __maia_runtime_lambda_get_capture_count\(\(void\*\)fn\);[\s\S]*fn->capture1 = c1;[\s\S]*fn->capture4 = c4;[\s\S]*fn->extra_capture_count = env \? env->extra_capture_count : extra_capture_count;[\s\S]*fn->capture1 = __maia_runtime_lambda_get_capture_at\(\(void\*\)fn, 0\);[\s\S]*fn->capture4 = __maia_runtime_lambda_get_capture_at\(\(void\*\)fn, 3\);/,
    'shared payload allocator must assign deterministic function identity, attach env handle, and consume capture metadata through runtime-facing APIs');
});

test('lambda lowering: emits capture-aware sync lambda hook for simple function-local capture', () => {
  const cpp = runCompilerCpp('function outer(y) {\n  const z = 7;\n  const add = x => x + y + z;\n  return 0;\n}\n');

  assert.match(cpp, /const void\* add = __maia_lambda1_capture2\(\(int\)\(y\), \(int\)\(z\)\);/, 'C++ must lower function-local captures into capture-aware lambda helper call');
});

test('lambda lowering: emits capture-aware sync lambda hook across nested block scope with shadowing', () => {
  const cpp = runCompilerCpp('function outer(y) {\n  const z = 7;\n  {\n    const y = 2;\n    const add = x => x + y + z;\n  }\n  return 0;\n}\n');

  assert.match(cpp, /const void\* add = __maia_lambda1_capture2\(\(int\)\(y\), \(int\)\(z\)\);/, 'C++ must capture the nearest shadowing binding and outer-scope locals across nested blocks');
});

test('lambda lowering: emits nested lambda capture-aware hook for enclosing lambda parameter', () => {
  const cpp = runCompilerCpp('const f = x => y => x + y;\n');

  assert.match(cpp, /extern void\* __maia_lambda1_capture1\(int c1\);/, 'C++ must declare capture-aware hook for inner lambda that captures outer lambda parameter');
  assert.match(cpp, /void\* __maia_lambda1_capture1\(int c1\) \{/, 'C++ must emit local fallback definition for inner lambda capture hook');
  assert.match(cpp, /void\* f\(int x\) \{[\s\S]*__maia_lambda1_capture1\(\(int\)\(x\)\)/, 'outer lambda must be emitted as a function that produces the captured closure');
});

test('lambda lowering: nested lambda captures enclosing lambda local without leaking it onto outer lambda hook', () => {
  const cpp = runCompilerCpp('const f = x => { const z = 1; return y => x + y + z; };\n');

  assert.match(cpp, /extern void\* __maia_lambda1_capture2\(int c1, int c2\);/, 'C++ must declare inner lambda hook that captures enclosing lambda param and local');
  assert.match(cpp, /void\* __maia_lambda1_capture2\(int c1, int c2\) \{/, 'C++ must emit fallback definition for the inner nested lambda hook');
  assert.match(cpp, /int f\(int x\) \{/, 'outer lambda must emit a callable function without capture payload');
  assert.doesNotMatch(cpp, /__maia_lambda1_capture1\(\(int\)\(z\)\)/, 'outer lambda must not leak inner local binding into its own lowering');
});

test('lambda lowering: emits async lambda runtime hook by arity', () => {
  const cpp = runCompilerCpp('const f = async x => await x;\n');

  assert.match(cpp, /extern void\* __maia_async_lambda1\(void\);/, 'C++ must declare async lambda runtime hook for arity-1');
  assert.match(cpp, /void\* __maia_async_lambda1\(void\) \{/, 'C++ must provide local fallback definition for async lambda hook');
  assert.match(cpp, /void\* f = __maia_async_lambda1\(\);/, 'C++ must lower async lambda expression into runtime helper');
});

test('lambda lowering: capture-aware identifier call routes through invocation function-id bridge', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\nf(1);\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'C++ must route capture-aware identifier calls through invocation function-id bridge');
  assert.doesNotMatch(cpp, /extern void __f\(/, 'selector-routed capture-aware lambda call must not emit host extern declarations for local binding names');
});

test('lambda lowering: no-capture identifier calls are not misrouted through invocation selector bridge', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\nconst g = x => x;\nf(1);\ng(1);\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'capture-aware binding should still route through invocation function-id bridge');
  assert.doesNotMatch(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)g, 1, 0\);/, 'no-capture binding must not be routed through capture-aware invocation function-id bridge');
});

test('lambda lowering: top-level assignment to capture-aware sync lambda participates in invocation selector routing', () => {
  const cpp = runCompilerCpp('let f;\nconst y = 7;\nf = x => x + y;\nf(1);\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'C++ must route assignment-defined capture-aware sync lambda calls through invocation function-id bridge');
});

test('lambda lowering: function-local capture-aware sync lambda call routes through invocation selector', () => {
  const cpp = runCompilerCpp('function outer(y) {\n  const f = x => x + y;\n  f(1);\n  return 0;\n}\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'C++ must route function-local capture-aware sync lambda calls through invocation function-id bridge');
});

test('lambda lowering: emits capture-aware async lambda hook for simple top-level identifier capture', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = async x => await y;\n');

  assert.match(cpp, /extern void\* __maia_async_lambda1_capture1\(int c1\);/, 'C++ must declare capture-aware async lambda runtime hook');
  assert.match(cpp, /void\* f = __maia_async_lambda1_capture1\(\(int\)\(y\)\);/, 'C++ must lower captured identifier into capture-aware async lambda helper call');
});

test('lambda lowering: capture-aware async identifier call routes through invocation selector with async flag', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = async x => await (x + y);\nf(1);\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 1\);/, 'C++ must route capture-aware async identifier calls through invocation function-id bridge with async flag set');
});

test('lambda lowering: top-level assignment to capture-aware async lambda participates in invocation selector routing', () => {
  const cpp = runCompilerCpp('let f;\nconst y = 7;\nf = async x => await (x + y);\nf(1);\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 1\);/, 'C++ must route assignment-defined capture-aware async lambda calls through invocation function-id bridge with async flag set');
});

test('lambda lowering: function-local capture-aware async lambda call routes through invocation selector with async flag', () => {
  const cpp = runCompilerCpp('function outer(y) {\n  const f = async x => await (x + y);\n  f(1);\n  return 0;\n}\n');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 1\);/, 'C++ must route function-local capture-aware async lambda calls through invocation function-id bridge with async flag set');
});

test('lambda lowering: function-local no-capture lambda call is not misrouted through invocation selector', () => {
  const cpp = runCompilerCpp('function outer() {\n  const g = x => x;\n  g(1);\n  return 0;\n}\n');

  assert.doesNotMatch(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)g, 1, 0\);/, 'function-local no-capture lambda call must not be routed through capture-aware invocation function-id bridge');
});

test('lambda lowering: parameter shadowing prevents selector misrouting from outer capture-aware binding', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\nfunction outer(f) {\n  f(1);\n  return 0;\n}\n');

  assert.doesNotMatch(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'parameter shadowing must prevent invoke-bridge routing intended for outer capture-aware lambda binding');
});

test('lambda lowering: local no-capture shadowing prevents selector misrouting from outer capture-aware binding', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\nfunction outer() {\n  const f = x => x;\n  f(1);\n  return 0;\n}\n');

  assert.doesNotMatch(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'local no-capture shadowing must prevent invoke-bridge routing intended for outer capture-aware lambda binding');
});

test('lambda lowering: hoisted local function declaration shadowing prevents selector misrouting from outer capture-aware binding', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\nfunction outer() {\n  f(1);\n  function f(x) { return x; }\n  return 0;\n}\n');

  assert.doesNotMatch(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/, 'hoisted local function declaration shadowing must prevent invoke-bridge routing intended for outer capture-aware lambda binding');
});

test('lambda lowering: emits capture-aware async lambda hook for simple function-local capture', () => {
  const cpp = runCompilerCpp('function outer(y) {\n  const z = 7;\n  const f = async x => await z;\n  return 0;\n}\n');

  assert.match(cpp, /const void\* f = __maia_async_lambda1_capture1\(\(int\)\(z\)\);/, 'C++ must lower only referenced function-local captures into capture-aware async lambda helper call');
});

test('lambda lowering: capture-aware async lambda with more than 4 captures preserves overflow capture storage', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    'const f = async x => await (x + a + b + c + d + e);'
  ].join('\n'));

  assert.match(cpp, /extern void\* __maia_async_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\);/, 'C++ must declare capture-aware async lambda hook for 5 captures');
  assert.match(cpp, /void\* __maia_async_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\) \{[\s\S]*int extra_captures\[1\];[\s\S]*extra_captures\[0\] = c5;[\s\S]*__maia_runtime_alloc_lambda_value\(1001005, 1, 1, 5, c1, c2, c3, c4, 1, extra_captures\);/,
    'capture-aware async lambda fallback must keep first four captures and preserve overflow captures through sidecar storage');
});

test('lambda lowering: nested async lambda captures enclosing lambda parameter and local without leaking onto outer lambda hook', () => {
  const cpp = runCompilerCpp('const f = x => { const z = 1; return async y => await x + z; };\n');

  assert.match(cpp, /extern void\* __maia_async_lambda1_capture2\(int c1, int c2\);/, 'C++ must declare nested async lambda hook that captures enclosing lambda param and local');
  assert.match(cpp, /void\* __maia_async_lambda1_capture2\(int c1, int c2\) \{/, 'C++ must emit local fallback definition for nested async lambda capture hook');
  assert.match(cpp, /int f\(int x\) \{/, 'outer non-capturing lambda must emit a callable function');
  assert.doesNotMatch(cpp, /__maia_lambda1_capture1\(/, 'outer lambda must not leak enclosing-lambda local captures into its own lowering');
});

test('lambda lowering: does not emit fallback comments for arrow declaration', () => {
  const cpp = runCompilerCpp('const f = x => x;\n');

  assert.doesNotMatch(cpp, /\[expression not yet lowered\]/, 'lambda declaration should not trigger expression fallback comment');
  assert.doesNotMatch(cpp, /\[statement not yet lowered\]/, 'lambda declaration should not trigger statement fallback comment');
});
