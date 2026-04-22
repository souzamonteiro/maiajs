'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COMPILER = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-runtime-fallback-shared-'));
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

test('runtime fallback dedup: emits shared helper once and reuses allocator across object/array/lambda', () => {
  const cpp = runCompilerCpp([
    'let o = { a: 1 };',
    'let a = [1, ...a0];',
    'const f = x => x;'
  ].join('\n'));

  const helperStructCount = (cpp.match(/struct __maia_runtime_value \{/g) || []).length;
  assert.equal(helperStructCount, 1, 'shared runtime value helper struct must be emitted exactly once');

  const helperAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_value\(int tag, int a, int b, int c\) \{/g) || []).length;
  assert.equal(helperAllocCount, 1, 'shared allocator helper must be emitted exactly once');

  assert.match(cpp, /void\* __maia_obj_literal1\(const char\* k1, int v1\) \{[\s\S]*__maia_runtime_alloc_value\(1, 1, 0, 0\);/,
    'object fallback must reuse shared allocator');

  assert.match(cpp, /void\* __maia_arr_builder_begin\(void\) \{[\s\S]*__maia_runtime_alloc_value\(4, 0, 0, 0\);/,
    'array builder fallback must reuse shared allocator');

  assert.match(cpp, /void\* __maia_lambda1\(void\) \{[\s\S]*__maia_runtime_alloc_value\(3, 1, 0, 0\);/,
    'lambda fallback must reuse shared allocator');
});

test('runtime fallback dedup: capture-aware lambda fallback reuses shared lambda payload allocator', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\n');

  const lambdaPayloadStructCount = (cpp.match(/struct __maia_runtime_lambda_value \{/g) || []).length;
  assert.equal(lambdaPayloadStructCount, 1, 'shared lambda payload struct must be emitted exactly once');

  const lambdaPayloadAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_lambda_value\(int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4\) \{/g) || []).length;
  assert.equal(lambdaPayloadAllocCount, 1, 'shared lambda payload allocator helper must be emitted exactly once');

  assert.match(cpp, /void\* __maia_lambda1_capture1\(int c1\) \{[\s\S]*__maia_runtime_alloc_lambda_value\(1, 0, 1, c1, 0, 0, 0\);/,
    'capture-aware sync lambda fallback must reuse shared lambda payload allocator');
});
