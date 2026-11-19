'use strict';

const TYPED_ARRAY_SPECS = {
  Int32Array: { elemSize: 4, isSigned: 1 },
  Uint32Array: { elemSize: 4, isSigned: 0 },
  Int16Array: { elemSize: 2, isSigned: 1 },
  Uint16Array: { elemSize: 2, isSigned: 0 },
  Int8Array: { elemSize: 1, isSigned: 1 },
  Uint8Array: { elemSize: 1, isSigned: 0 }
};

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

function analyzeAtomicsUsage(tree) {
  const plan = {
    enabled: false
  };
  if (!tree || typeof tree !== 'object') {
    return plan;
  }

  walkAst(tree, (node) => {
    if (plan.enabled || !node || node.kind !== 'terminal') {
      return;
    }
    if (node.token !== 'Identifier' && node.token !== 'IdentifierName' && node.token !== 'TOKEN_identifier') {
      return;
    }
    const val = node.value;
    if (val === 'SharedArrayBuffer' || val === 'Atomics' || Object.prototype.hasOwnProperty.call(TYPED_ARRAY_SPECS, val)) {
      plan.enabled = true;
    }
  });

  return plan;
}

function emitAtomicsRuntimeHelpersCpp() {
  return [
    'static void* __maia_sab_new(int byte_length) {',
    '  if (byte_length < 0) { byte_length = 0; }',
    '  int word_count = (byte_length + 3) / 4;',
    '  if (word_count < 1) { word_count = 1; }',
    '  int* buf = new int[word_count];',
    '  int i = 0;',
    '  while (i < word_count) { buf[i] = 0; i = i + 1; }',
    '  __maia_runtime_value* sab = (__maia_runtime_value*)__maia_runtime_alloc_value(7, byte_length, 0, 0);',
    '  sab->closure_env = (void*)buf;',
    '  return (void*)sab;',
    '}',
    'static void* __maia_typed_array_from_sab(void* sab_ptr, int elem_size, int is_signed, int byte_offset, int has_len, int explicit_len) {',
    '  __maia_runtime_value* sab = (__maia_runtime_value*)sab_ptr;',
    '  int total_bytes = sab ? sab->a : 0;',
    '  int avail = total_bytes - byte_offset;',
    '  if (avail < 0) { avail = 0; }',
    '  int length = has_len ? explicit_len : (avail / elem_size);',
    '  if (length < 0) { length = 0; }',
    '  __maia_runtime_value* ta = (__maia_runtime_value*)__maia_runtime_alloc_value(8, length, elem_size, is_signed);',
    '  ta->fn_id = byte_offset;',
    '  ta->closure_env = sab_ptr;',
    '  return (void*)ta;',
    '}',
    'static void* __maia_typed_array_from_len(int length, int elem_size, int is_signed) {',
    '  if (length < 0) { length = 0; }',
    '  void* sab = __maia_sab_new(length * elem_size);',
    '  return __maia_typed_array_from_sab(sab, elem_size, is_signed, 0, 1, length);',
    '}',
    'static long __maia_typed_array_read(void* ta_ptr, int index) {',
    '  __maia_runtime_value* ta = (__maia_runtime_value*)ta_ptr;',
    '  if (!ta || ta->tag != 8 || index < 0 || index >= ta->a) { return 0; }',
    '  __maia_runtime_value* sab = (__maia_runtime_value*)ta->closure_env;',
    '  if (!sab || !sab->closure_env) { return 0; }',
    '  int* words = (int*)sab->closure_env;',
    '  int elem_size = ta->b;',
    '  int is_signed = ta->c;',
    '  int byte_idx = ta->fn_id + index * elem_size;',
    '  if (elem_size == 4) {',
    '    int raw = words[byte_idx >> 2];',
    '    if (is_signed) { return (long)raw; }',
    '    return (long)((unsigned int)raw);',
    '  }',
    '  if (elem_size == 2) {',
    '    int shift = (byte_idx & 2) * 8;',
    '    int raw16 = (words[byte_idx >> 2] >> shift) & 65535;',
    '    if (is_signed && (raw16 & 32768)) { raw16 = raw16 - 65536; }',
    '    return (long)raw16;',
    '  }',
    '  int shift8 = (byte_idx & 3) * 8;',
    '  int raw8 = (words[byte_idx >> 2] >> shift8) & 255;',
    '  if (is_signed && (raw8 & 128)) { raw8 = raw8 - 256; }',
    '  return (long)raw8;',
    '}',
    'static long __maia_typed_array_write(void* ta_ptr, int index, long val) {',
    '  __maia_runtime_value* ta = (__maia_runtime_value*)ta_ptr;',
    '  if (!ta || ta->tag != 8 || index < 0 || index >= ta->a) { return val; }',
    '  __maia_runtime_value* sab = (__maia_runtime_value*)ta->closure_env;',
    '  if (!sab || !sab->closure_env) { return val; }',
    '  int* words = (int*)sab->closure_env;',
    '  int elem_size = ta->b;',
    '  int byte_idx = ta->fn_id + index * elem_size;',
    '  if (elem_size == 4) {',
    '    words[byte_idx >> 2] = (int)val;',
    '  } else if (elem_size == 2) {',
    '    int shift = (byte_idx & 2) * 8;',
    '    int mask = 65535 << shift;',
    '    words[byte_idx >> 2] = (words[byte_idx >> 2] & (~mask)) | (((int)val & 65535) << shift);',
    '  } else {',
    '    int shift8 = (byte_idx & 3) * 8;',
    '    int mask8 = 255 << shift8;',
    '    words[byte_idx >> 2] = (words[byte_idx >> 2] & (~mask8)) | (((int)val & 255) << shift8);',
    '  }',
    '  return val;',
    '}',
    'static long __maia_atomics_load(void* ta, int idx) {',
    '  return __maia_typed_array_read(ta, idx);',
    '}',
    'static long __maia_atomics_store(void* ta, int idx, long val) {',
    '  __maia_typed_array_write(ta, idx, val);',
    '  return __maia_typed_array_read(ta, idx);',
    '}',
    'static long __maia_atomics_add(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, old_val + val);',
    '  return old_val;',
    '}',
    'static long __maia_atomics_sub(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, old_val - val);',
    '  return old_val;',
    '}',
    'static long __maia_atomics_and(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, (long)((int)old_val & (int)val));',
    '  return old_val;',
    '}',
    'static long __maia_atomics_or(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, (long)((int)old_val | (int)val));',
    '  return old_val;',
    '}',
    'static long __maia_atomics_xor(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, (long)((int)old_val ^ (int)val));',
    '  return old_val;',
    '}',
    'static long __maia_atomics_exchange(void* ta, int idx, long val) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  __maia_typed_array_write(ta, idx, val);',
    '  return old_val;',
    '}',
    'static long __maia_atomics_compareExchange(void* ta, int idx, long expected, long replacement) {',
    '  long old_val = __maia_typed_array_read(ta, idx);',
    '  if (old_val == expected) {',
    '    __maia_typed_array_write(ta, idx, replacement);',
    '  }',
    '  return old_val;',
    '}',
    'static int __maia_atomics_isLockFree(int size) {',
    '  return (size == 1 || size == 2 || size == 4) ? 1 : 0;',
    '}',
    'static void* __maia_atomics_wait(void* ta, int idx, long expected, int has_timeout, int timeout_ms) {',
    '  (void)has_timeout;',
    '  (void)timeout_ms;',
    '  long cur = __maia_typed_array_read(ta, idx);',
    '  if (cur != expected) {',
    '    return (void*)"not-equal";',
    '  }',
    '  return (void*)"timed-out";',
    '}',
    'static int __maia_atomics_notify(void* ta, int idx, int count) {',
    '  (void)ta;',
    '  (void)idx;',
    '  (void)count;',
    '  return 0;',
    '}'
  ].join('\n');
}

module.exports = {
  TYPED_ARRAY_SPECS,
  analyzeAtomicsUsage,
  emitAtomicsRuntimeHelpersCpp
};
