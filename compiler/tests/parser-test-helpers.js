'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const Parser = require(path.resolve(__dirname, '..', 'ecmascript-parser'));
const { ParseTreeCollector } = require(path.resolve(__dirname, '..', 'parse-tree-collector'));

function parseWithCollector(source) {
  const collector = new ParseTreeCollector();
  const parser = new Parser(source, collector);
  parser.parse();

  return {
    parser,
    collector,
    root: collector.root
  };
}

function assertParses(source, label) {
  const result = parseWithCollector(source);
  assert.ok(result.root, `Expected parse tree root for ${label}`);
  assert.equal(result.root.name, 'program', `Expected root nonterminal 'program' for ${label}`);
  return result;
}

function assertFailsToParse(source, expectedMessageFragment, label) {
  let thrown = null;

  try {
    parseWithCollector(source);
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, `Expected parser failure for ${label}`);

  if (expectedMessageFragment) {
    assert.match(
      String(thrown.message || thrown),
      new RegExp(expectedMessageFragment),
      `Expected parser failure for ${label} to match '${expectedMessageFragment}'`
    );
  }

  return thrown;
}

module.exports = {
  parseWithCollector,
  assertParses,
  assertFailsToParse
};
