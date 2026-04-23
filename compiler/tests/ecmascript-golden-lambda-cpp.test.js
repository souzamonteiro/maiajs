'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-golden-lambda-'));
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

test('golden: no-capture lambda generates working fallback hook', () => {
  const cpp = runCompilerCpp('const f = x => x + 1;');

  // Verify basic structure
  assert.match(cpp, /void\* __maia_lambda1\(void\)/, 'should emit no-capture lambda hook');
  assert.match(cpp, /return __maia_runtime_alloc_value\(3, 1, 0, 0\);/, 
    'should allocate lambda value with tag 3 (lambda) and arity 1');
  assert.match(cpp, /int main\(\)/, 'should have valid main function');
});

test('golden: single-capture lambda generates capture-aware hook', () => {
  const cpp = runCompilerCpp('const y = 7; const f = x => x + y;');

  // Verify capture infrastructure is emitted
  assert.match(cpp, /struct __maia_runtime_lambda_env \{/, 'should emit lambda env struct');
  assert.match(cpp, /struct __maia_runtime_lambda_value \{/, 'should emit lambda payload struct');
  assert.match(cpp, /__maia_lambda1_capture1\(int c1\)/, 'should emit capture-aware hook');
  assert.match(cpp, /__maia_runtime_alloc_lambda_value\(1001, 1, 0, 1, c1, 0, 0, 0, 0, 0\);/, 
    'should call allocator with correct metadata');
});

test('golden: overflow capture lambda allocates sidecar storage', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    'const f = x => x + a + b + c + d + e;'
  ].join('\n'));

  // Verify overflow handling
  assert.match(cpp, /__maia_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\)/, 
    'should emit overflow-capture hook with 5 parameters');
  assert.match(cpp, /int extra_captures\[1\];/, 'should allocate sidecar for overflow');
  assert.match(cpp, /extra_captures\[0\] = c5;/, 'should populate sidecar with overflow value');
});

test('golden: async lambda preserves async metadata', () => {
  const cpp = runCompilerCpp('const y = 7; const f = async x => await (x + y);');

  // Verify async structure is emitted
  assert.match(cpp, /__maia_async_lambda1_capture1\(int c1\)/, 'should emit async capture-aware hook');
  assert.match(cpp, /__maia_runtime_alloc_lambda_value\(1001001, 1, 1, 1, c1, 0, 0, 0, 0, 0\);/, 
    'should set is_async=1 in allocator call (second param 1001001 encodes async, third param 1)');
  assert.match(cpp, /struct __maia_runtime_lambda_env \{/, 'should still emit env struct for async');
});

test('golden: nested lambdas preserve capture chain', () => {
  const cpp = runCompilerCpp([
    'const outer = 1;',
    'const f = x => {',
    '  const mid = 2;',
    '  const g = y => y + outer + mid + x;',
    '  return g;',
    '};'
  ].join('\n'));

  // Verify both lambdas are present (both share the same capture-aware hook infrastructure)
  assert.match(cpp, /__maia_lambda1_capture/, 'should emit capture-aware lambda hooks');
  assert.match(cpp, /struct __maia_runtime_lambda_env \{/, 'should emit shared env struct');
  assert.match(cpp, /struct __maia_runtime_lambda_value \{/, 'should emit shared lambda payload struct');
});

test('golden: capture-aware lambda emits full contract documentation', () => {
  const cpp = runCompilerCpp('const y = 7; const f = x => x + y;');

  // Verify contract block is emitted
  assert.match(cpp, /\/\* lambda closure\/env fallback contract \(local MVP\)/, 
    'should emit contract documentation block');
  assert.match(cpp, /function_id is deterministic/, 'should document function_id contract');
  assert.match(cpp, /capture_count is the canonical total capture count/, 
    'should document capture_count contract');
  assert.match(cpp, /mirror fields.*legacy-only/, 'should document legacy-only mirror fields');
});

test('golden: runtime API helpers avoid direct mirror reads', () => {
  const cpp = runCompilerCpp('const y = 7; const f = x => x + y;');

  // Verify API implementation patterns
  assert.match(cpp, /static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{/, 
    'should emit get_capture_count helper');
  assert.match(cpp, /static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{/, 
    'should emit get_capture_at helper');

  // Extract and verify get_capture_at doesn't read mirrors directly
  const getCAMatch = cpp.match(/static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{[\s\S]*?\n\}/);
  assert.ok(getCAMatch, 'should find get_capture_at body');
  assert.match(getCAMatch[0], /__maia_runtime_lambda_value_capture_at/, 
    'should delegate to accessor, not direct mirror reads');
});

test('golden: function-object metadata helpers are emitted for capture-aware payloads', () => {
  const cpp = runCompilerCpp('const y = 7; const f = async x => await (x + y);');

  assert.match(cpp, /static int __maia_runtime_lambda_get_function_id\(void\* lambda_value\) \{[\s\S]*return fn->function_id;[\s\S]*\}/,
    'should emit runtime-facing function-id helper');
  assert.match(cpp, /static int __maia_runtime_lambda_get_arity\(void\* lambda_value\) \{[\s\S]*return fn->arity;[\s\S]*\}/,
    'should emit runtime-facing arity helper');
  assert.match(cpp, /static int __maia_runtime_lambda_get_is_async\(void\* lambda_value\) \{[\s\S]*return fn->is_async;[\s\S]*\}/,
    'should emit runtime-facing is-async helper');
  assert.match(cpp, /if \(!fn\) \{ return 0; \}/,
    'metadata helpers should return zero for null payload pointers');
});

test('golden: invocation bridge helpers validate call-shape and select function id', () => {
  const cpp = runCompilerCpp('const y = 7; const f = async x => await (x + y);');

  assert.match(cpp, /static int __maia_runtime_lambda_can_invoke\(void\* lambda_value, int argc, int async_call\) \{[\s\S]*if \(!fn \|\| argc < 0\) \{ return 0; \}[\s\S]*if \(fn->arity != argc\) \{ return 0; \}[\s\S]*if \(fn->is_async != \(async_call \? 1 : 0\)\) \{ return 0; \}[\s\S]*return 1;[\s\S]*\}/,
    'invocation bridge compatibility helper should validate null/arity/async shape before invocation');
  assert.match(cpp, /static int __maia_runtime_lambda_select_function_id\(void\* lambda_value, int argc, int async_call\) \{[\s\S]*if \(!__maia_runtime_lambda_can_invoke\(lambda_value, argc, async_call\)\) \{ return 0; \}[\s\S]*return __maia_runtime_lambda_get_function_id\(lambda_value\);[\s\S]*\}/,
    'invocation bridge selector should return function id only for compatible call-shapes');
  assert.match(cpp, /static int __maia_runtime_lambda_invoke_function_id\(void\* lambda_value, int argc, int async_call\) \{[\s\S]*if \(!__maia_runtime_lambda_can_invoke\(lambda_value, argc, async_call\)\) \{ return 0; \}[\s\S]*int function_id = __maia_runtime_lambda_get_function_id\(lambda_value\);[\s\S]*switch \(function_id\) \{[\s\S]*default:[\s\S]*return function_id;[\s\S]*\}[\s\S]*\}/,
    'invocation bridge dispatch stub should expose a function-id switch scaffold with compatibility validation');
  assert.match(cpp, /switch \(function_id\) \{[\s\S]*case 1001001:[\s\S]*return function_id;/,
    'invocation bridge dispatch scaffold should materialize known capture-aware function-id case labels');
});

test('golden: capture-aware identifier call lowers through invocation function-id bridge', () => {
  const cpp = runCompilerCpp('const y = 7; const f = x => x + y; f(1);');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/,
    'capture-aware identifier call should lower to runtime invocation function-id bridge');
});

test('golden: capture-aware async identifier call lowers through invocation function-id bridge with async flag', () => {
  const cpp = runCompilerCpp('const y = 7; const f = async x => await (x + y); f(1);');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 1\);/,
    'capture-aware async identifier call should lower to runtime invocation function-id bridge with async flag');
});

test('golden: assignment-defined capture-aware identifier call lowers through invocation function-id bridge', () => {
  const cpp = runCompilerCpp('let f; const y = 7; f = x => x + y; f(1);');

  assert.match(cpp, /__maia_runtime_lambda_invoke_function_id\(\(void\*\)f, 1, 0\);/,
    'assignment-defined capture-aware identifier call should lower to runtime invocation function-id bridge');
});

test('golden: legacy-only labels appear in allocator only', () => {
  const cpp = runCompilerCpp('const y = 7; const f = x => x + y;');

  // Count legacy-only labels in allocator
  const allocMatch = cpp.match(/static void\* __maia_runtime_alloc_lambda_value\([^}]*\{[\s\S]*?\n\}/);
  assert.ok(allocMatch, 'should find allocator');
  const allocBody = allocMatch[0];
  const allocLegacy = allocBody.match(/\/\* legacy-only/g) || [];
  assert.ok(allocLegacy.length >= 2, 'allocator should have at least 2 legacy-only labels');

  // Verify they don't appear in API helpers
  const getCCMatch = cpp.match(/static int __maia_runtime_lambda_get_capture_count\([^}]*\{[\s\S]*?\n\}/);
  if (getCCMatch) {
    assert.doesNotMatch(getCCMatch[0], /\/\* legacy-only/, 
      'get_capture_count should not have legacy-only labels');
  }
});

