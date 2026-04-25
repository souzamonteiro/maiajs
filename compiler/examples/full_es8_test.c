Parsing: /Volumes/External_SSD/Documentos/Projects/maiajs/compiler/examples/full_es8_test.cpp
Parser falhou (Parser timeout (5000ms) during Parser: ok).
Usando fallback simples.
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
  (void)tag;
  (void)a;
  (void)b;
  (void)c;
  return (void*)0;
}

void* maia_runtime_alloc_lambda_env__iiiiiipv(int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {
  (void)capture_count;
  (void)c1;
  (void)c2;
  (void)c3;
  (void)c4;
  (void)extra_capture_count;
  (void)extra_captures;
  return (void*)0;
}

int maia_runtime_lambda_env_capture_at__pvi(__maia_runtime_lambda_env* env, int index) {
  (void)env;
  (void)index;
  return (int)0;
}

int maia_runtime_lambda_value_capture_at__pvi(__maia_runtime_lambda_value* fn, int index) {
  (void)fn;
  (void)index;
  return (int)0;
}

int maia_runtime_lambda_get_capture_count__pv(void* lambda_value) {
  (void)lambda_value;
  return (int)0;
}

int maia_runtime_lambda_get_capture_at__pvi(void* lambda_value, int index) {
  (void)lambda_value;
  (void)index;
  return (int)0;
}

int maia_runtime_lambda_get_function_id__pv(void* lambda_value) {
  (void)lambda_value;
  return (int)0;
}

int maia_runtime_lambda_get_arity__pv(void* lambda_value) {
  (void)lambda_value;
  return (int)0;
}

int maia_runtime_lambda_get_is_async__pv(void* lambda_value) {
  (void)lambda_value;
  return (int)0;
}

int maia_runtime_lambda_can_invoke__pvii(void* lambda_value, int argc, int async_call) {
  (void)lambda_value;
  (void)argc;
  (void)async_call;
  return (int)0;
}

int maia_runtime_lambda_select_function_id__pvii(void* lambda_value, int argc, int async_call) {
  (void)lambda_value;
  (void)argc;
  (void)async_call;
  return (int)0;
}

int maia_runtime_lambda_known_case_token__pvi(void* lambda_value, int function_id) {
  (void)lambda_value;
  (void)function_id;
  return (int)0;
}

int maia_runtime_lambda_known_case_polarity__i(int function_id) {
  (void)function_id;
  return (int)0;
}

int maia_runtime_lambda_known_case_weighted_capture_value__pvi(void* lambda_value, int function_id) {
  (void)lambda_value;
  (void)function_id;
  return (int)0;
}

int maia_runtime_lambda_known_case_matches_function_id__pvi(void* lambda_value, int function_id) {
  (void)lambda_value;
  (void)function_id;
  return (int)0;
}

int maia_runtime_lambda_has_known_case__i(int function_id) {
  (void)function_id;
  return (int)0;
}

int maia_runtime_lambda_invoke_known_case__pvii(void* lambda_value, int function_id, int argc) {
  (void)lambda_value;
  (void)function_id;
  (void)argc;
  return (int)0;
}

int maia_runtime_lambda_invoke_function_id__pvii(void* lambda_value, int argc, int async_call) {
  (void)lambda_value;
  (void)argc;
  (void)async_call;
  return (int)0;
}

void* maia_runtime_alloc_lambda_value__iiiiiiiiipv(int function_id, int arity, int is_async, int capture_count, int c1, int c2, int c3, int c4, int extra_capture_count, int* extra_captures) {
  (void)function_id;
  (void)arity;
  (void)is_async;
  (void)capture_count;
  (void)c1;
  (void)c2;
  (void)c3;
  (void)c4;
  (void)extra_capture_count;
  (void)extra_captures;
  return (void*)0;
}

int maia_pow_i32__ii(int base, int exponent) {
  (void)base;
  (void)exponent;
  return (int)0;
}

void* maia_obj_literal0(void) {
  return maia_runtime_alloc_value__iiii(1, 0, 0, 0);
}

void* maia_obj_literal1__pvi(char* k1, int v1) {
  (void)k1;
  (void)v1;
  return (void*)0;
}

void* maia_obj_literal2__pvipvi(char* k1, int v1, char* k2, int v2) {
  (void)k1;
  (void)v1;
  (void)k2;
  (void)v2;
  return (void*)0;
}

void* maia_obj_literal3__pvipvipvi(char* k1, int v1, char* k2, int v2, char* k3, int v3) {
  (void)k1;
  (void)v1;
  (void)k2;
  (void)v2;
  (void)k3;
  (void)v3;
  return (void*)0;
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
  return (void*)0;
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
  (void)builder;
  (void)value;
  return (void*)0;
}

void* maia_arr_builder_push_hole__pv(void* builder) {
  (void)builder;
  return (void*)0;
}

void* maia_arr_builder_spread__pvpv(void* builder, void* source_array) {
  (void)builder;
  (void)source_array;
  return (void*)0;
}

void* maia_arr_builder_end__pv(void* builder) {
  (void)builder;
  return (void*)0;
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
  (void)param;
  return (char*)0;
}

char* withDefault__ii(int name, int greeting) {
  (void)name;
  (void)greeting;
  return (char*)0;
}

int restParams__i(int first) {
  (void)first;
  return (int)0;
}

int delay__ii(int ms, int value) {
  (void)ms;
  (void)value;
  return (int)0;
}

char* expressionFunc__i(int param) {
  (void)param;
  return (char*)0;
}

char* trailingCommas__iii(int param1, int param2, int param3) {
  (void)param1;
  (void)param2;
  (void)param3;
  return (char*)0;
}

char* maia_fn_Animal_prototype_speak(void) {
  return (char*)0;
}

char* maia_fn_Animal_prototype_getDescription(void) {
  return (char*)0;
}

int maia_fn_Animal_prototype_setNickname__i(int nick) {
  (void)nick;
  return (int)0;
}

int maia_fn_Animal_prototype_getNickname(void) {
  return (int)0;
}

char* maia_fn_Animal_classify(void) {
  return (char*)0;
}

int maia_fn_Animal_prototype_accessPrivate(void) {
  return (int)0;
}

char* maia_fn_Dog_prototype_speak(void) {
  return (char*)0;
}

char* maia_fn_person_greet(void) {
  return (char*)0;
}

int maia_fn_arg_rangeValues_forEach_0__i(int num) {
  (void)num;
  return (int)0;
}

int maia_fn_arg_call_0__iii(int v, int i, int arr) {
  (void)v;
  (void)i;
  (void)arr;
  return (int)0;
}

void* new_Animal__ii(int name, int species) {
  (void)name;
  (void)species;
  return (void*)0;
}

void* new_Dog__ii(int name, int breed) {
  (void)name;
  (void)breed;
  return (void*)0;
}

int main(void) {
  return (int)0;
}

/* Lowering diagnostics: 47 event(s) (stub-fallback=47) */
/* - __maia_runtime_alloc_value: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_alloc_lambda_env: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_env_capture_at: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_value_capture_at: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_get_capture_count: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_get_capture_at: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_get_function_id: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_get_arity: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_get_is_async: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_can_invoke: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_select_function_id: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_known_case_token: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_known_case_polarity: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_known_case_weighted_capture_value: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_known_case_matches_function_id: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_has_known_case: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_invoke_known_case: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_lambda_invoke_function_id: stub-fallback (no-supported-lowering) */
/* - __maia_runtime_alloc_lambda_value: stub-fallback (no-supported-lowering) */
/* - __maia_pow_i32: stub-fallback (no-supported-lowering) */
/* - __maia_obj_literal1: stub-fallback (no-supported-lowering) */
/* - __maia_obj_literal2: stub-fallback (no-supported-lowering) */
/* - __maia_obj_literal3: stub-fallback (no-supported-lowering) */
/* - __maia_obj_literal4: stub-fallback (no-supported-lowering) */
/* - ... 23 more event(s) */

