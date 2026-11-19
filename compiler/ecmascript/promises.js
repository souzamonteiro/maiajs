'use strict';

/**
 * Analyzes AST for general Promise / Timer / async-await usage that requires
 * the dynamic Promise & Event Loop runtime.
 */
function analyzePromiseUsage(tree, helpers) {
  const { findFirstIdentifierValue } = helpers;
  let usesNewPromise = false;
  let usesPromiseStatic = false;
  let usesPromiseMethods = false;
  let usesSetTimeout = false;
  let usesAsyncFunction = false;
  let usesAwait = false;

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'nonterminal') {
      if (node.name === 'asyncFunctionDeclaration' || node.name === 'asyncFunctionExpression' || node.name === 'asyncArrowFunction') {
        usesAsyncFunction = true;
      } else if (node.name === 'awaitExpression') {
        usesAwait = true;
      } else if (node.name === 'memberExpression') {
        const ch = node.children || [];
        if (ch[0] && ch[0].kind === 'terminal' && ch[0].token === 'TOKEN_new') {
          const id = findFirstIdentifierValue(ch[1] || node);
          if (id === 'Promise') {
            usesNewPromise = true;
          }
        }
      } else if (node.name === 'callExpression') {
        const textIds = [];
        (function collectIds(n) {
          if (!n || typeof n !== 'object') return;
          if (n.kind === 'nonterminal' && n.name === 'arguments') return;
          if (n.kind === 'terminal' && (n.token === 'TOKEN_identifier' || n.value === 'then' || n.value === 'catch' || n.value === 'finally')) {
            textIds.push(n.value);
          }
          for (const sc of n.children || []) collectIds(sc);
        })(node);
        if (textIds[0] === 'Promise' && ['resolve', 'reject', 'all', 'race'].includes(textIds[1])) {
          usesPromiseStatic = true;
        }
        if (textIds[0] === 'setTimeout') {
          usesSetTimeout = true;
        }
        if (textIds.some((id) => id === 'then' || id === 'catch' || id === 'finally')) {
          usesPromiseMethods = true;
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c);
    }
  }

  walk(tree);

  const enabled = usesNewPromise
    || usesSetTimeout
    || usesPromiseMethods
    || (usesPromiseStatic && usesAsyncFunction)
    || (usesAsyncFunction && usesAwait && (usesNewPromise || usesPromiseStatic || usesSetTimeout));
  return {
    enabled,
    usesNewPromise,
    usesPromiseStatic,
    usesPromiseMethods,
    usesSetTimeout,
    usesAsyncFunction,
    usesAwait
  };
}

/**
 * Emits C++98-compatible Promise, FIFO Microtask Queue, Timer Queue,
 * and Event Loop Drain runtime helpers.
 */
function emitPromiseRuntimeHelpersCpp() {
  const lines = [];

    lines.push('struct __maia_promise_reaction {');
  lines.push('  void* on_fulfilled;');
  lines.push('  void* on_rejected;');
  lines.push('  void* on_finally;');
  lines.push('  void* next_promise;');
  lines.push('  int is_finally;');
  lines.push('  struct __maia_promise_reaction* next;');
  lines.push('};');

  lines.push('struct __maia_promise {');
  lines.push('  int tag;');
  lines.push('  int state;');
  lines.push('  int value;');
  lines.push('  int handled;');
  lines.push('  struct __maia_promise_reaction* head;');
  lines.push('  struct __maia_promise_reaction* tail;');
  lines.push('};');

  lines.push('struct __maia_promise_reg {');
  lines.push('  void* ptr;');
  lines.push('  struct __maia_promise_reg* next;');
  lines.push('};');

  lines.push('struct __maia_task_node {');
  lines.push('  int kind;');
  lines.push('  void* arg0;');
  lines.push('  void* arg1;');
  lines.push('  int delay_ms;');
  lines.push('  struct __maia_task_node* next;');
  lines.push('};');

  lines.push('static __maia_promise_reg* __maia_all_promises = 0;');
  lines.push('static __maia_task_node* __maia_micro_head = 0;');
  lines.push('static __maia_task_node* __maia_micro_tail = 0;');
  lines.push('static __maia_task_node* __maia_timer_head = 0;');
  lines.push('static __maia_task_node* __maia_timer_tail = 0;');

  lines.push('static int __maia_promise_resolve_value(void* p_ptr, int val);');
  lines.push('static int __maia_promise_reject_value(void* p_ptr, int reason);');
  lines.push('static void* __maia_promise_then(void* p_ptr, void* on_fulfilled, void* on_rejected);');
  lines.push('static int __maia_promise_all_on_resolve(void* state_ptr, int val);');
  lines.push('static int __maia_promise_all_on_reject(void* state_ptr, int reason);');
  lines.push('static int __maia_promise_race_on_resolve(void* p_ptr, int val);');
  lines.push('static int __maia_promise_race_on_reject(void* p_ptr, int reason);');

  lines.push('static void* __maia_promise_zalloc(void) {');
  lines.push('  int* raw = new int[16];');
  lines.push('  int i = 0;');
  lines.push('  for (i = 0; i < 16; i = i + 1) { raw[i] = 0; }');
  lines.push('  return (void*)raw;');
  lines.push('}');
  lines.push('static int __maia_is_promise(int val) {');
  lines.push('  __maia_promise_reg* cur = __maia_all_promises;');
  lines.push('  void* target = (void*)val;');
  lines.push('  if (!target) { return 0; }');
  lines.push('  while (cur) {');
  lines.push('    if (cur->ptr == target) { return 1; }');
  lines.push('    cur = cur->next;');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static void* __maia_promise_alloc(void) {');
  lines.push('  __maia_promise* p = (__maia_promise*)__maia_promise_zalloc();');
  lines.push('  p->tag = 5;');
  lines.push('  p->state = 0;');
  lines.push('  p->value = 0;');
  lines.push('  p->handled = 0;');
  lines.push('  p->head = 0;');
  lines.push('  p->tail = 0;');
  lines.push('  __maia_promise_reg* reg = (__maia_promise_reg*)__maia_promise_zalloc();');
  lines.push('  reg->ptr = (void*)p;');
  lines.push('  reg->next = __maia_all_promises;');
  lines.push('  __maia_all_promises = reg;');
  lines.push('  return (void*)p;');
  lines.push('}');

  lines.push('static void __maia_microtask_enqueue_reaction(void* p_ptr, void* r_ptr) {');
  lines.push('  __maia_task_node* n = (__maia_task_node*)__maia_promise_zalloc();');
  lines.push('  n->kind = 0;');
  lines.push('  n->arg0 = p_ptr;');
  lines.push('  n->arg1 = r_ptr;');
  lines.push('  n->delay_ms = 0;');
  lines.push('  n->next = 0;');
  lines.push('  if (!__maia_micro_tail) {');
  lines.push('    __maia_micro_head = n;');
  lines.push('    __maia_micro_tail = n;');
  lines.push('  } else {');
  lines.push('    __maia_micro_tail->next = n;');
  lines.push('    __maia_micro_tail = n;');
  lines.push('  }');
  lines.push('}');

  lines.push('static int __maia_set_timeout(void* fn_ptr, int delay_ms) {');
  lines.push('  __maia_task_node* n = (__maia_task_node*)__maia_promise_zalloc();');
  lines.push('  n->kind = 1;');
  lines.push('  n->arg0 = fn_ptr;');
  lines.push('  n->arg1 = 0;');
  lines.push('  n->delay_ms = delay_ms;');
  lines.push('  n->next = 0;');
  lines.push('  if (!__maia_timer_head || delay_ms < __maia_timer_head->delay_ms) {');
  lines.push('    n->next = __maia_timer_head;');
  lines.push('    __maia_timer_head = n;');
  lines.push('    if (!__maia_timer_tail) { __maia_timer_tail = n; }');
  lines.push('  } else {');
  lines.push('    __maia_task_node* cur = __maia_timer_head;');
  lines.push('    while (cur->next && cur->next->delay_ms <= delay_ms) {');
  lines.push('      cur = cur->next;');
  lines.push('    }');
  lines.push('    n->next = cur->next;');
  lines.push('    cur->next = n;');
  lines.push('    if (!n->next) { __maia_timer_tail = n; }');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static void __maia_promise_schedule_reactions(__maia_promise* p) {');
  lines.push('  __maia_promise_reaction* r = p->head;');
  lines.push('  p->head = 0;');
  lines.push('  p->tail = 0;');
  lines.push('  while (r) {');
  lines.push('    __maia_promise_reaction* next_r = r->next;');
  lines.push('    r->next = 0;');
  lines.push('    __maia_microtask_enqueue_reaction((void*)p, (void*)r);');
  lines.push('    r = next_r;');
  lines.push('  }');
  lines.push('}');

  lines.push('static int __maia_promise_resolve_value(void* p_ptr, int val) {');
  lines.push('  __maia_promise* p = (__maia_promise*)p_ptr;');
  lines.push('  if (!p || p->state != 0) { return 0; }');
  lines.push('  if (val == (int)p_ptr) {');
  lines.push('    return __maia_promise_reject_value(p_ptr, 0);');
  lines.push('  }');
  lines.push('  if (__maia_is_promise(val)) {');
  lines.push('    void* res_fn = __maia_closure_alloc(-1, 1, 0, p_ptr);');
  lines.push('    void* rej_fn = __maia_closure_alloc(-2, 1, 0, p_ptr);');
  lines.push('    __maia_promise_then((void*)val, res_fn, rej_fn);');
  lines.push('    return 0;');
  lines.push('  }');
  lines.push('  p->state = 1;');
  lines.push('  p->value = val;');
  lines.push('  __maia_promise_schedule_reactions(p);');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static int __maia_promise_reject_value(void* p_ptr, int reason) {');
  lines.push('  __maia_promise* p = (__maia_promise*)p_ptr;');
  lines.push('  if (!p || p->state != 0) { return 0; }');
  lines.push('  p->state = 2;');
  lines.push('  p->value = reason;');
  lines.push('  __maia_promise_schedule_reactions(p);');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static void* __maia_promise_new(void* executor_fn) {');
  lines.push('  void* p = __maia_promise_alloc();');
  lines.push('  if (executor_fn) {');
  lines.push('    void* res_fn = __maia_closure_alloc(-1, 1, 0, p);');
  lines.push('    void* rej_fn = __maia_closure_alloc(-2, 1, 0, p);');
  lines.push('    __maia_closure_call_i32_2(executor_fn, (int)res_fn, (int)rej_fn);');
  lines.push('  }');
  lines.push('  return p;');
  lines.push('}');

  lines.push('static void* __maia_promise_static_resolve(int val) {');
  lines.push('  if (__maia_is_promise(val)) { return (void*)val; }');
  lines.push('  void* p = __maia_promise_alloc();');
  lines.push('  __maia_promise_resolve_value(p, val);');
  lines.push('  return p;');
  lines.push('}');

  lines.push('static void* __maia_promise_static_reject(int reason) {');
  lines.push('  void* p = __maia_promise_alloc();');
  lines.push('  __maia_promise_reject_value(p, reason);');
  lines.push('  return p;');
  lines.push('}');

  lines.push('static void* __maia_promise_then(void* p_ptr, void* on_fulfilled, void* on_rejected) {');
  lines.push('  __maia_promise* p = (__maia_promise*)p_ptr;');
  lines.push('  void* next_p = __maia_promise_alloc();');
  lines.push('  if (!p) {');
  lines.push('    __maia_promise_resolve_value(next_p, 0);');
  lines.push('    return next_p;');
  lines.push('  }');
  lines.push('  p->handled = 1;');
  lines.push('  __maia_promise_reaction* r = (__maia_promise_reaction*)__maia_promise_zalloc();');
  lines.push('  r->on_fulfilled = on_fulfilled;');
  lines.push('  r->on_rejected = on_rejected;');
  lines.push('  r->on_finally = 0;');
  lines.push('  r->next_promise = next_p;');
  lines.push('  r->is_finally = 0;');
  lines.push('  r->next = 0;');
  lines.push('  if (p->state == 0) {');
  lines.push('    if (!p->tail) { p->head = r; p->tail = r; } else { p->tail->next = r; p->tail = r; }');
  lines.push('  } else {');
  lines.push('    __maia_microtask_enqueue_reaction(p_ptr, (void*)r);');
  lines.push('  }');
  lines.push('  return next_p;');
  lines.push('}');

  lines.push('static void* __maia_promise_catch(void* p_ptr, void* on_rejected) {');
  lines.push('  return __maia_promise_then(p_ptr, 0, on_rejected);');
  lines.push('}');

  lines.push('static void* __maia_promise_finally(void* p_ptr, void* on_finally) {');
  lines.push('  __maia_promise* p = (__maia_promise*)p_ptr;');
  lines.push('  void* next_p = __maia_promise_alloc();');
  lines.push('  if (!p) {');
  lines.push('    __maia_promise_resolve_value(next_p, 0);');
  lines.push('    return next_p;');
  lines.push('  }');
  lines.push('  p->handled = 1;');
  lines.push('  __maia_promise_reaction* r = (__maia_promise_reaction*)__maia_promise_zalloc();');
  lines.push('  r->on_fulfilled = 0;');
  lines.push('  r->on_rejected = 0;');
  lines.push('  r->on_finally = on_finally;');
  lines.push('  r->next_promise = next_p;');
  lines.push('  r->is_finally = 1;');
  lines.push('  r->next = 0;');
  lines.push('  if (p->state == 0) {');
  lines.push('    if (!p->tail) { p->head = r; p->tail = r; } else { p->tail->next = r; p->tail = r; }');
  lines.push('  } else {');
  lines.push('    __maia_microtask_enqueue_reaction(p_ptr, (void*)r);');
  lines.push('  }');
  lines.push('  return next_p;');
  lines.push('}');

  lines.push('struct __maia_promise_all_shared {');
  lines.push('  void* result_promise;');
  lines.push('  __maia_runtime_value* out_arr;');
  lines.push('  int remaining;');
  lines.push('  int settled;');
  lines.push('};');
  lines.push('struct __maia_promise_all_item {');
  lines.push('  __maia_promise_all_shared* shared;');
  lines.push('  int index;');
  lines.push('};');

  lines.push('static int __maia_promise_all_on_resolve(void* item_ptr, int val) {');
  lines.push('  __maia_promise_all_item* item = (__maia_promise_all_item*)item_ptr;');
  lines.push('  __maia_promise_all_shared* sh = item->shared;');
  lines.push('  if (sh->settled) { return 0; }');
  lines.push('  sh->out_arr->items[item->index] = (long)val;');
  lines.push('  sh->remaining = sh->remaining - 1;');
  lines.push('  if (sh->remaining == 0) {');
  lines.push('    sh->settled = 1;');
  lines.push('    __maia_promise_resolve_value(sh->result_promise, (int)(void*)sh->out_arr);');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static int __maia_promise_all_on_reject(void* sh_ptr, int reason) {');
  lines.push('  __maia_promise_all_shared* sh = (__maia_promise_all_shared*)sh_ptr;');
  lines.push('  if (sh->settled) { return 0; }');
  lines.push('  sh->settled = 1;');
  lines.push('  __maia_promise_reject_value(sh->result_promise, reason);');
  lines.push('  return 0;');
  lines.push('}');

  lines.push('static void* __maia_promise_all(void* arr_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  int len = arr ? arr->a : 0;');
  lines.push('  void* res_p = __maia_promise_alloc();');
  lines.push('  __maia_runtime_value* out_arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, len, 0, 0);');
  lines.push('  if (len <= 0) {');
  lines.push('    __maia_promise_resolve_value(res_p, (int)(void*)out_arr);');
  lines.push('    return res_p;');
  lines.push('  }');
  lines.push('  __maia_promise_all_shared* sh = (__maia_promise_all_shared*)__maia_promise_zalloc();');
  lines.push('  sh->result_promise = res_p;');
  lines.push('  sh->out_arr = out_arr;');
  lines.push('  sh->remaining = len;');
  lines.push('  sh->settled = 0;');
  lines.push('  int i = 0;');
  lines.push('  for (i = 0; i < len; i++) {');
  lines.push('    void* item_p = __maia_promise_static_resolve((int)(arr->items[i]));');
  lines.push('    __maia_promise_all_item* item = (__maia_promise_all_item*)__maia_promise_zalloc();');
  lines.push('    item->shared = sh;');
  lines.push('    item->index = i;');
  lines.push('    void* on_res = __maia_closure_alloc(-3, 1, 0, (void*)item);');
  lines.push('    void* on_rej = __maia_closure_alloc(-4, 1, 0, (void*)sh);');
  lines.push('    __maia_promise_then(item_p, on_res, on_rej);');
  lines.push('  }');
  lines.push('  return res_p;');
  lines.push('}');

  lines.push('static int __maia_promise_race_on_resolve(void* p_ptr, int val) {');
  lines.push('  return __maia_promise_resolve_value(p_ptr, val);');
  lines.push('}');
  lines.push('static int __maia_promise_race_on_reject(void* p_ptr, int reason) {');
  lines.push('  return __maia_promise_reject_value(p_ptr, reason);');
  lines.push('}');

  lines.push('static void* __maia_promise_race(void* arr_ptr) {');
  lines.push('  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;');
  lines.push('  int len = arr ? arr->a : 0;');
  lines.push('  void* res_p = __maia_promise_alloc();');
  lines.push('  int i = 0;');
  lines.push('  for (i = 0; i < len; i++) {');
  lines.push('    void* item_p = __maia_promise_static_resolve((int)(arr->items[i]));');
  lines.push('    void* on_res = __maia_closure_alloc(-5, 1, 0, res_p);');
  lines.push('    void* on_rej = __maia_closure_alloc(-6, 1, 0, res_p);');
  lines.push('    __maia_promise_then(item_p, on_res, on_rej);');
  lines.push('  }');
  lines.push('  return res_p;');
  lines.push('}');

  lines.push('static void __maia_run_reaction(__maia_promise* p, __maia_promise_reaction* r) {');
  lines.push('  if (r->is_finally) {');
  lines.push('    if (r->on_finally) { __maia_closure_call_i32_0(r->on_finally); }');
  lines.push('    if (p->state == 1) {');
  lines.push('      __maia_promise_resolve_value(r->next_promise, p->value);');
  lines.push('    } else {');
  lines.push('      __maia_promise_reject_value(r->next_promise, p->value);');
  lines.push('    }');
  lines.push('    return;');
  lines.push('  }');
  lines.push('  if (p->state == 1) {');
  lines.push('    if (r->on_fulfilled) {');
  lines.push('      int next_val = __maia_closure_call_i32_1(r->on_fulfilled, p->value);');
  lines.push('      __maia_promise_resolve_value(r->next_promise, next_val);');
  lines.push('    } else {');
  lines.push('      __maia_promise_resolve_value(r->next_promise, p->value);');
  lines.push('    }');
  lines.push('  } else {');
  lines.push('    if (r->on_rejected) {');
  lines.push('      int next_val = __maia_closure_call_i32_1(r->on_rejected, p->value);');
  lines.push('      __maia_promise_resolve_value(r->next_promise, next_val);');
  lines.push('    } else {');
  lines.push('      __maia_promise_reject_value(r->next_promise, p->value);');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');

  lines.push('struct __maia_async_resume_env {');
  lines.push('  void* step;');
  lines.push('  void* frame;');
  lines.push('  int is_reject;');
  lines.push('};');
  lines.push('static int __maia_promise_async_resume(void* env_ptr, int val) {');
  lines.push('  __maia_async_resume_env* re = (__maia_async_resume_env*)env_ptr;');
  lines.push('  if (!re || !re->step) { return 0; }');
  lines.push('  int (*fn)(void*, int, int) = (int (*)(void*, int, int))re->step;');
  lines.push('  return fn(re->frame, val, re->is_reject);');
  lines.push('}');
  lines.push('static void* __maia_promise_async_await(int awaited_val, void* step, void* frame) {');
  lines.push('  __maia_async_resume_env* ok_env = (__maia_async_resume_env*)__maia_promise_zalloc();');
  lines.push('  ok_env->step = step;');
  lines.push('  ok_env->frame = frame;');
  lines.push('  ok_env->is_reject = 0;');
  lines.push('  __maia_async_resume_env* err_env = (__maia_async_resume_env*)__maia_promise_zalloc();');
  lines.push('  err_env->step = step;');
  lines.push('  err_env->frame = frame;');
  lines.push('  err_env->is_reject = 1;');
  lines.push('  void* ok_fn = __maia_closure_alloc(-7, 1, 0, (void*)ok_env);');
  lines.push('  void* err_fn = __maia_closure_alloc(-7, 1, 0, (void*)err_env);');
  lines.push('  return __maia_promise_then(__maia_promise_static_resolve(awaited_val), ok_fn, err_fn);');
  lines.push('}');

  lines.push('static int __maia_event_loop_drain(void) {');
  lines.push('  while (__maia_micro_head || __maia_timer_head) {');
  lines.push('    while (__maia_micro_head) {');
  lines.push('      __maia_task_node* t = __maia_micro_head;');
  lines.push('      __maia_micro_head = t->next;');
  lines.push('      if (!__maia_micro_head) { __maia_micro_tail = 0; }');
  lines.push('      __maia_run_reaction((__maia_promise*)t->arg0, (__maia_promise_reaction*)t->arg1);');
  lines.push('    }');
  lines.push('    if (__maia_timer_head) {');
  lines.push('      __maia_task_node* tm = __maia_timer_head;');
  lines.push('      __maia_timer_head = tm->next;');
  lines.push('      if (!__maia_timer_head) { __maia_timer_tail = 0; }');
  lines.push('      if (tm->arg0) { __maia_closure_call_i32_0(tm->arg0); }');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return 0;');
  lines.push('}');

  return lines.join('\n');
}

module.exports = {
  analyzePromiseUsage,
  emitPromiseRuntimeHelpersCpp
};
