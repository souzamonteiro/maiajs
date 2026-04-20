'use strict';

const { test } = require('node:test');

const { assertParses } = require('./parser-test-helpers');

// ES6 features now working (promoted from target baseline)
const es6Supported = [
  {
    feature: 'let and const declarations',
    cases: [
      { name: 'let declaration', source: 'let x = this;' },
      { name: 'const declaration', source: 'const x = this;' }
    ]
  },
  {
    feature: 'arrow functions',
    cases: [
      { name: 'single parameter arrow', source: 'x => x;' },
      { name: 'parenthesized arrow', source: '(x, y) => x;' }
    ]
  },
  {
    feature: 'class declarations',
    cases: [
      { name: 'simple class', source: 'class A {}' },
      { name: 'class with extends', source: 'class A extends B {}' }
    ]
  },
  {
    feature: 'for-of',
    cases: [
      { name: 'for-of statement', source: 'for (let x of this) {}' }
    ]
  }
];

// ES6 features promoted from target baseline
const es6AdditionalSupported = [
  {
    feature: 'template literals',
    cases: [
      { name: 'plain template', source: '`hello`;' },
      { name: 'template with interpolation', source: '`value ${this}`;' }
    ]
  },
  {
    feature: 'destructuring',
    cases: [
      { name: 'array pattern', source: 'let [a] = this;' },
      { name: 'object pattern', source: 'let {a} = this;' }
    ]
  },
  {
    feature: 'default/rest/spread',
    cases: [
      { name: 'default parameter', source: 'function f(a = this){}' },
      { name: 'rest parameter', source: 'function f(...args){}' },
      { name: 'spread call', source: 'f(...this);' }
    ]
  },
  {
    feature: 'modules',
    cases: [
      { name: 'named export', source: 'export { x };' },
      { name: 'import binding', source: 'import x from "m";' }
    ]
  }
];

test('ES6 supported features now working', async (t) => {
  for (const featureSection of es6Supported) {
    await t.test(featureSection.feature, async (featureTest) => {
      for (const sample of featureSection.cases) {
        await featureTest.test(sample.name, () => {
          assertParses(sample.source, sample.name);
        });
      }
    });
  }
});

test('ES6 additional features now working', async (t) => {
  for (const featureSection of es6AdditionalSupported) {
    await t.test(featureSection.feature, async (featureTest) => {
      for (const sample of featureSection.cases) {
        await featureTest.test(sample.name, () => {
          assertParses(sample.source, sample.name);
        });
      }
    });
  }
});
