'use strict';

const { test } = require('node:test');

const { assertParses } = require('./parser-test-helpers');

const es8Supported = [
  {
    feature: 'async functions and await',
    cases: [
      { name: 'async function declaration', source: 'async function f(){ await x; }' },
      { name: 'async function expression', source: 'const f = async function(a){ return await a; };' },
      { name: 'export async function', source: 'export async function f(){ await x; }' },
      { name: 'await unary expression', source: 'async function f(){ return await x + 1; }' }
    ]
  },
  {
    feature: 'async arrows and async methods',
    cases: [
      { name: 'async arrow single param', source: 'const f = async x => await x;' },
      { name: 'async arrow parenthesized', source: 'const f = async (x, y) => await x + y;' },
      { name: 'async class method', source: 'class A { async f(x){ return await x; } }' }
    ]
  },
  {
    feature: 'exponentiation operator',
    cases: [
      { name: 'simple exponentiation', source: 'const x = 2 ** 3;' },
      { name: 'right associativity form', source: 'const x = 2 ** 3 ** 2;' },
      { name: 'exponentiation assignment', source: 'let x = 2; x **= 3;' }
    ]
  },
  {
    feature: 'arguments trailing comma',
    cases: [
      { name: 'call with trailing comma', source: 'f(a,);' },
      { name: 'call with two positional arguments', source: 'f(a, b);' },
      { name: 'call with numeric arguments', source: 'f(1, 2);' }
    ]
  }
];

test('ES8 features now supported', async (t) => {
  for (const featureSection of es8Supported) {
    await t.test(featureSection.feature, async (featureTest) => {
      for (const sample of featureSection.cases) {
        await featureTest.test(sample.name, () => {
          assertParses(sample.source, sample.name);
        });
      }
    });
  }
});
