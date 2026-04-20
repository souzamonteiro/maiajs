'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { HostRegistry } = require(path.resolve(__dirname, '..', 'ecmascript', 'host-registry'));

test('host registry maps console.log with required host prefix', () => {
  const registry = new HostRegistry();
  assert.equal(registry.resolveMemberCall('console', 'log'), '__console__log');
});

test('dynamic member mapping supports browser host objects', () => {
  const registry = new HostRegistry();
  assert.equal(registry.resolveMemberCall('window', 'alert'), '__window__alert');
  assert.equal(registry.resolveMemberCall('document', 'getElementByName'), '__document__getElementByName');
});

test('direct function call mapping uses __ prefix', () => {
  const registry = new HostRegistry();
  assert.equal(registry.resolveFunctionCall('setTimeout'), '__setTimeout');
});

test('all generated host symbols must use __ prefix', () => {
  const registry = new HostRegistry();
  const generated = [
    registry.resolveMemberCall('console', 'error'),
    registry.resolveMemberCall('window', 'fetch'),
    registry.resolveFunctionCall('parseInt')
  ];

  for (const hostSymbol of generated) {
    assert.match(hostSymbol, /^__/, `Host symbol must start with '__': ${hostSymbol}`);
  }
});

test('internal host symbols can be excluded', () => {
  const registry = new HostRegistry({
    internalHostSymbols: ['__maia_internal__get_property']
  });

  assert.equal(registry.resolvePath(['maia_internal', 'get_property']), null);
  assert.equal(registry.resolvePath(['console', 'log']), '__console__log');
});
