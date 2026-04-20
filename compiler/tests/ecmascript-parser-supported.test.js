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
  { name: 'line comment as sourceElement', source: '// comment\n' }
  // TODO: multiline comment causes regex lookahead confusion in lexer
  // { name: 'multiline comment as sourceElement', source: '/* comment */' },
  // { name: 'mixed source elements', source: '/* a */;debugger;this;' }
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
