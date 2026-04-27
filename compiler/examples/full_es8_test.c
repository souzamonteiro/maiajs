/* Generated from C++98 source */
/* Target: C89 */

/* Minimal bridge prelude for MaiaC */
/* Runtime interface */
extern void   __exc_push(void);
extern void   __exc_pop(void);
extern int    __exc_active(void);
extern int    __exc_type(void);
extern void*  __exc_data(void);
extern void   __exc_throw(int type, void* data);
extern void   __exc_clear(void);
extern int    __exc_matches(int thrown_type, int catch_type);
extern void*  __malloc(unsigned long size);
extern void   __free(void* ptr);

/* Host import declarations */
extern void __console__log(void*);
extern void __Array__prototype__slice__call(void*, double);
extern void __arrowFunc(const char*);
extern void __Object__values(void*);
extern void __Object__entries(void*);
extern void __Object__getOwnPropertyDescriptors(void*);
extern void __str__padStart(double, const char*);
extern void __str__padEnd(double, const char*);
extern void __numbers__map(void*);
extern void __numbers__filter(void*);
extern void __numbers__reduce(void*, double);
extern void __numbers__includes(double);
extern void ___animalPrivate(void*, void*);
extern void __Animal__call(void*, void*, const char*);
extern void __Object__create(void*);
extern void __genericAnimal__speak(void);
extern void __genericAnimal__getDescription(void);
extern void __genericAnimal__setNickname(const char*);
extern void __genericAnimal__getNickname(void);
extern void __Animal__classify(void);
extern void __genericAnimal__accessPrivate(void);
extern void __dog__speak(void);
extern void __setTimeout(void*, void*);
extern void __resolve(void*);
extern void __Promise__resolve(double);
extern void __Symbol(const char*);
extern void __rangeValues__forEach(void*);
extern void __Reflect(void*, const char*, double);
extern void __Reflect__ownKeys(void*);
extern void __arr__indexOf(void*);
extern void* __maia_obj_literal0(void);
extern void* __maia_obj_literal1(const char* k1, int v1);
extern void* __maia_obj_literal2(const char* k1, int v1, const char* k2, int v2);
extern void* __maia_obj_literal3(const char* k1, int v1, const char* k2, int v2, const char* k3, int v3);
extern void* __maia_obj_literal4(const char* k1, int v1, const char* k2, int v2, const char* k3, int v3, const char* k4, int v4);
extern void* __maia_arr_literal0(void);
extern void* __maia_arr_literal1(int v1);
extern void* __maia_arr_literal2(int v1, int v2);
extern void* __maia_arr_literal3(int v1, int v2, int v3);
extern void* __maia_arr_literal4(int v1, int v2, int v3, int v4);
extern void* __maia_arr_builder_begin(void);
extern void* __maia_arr_builder_push_value(void* builder, int value);
extern void* __maia_arr_builder_push_hole(void* builder);
extern void* __maia_arr_builder_spread(void* builder, void* source_array);
extern void* __maia_arr_builder_end(void* builder);
extern void* __maia_lambda0_capture2(int c1, int c2);
extern void* __maia_lambda1(void);
extern void* __maia_lambda1_capture1(int c1);
extern void* __maia_lambda2(void);
extern const char* __maia_fn_Animal_prototype_speak(void);
extern const char* __maia_fn_Animal_prototype_getDescription(void);
extern int __maia_fn_Animal_prototype_setNickname(int nick);
extern int __maia_fn_Animal_prototype_getNickname(void);
extern const char* __maia_fn_Animal_classify(void);
extern int __maia_fn_Animal_prototype_accessPrivate(void);
extern const char* __maia_fn_Dog_prototype_speak(void);
extern const char* __maia_fn_person_greet(void);
extern int __maia_fn_arg_rangeValues_forEach_0(int num);
extern int __maia_fn_arg_call_0(int v, int i, int arr);
extern void* __new__Animal(int name, int species);
extern void* __new__Dog(int name, int breed);

#define EXC___maia_runtime_value 1
#define EXC___maia_runtime_lambda_env 2
#define EXC___maia_runtime_lambda_value 3

typedef struct __maia_runtime_value {
  int tag;
  int a;
  int b;
  int c;
} __maia_runtime_value;

void maia_runtime_value_init(__maia_runtime_value* self);
void maia_runtime_value_destroy(__maia_runtime_value* self);

void maia_runtime_value_init(__maia_runtime_value* self) {
  (void)self;
}

void maia_runtime_value_destroy(__maia_runtime_value* self) {
  (void)self;
}

typedef struct __maia_runtime_lambda_env {
  int capture_count;
  int truncated_captures;
  int capture1;
  int capture2;
  int capture3;
  int capture4;
  int extra_capture_count;
  int* extra_captures;
} __maia_runtime_lambda_env;

void maia_runtime_lambda_env_init(__maia_runtime_lambda_env* self);
void maia_runtime_lambda_env_destroy(__maia_runtime_lambda_env* self);

void maia_runtime_lambda_env_init(__maia_runtime_lambda_env* self) {
  (void)self;
}

void maia_runtime_lambda_env_destroy(__maia_runtime_lambda_env* self) {
  (void)self;
}

typedef struct __maia_runtime_lambda_value {
  int function_id;
  int arity;
  int is_async;
  void* env;
  int capture_count;
  int truncated_captures;
  int capture1;
  int capture2;
  int capture3;
  int capture4;
  int extra_capture_count;
  int* extra_captures;
} __maia_runtime_lambda_value;

void maia_runtime_lambda_value_init(__maia_runtime_lambda_value* self);
void maia_runtime_lambda_value_destroy(__maia_runtime_lambda_value* self);

void maia_runtime_lambda_value_init(__maia_runtime_lambda_value* self) {
  (void)self;
}

void maia_runtime_lambda_value_destroy(__maia_runtime_lambda_value* self) {
  (void)self;
}

/* Global functions */
void* maia_runtime_alloc_value__iiii(int tag, int a, int b, int c);
void* maia_runtime_alloc_lambda_env__iiiiiipv(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures);
int maia_runtime_lambda_env_capture_at__pvi(__maia_runtime_lambda_env* env, int index);
int maia_runtime_lambda_value_capture_at__pvi(__maia_runtime_lambda_value* fn, int index);
int maia_runtime_lambda_get_capture_count__pv(void* lambda_value);
int maia_runtime_lambda_get_capture_at__pvi(void* lambda_value, int index);
int maia_runtime_lambda_get_function_id__pv(void* lambda_value);
int maia_runtime_lambda_get_arity__pv(void* lambda_value);
int maia_runtime_lambda_get_is_async__pv(void* lambda_value);
int maia_runtime_lambda_can_invoke__pvii(void* lambda_value, int argc, int async_call);
int maia_runtime_lambda_select_function_id__pvii(void* lambda_value, int argc, int async_call);
int maia_runtime_lambda_known_case_token__pvi(void* lambda_value, int function_id);
int maia_runtime_lambda_known_case_polarity__i(int function_id);
int maia_runtime_lambda_known_case_weighted_capture_value__pvi(void* lambda_value, int function_id);
int maia_runtime_lambda_known_case_matches_function_id__pvi(void* lambda_value, int function_id);
int maia_runtime_lambda_has_known_case__i(int function_id);
int maia_runtime_lambda_invoke_known_case__pvii(void* lambda_value, int function_id, int argc);
int maia_runtime_lambda_invoke_function_id__pvii(void* lambda_value, int argc, int async_call);
void* maia_runtime_alloc_lambda_value__iiiiiiiiipv(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures);
int maia_pow_i32__ii(int base, int exponent);
void* maia_obj_literal0(void);
void* maia_obj_literal1__pvi(char* k1, int v1);
void* maia_obj_literal2__pvipvi(char* k1, int v1, char* k2, int v2);
void* maia_obj_literal3__pvipvipvi(char* k1, int v1, char* k2, int v2, char* k3, int v3);
void* maia_obj_literal4__pvipvipvipvi(char* k1, int v1, char* k2, int v2, char* k3, int v3, char* k4, int v4);
void* maia_arr_literal0(void);
void* maia_arr_literal1__i(int v1);
void* maia_arr_literal2__ii(int v1, int v2);
void* maia_arr_literal3__iii(int v1, int v2, int v3);
void* maia_arr_literal4__iiii(int v1, int v2, int v3, int v4);
void* maia_arr_builder_begin(void);
void* maia_arr_builder_push_value__pvi(void* builder, int value);
void* maia_arr_builder_push_hole__pv(void* builder);
void* maia_arr_builder_spread__pvpv(void* builder, void* source_array);
void* maia_arr_builder_end__pv(void* builder);
void* maia_lambda0_capture2__ii(int c1, int c2);
void* maia_lambda1(void);
void* maia_lambda1_capture1__i(int c1);
void* maia_lambda2(void);
char* classicFunction__i(int param);
char* withDefault__ii(int name, int greeting);
int restParams__i(int first);
int delay__ii(int ms, int value);
char* expressionFunc__i(int param);
char* trailingCommas__iii(int param1, int param2, int param3);
char* maia_fn_Animal_prototype_speak(void);
char* maia_fn_Animal_prototype_getDescription(void);
int maia_fn_Animal_prototype_setNickname__i(int nick);
int maia_fn_Animal_prototype_getNickname(void);
char* maia_fn_Animal_classify(void);
int maia_fn_Animal_prototype_accessPrivate(void);
char* maia_fn_Dog_prototype_speak(void);
char* maia_fn_person_greet(void);
int maia_fn_arg_rangeValues_forEach_0__i(int num);
int maia_fn_arg_call_0__iii(int v, int i, int arr);
void* new_Animal__ii(int name, int species);
void* new_Dog__ii(int name, int breed);
int main(void);

void* maia_runtime_alloc_value__iiii(int tag, int a, int b, int c) {
  __maia_runtime_value* v = new __maia_runtime_value();
  v->tag = tag;
  v->a = a;
  v->b = b;
  v->c = c;
  return (void*)v;
}

void* maia_runtime_alloc_lambda_env__iiiiiipv(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {
  int i;
  __maia_runtime_lambda_env* env = new __maia_runtime_lambda_env();
  env->capture_count = capture_count;
  env->truncated_captures = 0;
  env->capture1 = c1;
  env->capture2 = c2;
  env->capture3 = c3;
  env->capture4 = c4;
  env->extra_capture_count = extra_capture_count;
  env->extra_captures = 0;
  if (extra_capture_count > 0 && extra_captures) {
    env->extra_captures = new int[extra_capture_count];
    for (i = 0; i < extra_capture_count; i += 1) {
      env->extra_captures[i] = extra_captures[i];
    }
  }
  return (void*)env;
}

int maia_runtime_lambda_env_capture_at__pvi(__maia_runtime_lambda_env* env, int index) {
  if (!env || index < 0) {
    return 0;
  }
  if (index == 0) {
    return env->capture1;
  }
  if (index == 1) {
    return env->capture2;
  }
  if (index == 2) {
    return env->capture3;
  }
  if (index == 3) {
    return env->capture4;
  }
  int extraIndex = index - 4;
  if (extraIndex < 0 || extraIndex >= env->extra_capture_count || !env->extra_captures) {
    return 0;
  }
  return env->extra_captures[extraIndex];
}

int maia_runtime_lambda_value_capture_at__pvi(__maia_runtime_lambda_value* fn, int index) {
  if (!fn || index < 0) {
    return 0;
  }
  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;
  if (env) {
    return __maia_runtime_lambda_env_capture_at(env, index);
  }
  if (index == 0) {
    return fn->capture1;
  }
  if (index == 1) {
    return fn->capture2;
  }
  if (index == 2) {
    return fn->capture3;
  }
  if (index == 3) {
    return fn->capture4;
  }
  int extraIndex = index - 4;
  if (extraIndex < 0 || extraIndex >= fn->extra_capture_count || !fn->extra_captures) {
    return 0;
  }
  return fn->extra_captures[extraIndex];
}

int maia_runtime_lambda_get_capture_count__pv(void* lambda_value) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  if (!fn) {
    return 0;
  }
  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)fn->env;
  if (env) {
    return env->capture_count;
  }
  return fn->capture_count;
}

int maia_runtime_lambda_get_capture_at__pvi(void* lambda_value, int index) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  return __maia_runtime_lambda_value_capture_at(fn, index);
}

int maia_runtime_lambda_get_function_id__pv(void* lambda_value) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  if (!fn) {
    return 0;
  }
  return fn->function_id;
}

int maia_runtime_lambda_get_arity__pv(void* lambda_value) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  if (!fn) {
    return 0;
  }
  return fn->arity;
}

int maia_runtime_lambda_get_is_async__pv(void* lambda_value) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  if (!fn) {
    return 0;
  }
  return fn->is_async;
}

int maia_runtime_lambda_can_invoke__pvii(void* lambda_value, int argc, int async_call) {
  __maia_runtime_lambda_value* fn = (__maia_runtime_lambda_value*)lambda_value;
  if (!fn || argc < 0) {
    return 0;
  }
  if (fn->arity != argc) {
    return 0;
  }
  if (fn->is_async != (async_call ? 1 : 0)) {
    return 0;
  }
  return 1;
}

int maia_runtime_lambda_select_function_id__pvii(void* lambda_value, int argc, int async_call) {
  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) {
    return 0;
  }
  return __maia_runtime_lambda_get_function_id(lambda_value);
}

int maia_runtime_lambda_known_case_token__pvi(void* lambda_value, int function_id) {
  switch (function_id) {
  case 2:
  return (__maia_runtime_lambda_get_arity(lambda_value) * 10) + 2 + 20 + 100 + (__maia_runtime_lambda_get_capture_count(lambda_value) * 1000);
  case 1001:
  return (__maia_runtime_lambda_get_arity(lambda_value) * 10) + 1 + 10 + 100 + (__maia_runtime_lambda_get_capture_count(lambda_value) * 1000);
  default:
  return 0;
  }
}

int maia_runtime_lambda_known_case_polarity__i(int function_id) {
  switch (function_id) {
  case 2:
  return 1;
  case 1001:
  return 1;
  default:
  return 0;
  }
}

int maia_runtime_lambda_known_case_weighted_capture_value__pvi(void* lambda_value, int function_id) {
  switch (function_id) {
  case 2:
  return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4);
  case 1001:
  return (__maia_runtime_lambda_get_capture_at(lambda_value, 0) * 1) + (__maia_runtime_lambda_get_capture_at(lambda_value, 1) * 2) + (__maia_runtime_lambda_get_capture_at(lambda_value, 2) * 3) + (__maia_runtime_lambda_get_capture_at(lambda_value, 3) * 4);
  default:
  return 0;
  }
}

int maia_runtime_lambda_known_case_matches_function_id__pvi(void* lambda_value, int function_id) {
  switch (function_id) {
  case 2:
  if (__maia_runtime_lambda_get_arity(lambda_value) != 0) { return 0; }
  if (__maia_runtime_lambda_get_is_async(lambda_value) != 0) { return 0; }
  return 1;
  case 1001:
  if (__maia_runtime_lambda_get_arity(lambda_value) != 1) { return 0; }
  if (__maia_runtime_lambda_get_is_async(lambda_value) != 0) { return 0; }
  return 1;
  default:
  return 0;
  }
}

int maia_runtime_lambda_has_known_case__i(int function_id) {
  switch (function_id) {
  case 2:
  return 1;
  case 1001:
  return 1;
  default:
  return 0;
  }
}

int maia_runtime_lambda_invoke_known_case__pvii(void* lambda_value, int function_id, int argc) {
  if (!__maia_runtime_lambda_has_known_case(function_id)) {
    return 0;
  }
  int known_case_token = __maia_runtime_lambda_known_case_token(lambda_value, function_id);
  if (!known_case_token) {
    return 0;
  }
  int known_case_polarity = __maia_runtime_lambda_known_case_polarity(function_id);
  if (!known_case_polarity) {
    return 0;
  }
  int weighted_capture_value = __maia_runtime_lambda_known_case_weighted_capture_value(lambda_value, function_id);
  if (!__maia_runtime_lambda_known_case_matches_function_id(lambda_value, function_id)) {
    return 0;
  }
  return known_case_polarity * (weighted_capture_value + argc + known_case_token);
}

int maia_runtime_lambda_invoke_function_id__pvii(void* lambda_value, int argc, int async_call) {
  if (!__maia_runtime_lambda_can_invoke(lambda_value, argc, async_call)) {
    return 0;
  }
  int function_id = __maia_runtime_lambda_select_function_id(lambda_value, argc, async_call);
  if (!function_id) {
    return 0;
  }
  return __maia_runtime_lambda_invoke_known_case(lambda_value, function_id, argc);
}

void* maia_runtime_alloc_lambda_value__iiiiiiiiipv(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {
  __maia_runtime_lambda_value* fn = new __maia_runtime_lambda_value();
  __maia_runtime_lambda_env* env = (__maia_runtime_lambda_env*)__maia_runtime_alloc_lambda_env(capture_count, c1, c2, c3, c4, extra_capture_count, extra_captures);
  fn->function_id = function_id;
  fn->arity = arity;
  fn->is_async = is_async;
  fn->env = (void*)env;
  fn->capture_count = __maia_runtime_lambda_get_capture_count((void*)fn);
  fn->truncated_captures = env ? env->truncated_captures : 0;
  fn->capture1 = c1;
  fn->capture2 = c2;
  fn->capture3 = c3;
  fn->capture4 = c4;
  fn->extra_capture_count = env ? env->extra_capture_count : extra_capture_count;
  fn->extra_captures = env ? env->extra_captures : 0;
  fn->capture1 = __maia_runtime_lambda_get_capture_at((void*)fn, 0);
  fn->capture2 = __maia_runtime_lambda_get_capture_at((void*)fn, 1);
  fn->capture3 = __maia_runtime_lambda_get_capture_at((void*)fn, 2);
  fn->capture4 = __maia_runtime_lambda_get_capture_at((void*)fn, 3);
  return (void*)fn;
}

int maia_pow_i32__ii(int base, int exponent) {
  if (exponent < 0) {
    return 0;
  }
  int result = 1;
  int current = base;
  int power = exponent;
  while (power > 0) {
    if ((power & 1) != 0) {
      result *= current;
    }
    power >>= 1;
    if (power > 0) {
      current *= current;
    }
  }
  return result;
}

void* maia_obj_literal0(void) {
  return maia_runtime_alloc_value__iiii(1, 0, 0, 0);
}

void* maia_obj_literal1__pvi(char* k1, int v1) {
  (void)k1;
  (void)v1;
  return __maia_runtime_alloc_value(1, 1, 0, 0);
}

void* maia_obj_literal2__pvipvi(char* k1, int v1, char* k2, int v2) {
  (void)k1;
  (void)v1;
  (void)k2;
  (void)v2;
  return __maia_runtime_alloc_value(1, 2, 0, 0);
}

void* maia_obj_literal3__pvipvipvi(char* k1, int v1, char* k2, int v2, char* k3, int v3) {
  (void)k1;
  (void)v1;
  (void)k2;
  (void)v2;
  (void)k3;
  (void)v3;
  return __maia_runtime_alloc_value(1, 3, 0, 0);
}

void* maia_obj_literal4__pvipvipvipvi(char* k1, int v1, char* k2, int v2, char* k3, int v3, char* k4, int v4) {
  (void)k1;
  (void)v1;
  (void)k2;
  (void)v2;
  (void)k3;
  (void)v3;
  (void)k4;
  (void)v4;
  return __maia_runtime_alloc_value(1, 4, 0, 0);
}

void* maia_arr_literal0(void) {
  return maia_runtime_alloc_value__iiii(2, 0, 0, 0);
}

void* maia_arr_literal1__i(int v1) {
  return maia_runtime_alloc_value__iiii(2, 1, 0, 0);
}

void* maia_arr_literal2__ii(int v1, int v2) {
  return maia_runtime_alloc_value__iiii(2, 2, 0, 0);
}

void* maia_arr_literal3__iii(int v1, int v2, int v3) {
  return maia_runtime_alloc_value__iiii(2, 3, 0, 0);
}

void* maia_arr_literal4__iiii(int v1, int v2, int v3, int v4) {
  return maia_runtime_alloc_value__iiii(2, 4, 0, 0);
}

void* maia_arr_builder_begin(void) {
  return maia_runtime_alloc_value__iiii(4, 0, 0, 0);
}

void* maia_arr_builder_push_value__pvi(void* builder, int value) {
  (void)value;
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) {
    return builder;
  }
  b->a += 1;
  return builder;
}

void* maia_arr_builder_push_hole__pv(void* builder) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) {
    return builder;
  }
  b->a += 1;
  b->b += 1;
  return builder;
}

void* maia_arr_builder_spread__pvpv(void* builder, void* source_array) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) {
    return builder;
  }
  b->c += 1;
  __maia_runtime_value* src = (__maia_runtime_value*)source_array;
  if (src && src->tag == 2) {
    b->a += src->a;
  }
  return builder;
}

void* maia_arr_builder_end__pv(void* builder) {
  __maia_runtime_value* b = (__maia_runtime_value*)builder;
  if (!b) {
    return __maia_arr_literal0();
  }
  void* arr = __maia_runtime_alloc_value(2, b->a, b->b, b->c);
  delete b;
  return arr;
}

void* maia_lambda0_capture2__ii(int c1, int c2) {
  return maia_runtime_alloc_lambda_value__iiiiiiiiipv(2, 0, 0, 2, c1, c2, 0, 0, 0, 0);
}

void* maia_lambda1(void) {
  return maia_runtime_alloc_value__iiii(3, 1, 0, 0);
}

void* maia_lambda1_capture1__i(int c1) {
  return maia_runtime_alloc_lambda_value__iiiiiiiiipv(1001, 1, 0, 1, c1, 0, 0, 0, 0, 0);
}

void* maia_lambda2(void) {
  return maia_runtime_alloc_value__iiii(3, 2, 0, 0);
}

char* classicFunction__i(int param) {
  return (const char*)("Classic function: " + param);
}

char* withDefault__ii(int name, int greeting) {
  if (name == nullptr) {
    name = "Guest";
  }
  if (greeting == nullptr) {
    greeting = "Hello";
  }
  return (const char*)(greeting + ", " + name + "!");
}

int restParams__i(int first) {
  const void* rest = __Array__prototype__slice__call(nullptr, 1);
  __console__log("Rest params - first: " + first + ", rest size: " + rest.length);
  return (int)(rest);
}

int delay__ii(int ms, int value) {
  return (int)(__new__Promise(__maia_lambda1_capture1((int)(ms))));
}

char* expressionFunc__i(int param) {
  return (const char*)("Function expression: " + param);
}

char* trailingCommas__iii(int param1, int param2, int param3) {
  return (const char*)(param1 + ", " + param2 + ", " + param3);
}

char* maia_fn_Animal_prototype_speak(void) {
  return (const char*)(this->name + " makes a sound");
}

char* maia_fn_Animal_prototype_getDescription(void) {
  return (const char*)(this->name + " is a " + this->species);
}

int maia_fn_Animal_prototype_setNickname__i(int nick) {
  this->_nickname = nick;
  return 0;
}

int maia_fn_Animal_prototype_getNickname(void) {
  return (int)(this->_nickname || this->name);
}

char* maia_fn_Animal_classify(void) {
  return (const char*)("All animals are living organisms");
}

int maia_fn_Animal_prototype_accessPrivate(void) {
  return (int)(___animalPrivate(this).privateField);
}

char* maia_fn_Dog_prototype_speak(void) {
  return (const char*)(this->name + " barks! Woof!");
}

char* maia_fn_person_greet(void) {
  return (const char*)("Hello, I am " + this->name);
}

int maia_fn_arg_rangeValues_forEach_0__i(int num) {
  __console__log("Iter value: " + num);
  return 0;
}

int maia_fn_arg_call_0__iii(int v, int i, int arr) {
  return (int)(__arr__indexOf(v) == i);
}

void* new_Animal__ii(int name, int species) {
  const void* __maia_this = __maia_obj_literal0();
  __Reflect(__maia_this, "name", name);
  __Reflect(__maia_this, "species", species);
  ___animalPrivate(__maia_this, __maia_obj_literal1("privateField", (int)("private value")));
  return (void*)__maia_this;
}

void* new_Dog__ii(int name, int breed) {
  const void* __maia_this = __maia_obj_literal0();
  __Animal__call(__maia_this, name, "Canine");
  __Reflect(__maia_this, "breed", breed);
  return (void*)__maia_this;
}

int main(void) {
  return (int)0;
}

/* Lowering diagnostics: 47 event(s) (structured-cstyle-body=46, stub-fallback=1) */
/* - __maia_runtime_alloc_value: structured-cstyle-body (6 stmt(s)) */
/* - __maia_runtime_alloc_lambda_env: structured-cstyle-body (11 stmt(s)) */
/* - __maia_runtime_lambda_env_capture_at: structured-cstyle-body (8 stmt(s)) */
/* - __maia_runtime_lambda_value_capture_at: structured-cstyle-body (10 stmt(s)) */
/* - __maia_runtime_lambda_get_capture_count: structured-cstyle-body (5 stmt(s)) */
/* - __maia_runtime_lambda_get_capture_at: structured-cstyle-body (2 stmt(s)) */
/* - __maia_runtime_lambda_get_function_id: structured-cstyle-body (3 stmt(s)) */
/* - __maia_runtime_lambda_get_arity: structured-cstyle-body (3 stmt(s)) */
/* - __maia_runtime_lambda_get_is_async: structured-cstyle-body (3 stmt(s)) */
/* - __maia_runtime_lambda_can_invoke: structured-cstyle-body (5 stmt(s)) */
/* - __maia_runtime_lambda_select_function_id: structured-cstyle-body (2 stmt(s)) */
/* - __maia_runtime_lambda_known_case_token: structured-cstyle-body (raw-body 8 line(s)) */
/* - __maia_runtime_lambda_known_case_polarity: structured-cstyle-body (raw-body 8 line(s)) */
/* - __maia_runtime_lambda_known_case_weighted_capture_value: structured-cstyle-body (raw-body 8 line(s)) */
/* - __maia_runtime_lambda_known_case_matches_function_id: structured-cstyle-body (raw-body 12 line(s)) */
/* - __maia_runtime_lambda_has_known_case: structured-cstyle-body (raw-body 8 line(s)) */
/* - __maia_runtime_lambda_invoke_known_case: structured-cstyle-body (8 stmt(s)) */
/* - __maia_runtime_lambda_invoke_function_id: structured-cstyle-body (4 stmt(s)) */
/* - __maia_runtime_alloc_lambda_value: structured-cstyle-body (19 stmt(s)) */
/* - __maia_pow_i32: structured-cstyle-body (6 stmt(s)) */
/* - __maia_obj_literal1: structured-cstyle-body (3 stmt(s)) */
/* - __maia_obj_literal2: structured-cstyle-body (5 stmt(s)) */
/* - __maia_obj_literal3: structured-cstyle-body (7 stmt(s)) */
/* - __maia_obj_literal4: structured-cstyle-body (9 stmt(s)) */
/* - ... 23 more event(s) */

