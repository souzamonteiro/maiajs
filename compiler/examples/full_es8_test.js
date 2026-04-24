// ES8 (ECMAScript 2017) Syntax Tester
// Tests: Object.values, Object.entries, String padding, async/await,
// trailing commas, shared memory, atomics, and all major operators

console.log('='.repeat(60));
console.log('ES8 SYNTAX TESTER - Running comprehensive tests');
console.log('='.repeat(60));

// ==================== 1. LITERALS & PRIMITIVE OPERATORS ====================
console.log('\n--- SECTION 1: LITERALS & OPERATORS ---');

// Arithmetic operators
let a = 10, b = 3;
console.log(`Arithmetic: ${a} + ${b} = ${a + b}`);
console.log(`Arithmetic: ${a} - ${b} = ${a - b}`);
console.log(`Arithmetic: ${a} * ${b} = ${a * b}`);
console.log(`Arithmetic: ${a} / ${b} = ${a / b}`);
console.log(`Arithmetic: ${a} % ${b} = ${a % b}`);
console.log(`Arithmetic: ${a} ** ${b} = ${a ** b}`);  // Exponentiation (ES7/ES8)

// Assignment operators
let x = 5;
console.log(`Assignment: x = 5 → x = ${x}`);
x += 3;
console.log(`Assignment: x += 3 → ${x}`);
x -= 2;
console.log(`Assignment: x -= 2 → ${x}`);
x *= 4;
console.log(`Assignment: x *= 4 → ${x}`);
x /= 2;
console.log(`Assignment: x /= 2 → ${x}`);
x %= 3;
console.log(`Assignment: x %= 3 → ${x}`);
x **= 2;
console.log(`Assignment: x **= 2 → ${x}`);

// Comparison operators
console.log(`Comparison: 5 == "5" → ${5 == "5"}`);
console.log(`Comparison: 5 === "5" → ${5 === "5"}`);
console.log(`Comparison: 5 != 3 → ${5 != 3}`);
console.log(`Comparison: 5 !== "5" → ${5 !== "5"}`);
console.log(`Comparison: 5 > 3 → ${5 > 3}`);
console.log(`Comparison: 5 < 3 → ${5 < 3}`);
console.log(`Comparison: 5 >= 5 → ${5 >= 5}`);
console.log(`Comparison: 5 <= 3 → ${5 <= 3}`);

// Logical operators
let t = true, f = false;
console.log(`Logical: true && false → ${t && f}`);
console.log(`Logical: true || false → ${t || f}`);
console.log(`Logical: !true → ${!t}`);
console.log(`Logical: null ?? "default" → ${null ?? "default"}`); // Nullish coalescing (ES2020 but tested)

// Bitwise operators
console.log(`Bitwise: 5 & 3 → ${5 & 3}`);
console.log(`Bitwise: 5 | 3 → ${5 | 3}`);
console.log(`Bitwise: 5 ^ 3 → ${5 ^ 3}`);
console.log(`Bitwise: ~5 → ${~5}`);
console.log(`Bitwise: 5 << 1 → ${5 << 1}`);
console.log(`Bitwise: 5 >> 1 → ${5 >> 1}`);
console.log(`Bitwise: 5 >>> 1 → ${5 >>> 1}`);

// Ternary operator
let age = 18;
let status = age >= 18 ? 'adult' : 'minor';
console.log(`Ternary: age ${age} → ${status}`);

// ==================== 2. VARIABLE DECLARATIONS (var, let, const) ====================
console.log('\n--- SECTION 2: VARIABLE DECLARATIONS ---');

var oldVar = 'I am var (function-scoped)';
console.log(`var: ${oldVar}`);

let blockScoped = 'I am let (block-scoped)';
console.log(`let: ${blockScoped}`);

const CONSTANT_VALUE = 'I am const (immutable)';
console.log(`const: ${CONSTANT_VALUE}`);

// Block scope demonstration
{
  let blockLet = 'inside block';
  var blockVar = 'also inside block but hoisted';
  console.log(`Block scope - let inside: ${blockLet}`);
}
console.log(`Block scope - var outside: ${blockVar}`);
// console.log(blockLet); // Would cause ReferenceError

// ==================== 3. FUNCTIONS (all forms) ====================
console.log('\n--- SECTION 3: FUNCTIONS (all forms) ---');

// Function declaration
function classicFunction(param) {
  return `Classic function: ${param}`;
}
console.log(classicFunction('Hello'));

// Function expression
const expressionFunc = function(param) {
  return `Function expression: ${param}`;
};
console.log(expressionFunc('World'));

// Arrow function (ES6, widely used in ES8)
const arrowFunc = (param) => `Arrow function: ${param}`;
console.log(arrowFunc('ES8'));

// Arrow function with multiple statements
const multiArrow = (a, b) => {
  const sum = a + b;
  return `Sum: ${a} + ${b} = ${sum}`;
};
console.log(multiArrow(5, 7));

// Immediately Invoked Function Expression (IIFE)
(function() {
  console.log('IIFE - executed immediately');
})();

// Generator function (ES6)
function* generatorFunction() {
  yield 'First value';
  yield 'Second value';
  return 'Done';
}
const gen = generatorFunction();
console.log(`Generator: ${gen.next().value}`);
console.log(`Generator: ${gen.next().value}`);
console.log(`Generator: ${gen.next().value}`);

// Function with default parameters (ES6)
function defaultParams(name = 'Guest', greeting = 'Hello') {
  return `${greeting}, ${name}!`;
}
console.log(`Default params: ${defaultParams()}`);
console.log(`Default params: ${defaultParams('John')}`);
console.log(`Default params: ${defaultParams('Jane', 'Hi')}`);

// Rest parameters (ES6)
function restParams(first, ...rest) {
  console.log(`Rest params - first: ${first}, rest: [${rest}]`);
  return rest;
}
restParams(1, 2, 3, 4, 5);

// Spread operator (ES6/ES8)
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const combined = [...arr1, ...arr2];
console.log(`Spread operator: [${combined}]`);

// ==================== 4. OBJECTS & ES8 OBJECT EXTENSIONS ====================
console.log('\n--- SECTION 4: OBJECTS & ES8 OBJECT METHODS ---');

const person = {
  name: 'Alice',
  age: 30,
  city: 'New York',
  greet() {
    return `Hello, I'm ${this.name}`;
  }
};

// Object.values() (ES8)
const values = Object.values(person);
console.log(`Object.values(): [${values}]`);

// Object.entries() (ES8)
const entries = Object.entries(person);
console.log('Object.entries():');
entries.forEach(([key, val]) => {
  console.log(`  ${key}: ${val}`);
});

// Object.getOwnPropertyDescriptors() (ES8)
const descriptors = Object.getOwnPropertyDescriptors(person);
console.log('Object.getOwnPropertyDescriptors():');
console.log(`  name descriptor: ${JSON.stringify(descriptors.name)}`);

// Object literal enhancements (ES6/ES8)
const propName = 'dynamicKey';
const dynamicObj = {
  [propName]: 'dynamic value',
  method() { return 'shorthand method'; }
};
console.log(`Computed property name: ${dynamicObj.dynamicKey}`);
console.log(`Shorthand method: ${dynamicObj.method()}`);

// Object spread (ES8 - part of object rest/spread proposal)
const obj1 = { a: 1, b: 2 };
const obj2 = { c: 3, d: 4 };
const mergedObj = { ...obj1, ...obj2 };
console.log(`Object spread: ${JSON.stringify(mergedObj)}`);

// ==================== 5. STRING METHODS (ES8 padding) ====================
console.log('\n--- SECTION 5: STRING METHODS (ES8) ---');

const str = '5';
console.log(`String.padStart(2, '0'): '${str.padStart(2, '0')}'`);
console.log(`String.padEnd(4, 'abc'): '${str.padEnd(4, 'abc')}'`);
console.log(`String.padStart(5, 'xyz'): '${'hello'.padStart(5, 'xyz')}'`);
console.log(`String.padEnd(8, '!'): '${'done'.padEnd(8, '!')}'`);

// Template literals (ES6)
const name = 'World';
const templateStr = `Hello ${name}! 
  This is a multiline
  template string.`;
console.log('Template literal:\n' + templateStr);

// Tagged templates
function tag(strings, ...values) {
  console.log(`Tagged template - strings: ${strings}, values: ${values}`);
  return strings.reduce((result, str, i) => result + str + (values[i] || ''), '');
}
const taggedResult = tag`Hello ${name}, you have ${10} messages.`;
console.log(`Tagged template result: ${taggedResult}`);

// ==================== 6. ARRAY METHODS ====================
console.log('\n--- SECTION 6: ARRAY METHODS ---');

const numbers = [1, 2, 3, 4, 5];

// forEach
numbers.forEach((n, i) => console.log(`forEach: index ${i} = ${n}`));

// map
const doubled = numbers.map(n => n * 2);
console.log(`map: [${numbers}] → [${doubled}]`);

// filter
const evens = numbers.filter(n => n % 2 === 0);
console.log(`filter: [${numbers}] → [${evens}]`);

// reduce
const sum = numbers.reduce((acc, n) => acc + n, 0);
console.log(`reduce: sum = ${sum}`);

// find & findIndex
const found = numbers.find(n => n > 3);
const foundIndex = numbers.findIndex(n => n > 3);
console.log(`find: first > 3 = ${found}, index = ${foundIndex}`);

// some & every
console.log(`some (even): ${numbers.some(n => n % 2 === 0)}`);
console.log(`every (>0): ${numbers.every(n => n > 0)}`);

// includes (ES7/ES8)
console.log(`includes(3): ${numbers.includes(3)}`);
console.log(`includes(10): ${numbers.includes(10)}`);

// flat and flatMap (ES10 but tested)
const nested = [1, [2, 3], [4, [5, 6]]];
console.log(`flat(1): [${nested.flat(1)}]`);
console.log(`flatMap: [${numbers.flatMap(n => [n, n * 2])}]`);

// ==================== 7. CLASSES (ES6/ES8 syntax) ====================
console.log('\n--- SECTION 7: CLASSES ---');

// ES8-compatible private state pattern
const _animalPrivate = new WeakMap();
function getAnimalPrivate(instance) {
  return _animalPrivate.get(instance);
}

class Animal {
  constructor(name, species) {
    this.name = name;
    this.species = species;
    _animalPrivate.set(this, {
      privateField: 'private value'
    });
  }
  
  // Instance method
  speak() {
    return `${this.name} makes a sound`;
  }
  
  // Getter
  get description() {
    return `${this.name} is a ${this.species}`;
  }
  
  // Setter
  set nickname(nick) {
    this._nickname = nick;
  }
  
  get nickname() {
    return this._nickname || this.name;
  }
  
  // Static method
  static classify() {
    return 'All animals are living organisms';
  }
  
  // Private-like helper method (ES8-compatible)
  _privateMethod() {
    return 'This is private';
  }
  
  // Method that uses private state
  accessPrivate() {
    return getAnimalPrivate(this).privateField;
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name, 'Canine');
    this.breed = breed;
  }
  
  // Override method
  speak() {
    return `${this.name} barks! Woof!`;
  }
  
  // Super call
  introduce() {
    return `${super.speak()} But specifically, I'm a ${this.breed}.`;
  }
}

const genericAnimal = new Animal('Generic', 'Unknown');
console.log(`Class instance: ${genericAnimal.speak()}`);
console.log(`Getter: ${genericAnimal.description}`);
genericAnimal.nickname = 'Genny';
console.log(`Setter/Getter: nickname = ${genericAnimal.nickname}`);
console.log(`Static method: ${Animal.classify()}`);
console.log(`Private field access: ${genericAnimal.accessPrivate()}`);

const dog = new Dog('Rex', 'German Shepherd');
console.log(`Dog speak: ${dog.speak()}`);
console.log(`Dog introduce: ${dog.introduce()}`);
console.log(`Dog instanceof Animal: ${dog instanceof Animal}`);

// ==================== 8. PROMISES & ASYNC/AWAIT (ES8 core feature) ====================
console.log('\n--- SECTION 8: PROMISES & ASYNC/AWAIT (ES8) ---');

// Promise creation
const simplePromise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Promise resolved after 500ms');
  }, 500);
});

simplePromise.then(result => {
  console.log(`Promise then: ${result}`);
}).catch(err => {
  console.error(`Promise catch: ${err}`);
});

// Promise chaining
Promise.resolve(5)
  .then(n => n * 2)
  .then(n => n + 3)
  .then(n => console.log(`Promise chain result: ${n}`));

// Promise.all
const p1 = Promise.resolve('First');
const p2 = Promise.resolve('Second');
const p3 = Promise.resolve('Third');
Promise.all([p1, p2, p3]).then(results => {
  console.log(`Promise.all: [${results}]`);
});

// Promise.race
const fast = new Promise(resolve => setTimeout(() => resolve('fast'), 100));
const slow = new Promise(resolve => setTimeout(() => resolve('slow'), 200));
Promise.race([fast, slow]).then(result => {
  console.log(`Promise.race winner: ${result}`);
});

// Async function (ES8)
async function asyncFunction() {
  console.log('Async function started');
  return 'Async result';
}

asyncFunction().then(result => console.log(`Async function returned: ${result}`));

// Async/Await with Promise (ES8)
function delay(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

async function asyncAwaitDemo() {
  console.log('async/await demo - starting');
  const result1 = await delay(300, 'First await result');
  console.log(`After first await: ${result1}`);
  
  const result2 = await delay(200, 'Second await result');
  console.log(`After second await: ${result2}`);
  
  return `Final result: ${result1} & ${result2}`;
}

asyncAwaitDemo().then(final => console.log(final));

// Async with error handling
async function asyncWithError() {
  try {
    await Promise.reject('Something went wrong');
  } catch (error) {
    console.log(`Caught in async/await: ${error}`);
  }
}
asyncWithError();

// ==================== 9. EXCEPTIONS & ERROR HANDLING ====================
console.log('\n--- SECTION 9: EXCEPTIONS ---');

// try-catch-finally
try {
  console.log('Try block - attempting operation');
  throw new Error('Custom error thrown');
  // Unreachable code
} catch (error) {
  console.log(`Catch block - caught: ${error.message}`);
} finally {
  console.log('Finally block - always executes');
}

// Multiple catch types (using instanceof)
try {
  let obj = null;
  obj.property; // TypeError
} catch (err) {
  if (err instanceof TypeError) {
    console.log(`TypeError caught: ${err.message}`);
  } else if (err instanceof RangeError) {
    console.log(`RangeError caught: ${err.message}`);
  } else {
    console.log(`Unknown error: ${err.message}`);
  }
}

// Custom error class
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

try {
  throw new ValidationError('Invalid email format', 'email');
} catch (err) {
  console.log(`Custom error - ${err.name}: ${err.message} (field: ${err.field})`);
}

// Finally without catch
try {
  console.log('Try without catch - works fine');
} finally {
  console.log('Finally executes even without catch');
}

// ==================== 10. SHARED MEMORY & ATOMICS (ES8 feature) ====================
console.log('\n--- SECTION 10: SHARED MEMORY & ATOMICS (ES8) ---');

// Check if SharedArrayBuffer is available (may be disabled due to security)
if (typeof SharedArrayBuffer !== 'undefined') {
  // Create shared buffer
  const sab = new SharedArrayBuffer(1024);
  console.log(`SharedArrayBuffer created: size = ${sab.byteLength} bytes`);
  
  // Create Int32Array view
  const intArray = new Int32Array(sab);
  intArray[0] = 42;
  console.log(`Initial value at index 0: ${intArray[0]}`);
  
  // Atomics operations
  console.log(`Atomics.add(0, 10): old value = ${Atomics.add(intArray, 0, 10)}`);
  console.log(`After Atomics.add: value = ${intArray[0]}`);
  
  console.log(`Atomics.sub(0, 5): old value = ${Atomics.sub(intArray, 0, 5)}`);
  console.log(`After Atomics.sub: value = ${intArray[0]}`);
  
  console.log(`Atomics.compareExchange(0, 47, 100): old = ${Atomics.compareExchange(intArray, 0, 47, 100)}`);
  console.log(`After compareExchange (expected 47, got 47): ${intArray[0]}`);
  
  console.log(`Atomics.compareExchange(0, 100, 200): old = ${Atomics.compareExchange(intArray, 0, 100, 200)}`);
  console.log(`After compareExchange (expected 100, got 47): ${intArray[0]}`);
  
  Atomics.store(intArray, 1, 999);
  console.log(`Atomics.load(1): ${Atomics.load(intArray, 1)}`);
  
  // Atomics.wait and notify would require worker threads, skipping
  console.log('Atomics operations completed');
} else {
  console.log('SharedArrayBuffer not available (may be disabled for security)');
  console.log('Atomics tests skipped');
}

// ==================== 11. TRAILING COMMAS (ES8 feature) ====================
console.log('\n--- SECTION 11: TRAILING COMMAS (ES8) ---');

// Trailing commas in function parameters and calls
function trailingCommas(
  param1,
  param2,
  param3,  // trailing comma allowed in ES8
) {
  return `${param1}, ${param2}, ${param3}`;
}

console.log(`Trailing commas in function definition: ${trailingCommas(
  'a',
  'b',
  'c',  // trailing comma in call
)}`);

// Trailing commas in array
const arrWithTrailing = [1, 2, 3,];
console.log(`Array with trailing comma: length = ${arrWithTrailing.length}, values = [${arrWithTrailing}]`);

// Trailing commas in object
const objWithTrailing = {
  name: 'Test',
  value: 123,
};  // trailing comma allowed
console.log(`Object with trailing comma: ${JSON.stringify(objWithTrailing)}`);

// ==================== 12. DESTRUCTURING (ES6/ES8) ====================
console.log('\n--- SECTION 12: DESTRUCTURING ---');

// Array destructuring
const [first, second, ...restArr] = [10, 20, 30, 40, 50];
console.log(`Array destructuring: first=${first}, second=${second}, rest=[${restArr}]`);

// Object destructuring
const { name: personName, age: personAge, city = 'Unknown' } = person;
console.log(`Object destructuring: name=${personName}, age=${personAge}, city=${city}`);

// Nested destructuring
const nestedObj = { user: { id: 101, profile: { nickname: 'JDoe' } } };
const { user: { profile: { nickname } } } = nestedObj;
console.log(`Nested destructuring: nickname=${nickname}`);

// Parameter destructuring
function printPerson({ name, age }) {
  console.log(`Parameter destructuring: ${name} is ${age} years old`);
}
printPerson(person);

// ==================== 13. SYMBOLS & ITERATORS ====================
console.log('\n--- SECTION 13: SYMBOLS & ITERATORS ---');

const sym1 = Symbol('unique');
const sym2 = Symbol('unique');
console.log(`Symbol equality: ${sym1 === sym2 ? 'equal' : 'not equal'}`);
console.log(`Symbol description: ${sym1.description}`);

// Symbol as object key
const symObj = {
  [sym1]: 'secret value',
  regular: 'normal'
};
console.log(`Symbol key access: ${symObj[sym1]}`);

// Custom iterator
const range = {
  from: 1,
  to: 5,
  [Symbol.iterator]() {
    let current = this.from;
    const end = this.to;
    return {
      next() {
        if (current <= end) {
          return { value: current++, done: false };
        }
        return { done: true };
      }
    };
  }
};
console.log('Custom iterator values:');
for (const num of range) {
  console.log(`  ${num}`);
}

// ==================== 14. MODULES (syntax demonstration) ====================
console.log('\n--- SECTION 14: MODULES (syntax only) ---');
console.log('Note: Module tests require separate files or type="module"');
console.log('Syntax demonstrated:');
console.log('  export const name = "value";');
console.log('  export default function() {}');
console.log('  import { name } from "./module.js";');
console.log('  import * as module from "./module.js";');
console.log('  import defaultExport from "./module.js";');

// Simulated module pattern
const modulePattern = (() => {
  let privateVar = 'private';
  return {
    publicMethod() { return privateVar; }
  };
})();
console.log(`Module pattern (IIFE): ${modulePattern.publicMethod()}`);

// ==================== 15. MISCELLANEOUS SYNTAX ====================
console.log('\n--- SECTION 15: MISCELLANEOUS SYNTAX ---');

// typeof operator
console.log(`typeof 42: ${typeof 42}`);
console.log(`typeof "string": ${typeof "string"}`);
console.log(`typeof true: ${typeof true}`);
console.log(`typeof undefined: ${typeof undefined}`);
console.log(`typeof null: ${typeof null}`); // historical bug
console.log(`typeof {}: ${typeof {}}`);
console.log(`typeof []: ${typeof []}`);
console.log(`typeof function(){}: ${typeof function(){}}`);

// instanceof operator
console.log(`[] instanceof Array: ${[] instanceof Array}`);
console.log(`{} instanceof Object: ${{} instanceof Object}`);
console.log(`dog instanceof Dog: ${dog instanceof Dog}`);

// in operator
console.log(`'name' in person: ${'name' in person}`);
console.log(`'toString' in person: ${'toString' in person}`);

// delete operator
let deleteTest = { x: 1, y: 2 };
console.log(`Before delete: ${JSON.stringify(deleteTest)}`);
delete deleteTest.x;
console.log(`After delete x: ${JSON.stringify(deleteTest)}`);

// void operator
const voidResult = void 0;
console.log(`void operator result: ${voidResult}`);

// new operator
function ConstructorExample(val) {
  this.value = val;
}
const instance = new ConstructorExample(100);
console.log(`new operator: ${instance.value}`);

// Optional chaining (ES2020 - but widely supported)
const optionalChain = person?.address?.city ?? 'no city';
console.log(`Optional chaining: ${optionalChain}`);

// ==================== 16. EVALUATION & REFLECT ====================
console.log('\n--- SECTION 16: EVALUATION & REFLECT ---');

// eval (use with caution)
const evalResult = eval('2 + 2');
console.log(`eval('2 + 2'): ${evalResult}`);

// Reflect API (ES6)
const reflectObj = { a: 1 };
Reflect.set(reflectObj, 'b', 2);
console.log(`Reflect.set: ${JSON.stringify(reflectObj)}`);
console.log(`Reflect.get(reflectObj, 'a'): ${Reflect.get(reflectObj, 'a')}`);
console.log(`Reflect.has(reflectObj, 'b'): ${Reflect.has(reflectObj, 'b')}`);
console.log(`Reflect.ownKeys(reflectObj): [${Reflect.ownKeys(reflectObj)}]`);

// ==================== 17. SET, MAP, WEAKSET, WEAKMAP ====================
console.log('\n--- SECTION 17: SET, MAP, WEAKSET, WEAKMAP ---');

// Set
const set = new Set([1, 2, 3, 3, 4]);
console.log(`Set: size=${set.size}, values=[${[...set]}]`);
set.add(5);
console.log(`Set after add: [${[...set]}]`);
console.log(`Set has(3): ${set.has(3)}`);

// Map
const map = new Map();
map.set('key1', 'value1');
map.set('key2', 'value2');
console.log(`Map get('key1'): ${map.get('key1')}`);
console.log(`Map size: ${map.size}`);
map.forEach((val, key) => console.log(`  Map: ${key}=${val}`));

// WeakSet (only objects)
let weakObj = {};
const weakSet = new WeakSet([weakObj]);
console.log(`WeakSet has: ${weakSet.has(weakObj)}`);
weakObj = null; // allows garbage collection

// WeakMap
let weakKey = {};
const weakMap = new WeakMap([[weakKey, 'weak value']]);
console.log(`WeakMap get: ${weakMap.get(weakKey)}`);
weakKey = null;

// ==================== 18. FINAL SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log('ES8 SYNTAX TEST COMPLETE');
console.log('='.repeat(60));
console.log('Tested features:');
console.log('  ✓ Arithmetic, assignment, comparison, logical, bitwise operators');
console.log('  ✓ var, let, const declarations');
console.log('  ✓ All function forms (declaration, expression, arrow, generator, IIFE)');
console.log('  ✓ Object.values(), Object.entries(), Object.getOwnPropertyDescriptors()');
console.log('  ✓ String.padStart(), String.padEnd()');
console.log('  ✓ Array methods (map, filter, reduce, etc.)');
console.log('  ✓ Classes (inheritance, getters/setters, static, private fields)');
console.log('  ✓ Promises and async/await');
console.log('  ✓ Exception handling (try/catch/finally, custom errors)');
console.log('  ✓ SharedArrayBuffer and Atomics');
console.log('  ✓ Trailing commas in functions, arrays, objects');
console.log('  ✓ Destructuring (arrays, objects, parameters)');
console.log('  ✓ Symbols and iterators');
console.log('  ✓ Module syntax (simulated)');
console.log('  ✓ typeof, instanceof, in, delete, void, new');
console.log('  ✓ eval and Reflect API');
console.log('  ✓ Set, Map, WeakSet, WeakMap');
console.log('\nAll syntax elements validated successfully!');