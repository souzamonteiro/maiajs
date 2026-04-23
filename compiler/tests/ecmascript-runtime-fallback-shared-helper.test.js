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

  assert.match(cpp, /\/\* lambda closure\/env fallback contract \(local MVP\)[\s\S]*function_id is deterministic per lowered lambda hook signature\.[\s\S]*capture_count is the canonical total capture count via env\/value API\.[\s\S]*__maia_runtime_lambda_get_capture_at returns capture value by index or 0 if out-of-range\.[\s\S]*mirror fields \(capture1\.\.capture4, extra_\*\) are legacy-only compatibility projections; env-backed accessors are canonical\.[\s\S]*\*\//,
    'capture-aware outputs must include explicit local closure/env runtime contract documentation');

  const lambdaEnvStructCount = (cpp.match(/struct __maia_runtime_lambda_env \{/g) || []).length;
  assert.equal(lambdaEnvStructCount, 1, 'shared lambda env struct must be emitted exactly once');

  const lambdaEnvAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_lambda_env\(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int\* extra_captures\) \{/g) || []).length;
  assert.equal(lambdaEnvAllocCount, 1, 'shared lambda env allocator helper must be emitted exactly once');

  const lambdaEnvCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_env_capture_at\(__maia_runtime_lambda_env\* env, int index\) \{/g) || []).length;
  assert.equal(lambdaEnvCaptureAtCount, 1, 'shared lambda env capture lookup helper must be emitted exactly once');
  assert.match(cpp, /static int __maia_runtime_lambda_env_capture_at\(__maia_runtime_lambda_env\* env, int index\) \{[\s\S]*if \(!env \|\| index < 0\) \{ return 0; \}[\s\S]*if \(extraIndex < 0 \|\| extraIndex >= env->extra_capture_count \|\| !env->extra_captures\) \{ return 0; \}[\s\S]*\}/,
    'lambda env capture accessor must guard invalid indexes and return zero for out-of-range reads');

  const lambdaValueCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_value_capture_at\(__maia_runtime_lambda_value\* fn, int index\) \{/g) || []).length;
  assert.equal(lambdaValueCaptureAtCount, 1, 'shared lambda value capture lookup helper must be emitted exactly once');
  assert.match(cpp, /static int __maia_runtime_lambda_value_capture_at\(__maia_runtime_lambda_value\* fn, int index\) \{[\s\S]*if \(!fn \|\| index < 0\) \{ return 0; \}[\s\S]*if \(env\) \{ return __maia_runtime_lambda_env_capture_at\(env, index\); \}[\s\S]*if \(extraIndex < 0 \|\| extraIndex >= fn->extra_capture_count \|\| !fn->extra_captures\) \{ return 0; \}[\s\S]*\}/,
    'lambda value capture accessor must return zero for invalid indexes and delegate to env-first path when available');

  const lambdaGetCaptureCountCount = (cpp.match(/static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{/g) || []).length;
  assert.equal(lambdaGetCaptureCountCount, 1, 'runtime-facing lambda capture-count API helper must be emitted exactly once');
  assert.match(cpp, /static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{[\s\S]*if \(!fn\) \{ return 0; \}[\s\S]*if \(env\) \{ return env->capture_count; \}[\s\S]*return fn->capture_count;[\s\S]*\}/,
    'runtime-facing lambda capture-count API helper must prefer env metadata and fallback to closure mirror count');

  const lambdaGetCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{/g) || []).length;
  assert.equal(lambdaGetCaptureAtCount, 1, 'runtime-facing lambda capture-by-index API helper must be emitted exactly once');

  const lambdaGetFunctionIdCount = (cpp.match(/static int __maia_runtime_lambda_get_function_id\(void\* lambda_value\) \{/g) || []).length;
  assert.equal(lambdaGetFunctionIdCount, 1, 'runtime-facing lambda function-id API helper must be emitted exactly once');

  const lambdaGetArityCount = (cpp.match(/static int __maia_runtime_lambda_get_arity\(void\* lambda_value\) \{/g) || []).length;
  assert.equal(lambdaGetArityCount, 1, 'runtime-facing lambda arity API helper must be emitted exactly once');

  const lambdaGetIsAsyncCount = (cpp.match(/static int __maia_runtime_lambda_get_is_async\(void\* lambda_value\) \{/g) || []).length;
  assert.equal(lambdaGetIsAsyncCount, 1, 'runtime-facing lambda is-async API helper must be emitted exactly once');

  const lambdaCanInvokeCount = (cpp.match(/static int __maia_runtime_lambda_can_invoke\(void\* lambda_value, int argc, int async_call\) \{/g) || []).length;
  assert.equal(lambdaCanInvokeCount, 1, 'runtime-facing lambda invocation-compatibility helper must be emitted exactly once');

  const lambdaSelectFunctionIdCount = (cpp.match(/static int __maia_runtime_lambda_select_function_id\(void\* lambda_value, int argc, int async_call\) \{/g) || []).length;
  assert.equal(lambdaSelectFunctionIdCount, 1, 'runtime-facing lambda invocation function-id selector helper must be emitted exactly once');

  const lambdaInvokeFunctionIdCount = (cpp.match(/static int __maia_runtime_lambda_invoke_function_id\(void\* lambda_value, int argc, int async_call\) \{/g) || []).length;
  assert.equal(lambdaInvokeFunctionIdCount, 1, 'runtime-facing lambda invocation function-id bridge helper must be emitted exactly once');
  assert.match(cpp, /static int __maia_runtime_lambda_known_case_token\(void\* lambda_value, int function_id\) \{[\s\S]*case 1001:[\s\S]*return \(__maia_runtime_lambda_get_arity\(lambda_value\) \* 10\) \+ 1 \+ 10 \+ 100 \+ \(__maia_runtime_lambda_get_capture_count\(lambda_value\) \* 1000\);[\s\S]*default:[\s\S]*return 0;[\s\S]*\}/,
    'runtime-facing invocation bridge helper surface should include a dedicated known-case token helper');
  assert.match(cpp, /static int __maia_runtime_lambda_invoke_function_id\(void\* lambda_value, int argc, int async_call\) \{[\s\S]*int function_id = __maia_runtime_lambda_select_function_id\(lambda_value, argc, async_call\);[\s\S]*if \(!function_id\) \{ return 0; \}[\s\S]*int known_case_token = __maia_runtime_lambda_known_case_token\(lambda_value, function_id\);[\s\S]*if \(!known_case_token\) \{ return 0; \}[\s\S]*switch \(function_id\) \{[\s\S]*default:[\s\S]*return 0;[\s\S]*\}/,
    'runtime-facing invocation bridge helper must derive its reusable known-case token before entering the switch scaffold');
  assert.match(cpp, /switch \(function_id\) \{[\s\S]*case 1001:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token;/,
    'runtime-facing invocation bridge helper should reuse known-case token inside weighted sync return behavior');
  assert.match(cpp, /static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{[\s\S]*return __maia_runtime_lambda_value_capture_at\(fn, index\);[\s\S]*\}/,
    'runtime-facing lambda capture-by-index API helper must delegate to lambda-value capture accessor path');

  const lambdaPayloadStructCount = (cpp.match(/struct __maia_runtime_lambda_value \{/g) || []).length;
  assert.equal(lambdaPayloadStructCount, 1, 'shared lambda payload struct must be emitted exactly once');

  const lambdaPayloadAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_lambda_value\(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int\* extra_captures\) \{/g) || []).length;
  assert.equal(lambdaPayloadAllocCount, 1, 'shared lambda payload allocator helper must be emitted exactly once');

  assert.match(cpp, /__maia_runtime_lambda_env\* env = \(__maia_runtime_lambda_env\*\)__maia_runtime_alloc_lambda_env\(capture_count, c1, c2, c3, c4, extra_capture_count, extra_captures\);[\s\S]*fn->env = \(void\*\)env;/,
    'lambda payload allocator must create an explicit env handle and attach it to the closure payload');
  assert.match(cpp, /fn->capture_count = __maia_runtime_lambda_get_capture_count\(\(void\*\)fn\);[\s\S]*fn->capture1 = c1;[\s\S]*fn->capture4 = c4;[\s\S]*fn->capture1 = __maia_runtime_lambda_get_capture_at\(\(void\*\)fn, 0\);[\s\S]*fn->capture4 = __maia_runtime_lambda_get_capture_at\(\(void\*\)fn, 3\);/,
    'lambda payload allocator must consume capture metadata through runtime-facing capture APIs and project compatibility mirrors from that path');
  assert.match(cpp, /\/\* legacy-only mirror projection seed from constructor arguments \*\/[\s\S]*\/\* legacy-only mirror projection from canonical runtime capture API \*\//,
    'lambda payload allocator must keep explicit legacy-only projection labels at mirror assignment sites');

  assert.match(cpp, /void\* __maia_lambda1_capture1\(int c1\) \{[\s\S]*__maia_runtime_alloc_lambda_value\(1001, 1, 0, 1, c1, 0, 0, 0, 0, 0\);/,
    'capture-aware sync lambda fallback must reuse shared lambda payload allocator');
});

test('runtime fallback dedup: legacy-only projection labels scoped to allocator, not runtime APIs', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\n');

  const allocatorMatch = cpp.match(/static void\* __maia_runtime_alloc_lambda_value\([^}]*?\{[\s\S]*?\n\}/);
  assert.ok(allocatorMatch, 'must find lambda payload allocator');
  const allocatorBody = allocatorMatch[0];
  assert.match(allocatorBody, /\/\* legacy-only mirror projection seed from constructor arguments \*\/[\s\S]*\/\* legacy-only mirror projection from canonical runtime capture API \*\//,
    'legacy-only labels must appear in allocator body');

  const getCaptureCountMatch = cpp.match(/static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{[\s\S]*?\n\}/);
  assert.ok(getCaptureCountMatch, 'must find runtime-facing capture-count API');
  const getCaptureCountBody = getCaptureCountMatch[0];
  assert.doesNotMatch(getCaptureCountBody, /legacy-only/,
    'legacy-only labels must not appear in get_capture_count API body');

  const getCaptureAtMatch = cpp.match(/static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{[\s\S]*?\n\}/);
  assert.ok(getCaptureAtMatch, 'must find runtime-facing capture-by-index API');
  const getCaptureAtBody = getCaptureAtMatch[0];
  assert.doesNotMatch(getCaptureAtBody, /legacy-only/,
    'legacy-only labels must not appear in get_capture_at API body');
});

test('runtime fallback dedup: mixed sync and async overflow hooks reuse one shared lambda payload allocator', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    'const syncF = x => x + a + b + c + d + e;',
    'const asyncF = async x => await (x + a + b + c + d + e);'
  ].join('\n'));

  const lambdaEnvStructCount = (cpp.match(/struct __maia_runtime_lambda_env \{/g) || []).length;
  assert.equal(lambdaEnvStructCount, 1, 'shared lambda env struct must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaEnvAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_lambda_env\(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int\* extra_captures\) \{/g) || []).length;
  assert.equal(lambdaEnvAllocCount, 1, 'shared lambda env allocator helper must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaEnvCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_env_capture_at\(__maia_runtime_lambda_env\* env, int index\) \{/g) || []).length;
  assert.equal(lambdaEnvCaptureAtCount, 1, 'shared lambda env capture lookup helper must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaValueCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_value_capture_at\(__maia_runtime_lambda_value\* fn, int index\) \{/g) || []).length;
  assert.equal(lambdaValueCaptureAtCount, 1, 'shared lambda value capture lookup helper must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaGetCaptureCountCount = (cpp.match(/static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{/g) || []).length;
  assert.equal(lambdaGetCaptureCountCount, 1, 'runtime-facing lambda capture-count API helper must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaGetCaptureAtCount = (cpp.match(/static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{/g) || []).length;
  assert.equal(lambdaGetCaptureAtCount, 1, 'runtime-facing lambda capture-by-index API helper must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaPayloadStructCount = (cpp.match(/struct __maia_runtime_lambda_value \{/g) || []).length;
  assert.equal(lambdaPayloadStructCount, 1, 'shared lambda payload struct must still be emitted exactly once with mixed sync/async overflow hooks');

  const lambdaPayloadAllocCount = (cpp.match(/static void\* __maia_runtime_alloc_lambda_value\(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, const int\* extra_captures\) \{/g) || []).length;
  assert.equal(lambdaPayloadAllocCount, 1, 'shared lambda payload allocator helper must still be emitted exactly once with mixed sync/async overflow hooks');

  assert.match(cpp, /void\* __maia_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\) \{[\s\S]*int extra_captures\[1\];[\s\S]*__maia_runtime_alloc_lambda_value\(1005, 1, 0, 5, c1, c2, c3, c4, 1, extra_captures\);/,
    'sync overflow hook must reuse shared lambda payload allocator');

  assert.match(cpp, /void\* __maia_async_lambda1_capture5\(int c1, int c2, int c3, int c4, int c5\) \{[\s\S]*int extra_captures\[1\];[\s\S]*__maia_runtime_alloc_lambda_value\(1001005, 1, 1, 5, c1, c2, c3, c4, 1, extra_captures\);/,
    'async overflow hook must reuse shared lambda payload allocator');

  assert.match(cpp, /case 1005:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ __maia_runtime_lambda_get_capture_at\(lambda_value, 4\) \+ argc \+ known_case_token;/,
    'known sync overflow function-id case should include capture-index-4 plus reusable known-case token after metadata guards');

  assert.match(cpp, /case 1001005:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*return -\(\(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ __maia_runtime_lambda_get_capture_at\(lambda_value, 4\) \+ argc \+ known_case_token\);/,
    'known async overflow function-id case should include negated capture-index-4 plus reusable known-case token after metadata guards');
});

test('runtime fallback dedup: mid-profile known cases (2..4 captures) omit capture-index-4 and carry family constant', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const syncF = x => x + a + b;',
    'const asyncF = async x => await (x + a + b);'
  ].join('\n'));

  assert.match(cpp, /case 1002:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token;/,
    'known sync mid-profile function-id case should omit capture-index-4 and include reusable known-case token after metadata guards');

  assert.match(cpp, /case 1001002:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*return -\(\(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token\);/,
    'known async mid-profile function-id case should omit capture-index-4 and include negated reusable known-case token after metadata guards');

  assert.doesNotMatch(cpp, /case 1002:[\s\S]*__maia_runtime_lambda_get_capture_at\(lambda_value, 4\)/,
    'known mid-profile function-id case must not include overflow-only capture-index-4 contribution');
});

test('runtime fallback dedup: multi-arg known cases carry arity-family constant', () => {
  const cpp = runCompilerCpp([
    'const z = 7;',
    'const syncF = (x, y) => x + y + z;',
    'const asyncF = async (x, y) => await (x + y + z);'
  ].join('\n'));

  assert.match(cpp, /case 2001:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 2\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token;/,
    'known sync multi-arg function-id case should include reusable known-case token after metadata guards');

  assert.match(cpp, /case 1002001:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 2\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*return -\(\(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token\);/,
    'known async multi-arg function-id case should include negated reusable known-case token after metadata guards');
});

test('runtime fallback dedup: exact capture-count term differentiates three-capture and four-capture known cases', () => {
  const cpp = runCompilerCpp([
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const f3 = x => x + a + b + c;',
    'const f4 = x => x + a + b + c + d;'
  ].join('\n'));

  assert.match(cpp, /case 1003:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token;/,
    'known three-capture function-id case should include reusable known-case token after metadata guards');

  assert.match(cpp, /case 1004:[\s\S]*if \(__maia_runtime_lambda_get_arity\(lambda_value\) != 1\) \{ return 0; \}[\s\S]*if \(__maia_runtime_lambda_get_is_async\(lambda_value\) != 0\) \{ return 0; \}[\s\S]*return \(__maia_runtime_lambda_get_capture_at\(lambda_value, 0\) \* 1\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 1\) \* 2\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 2\) \* 3\) \+ \(__maia_runtime_lambda_get_capture_at\(lambda_value, 3\) \* 4\) \+ argc \+ known_case_token;/,
    'known four-capture function-id case should include reusable known-case token after metadata guards');
});

test('runtime fallback dedup: no-capture-only lambda programs do not emit capture runtime API helpers', () => {
  const cpp = runCompilerCpp([
    'const f = x => x;',
    'const g = async x => await x;'
  ].join('\n'));

  assert.doesNotMatch(cpp, /\/\* lambda closure\/env fallback contract \(local MVP\)/, 'no-capture-only programs must not emit closure/env contract comment block');
  assert.doesNotMatch(cpp, /struct __maia_runtime_lambda_env \{/, 'no-capture-only programs must not emit lambda env struct');
  assert.doesNotMatch(cpp, /static void\* __maia_runtime_alloc_lambda_env\(/, 'no-capture-only programs must not emit lambda env allocator');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_capture_count\(void\* lambda_value\) \{/, 'no-capture-only programs must not emit runtime-facing capture-count helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{/, 'no-capture-only programs must not emit runtime-facing capture-by-index helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_function_id\(void\* lambda_value\) \{/, 'no-capture-only programs must not emit runtime-facing function-id helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_arity\(void\* lambda_value\) \{/, 'no-capture-only programs must not emit runtime-facing arity helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_is_async\(void\* lambda_value\) \{/, 'no-capture-only programs must not emit runtime-facing is-async helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_can_invoke\(void\* lambda_value, int argc, int async_call\) \{/, 'no-capture-only programs must not emit runtime-facing invocation-compatibility helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_select_function_id\(void\* lambda_value, int argc, int async_call\) \{/, 'no-capture-only programs must not emit runtime-facing invocation function-id selector helper');
  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_invoke_function_id\(void\* lambda_value, int argc, int async_call\) \{/, 'no-capture-only programs must not emit runtime-facing invocation function-id bridge helper');
});

test('runtime fallback dedup: runtime-facing capture API avoids direct mirror-field reads', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\n');

  assert.match(cpp, /static int __maia_runtime_lambda_value_capture_at\(__maia_runtime_lambda_value\* fn, int index\) \{[\s\S]*if \(index == 0\) \{ return fn->capture1; \}[\s\S]*if \(index == 3\) \{ return fn->capture4; \}[\s\S]*\}/,
    'compatibility fallback accessor may read mirror fields directly');

  assert.match(cpp, /static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{[\s\S]*return __maia_runtime_lambda_value_capture_at\(fn, index\);[\s\S]*\}/,
    'runtime-facing capture API must delegate through accessor path');

  assert.doesNotMatch(cpp, /static int __maia_runtime_lambda_get_capture_at\(void\* lambda_value, int index\) \{[^}]*fn->capture[1-4]/,
    'runtime-facing capture API function body must not read mirror fields directly');
});

test('runtime fallback dedup: no new mirror-field read consumers beyond compatibility fallbacks', () => {
  const cpp = runCompilerCpp('const y = 7;\nconst f = x => x + y;\n');

  const count = (pattern) => (cpp.match(pattern) || []).length;

  assert.equal(count(/return fn->capture1;/g), 1,
    'mirror-field read for capture1 must remain confined to one compatibility fallback path');
  assert.equal(count(/return fn->capture2;/g), 1,
    'mirror-field read for capture2 must remain confined to one compatibility fallback path');
  assert.equal(count(/return fn->capture3;/g), 1,
    'mirror-field read for capture3 must remain confined to one compatibility fallback path');
  assert.equal(count(/return fn->capture4;/g), 1,
    'mirror-field read for capture4 must remain confined to one compatibility fallback path');
  assert.equal(count(/return fn->extra_captures\[extraIndex\];/g), 1,
    'mirror-field read for overflow captures must remain confined to one compatibility fallback path');
  assert.equal(count(/return fn->capture_count;/g), 1,
    'mirror-field read for capture_count must remain confined to one compatibility fallback path');
});
