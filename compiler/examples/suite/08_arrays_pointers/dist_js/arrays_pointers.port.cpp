extern void __console__log(const char*);

extern "C" int strcmp(const char* a, const char* b);
extern "C" void free(void* ptr);
struct __maia_runtime_value {
  int tag;
  int a;
  int b;
  int c;
  char* k1;
  char* k2;
  char* k3;
  char* k4;
  char* k5;
  char* k6;
  char* k7;
  char* k8;
  long v1;
  long v2;
  long v3;
  long v4;
  long v5;
  long v6;
  long v7;
  long v8;
  long* items;
  int capacity;
};
static void* __maia_runtime_alloc_value(int tag, int a, int b, int c) {
  __maia_runtime_value* v = new __maia_runtime_value();
  v->tag = tag;
  v->a = a;
  v->b = b;
  v->c = c;
  v->k1 = 0;
  v->k2 = 0;
  v->k3 = 0;
  v->k4 = 0;
  v->k5 = 0;
  v->k6 = 0;
  v->k7 = 0;
  v->k8 = 0;
  v->v1 = 0;
  v->v2 = 0;
  v->v3 = 0;
  v->v4 = 0;
  v->v5 = 0;
  v->v6 = 0;
  v->v7 = 0;
  v->v8 = 0;
  v->items = 0;
  v->capacity = 0;
  if ((tag == 2 || tag == 4) && a > 0) {
    v->items = new long[a];
    v->capacity = a;
    for (int i = 0; i < a; i++) { v->items[i] = 0; }
  }
  return (void*)v;
}
static int __maia_runtime_ensure_array_capacity(__maia_runtime_value* v, int needed) {
  int next_capacity = 0;
  long* next_items = 0;
  if (!v || needed <= 0) { return 0; }
  if (v->capacity >= needed) { return 0; }
  next_capacity = v->capacity > 0 ? v->capacity : 4;
  while (next_capacity < needed) { next_capacity *= 2; }
  next_items = new long[next_capacity];
  for (int i = 0; i < next_capacity; i++) { next_items[i] = 0; }
  if (v->items && v->capacity > 0) {
    for (int i = 0; i < v->capacity; i++) { next_items[i] = v->items[i]; }
    free((void*)v->items);
  }
  v->items = next_items;
  v->capacity = next_capacity;
  return 0;
}
static int __maia_runtime_value_length(void* value) {
  __maia_runtime_value* v = (__maia_runtime_value*)value;
  if (!v) { return 0; }
  if (v->tag == 1 || v->tag == 2) { return v->a; }
  return 0;
}
static long __maia_runtime_value_get_index(void* value, int index) {
  __maia_runtime_value* v = (__maia_runtime_value*)value;
  if (!v || (v->tag != 2 && v->tag != 4) || index < 0 || index >= v->a || !v->items) { return 0; }
  return v->items[index];
}
static int __maia_runtime_value_set_index(void* value, int index, long element_value) {
  __maia_runtime_value* v = (__maia_runtime_value*)value;
  if (!v || (v->tag != 2 && v->tag != 4) || index < 0) { return 0; }
  __maia_runtime_ensure_array_capacity(v, index + 1);
  if (!v->items) { return 0; }
  v->items[index] = element_value;
  if (index >= v->a) { v->a = index + 1; }
  return 0;
}
static void* __maia_runtime_arguments_slice(int argc, int start) {
  int length = argc - start;
  if (length < 0) { length = 0; }
  return __maia_runtime_alloc_value(2, length, 0, 0);
}
static long __maia_runtime_value_get_property(void* value, void* key) {
  __maia_runtime_value* v = (__maia_runtime_value*)value;
  const char* property_key = (const char*)key;
  if (!v || !property_key || v->tag != 1) { return 0; }
  if (v->k1 && strcmp(v->k1, property_key) == 0) { return v->v1; }
  if (v->k2 && strcmp(v->k2, property_key) == 0) { return v->v2; }
  if (v->k3 && strcmp(v->k3, property_key) == 0) { return v->v3; }
  if (v->k4 && strcmp(v->k4, property_key) == 0) { return v->v4; }
  if (v->k5 && strcmp(v->k5, property_key) == 0) { return v->v5; }
  if (v->k6 && strcmp(v->k6, property_key) == 0) { return v->v6; }
  if (v->k7 && strcmp(v->k7, property_key) == 0) { return v->v7; }
  if (v->k8 && strcmp(v->k8, property_key) == 0) { return v->v8; }
  return 0;
}
static int __maia_runtime_value_set_property(void* value, const char* key, long property_value) {
  __maia_runtime_value* v = (__maia_runtime_value*)value;
  if (!v || !key || v->tag != 1) { return 0; }
  if (v->k1 && strcmp(v->k1, key) == 0) { v->v1 = property_value; return 0; }
  if (v->k2 && strcmp(v->k2, key) == 0) { v->v2 = property_value; return 0; }
  if (v->k3 && strcmp(v->k3, key) == 0) { v->v3 = property_value; return 0; }
  if (v->k4 && strcmp(v->k4, key) == 0) { v->v4 = property_value; return 0; }
  if (v->k5 && strcmp(v->k5, key) == 0) { v->v5 = property_value; return 0; }
  if (v->k6 && strcmp(v->k6, key) == 0) { v->v6 = property_value; return 0; }
  if (v->k7 && strcmp(v->k7, key) == 0) { v->v7 = property_value; return 0; }
  if (v->k8 && strcmp(v->k8, key) == 0) { v->v8 = property_value; return 0; }
  if (!v->k1) { v->k1 = (char*)key; v->v1 = property_value; v->a += 1; return 0; }
  if (!v->k2) { v->k2 = (char*)key; v->v2 = property_value; v->a += 1; return 0; }
  if (!v->k3) { v->k3 = (char*)key; v->v3 = property_value; v->a += 1; return 0; }
  if (!v->k4) { v->k4 = (char*)key; v->v4 = property_value; v->a += 1; return 0; }
  if (!v->k5) { v->k5 = (char*)key; v->v5 = property_value; v->a += 1; return 0; }
  if (!v->k6) { v->k6 = (char*)key; v->v6 = property_value; v->a += 1; return 0; }
  if (!v->k7) { v->k7 = (char*)key; v->v7 = property_value; v->a += 1; return 0; }
  if (!v->k8) { v->k8 = (char*)key; v->v8 = property_value; v->a += 1; return 0; }
  return 0;
}
static int __Reflect(void* target, const char* key, long value) {
  return __maia_runtime_value_set_property(target, key, value);
}
static void* __Object__values(void* target) {
  __maia_runtime_value* src = (__maia_runtime_value*)target;
  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }
  return __maia_runtime_alloc_value(2, src->a, 0, 0);
}
static void* __Object__entries(void* target) {
  __maia_runtime_value* src = (__maia_runtime_value*)target;
  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }
  return __maia_runtime_alloc_value(2, src->a, 0, 0);
}
static void* __maia_runtime_make_descriptor_enumerable(void) {
  __maia_runtime_value* descriptor = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 1, 0, 0);
  descriptor->k1 = (char*)"enumerable";
  descriptor->v1 = 1;
  return (void*)descriptor;
}
static void* __Object__getOwnPropertyDescriptors(void* target) {
  __maia_runtime_value* src = (__maia_runtime_value*)target;
  __maia_runtime_value* out = (__maia_runtime_value*)__maia_runtime_alloc_value(1, 0, 0, 0);
  if (!src || src->tag != 1) { return (void*)out; }
  if (src->k1) { out->k1 = src->k1; out->v1 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k2) { out->k2 = src->k2; out->v2 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k3) { out->k3 = src->k3; out->v3 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k4) { out->k4 = src->k4; out->v4 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k5) { out->k5 = src->k5; out->v5 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k6) { out->k6 = src->k6; out->v6 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k7) { out->k7 = src->k7; out->v7 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  if (src->k8) { out->k8 = src->k8; out->v8 = (long)__maia_runtime_make_descriptor_enumerable(); out->a += 1; }
  return (void*)out;
}
static void* __Reflect__ownKeys(void* target) {
  __maia_runtime_value* src = (__maia_runtime_value*)target;
  if (!src || src->tag != 1) { return __maia_runtime_alloc_value(2, 0, 0, 0); }
  return __maia_runtime_alloc_value(2, src->a, 0, 0);
}
static void* __Symbol(const char* description) {
  static long __maia_symbol_counter = 1;
  (void)description;
  return (void*)(__maia_symbol_counter++);
}

extern "C" int snprintf(char* buffer, unsigned long size, const char* format, ...);
static char* __maia_console_next_buffer(void) {
  char* buffer = new char[256];
  buffer[0] = '\0';
  return buffer;
}
static const char* __maia_console_to_cstr_string(const void* value) {
  const char* text = (const char*)value;
  const char* safe_text = text;
  if (!safe_text) { safe_text = ""; }
  return safe_text;
}
static const char* __maia_console_to_cstr_bool(int value) {
  const char* safe_text = "false";
  if (value) { safe_text = "true"; }
  return safe_text;
}
static const char* __maia_console_to_cstr_number(double value) {
  char* buffer = __maia_console_next_buffer();
  snprintf(buffer, 256, "%.17g", value);
  return buffer;
}
static const char* __maia_console_to_cstr_ptr(const void* value) {
  const char* safe_text = "[ptr]";
  if (!value) { safe_text = "null"; }
  return safe_text;
}
static const char* __maia_console_concat2(const void* left, const void* right) {
  const char* left_text = (const char*)left;
  const char* right_text = (const char*)right;
  const char* safe_left_text = left_text;
  const char* safe_right_text = right_text;
  if (!safe_left_text) { safe_left_text = ""; }
  if (!safe_right_text) { safe_right_text = ""; }
  char* buffer = __maia_console_next_buffer();
  int write_index = 0;
  while (safe_left_text[write_index] && write_index < 255) {
    buffer[write_index] = safe_left_text[write_index];
    write_index += 1;
  }
  int right_index = 0;
  while (safe_right_text[right_index] && write_index < 255) {
    buffer[write_index] = safe_right_text[right_index];
    write_index += 1;
    right_index += 1;
  }
  buffer[write_index] = '\0';
  return buffer;
}

extern void* __maia_arr_literal0(void);
extern void* __maia_arr_literal1(long v1);
extern void* __maia_arr_literal2(long v1, long v2);
extern void* __maia_arr_literal3(long v1, long v2, long v3);
extern void* __maia_arr_builder_begin(void);
extern void* __maia_arr_builder_push_value(void* builder, long value);
extern void* __maia_arr_builder_push_hole(void* builder);
extern void* __maia_arr_builder_spread(void* builder, void* source_array);
extern void* __maia_arr_builder_end(void* builder);
extern long __maia_runtime_value_get_index(void* value, int index);
extern int __maia_runtime_value_set_index(void* value, int index, long element_value);

void* __maia_arr_literal0(void) {
  return __maia_runtime_alloc_value(2, 0, 0, 0);
}
void* __maia_arr_literal1(long v1) {
  __maia_runtime_value* arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, 1, 0, 0);
  __maia_runtime_value_set_index((void*)arr, 0, (long)(v1));
  return (void*)arr;
}
void* __maia_arr_literal2(long v1, long v2) {
  __maia_runtime_value* arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, 2, 0, 0);
  __maia_runtime_value_set_index((void*)arr, 0, (long)(v1));
  __maia_runtime_value_set_index((void*)arr, 1, (long)(v2));
  return (void*)arr;
}
void* __maia_arr_literal3(long v1, long v2, long v3) {
  __maia_runtime_value* arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, 3, 0, 0);
  __maia_runtime_value_set_index((void*)arr, 0, (long)(v1));
  __maia_runtime_value_set_index((void*)arr, 1, (long)(v2));
  __maia_runtime_value_set_index((void*)arr, 2, (long)(v3));
  return (void*)arr;
}
void* __maia_arr_builder_begin(void) {
  return __maia_runtime_alloc_value(4, 0, 0, 0);
}
void* __maia_arr_builder_push_value(void* builder, long value) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) { return builder; }
  __maia_runtime_value_set_index(builder, b->a, (long)(value));
  return builder;
}
void* __maia_arr_builder_push_hole(void* builder) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) { return builder; }
  __maia_runtime_value_set_index(builder, b->a, 0);
  b->b += 1;
  return builder;
}
void* __maia_arr_builder_spread(void* builder, void* source_array) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  __maia_runtime_value* src = (__maia_runtime_value*)source_array;
  if (!b) { return builder; }
  b->c += 1;
  if (src && src->tag == 2) {
    for (int i = 0; i < src->a; i++) {
      __maia_runtime_value_set_index(builder, b->a, __maia_runtime_value_get_index(source_array, i));
    }
  }
  return builder;
}
void* __maia_arr_builder_end(void* builder) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  __maia_runtime_value* arr = 0;
  if (!b) { return __maia_arr_literal0(); }
  arr = (__maia_runtime_value*)__maia_runtime_alloc_value(2, b->a, b->b, b->c);
  for (int i = 0; i < b->a; i++) {
    __maia_runtime_value_set_index((void*)arr, i, __maia_runtime_value_get_index(builder, i));
  }
  if (b->items) { free((void*)b->items); }
  delete b;
  return (void*)arr;
}

int pass(const char* name);
int fail(const char* name);
double arraySum(void* arr, int n);
int main(void);

int pass(const char* name) {
  const char* __maia_console_tmp0 = (const char*)__maia_console_concat2("PASS ", __maia_console_to_cstr_string((const char*)(name)));
  __console__log(__maia_console_tmp0);
  return 0;
}

int fail(const char* name) {
  const char* __maia_console_tmp1 = (const char*)__maia_console_concat2("FAIL ", __maia_console_to_cstr_string((const char*)(name)));
  __console__log(__maia_console_tmp1);
  return 0;
}

double arraySum(void* arr, int n) {
  double s = 0;
  double i = 0;
  for (i = 0; i < n; i++) {
    {
      s += __maia_runtime_value_get_index((void*)(arr), (int)(i));
    }
  }
  return (double)(s);
}

int main(void) {
  void* __maia_arr_builder_tmp0 = __maia_arr_builder_begin();
  void* __maia_arr_builder_tmp1 = __maia_arr_builder_push_value(__maia_arr_builder_tmp0, (long)(2));
  void* __maia_arr_builder_tmp2 = __maia_arr_builder_push_value(__maia_arr_builder_tmp1, (long)(4));
  void* __maia_arr_builder_tmp3 = __maia_arr_builder_push_value(__maia_arr_builder_tmp2, (long)(6));
  void* __maia_arr_builder_tmp4 = __maia_arr_builder_push_value(__maia_arr_builder_tmp3, (long)(8));
  void* __maia_arr_builder_tmp5 = __maia_arr_builder_push_value(__maia_arr_builder_tmp4, (long)(10));
  void* a = __maia_arr_builder_end(__maia_arr_builder_tmp5);
  void* __maia_arr_builder_tmp6 = __maia_arr_builder_begin();
  void* __maia_arr_value_tmp0 = (void*)(__maia_arr_literal3((long)(1), (long)(2), (long)(3)));
  void* __maia_arr_builder_tmp7 = __maia_arr_builder_push_value(__maia_arr_builder_tmp6, (long)(__maia_arr_value_tmp0));
  void* __maia_arr_value_tmp1 = (void*)(__maia_arr_literal3((long)(4), (long)(5), (long)(6)));
  void* __maia_arr_builder_tmp8 = __maia_arr_builder_push_value(__maia_arr_builder_tmp7, (long)(__maia_arr_value_tmp1));
  void* __maia_arr_value_tmp2 = (void*)(__maia_arr_literal3((long)(7), (long)(8), (long)(9)));
  void* __maia_arr_builder_tmp9 = __maia_arr_builder_push_value(__maia_arr_builder_tmp8, (long)(__maia_arr_value_tmp2));
  void* mat = __maia_arr_builder_end(__maia_arr_builder_tmp9);
  void* __maia_arr_builder_tmp10 = __maia_arr_builder_begin();
  void* __maia_arr_builder_tmp11 = __maia_arr_builder_push_value(__maia_arr_builder_tmp10, (long)(0));
  void* __maia_arr_builder_tmp12 = __maia_arr_builder_push_value(__maia_arr_builder_tmp11, (long)(0));
  void* __maia_arr_builder_tmp13 = __maia_arr_builder_push_value(__maia_arr_builder_tmp12, (long)(0));
  void* __maia_arr_builder_tmp14 = __maia_arr_builder_push_value(__maia_arr_builder_tmp13, (long)(0));
  void* __maia_arr_builder_tmp15 = __maia_arr_builder_push_value(__maia_arr_builder_tmp14, (long)(0));
  void* sq = __maia_arr_builder_end(__maia_arr_builder_tmp15);
  double x = 42;
  double i = 0;
  double __maia_logical_tmp0 = (double)(__maia_runtime_value_get_index((void*)(a), (int)(0)) == 2);
  if ((((__maia_logical_tmp0 != 0)) ? __maia_runtime_value_get_index((void*)(a), (int)(4)) == 10 : __maia_logical_tmp0)) {
    {
      pass("arr_access");
    }
  }
  else {
    {
      fail("arr_access");
    }
  }
  if (arraySum(a, 5) == 30) {
    {
      pass("arr_sum");
    }
  }
  else {
    {
      fail("arr_sum");
    }
  }
  double __maia_logical_tmp1 = (double)(__maia_runtime_value_get_index((void*)(a), (int)(0)) == 2);
  if ((((__maia_logical_tmp1 != 0)) ? __maia_runtime_value_get_index((void*)(a), (int)(2)) == 6 : __maia_logical_tmp1)) {
    {
      pass("ptr_arith");
    }
  }
  else {
    {
      fail("ptr_arith");
    }
  }
  long __maia_member_value_tmp0 = (long)(__maia_runtime_value_get_index((void*)(mat), (int)(1)));
  long __maia_member_value_tmp1 = (long)(__maia_runtime_value_get_index((void*)(mat), (int)(2)));
  double __maia_logical_tmp2 = (double)(__maia_runtime_value_get_index((void*)(__maia_member_value_tmp0), (int)(1)) == 5);
  if ((((__maia_logical_tmp2 != 0)) ? __maia_runtime_value_get_index((void*)(__maia_member_value_tmp1), (int)(2)) == 9 : __maia_logical_tmp2)) {
    {
      pass("mat_2d");
    }
  }
  else {
    {
      fail("mat_2d");
    }
  }
  for (i = 0; i < 5; i++) {
    {
      (__maia_runtime_value_set_index((void*)(sq), (int)(i), (long)(i * i)), i * i);
    }
  }
  double __maia_logical_tmp3 = (double)(__maia_runtime_value_get_index((void*)(sq), (int)(3)) == 9);
  if ((((__maia_logical_tmp3 != 0)) ? __maia_runtime_value_get_index((void*)(sq), (int)(4)) == 16 : __maia_logical_tmp3)) {
    {
      pass("fill_sq");
    }
  }
  else {
    {
      fail("fill_sq");
    }
  }
  if (x == 42) {
    {
      pass("ptr_deref");
    }
  }
  else {
    {
      fail("ptr_deref");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}
