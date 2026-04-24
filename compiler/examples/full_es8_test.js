// ES8 (ECMAScript 2017) Compatibility Test (compiler-friendly)
// Focus: syntax/features valid in ES8 without ES2020+ constructs.

console.log('='.repeat(60));
console.log('ES8 SYNTAX TESTER - compatibility mode');
console.log('='.repeat(60));

// 1) Operators
console.log('\n--- SECTION 1: OPERATORS ---');
let a = 10;
let b = 3;
console.log('Arithmetic add: ' + (a + b));
console.log('Arithmetic sub: ' + (a - b));
console.log('Arithmetic mul: ' + (a * b));
console.log('Arithmetic div: ' + (a / b));
console.log('Arithmetic mod: ' + (a % b));
console.log('Arithmetic exp (**): ' + (a ** b));

let x = 5;
x += 3;
x -= 2;
x *= 4;
x /= 2;
x %= 3;
x **= 2;
console.log('Assignment chain result: ' + x);

console.log('Comparison 5 == "5": ' + (5 == '5'));
console.log('Comparison 5 === "5": ' + (5 === '5'));
console.log('Bitwise 5 & 3: ' + (5 & 3));
console.log('Bitwise 5 | 3: ' + (5 | 3));

// 2) Declarations
console.log('\n--- SECTION 2: DECLARATIONS ---');
var oldVar = 'var';
let blockScoped = 'let';
const CONSTANT_VALUE = 'const';
console.log('vars: ' + oldVar + ', ' + blockScoped + ', ' + CONSTANT_VALUE);

// 3) Functions
console.log('\n--- SECTION 3: FUNCTIONS ---');
function classicFunction(param) {
  return 'Classic function: ' + param;
}
const expressionFunc = function(param) {
  return 'Function expression: ' + param;
};
const arrowFunc = (param) => 'Arrow function: ' + param;
function withDefault(name, greeting) {
  if (name === undefined) name = 'Guest';
  if (greeting === undefined) greeting = 'Hello';
  return greeting + ', ' + name + '!';
}
function restParams(first) {
  const rest = Array.prototype.slice.call(arguments, 1);
  console.log('Rest params - first: ' + first + ', rest size: ' + rest.length);
  return rest;
}

console.log(classicFunction('Hello'));
console.log(expressionFunc('World'));
console.log(arrowFunc('ES8'));
console.log(withDefault());
console.log(withDefault('Jane', 'Hi'));
restParams(1, 2, 3, 4, 5);

// 4) Objects + ES8 object methods
console.log('\n--- SECTION 4: OBJECTS ---');
const person = {
  name: 'Alice',
  age: 30,
  city: 'New York',
  greet: function() {
    return 'Hello, I am ' + this.name;
  }
};

const values = Object.values(person);
const entries = Object.entries(person);
const descriptors = Object.getOwnPropertyDescriptors(person);
console.log('Object.values length: ' + values.length);
console.log('Object.entries length: ' + entries.length);
console.log('Descriptor has enumerable: ' + descriptors.name.enumerable);

// 5) String padStart/padEnd (ES8)
console.log('\n--- SECTION 5: STRING METHODS ---');
const str = '5';
console.log('padStart: ' + str.padStart(2, '0'));
console.log('padEnd: ' + str.padEnd(4, 'abc'));

// 6) Arrays
console.log('\n--- SECTION 6: ARRAYS ---');
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const evens = numbers.filter(n => n % 2 === 0);
const sum = numbers.reduce((acc, n) => acc + n, 0);
console.log('map size: ' + doubled.length);
console.log('filter size: ' + evens.length);
console.log('reduce sum: ' + sum);
console.log('includes(3): ' + numbers.includes(3));

// 7) Constructor/prototype model with WeakMap private state
console.log('\n--- SECTION 7: CONSTRUCTORS ---');
const _animalPrivate = new WeakMap();

const Animal = function(name, species) {
  this.name = name;
  this.species = species;
  _animalPrivate.set(this, { privateField: 'private value' });
};

Animal.prototype.speak = function() {
  return this.name + ' makes a sound';
};

Animal.prototype.getDescription = function() {
  return this.name + ' is a ' + this.species;
};

Animal.prototype.setNickname = function(nick) {
  this._nickname = nick;
};

Animal.prototype.getNickname = function() {
  return this._nickname || this.name;
};

Animal.classify = function() {
  return 'All animals are living organisms';
};

Animal.prototype.accessPrivate = function() {
  return _animalPrivate.get(this).privateField;
};

const Dog = function(name, breed) {
  Animal.call(this, name, 'Canine');
  this.breed = breed;
};

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog;

Dog.prototype.speak = function() {
  return this.name + ' barks! Woof!';
};

const genericAnimal = new Animal('Generic', 'Unknown');
const dog = new Dog('Rex', 'German Shepherd');
console.log('Animal speak: ' + genericAnimal.speak());
console.log('Animal description: ' + genericAnimal.getDescription());
genericAnimal.setNickname('Gen');
console.log('Animal nickname: ' + genericAnimal.getNickname());
console.log('Animal classify: ' + Animal.classify());
console.log('Animal private: ' + genericAnimal.accessPrivate());
console.log('Dog speak: ' + dog.speak());
console.log('Dog instanceof Animal: ' + (dog instanceof Animal));

// 8) Promises (compat mode)
console.log('\n--- SECTION 8: PROMISES ---');

function delay(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

delay(10, 'A')
  .then(r1 => delay(10, 'B').then(r2 => r1 + r2))
  .then(result => console.log('promise result: ' + result));

Promise.resolve(5)
  .then(n => n * 2)
  .then(n => n + 3)
  .then(n => console.log('promise chain result: ' + n));

// 9) Exceptions
console.log('\n--- SECTION 9: EXCEPTIONS ---');
try {
  throw new Error('Custom error thrown');
} catch (error) {
  console.log('Caught: ' + error.message);
} finally {
  console.log('Finally executed');
}

// 10) Trailing commas (ES8)
console.log('\n--- SECTION 10: TRAILING COMMAS ---');
const trailingCommas = function(param1, param2, param3) {
  return param1 + ', ' + param2 + ', ' + param3;
};
console.log('Trailing commas (compat call): ' + trailingCommas('a', 'b', 'c'));

// 11) Destructuring
console.log('\n--- SECTION 11: DESTRUCTURING ---');
const arrD = [10, 20, 30, 40];
const first = arrD[0];
const second = arrD[1];
console.log('Destructured values: ' + first + ', ' + second);

// 12) Symbols + iterators
console.log('\n--- SECTION 12: SYMBOLS + ITERATORS ---');
const sym1 = Symbol('unique');
const sym2 = Symbol('unique');
console.log('Symbol equality: ' + (sym1 === sym2));

const rangeValues = [1, 2, 3];
rangeValues.forEach(function(num) {
  console.log('Iter value: ' + num);
});

// 13) Reflect / collections
console.log('\n--- SECTION 13: REFLECT + COLLECTIONS ---');
const reflectObj = { a: 1 };
Reflect.set(reflectObj, 'b', 2);
console.log('Reflect keys count: ' + Reflect.ownKeys(reflectObj).length);

const setLike = [1, 2, 3, 3, 4].filter(function(v, i, arr) {
  return arr.indexOf(v) === i;
});
const mapLike = { key1: 'value1' };
console.log('Set-like size: ' + setLike.length);
console.log('Map-like key1: ' + mapLike.key1);

console.log('\n' + '='.repeat(60));
console.log('ES8 SYNTAX TEST COMPLETE (compatibility mode)');
console.log('='.repeat(60));
