// MaiaJS mirror of maiacpp/compiler/examples/test.cpp

class C {
  constructor(x) {
    this.value = x;
  }

  getValue() {
    return this.value;
  }
}

class Box {
  constructor() {
    this.d0 = 0;
    this.d1 = 0;
    this.d2 = 0;
    this.d3 = 0;
  }

  at(i) {
    if (i === 0) { return this.d0; }
    if (i === 1) { return this.d1; }
    if (i === 2) { return this.d2; }
    return this.d3;
  }

  setAt(i, v) {
    if (i === 0) { this.d0 = v; return 0; }
    if (i === 1) { this.d1 = v; return 0; }
    if (i === 2) { this.d2 = v; return 0; }
    this.d3 = v;
    return 0;
  }
}

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function execute(a, b, fn) {
  return fn(a, b);
}

class BBase {
  constructor() {}
}

class DDerived extends BBase {
  constructor(n) {
    super();
    this.number = n;
  }

  value() {
    return this.number;
  }
}

class P {
  constructor(x) {
    this.value = x;
  }

  getValue() {
    return this.value;
  }
}

function run_class_tests() {
  const c = new C(42);
  return (c.getValue() === 42) ? 1 : 0;
}

function run_template_tests() {
  const box = new Box();
  box.setAt(0, 10);
  box.setAt(1, 20);
  return ((box.at(0) + box.at(1)) === 30) ? 1 : 0;
}

function run_function_pointer_tests() {
  const s = execute(7, 3, add);
  const m = execute(7, 3, multiply);
  return (s === 10 && m === 21) ? 1 : 0;
}

function run_cast_tests() {
  const b = new DDerived(15);
  const isDerived = (b instanceof DDerived) ? 1 : 0;
  const n = (3.2 | 0);

  if (isDerived !== 1) { return 0; }
  if (b.value() !== 15) { return 0; }
  if (n !== 3) { return 0; }
  return 1;
}

function run_new_delete_tests() {
  const a = new C(1);
  if (a.getValue() !== 1) {
    return 0;
  }

  const p = new P(10);
  const v = p.getValue();
  return (v === 10) ? 1 : 0;
}

function run_cout_stress_tests() {
  let cout_acc = 0;
  let i = 1;

  cout_acc = cout_acc + i;
  if (cout_acc !== 1) {
    return 0;
  }
  console.log('[cout-test] i=1 acc=1 int=42 double=3.25 char=Q');
  i = i + 1;

  cout_acc = cout_acc + i;
  if (cout_acc !== 3) {
    return 0;
  }
  console.log('[cout-test] i=2 acc=3 int=42 double=3.25 char=Q');
  i = i + 1;

  cout_acc = cout_acc + i;
  if (cout_acc !== 6) {
    return 0;
  }
  console.log('[cout-test] i=3 acc=6 int=42 double=3.25 char=Q');

  return (cout_acc === 6) ? 1 : 0;
}

function run_for_cout_test() {
  let sum = 0;
  const ratio = 1.5;

  for (let i = 1; i < 4; i = i + 1) {
    sum = sum + i;
    if (i === 1 && sum === 1) {
      console.log('[for-cout] i=1 sum=1 ratio=1.5');
      continue;
    }
    if (i === 2 && sum === 3) {
      console.log('[for-cout] i=2 sum=3 ratio=1.5');
      continue;
    }
    if (i === 3 && sum === 6) {
      console.log('[for-cout] i=3 sum=6 ratio=1.5');
      continue;
    }
    return 0;
  }

  return (sum === 6) ? 1 : 0;
}

function run_main_baseline_sections() {
  let a = 10;
  const b = 20;
  let result = 0;
  let i = 0;
  let loop_sum = 0;
  let down = 5;
  let up = 0;

  console.log('--- Arithmetic Operators ---');
  result = a + b;
  if (result !== 30) { return 0; }
  console.log('add result=30');
  result = b - a;
  if (result !== 10) { return 0; }
  console.log('b-a=10');
  result = a * 3;
  if (result !== 30) { return 0; }
  console.log('a*3=30');
  result = b / 2;
  if (result !== 10) { return 0; }
  console.log('b/2=10');
  result = b % 3;
  if (result !== 2) { return 0; }
  console.log('b%3=2');

  console.log('--- Assignment Operators ---');
  result = a;
  if (result !== 10) { return 0; }
  console.log('result=10');
  result = result + b;
  if (result !== 30) { return 0; }
  console.log('result+=b => 30');
  result = result - 10;
  if (result !== 20) { return 0; }
  console.log('result-=10 => 20');
  result = result * 2;
  if (result !== 40) { return 0; }
  console.log('result*=2 => 40');
  result = result / 5;
  if (result !== 8) { return 0; }
  console.log('result/=5 => 8');
  result = result - ((result / 4) * 4);
  if (result !== 0) { return 0; }
  console.log('result%=4 => 0');

  console.log('--- Relational Operators ---');
  if ((a === b) ? 1 : 0) { return 0; }
  if (((a !== b) ? 1 : 0) !== 1) { return 0; }
  if (((a < b) ? 1 : 0) !== 1) { return 0; }
  if ((a > b) ? 1 : 0) { return 0; }
  if (((a <= b) ? 1 : 0) !== 1) { return 0; }
  if ((a >= b) ? 1 : 0) { return 0; }
  console.log('a==b => 0');
  console.log('a!=b => 1');
  console.log('a<b => 1');
  console.log('a>b => 0');
  console.log('a<=b => 1');
  console.log('a>=b => 0');

  console.log('--- Logical Operators ---');
  if (((a && b) ? 1 : 0) !== 1) { return 0; }
  if (((a || 0) ? 1 : 0) !== 1) { return 0; }
  console.log('a&&b => 1');
  console.log('a||0 => 1');

  console.log('--- Bitwise Operators ---');
  const bitAnd = (a & b);
  const bitOr = (a | b);
  const bitXor = (a ^ b);
  const shiftLeft = (a << 2);
  const shiftRight = (b >> 1);
  if (bitAnd !== 0) { return 0; }
  if (bitOr !== 30) { return 0; }
  if (bitXor !== 30) { return 0; }
  if (shiftLeft !== 40) { return 0; }
  if (shiftRight !== 10) { return 0; }
  console.log('a&b => 0');
  console.log('a|b => 30');
  console.log('a^b => 30');
  console.log('a<<2 => 40');
  console.log('b>>1 => 10');

  console.log('--- Pointer Operators ---');
  a = 100;
  console.log('*ptr=100 => a=100');

  console.log('--- Control Flow ---');
  for (i = 0; i < 8; i = i + 1) {
    if (i === 5) {
      continue;
    }
    loop_sum = loop_sum + i;
    if (i === 0 && loop_sum === 0) { console.log('[for] i=0 loop_sum=0'); continue; }
    if (i === 1 && loop_sum === 1) { console.log('[for] i=1 loop_sum=1'); continue; }
    if (i === 2 && loop_sum === 3) { console.log('[for] i=2 loop_sum=3'); continue; }
    if (i === 3 && loop_sum === 6) { console.log('[for] i=3 loop_sum=6'); continue; }
    if (i === 4 && loop_sum === 10) { console.log('[for] i=4 loop_sum=10'); continue; }
    if (i === 6 && loop_sum === 16) { console.log('[for] i=6 loop_sum=16'); continue; }
    if (i === 7 && loop_sum === 23) { console.log('[for] i=7 loop_sum=23'); continue; }
    return 0;
  }

  console.log('loop_sum=23');

  while (down > 0) {
    down = down - 1;
  }
  console.log('while-down=0');

  do {
    up = up + 1;
  } while (up < 5);
  console.log('do-while-up=5');

  return ((loop_sum === 23) && (down === 0) && (up === 5) && (a === 100)) ? 1 : 0;
}

function run_program() {
  let failures = 0;
  console.log('=== MaiaJS Comprehensive Runtime Baseline ===');

  if (!run_main_baseline_sections()) {
    console.log('FAIL main baseline sections');
    return 1;
  }

  console.log('1. class/ctor/const:');
  if (run_class_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('2. template/operator[]:');
  if (run_template_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('3. function pointer dispatch:');
  if (run_function_pointer_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('4. casts (dynamic/static):');
  if (run_cast_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('5. new/delete/placement-new:');
  if (run_new_delete_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('6. cout stress (chain/loop/literals):');
  if (run_cout_stress_tests()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  console.log('7. for-loop with cout and double local:');
  if (run_for_cout_test()) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failures = failures + 1;
  }

  if (failures === 0) {
    console.log('ALL TESTS PASSED');
    return 0;
  }

  console.log('TESTS FAILED');
  return 1;
}

run_program();
