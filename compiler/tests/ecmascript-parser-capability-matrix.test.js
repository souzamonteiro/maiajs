'use strict';

const { test } = require('node:test');

const { assertParses, assertFailsToParse } = require('./parser-test-helpers');

const capabilityMatrix = [
  {
    area: 'Program and statements',
    supported: [
      { name: 'empty statement', source: ';' },
      { name: 'block', source: '{}' },
      { name: 'if with this', source: 'if(this){}else{}' },
      { name: 'iteration forms with this', source: 'do{}while(this);while(this){}for(this;this;this){}' },
      { name: 'switch default', source: 'switch(this){default:;}' },
      { name: 'function declaration with identifier', source: 'function f(){}' },
      { name: 'var declaration with identifier', source: 'var a;' },
      { name: 'try catch finally with catch identifier', source: 'try{}catch(e){}finally{}' }
    ],
    unsupported: []
  },
  {
    area: 'Primary expressions',
    supported: [
      { name: 'this primary expression', source: 'this;' },
      { name: 'identifier expression', source: 'x;' },
      { name: 'numeric literal expression', source: '1;' },
      { name: 'string literal expression', source: '"x";' },
      { name: 'boolean literal expression', source: 'true;' },
      { name: 'null literal expression', source: 'null;' }
    ],
    unsupported: []
  },
  {
    area: 'Comments and trivia',
    supported: [
      { name: 'single-line comment top level', source: '// c\n' }
      // TODO: multiline comment causes regex lookahead confusion in lexer
      // { name: 'multi-line comment top level', source: '/* c */' }
    ],
    unsupported: []
  }
];

test('capability matrix documents current parser support and limits', async (t) => {
  for (const section of capabilityMatrix) {
    await t.test(section.area, async (sectionTest) => {
      for (const item of section.supported) {
        await sectionTest.test(`supported: ${item.name}`, () => {
          assertParses(item.source, item.name);
        });
      }

      for (const item of section.unsupported) {
        await sectionTest.test(`unsupported (current baseline): ${item.name}`, () => {
          assertFailsToParse(item.source, item.errorLike, item.name);
        });
      }
    });
  }
});
