extern void __fn(void*, void*);
extern void __c__getValue(void);
extern void __box__setAt(double, double);
extern void __box__at(double);
extern void __b__value(void);
extern void __a__getValue(void);
extern void __p__getValue(void);
extern void __console__log(const char*);

struct C {
  int value;
};

void C_ctor_init(C* self, int x) {
  self->value = x;
}
void C_ctor_init__pvi(C* self, int x) {
  C_ctor_init(self, x);
}
int C_meth_getValue(C* self) {
  return (int)(self->value);
}

struct Box {
  int d0;
  int d1;
  int d2;
  int d3;
};

void Box_ctor_init(Box* self) {
  self->d0 = 0;
  self->d1 = 0;
  self->d2 = 0;
  self->d3 = 0;
}
void Box_ctor_init__pv(Box* self) {
  Box_ctor_init(self);
}
int Box_meth_at(Box* self, int i) {
  if (i == 0) {
    return (int)(self->d0);
  }
  if (i == 1) {
    return (int)(self->d1);
  }
  if (i == 2) {
    return (int)(self->d2);
  }
  return (int)(self->d3);
}
int Box_meth_setAt(Box* self, int i, int v) {
  if (i == 0) {
    self->d0 = v;
    return (int)(0);
  }
  if (i == 1) {
    self->d1 = v;
    return (int)(0);
  }
  if (i == 2) {
    self->d2 = v;
    return (int)(0);
  }
  self->d3 = v;
  return (int)(0);
}

struct BBase {

};

void BBase_ctor_init(BBase* self) {
}
void BBase_ctor_init__pv(BBase* self) {
  BBase_ctor_init(self);
}

struct DDerived : public BBase {
  int number;
};

void DDerived_ctor_init(DDerived* self, int n) {
  BBase_ctor_init__pv((BBase*)self);
  ;
  self->number = n;
}
void DDerived_ctor_init__pvi(DDerived* self, int n) {
  DDerived_ctor_init(self, n);
}
int DDerived_meth_value(DDerived* self) {
  return (int)(self->number);
}

struct P {
  int value;
};

void P_ctor_init(P* self, int x) {
  self->value = x;
}
void P_ctor_init__pvi(P* self, int x) {
  P_ctor_init(self, x);
}
int P_meth_getValue(P* self) {
  return (int)(self->value);
}

int add(int a, int b);
int multiply(int a, int b);
int execute(int a, int b, int (*fn)(int, int));
int run_class_tests(void);
int run_template_tests(void);
int run_function_pointer_tests(void);
int run_cast_tests(void);
int run_new_delete_tests(void);
int run_cout_stress_tests(void);
int run_for_cout_test(void);
int run_main_baseline_sections(void);
int run_program(void);

int add(int a, int b) {
  return (int)(a + b);
}

int multiply(int a, int b) {
  return (int)(a * b);
}

int execute(int a, int b, int (*fn)(int, int)) {
  return (int)(fn(a, b));
}

int run_class_tests(void) {
  C c;
  C_ctor_init__pvi((C*)&c, 42);
  return (int)(((C_meth_getValue(&c) == 42) ? (1) : (0)));
}

int run_template_tests(void) {
  Box box;
  Box_ctor_init__pv((Box*)&box);
  Box_meth_setAt(&box, 0, 10);
  Box_meth_setAt(&box, 1, 20);
  return (int)(((Box_meth_at(&box, 0) + Box_meth_at(&box, 1) == 30) ? (1) : (0)));
}

int run_function_pointer_tests(void) {
  const double s = execute(7, 3, add);
  const double m = execute(7, 3, multiply);
  return (int)(((s == 10 && m == 21) ? (1) : (0)));
}

int run_cast_tests(void) {
  DDerived b;
  DDerived_ctor_init__pvi((DDerived*)&b, 15);
  const double isDerived = (((dynamic_cast<DDerived*>(&b) != 0)) ? (1) : (0));
  const int n = (int)(3.2) | (int)(0);
  if (isDerived != 1) {
    return (int)(0);
  }
  if (DDerived_meth_value(&b) != 15) {
    return (int)(0);
  }
  if (n != 3) {
    return (int)(0);
  }
  return (int)(1);
}

int run_new_delete_tests(void) {
  C a;
  C_ctor_init__pvi((C*)&a, 1);
  if (C_meth_getValue(&a) != 1) {
    return (int)(0);
  }
  P p;
  P_ctor_init__pvi((P*)&p, 10);
  const double v = P_meth_getValue(&p);
  return (int)(((v == 10) ? (1) : (0)));
}

int run_cout_stress_tests(void) {
  double cout_acc = 0;
  double i = 1;
  cout_acc = cout_acc + i;
  if (cout_acc != 1) {
    return (int)(0);
  }
  __console__log("[cout-test] i=1 acc=1 int=42 double=3.25 char=Q");
  i = i + 1;
  cout_acc = cout_acc + i;
  if (cout_acc != 3) {
    return (int)(0);
  }
  __console__log("[cout-test] i=2 acc=3 int=42 double=3.25 char=Q");
  i = i + 1;
  cout_acc = cout_acc + i;
  if (cout_acc != 6) {
    return (int)(0);
  }
  __console__log("[cout-test] i=3 acc=6 int=42 double=3.25 char=Q");
  return (int)(((cout_acc == 6) ? (1) : (0)));
}

int run_for_cout_test(void) {
  double sum = 0;
  const double ratio = 1.5;
  {
    double i = 1;
    for (; i < 4; i = i + 1) {
      sum = sum + i;
      if (i == 1 && sum == 1) {
        __console__log("[for-cout] i=1 sum=1 ratio=1.5");
        continue;
      }
      if (i == 2 && sum == 3) {
        __console__log("[for-cout] i=2 sum=3 ratio=1.5");
        continue;
      }
      if (i == 3 && sum == 6) {
        __console__log("[for-cout] i=3 sum=6 ratio=1.5");
        continue;
      }
      return (int)(0);
    }
  }
  return (int)(((sum == 6) ? (1) : (0)));
}

int run_main_baseline_sections(void) {
  double a = 10;
  const double b = 20;
  double result = 0;
  double i = 0;
  double loop_sum = 0;
  double down = 5;
  double up = 0;
  __console__log("--- Arithmetic Operators ---");
  result = a + b;
  if (result != 30) {
    return (int)(0);
  }
  __console__log("add result=30");
  result = b - a;
  if (result != 10) {
    return (int)(0);
  }
  __console__log("b-a=10");
  result = a * 3;
  if (result != 30) {
    return (int)(0);
  }
  __console__log("a*3=30");
  result = b / 2;
  if (result != 10) {
    return (int)(0);
  }
  __console__log("b/2=10");
  result = (int)(b) % (int)(3);
  if (result != 2) {
    return (int)(0);
  }
  __console__log("b%3=2");
  __console__log("--- Assignment Operators ---");
  result = a;
  if (result != 10) {
    return (int)(0);
  }
  __console__log("result=10");
  result = result + b;
  if (result != 30) {
    return (int)(0);
  }
  __console__log("result+=b => 30");
  result = result - 10;
  if (result != 20) {
    return (int)(0);
  }
  __console__log("result-=10 => 20");
  result = result * 2;
  if (result != 40) {
    return (int)(0);
  }
  __console__log("result*=2 => 40");
  result = result / 5;
  if (result != 8) {
    return (int)(0);
  }
  __console__log("result/=5 => 8");
  result = result - result / 4 * 4;
  if (result != 0) {
    return (int)(0);
  }
  __console__log("result%=4 => 0");
  __console__log("--- Relational Operators ---");
  if (((a == b) ? (1) : (0))) {
    return (int)(0);
  }
  if (((a != b) ? (1) : (0)) != 1) {
    return (int)(0);
  }
  if (((a < b) ? (1) : (0)) != 1) {
    return (int)(0);
  }
  if (((a > b) ? (1) : (0))) {
    return (int)(0);
  }
  if (((a <= b) ? (1) : (0)) != 1) {
    return (int)(0);
  }
  if (((a >= b) ? (1) : (0))) {
    return (int)(0);
  }
  __console__log("a==b => 0");
  __console__log("a!=b => 1");
  __console__log("a<b => 1");
  __console__log("a>b => 0");
  __console__log("a<=b => 1");
  __console__log("a>=b => 0");
  __console__log("--- Logical Operators ---");
  if (((a && b) ? (1) : (0)) != 1) {
    return (int)(0);
  }
  if (((a || 0) ? (1) : (0)) != 1) {
    return (int)(0);
  }
  __console__log("a&&b => 1");
  __console__log("a||0 => 1");
  __console__log("--- Bitwise Operators ---");
  const int bitAnd = (int)(a) & (int)(b);
  const int bitOr = (int)(a) | (int)(b);
  const int bitXor = (int)(a) ^ (int)(b);
  const int shiftLeft = (int)(a) << (int)(2);
  const int shiftRight = (int)(b) >> (int)(1);
  if (bitAnd != 0) {
    return (int)(0);
  }
  if (bitOr != 30) {
    return (int)(0);
  }
  if (bitXor != 30) {
    return (int)(0);
  }
  if (shiftLeft != 40) {
    return (int)(0);
  }
  if (shiftRight != 10) {
    return (int)(0);
  }
  __console__log("a&b => 0");
  __console__log("a|b => 30");
  __console__log("a^b => 30");
  __console__log("a<<2 => 40");
  __console__log("b>>1 => 10");
  __console__log("--- Pointer Operators ---");
  a = 100;
  __console__log("*ptr=100 => a=100");
  __console__log("--- Control Flow ---");
  for (; i < 8; i = i + 1) {
    if (i == 5) {
      continue;
    }
    loop_sum = loop_sum + i;
    if (i == 0 && loop_sum == 0) {
      __console__log("[for] i=0 loop_sum=0");
      continue;
    }
    if (i == 1 && loop_sum == 1) {
      __console__log("[for] i=1 loop_sum=1");
      continue;
    }
    if (i == 2 && loop_sum == 3) {
      __console__log("[for] i=2 loop_sum=3");
      continue;
    }
    if (i == 3 && loop_sum == 6) {
      __console__log("[for] i=3 loop_sum=6");
      continue;
    }
    if (i == 4 && loop_sum == 10) {
      __console__log("[for] i=4 loop_sum=10");
      continue;
    }
    if (i == 6 && loop_sum == 16) {
      __console__log("[for] i=6 loop_sum=16");
      continue;
    }
    if (i == 7 && loop_sum == 23) {
      __console__log("[for] i=7 loop_sum=23");
      continue;
    }
    return (int)(0);
  }
  __console__log("loop_sum=23");
  while (down > 0) {
    down = down - 1;
  }
  __console__log("while-down=0");
  do {
    up = up + 1;
  } while (up < 5);
  __console__log("do-while-up=5");
  return (int)(((loop_sum == 23 && down == 0 && up == 5 && a == 100) ? (1) : (0)));
}

int run_program(void) {
  double failures = 0;
  __console__log("=== MaiaJS Comprehensive Runtime Baseline ===");
  if (!((int)(run_main_baseline_sections()))) {
    __console__log("FAIL main baseline sections");
    return (int)(1);
  }
  __console__log("1. class/ctor/const:");
  if (run_class_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("2. template/operator[]:");
  if (run_template_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("3. function pointer dispatch:");
  if (run_function_pointer_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("4. casts (dynamic/static):");
  if (run_cast_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("5. new/delete/placement-new:");
  if (run_new_delete_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("6. cout stress (chain/loop/literals):");
  if (run_cout_stress_tests()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  __console__log("7. for-loop with cout and double local:");
  if (run_for_cout_test()) {
    __console__log("OK");
  }
  else {
    __console__log("FAIL");
    failures = failures + 1;
  }
  if (failures == 0) {
    __console__log("ALL TESTS PASSED");
    return (int)(0);
  }
  __console__log("TESTS FAILED");
  return (int)(1);
}

int main() {
  run_program();
  return 0;
}
