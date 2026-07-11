'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { assertParses } = require('./parser-test-helpers');

const supportedCases = [
  { name: 'empty statement', source: ';' },
  { name: 'block statement', source: '{}' },
  { name: 'debugger statement', source: 'debugger;' },
  { name: 'expression statement with this', source: 'this;' },
  { name: 'return statement with this', source: 'return this;' },
  { name: 'throw statement with this', source: 'throw this;' },
  { name: 'with statement', source: 'with(this){}' },
  { name: 'if statement', source: 'if(this){}' },
  { name: 'if else statement', source: 'if(this){}else{}' },
  { name: 'while statement', source: 'while(this){}' },
  { name: 'do while statement', source: 'do{}while(this);' },
  { name: 'for statement without clauses', source: 'for(;;){}' },
  { name: 'for statement with expressions', source: 'for(this;this;this){}' },
  { name: 'for in statement', source: 'for(this in this){}' },
  { name: 'switch statement', source: 'switch(this){default:;}' },
  { name: 'line comment as sourceElement', source: '// comment\n' },
  { name: 'multiline comment as sourceElement', source: '/* comment */' },
  { name: 'mixed source elements', source: '/* a */;debugger;this;' },
  { name: 'object literal with properties', source: 'const obj = {a:1, b:2};' },
  { name: 'empty object literal', source: 'const obj = {};' },
  { name: 'member call expression', source: 'x.y();' },
  { name: 'console log call expression', source: 'console.log("hello");' },
  {
    name: 'function argument containing template literal with computed member interpolation',
    source: 'foo(function(entry){ bar(`x ${entry[0]}`); });'
  },
  {
    name: 'template literal interpolation containing callback with block body',
    source: 'console.log(`x ${numbers.some(function(n) { return n % 2 === 0; })}`);'
  },
  {
    name: 'member access accepts reserved-word property names',
    source: 'simplePromise.then(function(result) { console.log(`Promise then: ${result}`); }).catch(function(err) { console.error(`Promise catch: ${err}`); });'
  },
  {
    name: 'function declaration accepts trailing comma in parameters',
    source: 'function trailingCommas(param1, param2, param3,) { return param1 + param2 + param3; }'
  },
  {
    name: 'computed property accepts function-valued assignment with nested object returns',
    source: 'const range = { [Symbol.iterator]: function() { let current = this.from; return { next: function() { return { done: true }; } }; } };'
  },
  {
    name: 'object literal accepts reserved-word property names before computed properties',
    source: 'const range = { from: 1, to: 5, [Symbol.iterator]: function() { let current = this.from; const end = this.to; return { next: function() { if (current <= end) { return { value: current++, done: false }; } return { done: true }; } }; } };'
  },
  {
    name: 'variable initializer accepts function expressions',
    source: 'const expressionFunc = function(param) { return `Function expression: ${param}`; };'
  },
  {
    name: 'new expression parses as constructor call statement',
    source: 'new Foo();'
  },
  {
    name: 'variable initializer accepts new expressions',
    source: 'const genericAnimal = new Animal("Generic", "Unknown");'
  },
  {
    name: 'binding identifiers accept contextual keywords like set',
    source: 'const set = new Set([1, 2, 3]);'
  },
  {
    name: 'identifier references accept contextual keywords like set',
    source: 'set.add(5);'
  }
];

test('current parser accepts known-supported grammar subset', async (t) => {
  for (const testCase of supportedCases) {
    await t.test(testCase.name, () => {
      const { collector } = assertParses(testCase.source, testCase.name);
      const xml = collector.toXml({ includeDeclaration: true });
      assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      assert.match(xml, /<program>/);
    });
  }
});
