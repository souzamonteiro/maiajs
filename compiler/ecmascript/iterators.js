'use strict';

/**
 * Runtime and AST analysis helpers for ES6+ iterators and generators:
 * - [Symbol.iterator] on objects, arrays, and generators
 * - for...of loops over arrays, generators, and custom iterables
 * - function* generators with yield, yield*, next(val), and return
 */

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkAst(child, visitor);
    }
  }
}

function isForOfStatementNode(node) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'iterationStatement') {
    return false;
  }
  return (node.children || []).some(
    (c) => c && c.kind === 'terminal' && String(c.value || '').trim() === 'of'
  );
}

function isSymbolIteratorPropertyNameNode(node) {
  if (!node || node.kind !== 'nonterminal' || node.name !== 'computedPropertyName') {
    return false;
  }
  const tokens = [];
  walkAst(node, (n) => {
    if (n && n.kind === 'terminal' && n.value !== undefined && n.value !== null) {
      const v = String(n.value).trim();
      if (v) { tokens.push(v); }
    }
  });
  const joined = tokens.join('');
  return joined === '[Symbol.iterator]' || joined.includes('Symbol.iterator');
}

function analyzeIteratorUsage(tree) {
  let hasGenerators = false;
  let hasForOf = false;
  let hasSymbolIterator = false;
  let hasNextCall = false;

  walkAst(tree, (node) => {
    if (!node || node.kind !== 'nonterminal') {
      return;
    }
    if (node.name === 'generatorDeclaration' || node.name === 'generatorExpression' || node.name === 'yieldExpression') {
      hasGenerators = true;
    }
    if (isForOfStatementNode(node)) {
      hasForOf = true;
    }
    if (node.name === 'computedPropertyName' && isSymbolIteratorPropertyNameNode(node)) {
      hasSymbolIterator = true;
    }
    if (node.name === 'callExpression') {
      const textTokens = [];
      walkAst(node, (n) => {
        if (n && n.kind === 'terminal' && n.value) {
          textTokens.push(String(n.value).trim());
        }
      });
      if (textTokens.includes('next')) {
        hasNextCall = true;
      }
    }
  });

  const enabled = hasGenerators || hasForOf || hasSymbolIterator;
  return {
    enabled,
    hasGenerators,
    hasForOf,
    hasSymbolIterator,
    hasNextCall
  };
}

function emitIteratorRuntimeHelpersCpp(options = {}) {
  const generators = Array.isArray(options.generators) ? options.generators : [];
  const lines = [
    'static void* __maia_this_ptr = 0;',
    'static void* __maia_iter_make_result(long val, int done) {',
    '  __maia_runtime_value* r = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 2, 0, 0);',
    '  r->k1 = (char*)"value";',
    '  r->v1 = val;',
    '  r->k2 = (char*)"done";',
    '  r->v2 = (long)(done ? 1 : 0);',
    '  return (void*)r;',
    '}',
    'static int __maia_iter_result_done(void* res_ptr) {',
    '  if (!res_ptr) { return 1; }',
    '  return (int)__maia_runtime_value_get_property(res_ptr, (void*)"done");',
    '}',
    'static long __maia_iter_result_value(void* res_ptr) {',
    '  if (!res_ptr) { return 0; }',
    '  return __maia_runtime_value_get_property(res_ptr, (void*)"value");',
    '}',
    'static void* __maia_iter_make_generator(int gen_id, void* frame) {',
    '  __maia_runtime_value* g = (__maia_runtime_value*)__maia_runtime_alloc_value(5, 0, 0, 0);',
    '  g->fn_id = gen_id;',
    '  g->closure_env = frame;',
    '  return (void*)g;',
    '}',
    'static void* __maia_gen_dispatch(int gen_id, void* frame, int sent_val) {'
  ];

  if (generators.length > 0) {
    lines.push('  switch (gen_id) {');
    for (const gen of generators) {
      lines.push(`    case ${gen.genId}: return ${gen.stepName}(frame, sent_val);`);
    }
    lines.push('    default: return __maia_iter_make_result(0, 1);');
    lines.push('  }');
  } else {
    lines.push('  (void)gen_id; (void)frame; (void)sent_val;');
    lines.push('  return __maia_iter_make_result(0, 1);');
  }
  lines.push('}');

  lines.push(
    'static void* __maia_iter_get_iterator(void* iterable_ptr) {',
    '  if (!iterable_ptr) { return 0; }',
    '  __maia_runtime_value* v = (__maia_runtime_value*)iterable_ptr;',
    '  if (v->tag == 5 || v->tag == 6) { return iterable_ptr; }',
    '  if (v->tag == 2) {',
    '    __maia_runtime_value* it = (__maia_runtime_value*)__maia_runtime_alloc_value(6, 0, 0, 0);',
    '    it->closure_env = iterable_ptr;',
    '    return (void*)it;',
    '  }',
    '  long sym_fn = __maia_runtime_value_get_property(iterable_ptr, (void*)"__maia_sym_iterator");',
    '  if (sym_fn) {',
    '    void* prev_this = __maia_this_ptr;',
    '    __maia_this_ptr = iterable_ptr;',
    '    int iter_res = __maia_closure_call_i32_0((void*)sym_fn);',
    '    __maia_this_ptr = prev_this;',
    '    return (void*)iter_res;',
    '  }',
    '  long next_fn = __maia_runtime_value_get_property(iterable_ptr, (void*)"next");',
    '  if (next_fn) { return iterable_ptr; }',
    '  return 0;',
    '}',
    'static void* __maia_iter_next(void* iter_ptr, int sent_val) {',
    '  if (!iter_ptr) { return __maia_iter_make_result(0, 1); }',
    '  __maia_runtime_value* it = (__maia_runtime_value*)iter_ptr;',
    '  if (it->tag == 5) {',
    '    return __maia_gen_dispatch(it->fn_id, it->closure_env, sent_val);',
    '  }',
    '  if (it->tag == 6) {',
    '    __maia_runtime_value* arr = (__maia_runtime_value*)it->closure_env;',
    '    if (!arr || it->a >= arr->a) { return __maia_iter_make_result(0, 1); }',
    '    long elem = arr->items ? arr->items[it->a] : 0;',
    '    it->a = it->a + 1;',
    '    return __maia_iter_make_result(elem, 0);',
    '  }',
    '  long next_fn = __maia_runtime_value_get_property(iter_ptr, (void*)"next");',
    '  if (next_fn) {',
    '    void* prev_this = __maia_this_ptr;',
    '    __maia_this_ptr = iter_ptr;',
    '    int res = __maia_closure_call_i32_1((void*)next_fn, sent_val);',
    '    __maia_this_ptr = prev_this;',
    '    return (void*)res;',
    '  }',
    '  return __maia_iter_make_result(0, 1);',
    '}'
  );

  return lines;
}

module.exports = {
  analyzeIteratorUsage,
  isForOfStatementNode,
  isSymbolIteratorPropertyNameNode,
  emitIteratorRuntimeHelpersCpp
};
