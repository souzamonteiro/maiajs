'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Parser = require(path.resolve(__dirname, '..', 'ecmascript-parser'));
const { ParseTreeCollector } = require(path.resolve(__dirname, '..', 'parse-tree-collector'));
const { buildAsyncIR, ASYNC_IR_VERSION } = require(path.resolve(__dirname, '..', 'ecmascript', 'async-ir'));

function parseTree(source) {
  const collector = new ParseTreeCollector();
  const parser = new Parser(source, collector);
  parser.parse();
  return collector.root;
}

test('async IR version is defined and semver-shaped', () => {
  assert.match(ASYNC_IR_VERSION, /^\d+\.\d+\.\d+$/, 'version must be semver');
});

test('async IR buildAsyncIR returns manifest with asyncFunctions array', () => {
  const tree = parseTree('async function fetch() {}\n');
  const ir = buildAsyncIR(tree);

  assert.ok(ir, 'IR manifest must be defined');
  assert.ok(Array.isArray(ir.asyncFunctions), 'asyncFunctions must be an array');
  assert.equal(ir.version, ASYNC_IR_VERSION, 'IR manifest must include version');
});

test('async IR identifies a named async function declaration', () => {
  const tree = parseTree('async function load() {}\n');
  const ir = buildAsyncIR(tree);

  assert.equal(ir.asyncFunctions.length, 1, 'must detect exactly one async function');
  const machine = ir.asyncFunctions[0];
  assert.equal(machine.kind, 'AsyncStateMachine', 'node kind must be AsyncStateMachine');
  assert.equal(machine.name, 'load', 'must extract function name');
});

test('async IR emits no suspend points for async function with no await', () => {
  const tree = parseTree('async function noop() {}\n');
  const ir = buildAsyncIR(tree);

  assert.equal(ir.asyncFunctions.length, 1);
  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 0, 'no await means no suspend points');
  assert.deepEqual(machine.body, [], 'body must be empty');
});

test('async IR emits correct suspend point count for awaited expressions', () => {
  const tree = parseTree('async function run() { await fetch(); await store(); }\n');
  const ir = buildAsyncIR(tree);

  assert.equal(ir.asyncFunctions.length, 1);
  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 2, 'must count two await checkpoints');
  assert.equal(machine.body.length, 2, 'body must have two suspend point entries');
  assert.equal(machine.body[0].kind, 'suspend', 'first entry must be suspend');
  assert.equal(machine.body[0].stateId, 1, 'first suspend point state ID must be 1');
  assert.equal(machine.body[1].stateId, 2, 'second suspend point state ID must be 2');
});

test('async IR suspend points have null awaitedExpr before lowering', () => {
  const tree = parseTree('async function run() { await fetch(); }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.body[0].awaitedExpr, null, 'awaitedExpr must be null before lowering pass');
});

test('async IR supports lowering awaitedExpr via callback', () => {
  const tree = parseTree('async function run() { await fetch(x, y); }\n');
  const ir = buildAsyncIR(tree, {
    lowerAwaitOperand(node) {
      assert.equal(node.name, 'unaryExpression', 'await operand should be the expression child');
      return 'fetch(x, y)';
    }
  });

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.body[0].awaitedExpr, 'fetch(x, y)', 'awaitedExpr must store lowered operand string');
});

test('async IR marks await outside try with tryDepth=0', () => {
  const tree = parseTree('async function run() { await fetch(); }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.body[0].tryDepth, 0, 'await outside try must have tryDepth=0');
});

test('async IR marks await inside try with tryDepth=1', () => {
  const tree = parseTree('async function run() { try { await fetch(); } catch (e) { } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 1, 'must detect one suspend point');
  assert.equal(machine.body[0].tryDepth, 1, 'await inside try must have tryDepth=1');
});

test('async IR marks await in nested try with tryDepth=2', () => {
  const tree = parseTree('async function run() { try { try { await fetch(); } catch (e1) { } } catch (e2) { } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 1, 'must detect one suspend point');
  assert.equal(machine.body[0].tryDepth, 2, 'await in nested try must have tryDepth=2');
});

test('async IR collects catch handler from wrapping try', () => {
  const tree = parseTree('async function run() { try { await fetch(); } catch (e) { } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.body[0].catchHandlers.length, 1, 'must collect one catch handler');
  assert.equal(machine.body[0].catchHandlers[0].paramName, 'e', 'must extract catch parameter name');
  assert.equal(machine.body[0].catchHandlers[0].typeCode, 1, 'must assign generic type code 1');
});

test('async IR collects multiple catch handlers from nested try', () => {
  const tree = parseTree('async function run() { try { try { await fetch(); } catch (inner) { } } catch (outer) { } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  // Inner try handlers
  assert.ok(machine.body[0].catchHandlers, 'must have catchHandlers array');
  assert.ok(machine.body[0].catchHandlers.length >= 1, 'must have at least innermost catch handler');
  const innerHandler = machine.body[0].catchHandlers[0];
  assert.equal(innerHandler.paramName, 'inner', 'must record innermost catch parameter');
});

test('async IR marks await inside try/finally with finallyDepth=1', () => {
  const tree = parseTree('async function run() { try { await fetch(); } finally { cleanup(); } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 1, 'must detect one suspend point');
  assert.equal(machine.body[0].finallyDepth, 1, 'await inside try/finally must have finallyDepth=1');
  assert.equal(machine.body[0].finallyHandlers.length, 1, 'must record one finally handler');
});

test('async IR marks await in nested try/finally with finallyDepth=2', () => {
  const tree = parseTree('async function run() { try { try { await fetch(); } finally { a(); } } finally { b(); } }\n');
  const ir = buildAsyncIR(tree);

  const machine = ir.asyncFunctions[0];
  assert.equal(machine.suspendPointCount, 1, 'must detect one suspend point');
  assert.equal(machine.body[0].finallyDepth, 2, 'await inside nested try/finally must have finallyDepth=2');
  assert.equal(machine.body[0].finallyHandlers.length, 2, 'must record two finally handlers');
});

test('async IR collects multiple top-level async function declarations', () => {
  const tree = parseTree('async function a() {}\nasync function b() {}\n');
  const ir = buildAsyncIR(tree);

  assert.equal(ir.asyncFunctions.length, 2, 'must detect two async functions');
  const names = ir.asyncFunctions.map((m) => m.name);
  assert.ok(names.includes('a'), 'must include function a');
  assert.ok(names.includes('b'), 'must include function b');
});

test('async IR does not classify sync function declarations as async', () => {
  const tree = parseTree('function sync() {}\nasync function async_fn() {}\n');
  const ir = buildAsyncIR(tree);

  assert.equal(ir.asyncFunctions.length, 1, 'must only detect the async function');
  assert.equal(ir.asyncFunctions[0].name, 'async_fn');
});
