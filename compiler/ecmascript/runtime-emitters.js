'use strict';

/**
 * C++98 runtime fallback & literal helper emitters for objects, arrays, and lambdas.
 */

let _reDeps = null;
function _deps() { return _reDeps; }

function collectObjectLiteralArities(tree, compileContext = null) {
  const simpleArities = new Set();
  let requiresBuilderHooks = false;

  _deps().walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'objectLiteral') {
      return;
    }

    const properties = _deps().extractObjectLiteralProperties(node, compileContext);
    const operations = _deps().extractObjectLiteralOperations(node, compileContext);
    if (operations.some((operation) => operation.kind === 'spread') || properties.length > 4) {
      requiresBuilderHooks = true;
    } else {
      simpleArities.add(properties.length);
    }
  });

  return { simpleArities, requiresBuilderHooks };
}

function emitObjectLiteralRuntimeDeclsCpp(tree, compileContext = null) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree, compileContext);
  const requiresCtorObjectSeed = _deps().collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const decls = [];

  if (simpleArities.size > 0) {
    const maxArity = Math.max(...Array.from(simpleArities.values()));
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_obj_literal0(void);');
        continue;
      }
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`char* k${i}`);
        params.push(`long v${i}`);
      }
      decls.push(`extern void* __maia_obj_literal${arity}(${params.join(', ')});`);
    }
  } else {
    decls.push('extern void* __maia_obj_literal0(void);');
  }

  if (requiresBuilderHooks) {
    decls.push('extern void* __maia_obj_builder_begin(void);');
    decls.push('extern void* __maia_obj_builder_set_key(void* builder, char* key, long value);');
    decls.push('extern void* __maia_obj_builder_spread(void* builder, void* source);');
    decls.push('extern void* __maia_obj_builder_end(void* builder);');
  }

  return decls.join('\n');
}

function emitSharedRuntimeFallbackHelpersCpp(tree, compileContext = null) {
  const objArities = collectObjectLiteralArities(tree, compileContext);
  const hasObjectFallback = objArities.simpleArities.size > 0
    || objArities.requiresBuilderHooks
    || _deps().collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  const arrayStats = collectArrayLiteralArities(tree);
  const hasArrayFallback = arrayStats.simpleArities.size > 0 || arrayStats.requiresBuilderHooks;
  const lambdaStats = collectLambdaSignatures(tree);
  const hasLambdaFallback = lambdaStats.syncSignatures.size > 0 || lambdaStats.asyncSignatures.size > 0;
  const hasLambdaCapturePayload = [
    ...Array.from(lambdaStats.syncSignatures.values()),
    ...Array.from(lambdaStats.asyncSignatures.values())
  ].some((signature) => signature.captureCount > 0);
  const lambdaDispatchCases = hasLambdaCapturePayload
    ? [
      ...Array.from(lambdaStats.syncSignatures.values())
        .filter((signature) => signature.captureCount > 0)
        .map((signature) => ({
          functionId: _deps().getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, false),
          arity: signature.arity,
          isAsync: 0,
          captureCount: signature.captureCount
        })),
      ...Array.from(lambdaStats.asyncSignatures.values())
        .filter((signature) => signature.captureCount > 0)
        .map((signature) => ({
          functionId: _deps().getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, true),
          arity: signature.arity,
          isAsync: 1,
          captureCount: signature.captureCount
        }))
    ]
      .sort((a, b) => a.functionId - b.functionId)
    : [];

  const hasClosurePlan = Boolean(compileContext && compileContext.closurePlan && compileContext.closurePlan.orderedClosures.length > 0);
  const hasPromisePlan = Boolean(compileContext && compileContext.promisePlan && compileContext.promisePlan.enabled);
  const hasIteratorPlan = Boolean(compileContext && compileContext.iteratorPlan && compileContext.iteratorPlan.enabled);
  const hasAtomicsPlan = Boolean(compileContext && compileContext.atomicsPlan && compileContext.atomicsPlan.enabled);
  const hasCollectionsPlan = Boolean(compileContext && compileContext.collectionsPlan && compileContext.collectionsPlan.enabled);
  if (!hasObjectFallback && !hasArrayFallback && !hasLambdaFallback && !hasClosurePlan && !hasPromisePlan && !hasIteratorPlan && !hasAtomicsPlan && !hasCollectionsPlan) {
    return '';
  }

  return [
    'extern "C" int strcmp(const char* a, const char* b);',
    'extern "C" void free(void* ptr);',
    'struct __maia_runtime_value {',
    '  int tag;',
    '  int a;',
    '  int b;',
    '  int c;',
    '  char* k1;',
    '  char* k2;',
    '  char* k3;',
    '  char* k4;',
    '  char* k5;',
    '  char* k6;',
    '  char* k7;',
    '  char* k8;',
    '  long v1;',
    '  long v2;',
    '  long v3;',
    '  long v4;',
    '  long v5;',
    '  long v6;',
    '  long v7;',
    '  long v8;',
    '  long* items;',
    '  int capacity;',
    '  int fn_id;',
    '  void* closure_env;',
    '};',
    'static void* __maia_runtime_alloc_value(int tag, int a, int b, int c) {',
    '  __maia_runtime_value* v = new __maia_runtime_value();',
    '  v->tag = tag;',
    '  v->a = a;',
    '  v->b = b;',
    '  v->c = c;',
    '  v->k1 = 0;',
    '  v->k2 = 0;',
    '  v->k3 = 0;',
    '  v->k4 = 0;',
    '  v->k5 = 0;',
    '  v->k6 = 0;',
    '  v->k7 = 0;',
    '  v->k8 = 0;',
    '  v->v1 = 0;',
    '  v->v2 = 0;',
    '  v->v3 = 0;',
    '  v->v4 = 0;',
    '  v->v5 = 0;',
    '  v->v6 = 0;',
    '  v->v7 = 0;',
    '  v->v8 = 0;',
    '  v->items = 0;',
    '  v->capacity = 0;',
    '  v->fn_id = 0;',
    '  v->closure_env = 0;',
    '  if ((tag == 2 || tag == 4) && a > 0) {',
    '    v->items = new long[a];',
    '    v->capacity = a;',
    '    for (int i = 0; i < a; i++) { v->items[i] = 0; }',
    '  }',
    '  return (void*)v;',
    '}',
    'static int __maia_runtime_ensure_array_capacity(__maia_runtime_value* v, int needed) {',
    '  int next_capacity = 0;',
    '  long* next_items = 0;',
    '  if (!v || needed <= 0) { return 0; }',
    '  if (v->capacity >= needed) { return 0; }',
    '  next_capacity = v->capacity > 0 ? v->capacity : 4;',
    '  while (next_capacity < needed) { next_capacity *= 2; }',
    '  next_items = new long[next_capacity];',
    '  for (int i = 0; i < next_capacity; i++) { next_items[i] = 0; }',
    '  if (v->items && v->capacity > 0) {',
    '    for (int i = 0; i < v->capacity; i++) { next_items[i] = v->items[i]; }',
    '    free((void*)v->items);',
    '  }',
    '  v->items = next_items;',
    '  v->capacity = next_capacity;',
    '  return 0;',
    '}',
    'static int __maia_runtime_value_length(void* value) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v) { return 0; }',
    '  if (v->tag == 1 || v->tag == 2) { return v->a; }',
    '  return 0;',
    '}',
    ...(hasAtomicsPlan ? [
      'static long __maia_typed_array_read(void* ta_ptr, int index);',
      'static long __maia_typed_array_write(void* ta_ptr, int index, long val);'
    ] : []),
    'static long __maia_runtime_value_get_index(void* value, int index) {',
    ...(hasAtomicsPlan ? ['  if (value && ((__maia_runtime_value*)value)->tag == 8) { return __maia_typed_array_read(value, index); }'] : []),
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || (v->tag != 2 && v->tag != 4) || index < 0 || index >= v->a || !v->items) { return 0; }',
    '  return v->items[index];',
    '}',
    'static int __maia_runtime_value_set_index(void* value, int index, long element_value) {',
    ...(hasAtomicsPlan ? ['  if (value && ((__maia_runtime_value*)value)->tag == 8) { __maia_typed_array_write(value, index, element_value); return 0; }'] : []),
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || (v->tag != 2 && v->tag != 4) || index < 0) { return 0; }',
    '  __maia_runtime_ensure_array_capacity(v, index + 1);',
    '  if (!v->items) { return 0; }',
    '  v->items[index] = element_value;',
    '  if (index >= v->a) { v->a = index + 1; }',
    '  return 0;',
    '}',
    'static void* __maia_runtime_arguments_slice(int argc, int start) {',
    '  int length = argc - start;',
    '  if (length < 0) { length = 0; }',
    '  return __maia_runtime_alloc_value(2, length, 0, 0);',
    '}',
    'static long __maia_runtime_value_get_property(void* value, void* key) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  const char* property_key = (const char*)key;',
    ...(hasAtomicsPlan ? [
      '  if (v && (v->tag == 7 || v->tag == 8) && property_key && strcmp(property_key, "byteLength") == 0) { return (long)(v->tag == 7 ? v->a : v->a * v->b); }',
      '  if (v && v->tag == 8 && property_key && strcmp(property_key, "length") == 0) { return (long)v->a; }'
    ] : []),
    '  if (!v || !property_key || v->tag != 1) { return 0; }',
    '  if (v->k1 && strcmp(v->k1, property_key) == 0) { return v->v1; }',
    '  if (v->k2 && strcmp(v->k2, property_key) == 0) { return v->v2; }',
    '  if (v->k3 && strcmp(v->k3, property_key) == 0) { return v->v3; }',
    '  if (v->k4 && strcmp(v->k4, property_key) == 0) { return v->v4; }',
    '  if (v->k5 && strcmp(v->k5, property_key) == 0) { return v->v5; }',
    '  if (v->k6 && strcmp(v->k6, property_key) == 0) { return v->v6; }',
    '  if (v->k7 && strcmp(v->k7, property_key) == 0) { return v->v7; }',
    '  if (v->k8 && strcmp(v->k8, property_key) == 0) { return v->v8; }',
    '  return 0;',
    '}',
    "static int __maia_runtime_value_has_property(void* value, void* key) {",
    "  __maia_runtime_value* v = (__maia_runtime_value*)value;",
    "  const char* property_key = (const char*)key;",
    "  if (!v || !property_key || v->tag != 1) { return 0; }",
    "  if (v->k1 && strcmp(v->k1, property_key) == 0) { return 1; }",
    "  if (v->k2 && strcmp(v->k2, property_key) == 0) { return 1; }",
    "  if (v->k3 && strcmp(v->k3, property_key) == 0) { return 1; }",
    "  if (v->k4 && strcmp(v->k4, property_key) == 0) { return 1; }",
    "  if (v->k5 && strcmp(v->k5, property_key) == 0) { return 1; }",
    "  if (v->k6 && strcmp(v->k6, property_key) == 0) { return 1; }",
    "  if (v->k7 && strcmp(v->k7, property_key) == 0) { return 1; }",
    "  if (v->k8 && strcmp(v->k8, property_key) == 0) { return 1; }",
    "  return 0;",
    "}",
    'static int __maia_runtime_value_set_property(void* value, const char* key, long property_value) {',
    '  __maia_runtime_value* v = (__maia_runtime_value*)value;',
    '  if (!v || !key || v->tag != 1) { return 0; }',
    '  if (v->k1 && strcmp(v->k1, key) == 0) { v->v1 = property_value; return 0; }',
    '  if (v->k2 && strcmp(v->k2, key) == 0) { v->v2 = property_value; return 0; }',
    '  if (v->k3 && strcmp(v->k3, key) == 0) { v->v3 = property_value; return 0; }',
    '  if (v->k4 && strcmp(v->k4, key) == 0) { v->v4 = property_value; return 0; }',
    '  if (v->k5 && strcmp(v->k5, key) == 0) { v->v5 = property_value; return 0; }',
    '  if (v->k6 && strcmp(v->k6, key) == 0) { v->v6 = property_value; return 0; }',
    '  if (v->k7 && strcmp(v->k7, key) == 0) { v->v7 = property_value; return 0; }',
    '  if (v->k8 && strcmp(v->k8, key) == 0) { v->v8 = property_value; return 0; }',
    '  if (!v->k1) { v->k1 = (char*)key; v->v1 = property_value; v->a += 1; return 0; }',
    '  if (!v->k2) { v->k2 = (char*)key; v->v2 = property_value; v->a += 1; return 0; }',
    '  if (!v->k3) { v->k3 = (char*)key; v->v3 = property_value; v->a += 1; return 0; }',
    '  if (!v->k4) { v->k4 = (char*)key; v->v4 = property_value; v->a += 1; return 0; }',
    '  if (!v->k5) { v->k5 = (char*)key; v->v5 = property_value; v->a += 1; return 0; }',
    '  if (!v->k6) { v->k6 = (char*)key; v->v6 = property_value; v->a += 1; return 0; }',
    '  if (!v->k7) { v->k7 = (char*)key; v->v7 = property_value; v->a += 1; return 0; }',
    '  if (!v->k8) { v->k8 = (char*)key; v->v8 = property_value; v->a += 1; return 0; }',
    '  return 0;',
    '}',
    'static int __Reflect(void* target, const char* key, long value) {',
    '  return __maia_runtime_value_set_property(target, key, value);',
    '}',
    'static void* __Object__values(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __Object__entries(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __maia_runtime_make_descriptor_enumerable(void) {',
    '  __maia_runtime_value* descriptor = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 1, 0, 0);',
    '  descriptor->k1 = (char*)"enumerable";',
    '  descriptor->v1 = 1;',
    '  return (void*)descriptor;',
    '}',
    'static void* __Object__getOwnPropertyDescriptors(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  __maia_runtime_value* out = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 0, 0, 0);',
    '  if (!src || src->tag != 1) { return (void*)out; }',
    '  if (src->k1) { out->k1 = src->k1; out->v1 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k2) { out->k2 = src->k2; out->v2 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k3) { out->k3 = src->k3; out->v3 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k4) { out->k4 = src->k4; out->v4 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k5) { out->k5 = src->k5; out->v5 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k6) { out->k6 = src->k6; out->v6 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k7) { out->k7 = src->k7; out->v7 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  if (src->k8) { out->k8 = src->k8; out->v8 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }',
    '  return (void*)out;',
    '}',
    'static void* __Reflect__ownKeys(void* target) {',
    '  __maia_runtime_value* src = (__maia_runtime_value*)target;',
    '  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }',
    '  return __maia_runtime_alloc_value(2, src->a, 0, 0);',
    '}',
    'static void* __Symbol(const char* description) {',
    '  static long __maia_symbol_counter = 1;',
    '  (void)description;',
    '  return (void*)(__maia_symbol_counter++);',
    '}',
    ...(hasLambdaCapturePayload ? [
      'struct __maia_runtime_lambda_env {',
      '  int capture_count;',
      '  int truncated_captures;',
      '  int capture1;',
      '  int capture2;',
      '  int capture3;',
      '  int capture4;',
      '  int extra_capture_count;',
      '  int* extra_captures;',
      '};',
      'static void* __maia_runtime_alloc_lambda_env(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {',
      '  __maia_runtime_lambda_env* env = new __maia_runtime_lambda_env();',
      '  env->capture_count = capture_count;',
      '  env->truncated_captures = 0;',
      '  env->capture1 = c1;',
      '  env->capture2 = c2;',
      '  env->capture3 = c3;',
      '  env->capture4 = c4;',
      '  env->extra_capture_count = extra_capture_count;',
      '  env->extra_captures = 0;',
      '  if (extra_capture_count > 0 && extra_captures) {',
      '    env->extra_captures = new int[extra_capture_count];',
      '    for (int i = 0; i < extra_capture_count; i += 1) {',
      '      env->extra_captures[i] = extra_captures[i];',
      '    }',
      '  }',
      '  return (void*)env;',
      '}',
      'struct __maia_runtime_lambda_value {',
      '  int function_id;',
      '  int arity;',
      '  int is_async;',
      '  void* env;',
      '  int capture_count;',
      '  int truncated_captures;',
      '  int capture1;',
      '  int capture2;',
      '  int capture3;',
      '  int capture4;',
      '  int extra_capture_count;',
      '  int* extra_captures;',
      '};',
      'static int __maia_runtime_lambda_env_capture_at(__maia_runtime_lambda_env* env, int index) {',
      '  if (!env || index < 0) { return 0; }',
      '  if (index == 0) { return env->capture1; }',
      '  if (index == 1) { return env->capture2; }',
      '  if (index == 2) { return env->capture3; }',
      '  if (index == 3) { return env->capture4; }',
      '  int extraIndex = index - 4;',
      '  if (extraIndex < 0 || extraIndex >= env->extra_capture_count || !env->extra_captures) { return 0; }',
      '  return env->extra_captures[extraIndex];',
      '}',
      'static int __maia_runtime_lambda_value_capture_at(__maia_runtime_lambda_value* fn, int index) {',
      '  if (!fn || index < 0) { return 0; }',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;',
      '  if (env) { return __maia_runtime_lambda_env_capture_at(env, index); }',
      '  if (index == 0) { return fn->capture1; }',
      '  if (index == 1) { return fn->capture2; }',
      '  if (index == 2) { return fn->capture3; }',
      '  if (index == 3) { return fn->capture4; }',
      '  int extraIndex = index - 4;',
      '  if (extraIndex < 0 || extraIndex >= fn->extra_capture_count || !fn->extra_captures) { return 0; }',
      '  return fn->extra_captures[extraIndex];',
      '}',
      'static int __maia_runtime_lambda_get_capture_count(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;',
      '  if (env) { return env->capture_count; }',
      '  return fn->capture_count;',
      '}',
      'static int __maia_runtime_lambda_get_capture_at(void* lambda_value, int index) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  return __maia_runtime_lambda_value_capture_at(fn, index);',
      '}',
      'static int __maia_runtime_lambda_get_function_id(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->function_id;',
      '}',
      'static int __maia_runtime_lambda_get_arity(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->arity;',
      '}',
      'static int __maia_runtime_lambda_get_is_async(void* lambda_value) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn) { return 0; }',
      '  return fn->is_async;',
      '}',
      'static int __maia_runtime_lambda_can_invoke(void* lambda_value, int argc, int async_call) {',
      '  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;',
      '  if (!fn || argc < 0) { return 0; }',
      '  if (fn->arity != argc) { return 0; }',
      '  if (fn->is_async != (async_call ? 1 : 0)) { return 0; }',
      '  return 1;',
      '}',
      'static int __maia_runtime_lambda_select_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  return __maia_runtime_lambda_get_function_id(lambda_value);',
      '}',
      'static int __maia_runtime_lambda_known_case_token(void* lambda_value, int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  int expected_is_async = function_id >= 1000000 ? 1 : 0;',
      '  int normalized_id = expected_is_async ? (function_id - 1000000) : function_id;',
      '  int expected_arity = normalized_id / 1000;',
      '  int expected_capture_count = normalized_id % 1000;',
      '  int capture_family = expected_capture_count > 4 ? 40 : (expected_capture_count > 1 ? 20 : 10);',
      '  int arity_family = expected_arity > 1 ? 200 : 100;',
      '  int runtime_arity = __maia_runtime_lambda_get_arity(lambda_value);',
      '  int runtime_capture_count = __maia_runtime_lambda_get_capture_count(lambda_value);',
      '  int token = (runtime_arity * 10) + (expected_capture_count % 10);',
      '  token += capture_family;',
      '  token += arity_family;',
      '  token += (runtime_capture_count * 1000);',
      '  return token;',
      '}',
      'static int __maia_runtime_lambda_known_case_polarity(int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  return function_id >= 1000000 ? -1 : 1;',
      '}',
      'static int __maia_runtime_lambda_known_case_weighted_capture_value(void* lambda_value, int function_id) {',
      '  if (function_id <= 0) { return 0; }',
      '  int capture_count = __maia_runtime_lambda_get_capture_count(lambda_value);',
      '  int weighted = 0;',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3);',
      '  weighted += (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4);',
      '  if (capture_count > 4) {',
      '    weighted += __maia_runtime_lambda_get_capture_at(lambda_value, 4);',
      '  }',
      '  return weighted;',
      '}',
      'static int __maia_runtime_lambda_known_case_matches_function_id(void* lambda_value, int function_id) {',
      '  int expected_is_async = function_id >= 1000000 ? 1 : 0;',
      '  int normalized_id = expected_is_async ? (function_id - 1000000) : function_id;',
      '  int expected_arity = normalized_id / 1000;',
      '  if (__maia_runtime_lambda_get_arity(lambda_value) != expected_arity) { return 0; }',
      '  if (__maia_runtime_lambda_get_is_async(lambda_value) != expected_is_async) { return 0; }',
      '  return 1;',
      '}',
      'static int __maia_runtime_lambda_has_known_case(int function_id) {',
      '  return function_id > 0 ? 1 : 0;',
      '}',
      'static int __maia_runtime_lambda_invoke_known_case(void* lambda_value, int function_id, int argc) {',
      '  if (!__maia_runtime_lambda_has_known_case(function_id)) { return 0; }',
      '  if (!__maia_runtime_lambda_known_case_matches_function_id(lambda_value, function_id)) { return 0; }',
      '  int weighted_capture_value = __maia_runtime_lambda_known_case_weighted_capture_value(lambda_value, function_id);',
      '  int known_case_token = __maia_runtime_lambda_known_case_token(lambda_value, function_id);',
      '  int known_case_total = weighted_capture_value + argc + known_case_token;',
      '  return __maia_runtime_lambda_known_case_polarity(function_id) * known_case_total;',
      '}',
      'static int __maia_runtime_lambda_invoke_function_id(void* lambda_value, int argc, int async_call) {',
      '  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) { return 0; }',
      '  int selected_function_id = __maia_runtime_lambda_select_function_id(lambda_value, argc, async_call);',
      '  return __maia_runtime_lambda_invoke_known_case(lambda_value, selected_function_id, argc);',
      '}',
      'static void* __maia_runtime_alloc_lambda_value(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {',
      '  __maia_runtime_lambda_value* fn = new __maia_runtime_lambda_value();',
      '  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)__maia_runtime_alloc_lambda_env(capture_count, c1, c2, c3, c4, extra_capture_count, extra_captures);',
      '  fn->function_id = function_id;',
      '  fn->arity = arity;',
      '  fn->is_async = is_async;',
      '  fn->env = (void*)env;',
      '  fn->capture_count = __maia_runtime_lambda_get_capture_count((void*)fn);',
      '  fn->truncated_captures = env ? env->truncated_captures : 0;',
      '  fn->capture1 = c1;',
      '  fn->capture2 = c2;',
      '  fn->capture3 = c3;',
      '  fn->capture4 = c4;',
      '  fn->extra_capture_count = env ? env->extra_capture_count : extra_capture_count;',
      '  fn->extra_captures = env ? env->extra_captures : 0;',
      '  fn->capture1 = __maia_runtime_lambda_get_capture_at((void*)fn, 0);',
      '  fn->capture2 = __maia_runtime_lambda_get_capture_at((void*)fn, 1);',
      '  fn->capture3 = __maia_runtime_lambda_get_capture_at((void*)fn, 2);',
      '  fn->capture4 = __maia_runtime_lambda_get_capture_at((void*)fn, 3);',
      '  return (void*)fn;',
      '}'
    ] : [])
  ].join('\n');
}

function emitObjectLiteralRuntimeFallbackCpp(tree, compileContext = null) {
  const { simpleArities, requiresBuilderHooks } = collectObjectLiteralArities(tree, compileContext);
  const requiresCtorObjectSeed = _deps().collectTopLevelConstructorFunctionExpressionBindings(tree).length > 0;
  if (simpleArities.size === 0 && !requiresBuilderHooks && !requiresCtorObjectSeed) {
    return '';
  }

  const maxArity = simpleArities.size > 0 ? Math.max(...Array.from(simpleArities.values())) : 0;
  const lines = [];

  lines.push('void* __maia_obj_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(1, 0, 0, 0);');
  lines.push('}');

  for (let arity = 1; arity <= maxArity; arity += 1) {
    const params = [];
    for (let i = 1; i <= arity; i += 1) {
      params.push(`char* k${i}`);
      params.push(`long v${i}`);
    }
    lines.push(`void* __maia_obj_literal${arity}(${params.join(', ')}) {`);
    lines.push(`  __maia_runtime_value* obj = (__maia_runtime_value*)__maia_runtime_alloc_value(1, ${arity}, 0, 0);`);
    for (let i = 1; i <= arity; i += 1) {
      lines.push(`  obj->k${i} = k${i};`);
      lines.push(`  obj->v${i} = v${i};`);
    }
    lines.push('  return (void*)obj;');
    lines.push('}');
  }

  if (requiresBuilderHooks) {
    lines.push('void* __maia_obj_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(5, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_obj_builder_set_key(void* builder, char* key, long value) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  if (b->k1 && strcmp(b->k1, key) == 0) { b->v1 = value; return builder; }');
    lines.push('  if (b->k2 && strcmp(b->k2, key) == 0) { b->v2 = value; return builder; }');
    lines.push('  if (b->k3 && strcmp(b->k3, key) == 0) { b->v3 = value; return builder; }');
    lines.push('  if (b->k4 && strcmp(b->k4, key) == 0) { b->v4 = value; return builder; }');
    lines.push('  if (b->k5 && strcmp(b->k5, key) == 0) { b->v5 = value; return builder; }');
    lines.push('  if (b->k6 && strcmp(b->k6, key) == 0) { b->v6 = value; return builder; }');
    lines.push('  if (b->k7 && strcmp(b->k7, key) == 0) { b->v7 = value; return builder; }');
    lines.push('  if (b->k8 && strcmp(b->k8, key) == 0) { b->v8 = value; return builder; }');
    lines.push('  b->a += 1;');
    lines.push('  if (b->a == 1) { b->k1 = key; b->v1 = value; }');
    lines.push('  else if (b->a == 2) { b->k2 = key; b->v2 = value; }');
    lines.push('  else if (b->a == 3) { b->k3 = key; b->v3 = value; }');
    lines.push('  else if (b->a == 4) { b->k4 = key; b->v4 = value; }');
    lines.push('  else if (b->a == 5) { b->k5 = key; b->v5 = value; }');
    lines.push('  else if (b->a == 6) { b->k6 = key; b->v6 = value; }');
    lines.push('  else if (b->a == 7) { b->k7 = key; b->v7 = value; }');
    lines.push('  else if (b->a == 8) { b->k8 = key; b->v8 = value; }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_obj_builder_spread(void* builder, void* source) {');
    lines.push('  __maia_runtime_value* value = (__maia_runtime_value*)source;');
    lines.push('  if (!value || value->tag != 1) { return builder; }');
    lines.push('  if (value->k1) { __maia_obj_builder_set_key(builder, value->k1, value->v1); }');
    lines.push('  if (value->k2) { __maia_obj_builder_set_key(builder, value->k2, value->v2); }');
    lines.push('  if (value->k3) { __maia_obj_builder_set_key(builder, value->k3, value->v3); }');
    lines.push('  if (value->k4) { __maia_obj_builder_set_key(builder, value->k4, value->v4); }');
    lines.push('  if (value->k5) { __maia_obj_builder_set_key(builder, value->k5, value->v5); }');
    lines.push('  if (value->k6) { __maia_obj_builder_set_key(builder, value->k6, value->v6); }');
    lines.push('  if (value->k7) { __maia_obj_builder_set_key(builder, value->k7, value->v7); }');
    lines.push('  if (value->k8) { __maia_obj_builder_set_key(builder, value->k8, value->v8); }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_obj_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return __maia_obj_literal0(); }');
    lines.push('  __maia_runtime_value* obj = (__maia_runtime_value*)__maia_runtime_alloc_value(1, b->a, 0, 0);');
    lines.push('  obj->k1 = b->k1;');
    lines.push('  obj->k2 = b->k2;');
    lines.push('  obj->k3 = b->k3;');
    lines.push('  obj->k4 = b->k4;');
    lines.push('  obj->k5 = b->k5;');
    lines.push('  obj->k6 = b->k6;');
    lines.push('  obj->k7 = b->k7;');
    lines.push('  obj->k8 = b->k8;');
    lines.push('  obj->v1 = b->v1;');
    lines.push('  obj->v2 = b->v2;');
    lines.push('  obj->v3 = b->v3;');
    lines.push('  obj->v4 = b->v4;');
    lines.push('  obj->v5 = b->v5;');
    lines.push('  obj->v6 = b->v6;');
    lines.push('  obj->v7 = b->v7;');
    lines.push('  obj->v8 = b->v8;');
    lines.push('  delete b;');
    lines.push('  return (void*)obj;');
    lines.push('}');
  }

  return lines.join('\n');
}

function collectArrayLiteralArities(tree) {
  const simpleArities = new Set();
  let requiresBuilderHooks = false;

  _deps().walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal' || node.name !== 'arrayLiteral') {
      return;
    }

    const arrayInfo = _deps().extractArrayLiteralElements(node);
    if (arrayInfo.hasSpread || arrayInfo.hasElision || arrayInfo.values.length > 4) {
      requiresBuilderHooks = true;
      return;
    }
    simpleArities.add(arrayInfo.values.length);
  });

  return {
    simpleArities,
    requiresBuilderHooks
  };
}

function emitArrayLiteralRuntimeDeclsCpp(tree) {
  const stats = collectArrayLiteralArities(tree);
  if (stats.simpleArities.size === 0 && !stats.requiresBuilderHooks) {
    return '';
  }

  const maxArity = stats.simpleArities.size > 0
    ? Math.min(4, Math.max(...Array.from(stats.simpleArities.values())))
    : -1;
  const decls = [];

  if (maxArity >= 0) {
    for (let arity = 0; arity <= maxArity; arity += 1) {
      if (arity === 0) {
        decls.push('extern void* __maia_arr_literal0(void);');
        continue;
      }

      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`long v${i}`);
      }
      decls.push(`extern void* __maia_arr_literal${arity}(${params.join(', ')});`);
    }
  }

  if (stats.requiresBuilderHooks) {
    decls.push('extern void* __maia_arr_builder_begin(void);');
    decls.push('extern void* __maia_arr_builder_push_value(void* builder, long value);');
    decls.push('extern void* __maia_arr_builder_push_hole(void* builder);');
    decls.push('extern void* __maia_arr_builder_spread(void* builder, void* source_array);');
    decls.push('extern void* __maia_arr_builder_end(void* builder);');
  }

  if (stats.simpleArities.size > 0 || stats.requiresBuilderHooks) {
    decls.push('extern long __maia_runtime_value_get_index(void* value, int index);');
    decls.push('extern int __maia_runtime_value_set_index(void* value, int index, long element_value);');
  }

  return decls.join('\n');
}

function emitArrayLiteralRuntimeFallbackCpp(tree) {
  const stats = collectArrayLiteralArities(tree);
  if (stats.simpleArities.size === 0 && !stats.requiresBuilderHooks) {
    return '';
  }

  const maxArity = stats.simpleArities.size > 0
    ? Math.min(4, Math.max(...Array.from(stats.simpleArities.values())))
    : -1;
  const lines = [];

  lines.push('void* __maia_arr_literal0(void) {');
  lines.push('  return __maia_runtime_alloc_value(2, 0, 0, 0);');
  lines.push('}');

  if (maxArity >= 1) {
    for (let arity = 1; arity <= maxArity; arity += 1) {
      const params = [];
      for (let i = 1; i <= arity; i += 1) {
        params.push(`long v${i}`);
      }
      lines.push(`void* __maia_arr_literal${arity}(${params.join(', ')}) {`);
      lines.push(`  __maia_runtime_value* arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, ${arity}, 0, 0);`);
      for (let i = 1; i <= arity; i += 1) {
        lines.push(`  __maia_runtime_value_set_index((void*)arr, ${i - 1}, (long)(v${i}));`);
      }
      lines.push('  return (void*)arr;');
      lines.push('}');
    }
  }

  if (stats.requiresBuilderHooks) {
    lines.push('void* __maia_arr_builder_begin(void) {');
    lines.push('  return __maia_runtime_alloc_value(4, 0, 0, 0);');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_value(void* builder, long value) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  __maia_runtime_value_set_index(builder, b->a, (long)(value));');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_push_hole(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  __maia_runtime_value_set_index(builder, b->a, 0);');
    lines.push('  b->b += 1;');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_spread(void* builder, void* source_array) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  __maia_runtime_value* src = (__maia_runtime_value*)source_array;');
    lines.push('  if (!b) { return builder; }');
    lines.push('  b->c += 1;');
    lines.push('  if (src && src->tag == 2) {');
    lines.push('    for (int i = 0; i < src->a; i++) {');
    lines.push('      __maia_runtime_value_set_index(builder, b->a, __maia_runtime_value_get_index(source_array, i));');
    lines.push('    }');
    lines.push('  }');
    lines.push('  return builder;');
    lines.push('}');
    lines.push('void* __maia_arr_builder_end(void* builder) {');
    lines.push('  __maia_runtime_value* b = (__maia_runtime_value*)builder;');
    lines.push('  __maia_runtime_value* arr = 0;');
    lines.push('  if (!b) { return __maia_arr_literal0(); }');
    lines.push('  arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, b->a, b->b, b->c);');
    lines.push('  for (int i = 0; i < b->a; i++) {');
    lines.push('    __maia_runtime_value_set_index((void*)arr, i, __maia_runtime_value_get_index(builder, i));');
    lines.push('  }');
    lines.push('  if (b->items) { free((void*)b->items); }');
    lines.push('  delete b;');
    lines.push('  return (void*)arr;');
    lines.push('}');
  }

  return lines.join('\n');
}

function collectLambdaSignatures(tree) {
  const syncSignatures = new Map();
  const asyncSignatures = new Map();
  const topLevelBindingNames = _deps().collectTopLevelBindingNames(tree);
  const localFunctionNames = _deps().collectTopLevelFunctionNames(tree);
  const lambdaCompileContext = {
    tree,
    topLevelBindingNames,
    localFunctionNames
  };

  _deps().walk(tree, (node) => {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }

    if (node.name === 'arrowFunction') {
      const arity = _deps().extractLambdaParameterNames(node).length;
      const captureCount = _deps().collectLambdaCaptureNames(node, lambdaCompileContext).length;
      syncSignatures.set(`${arity}:${captureCount}`, { arity, captureCount });
      return;
    }

    if (node.name === 'asyncArrowFunction') {
      const arity = _deps().extractLambdaParameterNames(node).length;
      const captureCount = _deps().collectLambdaCaptureNames(node, lambdaCompileContext).length;
      asyncSignatures.set(`${arity}:${captureCount}`, { arity, captureCount });
    }
  });

  return { syncSignatures, asyncSignatures };
}

function emitLambdaRuntimeDeclsCpp(tree) {
  const { syncSignatures, asyncSignatures } = collectLambdaSignatures(tree);
  if (syncSignatures.size === 0 && asyncSignatures.size === 0) {
    return '';
  }

  const decls = [];
  for (const signature of Array.from(syncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = _deps().getLambdaRuntimeHookName(signature.arity, signature.captureCount, false);
    if (signature.captureCount === 0) {
      decls.push(`extern void* ${hookName}(void);`);
      continue;
    }

    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    decls.push(`extern void* ${hookName}(${params.join(', ')});`);
  }
  for (const signature of Array.from(asyncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = _deps().getLambdaRuntimeHookName(signature.arity, signature.captureCount, true);
    if (signature.captureCount === 0) {
      decls.push(`extern void* ${hookName}(void);`);
      continue;
    }

    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    decls.push(`extern void* ${hookName}(${params.join(', ')});`);
  }

  return decls.join('\n');
}

function emitLambdaRuntimeFallbackCpp(tree) {
  const { syncSignatures, asyncSignatures } = collectLambdaSignatures(tree);
  if (syncSignatures.size === 0 && asyncSignatures.size === 0) {
    return '';
  }

  const lines = [];

  for (const signature of Array.from(syncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = _deps().getLambdaRuntimeHookName(signature.arity, signature.captureCount, false);
    const functionId = _deps().getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, false);
    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    lines.push(`void* ${hookName}(${params.length > 0 ? params.join(', ') : 'void'}) {`);
    if (signature.captureCount > 0) {
      if (signature.captureCount > 4) {
        lines.push(`  int extra_captures[${signature.captureCount - 4}];`);
        for (let i = 5; i <= signature.captureCount; i += 1) {
          lines.push(`  extra_captures[${i - 5}] = c${i};`);
        }
        lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 0, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, ${signature.captureCount - 4}, extra_captures);`);
        lines.push('}');
        continue;
      }
      lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 0, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, 0, 0);`);
      lines.push('}');
      continue;
    }
    for (let i = 1; i <= signature.captureCount; i += 1) {
      lines.push(`  (void)c${i};`);
    }
    lines.push(`  return __maia_runtime_alloc_value(3, ${signature.arity}, 0, ${signature.captureCount});`);
    lines.push('}');
  }

  for (const signature of Array.from(asyncSignatures.values()).sort((a, b) => {
    if (a.arity !== b.arity) {
      return a.arity - b.arity;
    }
    return a.captureCount - b.captureCount;
  })) {
    const hookName = _deps().getLambdaRuntimeHookName(signature.arity, signature.captureCount, true);
    const functionId = _deps().getLambdaRuntimeFunctionId(signature.arity, signature.captureCount, true);
    const params = [];
    for (let i = 1; i <= signature.captureCount; i += 1) {
      params.push(`int c${i}`);
    }
    lines.push(`void* ${hookName}(${params.length > 0 ? params.join(', ') : 'void'}) {`);
    if (signature.captureCount > 0) {
      if (signature.captureCount > 4) {
        lines.push(`  int extra_captures[${signature.captureCount - 4}];`);
        for (let i = 5; i <= signature.captureCount; i += 1) {
          lines.push(`  extra_captures[${i - 5}] = c${i};`);
        }
        lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 1, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, ${signature.captureCount - 4}, extra_captures);`);
        lines.push('}');
        continue;
      }
      lines.push(`  return __maia_runtime_alloc_lambda_value(${functionId}, ${signature.arity}, 1, ${signature.captureCount}, ${signature.captureCount >= 1 ? 'c1' : '0'}, ${signature.captureCount >= 2 ? 'c2' : '0'}, ${signature.captureCount >= 3 ? 'c3' : '0'}, ${signature.captureCount >= 4 ? 'c4' : '0'}, 0, 0);`);
      lines.push('}');
      continue;
    }
    for (let i = 1; i <= signature.captureCount; i += 1) {
      lines.push(`  (void)c${i};`);
    }
    lines.push(`  return __maia_runtime_alloc_value(3, ${signature.arity}, 1, ${signature.captureCount});`);
    lines.push('}');
  }

  return lines.join('\n');
}



function createRuntimeEmitters(deps) {
  _reDeps = deps;
  return {
    collectObjectLiteralArities,
    emitObjectLiteralRuntimeDeclsCpp,
    emitSharedRuntimeFallbackHelpersCpp,
    emitObjectLiteralRuntimeFallbackCpp,
    collectArrayLiteralArities,
    emitArrayLiteralRuntimeDeclsCpp,
    emitArrayLiteralRuntimeFallbackCpp,
    collectLambdaSignatures,
    emitLambdaRuntimeDeclsCpp,
    emitLambdaRuntimeFallbackCpp
  };
}

module.exports = { createRuntimeEmitters };
