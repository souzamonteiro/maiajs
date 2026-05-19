// MaiaJS Comprehensive Runtime Baseline
// JS mirror of maiacpp/compiler/examples/test.cpp
// Rules: ES6 classes, named function refs (no closures/captures), no Promise/
//        WeakMap/Symbol/Reflect, no Array.prototype.map/filter/reduce,
//        no String.padStart/padEnd — all of those require runtime void* hooks
//        and make MaiaCpp hang on the generated C++.

// ---------------------------------------------------------------------------
// Section 1: Class with constructor and method (mirrors class C)
// ---------------------------------------------------------------------------

class C {
  constructor(x) {
    this.value = x;
  }
  getValue() {
    return this.value;
  }
}

// ---------------------------------------------------------------------------
// Section 2: Fixed-slot container (mirrors template Box<int> with operator[])
// ---------------------------------------------------------------------------

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
    if (i === 0) { this.d0 = v; return; }
    if (i === 1) { this.d1 = v; return; }
    if (i === 2) { this.d2 = v; return; }
    this.d3 = v;
  }
}

// ---------------------------------------------------------------------------
// Section 3: Function references / higher-order dispatch (mirrors BinaryOp)
// ---------------------------------------------------------------------------

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function execute(a, b, fn) {
  return fn(a, b);
}

// ---------------------------------------------------------------------------
// Section 4: Inheritance (mirrors BBase / DDerived + instanceof instead of
//            dynamic_cast, bitwise truncation instead of static_cast<int>)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section 5: Allocation (mirrors new/delete — no placement-new equivalent)
// ---------------------------------------------------------------------------

class P {
  constructor(x) {
    this.val = x;
  }
  getValue() {
    return this.val;
  }
}

class PointRec {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

// ---------------------------------------------------------------------------
// Test runners (mirror run_* functions in test.cpp)
// ---------------------------------------------------------------------------

function runClassTests() {
  const c = new C(42);
  return (c.getValue() === 42) ? 1 : 0;
}

function runBoxTests() {
  const box = new Box();
  box.setAt(0, 10);
  box.setAt(1, 20);
  return ((box.at(0) + box.at(1)) === 30) ? 1 : 0;
}

function runFunctionRefTests() {
  const s = execute(7, 3, add);
  const m = execute(7, 3, multiply);
  return (s === 10 && m === 21) ? 1 : 0;
}

function runInheritanceTests() {
  const d = new DDerived(15);
  const isBase = (d instanceof BBase) ? 1 : 0;
  const n = (3.2 | 0); // bitwise truncation mirrors static_cast<int>(3.2)
  if (isBase !== 1) { return 0; }
  if (d.value() !== 15) { return 0; }
  if (n !== 3) { return 0; }
  return 1;
}

function runNewTests() {
  const a = new C(1);
  if (a.getValue() !== 1) { return 0; }
  const p = new P(10);
  const v = p.getValue();
  return (v === 10) ? 1 : 0;
}

function runCoutStressTests() {
  let coutAcc = 0;
  let i = 1;
  coutAcc = coutAcc + i;
  console.log('[cout-test] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout-test] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout-test] tick');
  return (coutAcc === 6) ? 1 : 0;
}

function runForCoutTest() {
  let sum = 0;
  const ratio = 1;
  for (let i = 1; i < 4; i++) {
    sum = sum + i;
    console.log('[for-cout] tick');
  }
  return (sum === 6) ? 1 : 0;
}

function bubbleSort(array) {
  const size = array.length;
  for (let i = 0; i < size - 1; i++) {
    for (let j = 0; j < size - i - 1; j++) {
      if (array[j] > array[j + 1]) {
        const temp = array[j];
        array[j] = array[j + 1];
        array[j + 1] = temp;
      }
    }
  }
}

function runArrayStressTests() {
  console.log('--- Array Stress (C-like) ---');

  // 1D array sort/search + checksum
  const array = [];
  array[0] = 5;
  array[1] = 2;
  array[2] = 8;
  array[3] = 1;
  array[4] = 9;
  array[5] = 3;
  array[6] = 7;
  array[7] = 4;
  array[8] = 6;
  array[9] = 0;
  bubbleSort(array);
  let pos5 = -1;
  let pos11 = -1;
  for (let i = 0; i < 10; i++) {
    if (array[i] === 5) {
      pos5 = i;
    }
    if (array[i] === 11) {
      pos11 = i;
    }
  }

  let checksum = 0;
  for (let i = 0; i < 10; i++) {
    checksum = checksum + array[i];
  }
  console.log('array checksum=' + checksum + ' pos5=' + pos5 + ' pos11=' + pos11);

  // 3D array (2x3x4) stored in flat layout to keep lowering stable
  const array3dFlat = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 4; k++) {
        const idx = i * 12 + j * 4 + k;
        array3dFlat[idx] = idx;
      }
    }
  }
  const v123 = array3dFlat[1 * 12 + 2 * 4 + 3];
  console.log('array3d[1][2][3]=' + v123);

  // Array of strings
  const strings = [];
  strings[0] = 'First string';
  strings[1] = 'Second string';
  strings[2] = 'Third string';
  let strChars = 0;
  for (let i = 0; i < 3; i++) {
    strChars = strChars + strings[i].length;
    console.log('str[' + i + ']=' + strings[i]);
  }

  // Array of structures (class instances)
  const points = [];
  for (let i = 0; i < 5; i++) {
    points[i] = new PointRec(i * 10, i * 20);
  }
  const lastPoint = points[4];
  console.log('points[4]=(' + lastPoint.x + ',' + lastPoint.y + ')');

  // Matrix-like traversal and diagonal accumulation using flat storage
  const matrix = [];
  matrix[0] = 1;
  matrix[1] = 2;
  matrix[2] = 3;
  matrix[3] = 4;
  matrix[4] = 5;
  matrix[5] = 6;
  matrix[6] = 7;
  matrix[7] = 8;
  matrix[8] = 9;
  matrix[9] = 10;
  matrix[10] = 11;
  matrix[11] = 12;
  let diag = 0;
  for (let i = 0; i < 3; i++) {
    diag = diag + matrix[i * 4 + i];
  }
  console.log('diag=' + diag);

  // Pass/fail aggregation tuned to deterministic integer checks
  if (checksum !== 45) { return 0; }
  if (pos5 !== 5) { return 0; }
  if (pos11 !== -1) { return 0; }
  if (v123 !== 23) { return 0; }
  if (strChars !== 37) { return 0; }
  if (lastPoint.x !== 40 || lastPoint.y !== 80) { return 0; }
  if (diag !== 18) { return 0; }

  return 1;
}

// ---------------------------------------------------------------------------
// main — mirrors int main() in test.cpp
// ---------------------------------------------------------------------------

function main() {
  let failures = 0;
  const a = 10;
  const b = 20;
  let result = 0;
  let relation = 0;
  let logic = 0;
  let bit = 0;
  let coutAcc = 0;
  let i = 0;
  let loopSum = 0;
  let down = 5;
  let up = 0;

  console.log('=== MaiaJS Comprehensive Runtime Baseline ===');

  // Arithmetic operators
  console.log('--- Arithmetic Operators ---');
  result = a + b;
  console.log('add(a,b)=' + result);
  result = b - a;
  console.log('b-a=' + result);
  result = a * 3;
  console.log('a*3=' + result);
  result = b / 2;
  console.log('b/2=' + result);
  result = b % 3;
  console.log('b%3=' + result);

  // Assignment operators
  console.log('--- Assignment Operators ---');
  result = a;
  console.log('result=' + result);
  result = result + b;
  console.log('result+=b => ' + result);
  result = result - 10;
  console.log('result-=10 => ' + result);
  result = result * 2;
  console.log('result*=2 => ' + result);
  result = result / 5;
  console.log('result/=5 => ' + result);
  result = result % 4;
  console.log('result%=4 => ' + result);

  // Relational operators
  console.log('--- Relational Operators ---');
  relation = (a === b) ? 1 : 0;
  console.log('a==b => ' + relation);
  relation = (a !== b) ? 1 : 0;
  console.log('a!=b => ' + relation);
  relation = (a < b) ? 1 : 0;
  console.log('a<b => ' + relation);
  relation = (a > b) ? 1 : 0;
  console.log('a>b => ' + relation);
  relation = (a <= b) ? 1 : 0;
  console.log('a<=b => ' + relation);
  relation = (a >= b) ? 1 : 0;
  console.log('a>=b => ' + relation);

  // Logical operators
  console.log('--- Logical Operators ---');
  logic = (a && b) ? 1 : 0;
  console.log('a&&b => ' + logic);
  logic = (a || 0) ? 1 : 0;
  console.log('a||0 => ' + logic);

  // Bitwise operators
  console.log('--- Bitwise Operators ---');
  bit = a & b;
  console.log('a&b => ' + bit);
  bit = a | b;
  console.log('a|b => ' + bit);
  bit = a ^ b;
  console.log('a^b => ' + bit);
  bit = a << 2;
  console.log('a<<2 => ' + bit);
  bit = b >> 1;
  console.log('b>>1 => ' + bit);

  // Control flow
  console.log('--- Control Flow ---');
  for (let j = 0; j < 8; j++) {
    if (j === 5) {
      continue;
    }
    loopSum = loopSum + j;
    console.log('[for] tick');
  }
  console.log('loop_sum=' + loopSum);

  while (down > 0) {
    down--;
  }
  console.log('while-down=' + down);

  do {
    up++;
  } while (up < 5);
  console.log('do-while-up=' + up);

  // Logging-chain stress (mirrors cout stress in test.cpp)
  console.log('--- cout stress preflight ---');
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  i++;
  coutAcc = coutAcc + i;
  console.log('[cout] tick');
  console.log('cout_acc=' + coutAcc + ' expected=92');

  // Subsection results
  if (runClassTests()) {
    console.log('1. class/ctor/method: OK');
  } else {
    console.log('1. class/ctor/method: FAIL');
    failures = failures + 1;
  }

  if (runBoxTests()) {
    console.log('2. box/slot-index: OK');
  } else {
    console.log('2. box/slot-index: FAIL');
    failures = failures + 1;
  }

  if (runFunctionRefTests()) {
    console.log('3. function-ref dispatch: OK');
  } else {
    console.log('3. function-ref dispatch: FAIL');
    failures = failures + 1;
  }

  if (runInheritanceTests()) {
    console.log('4. inheritance/instanceof/trunc: OK');
  } else {
    console.log('4. inheritance/instanceof/trunc: FAIL');
    failures = failures + 1;
  }

  if (runNewTests()) {
    console.log('5. new/ctor: OK');
  } else {
    console.log('5. new/ctor: FAIL');
    failures = failures + 1;
  }

  if (runCoutStressTests()) {
    console.log('6. cout stress: OK');
  } else {
    console.log('6. cout stress: FAIL');
    failures = failures + 1;
  }

  if (runForCoutTest()) {
    console.log('7. for-loop with logging: OK');
  } else {
    console.log('7. for-loop with logging: FAIL');
    failures = failures + 1;
  }

  if (runArrayStressTests()) {
    console.log('8. robust arrays battery: OK');
  } else {
    console.log('8. robust arrays battery: FAIL');
    failures = failures + 1;
  }

  if (failures === 0) {
    console.log('ALL TESTS PASSED');
    return 0;
  }
  console.log('TESTS FAILED: ' + failures);
  return 1;
}

main();
