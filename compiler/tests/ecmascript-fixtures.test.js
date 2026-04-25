'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runFixtures } = require('./fixtures-runner');

test('fixture suite: lexer/parser/transpiler coverage matrix', () => {
  const summary = runFixtures({
    fixturesDir: 'compiler/tests/fixtures'
  });

  assert.equal(
    summary.failed,
    0,
    `Fixture failures (${summary.failed}/${summary.total}):\n${summary.failures
      .map((f) => `- ${f.name}: ${f.errors.join('; ')}`)
      .join('\n')}`
  );
});
