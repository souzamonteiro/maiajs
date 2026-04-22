'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEBC_TOOL = path.resolve(__dirname, '..', '..', 'maiac', 'tools', 'webc.js');

function readWebcSource() {
  return fs.readFileSync(WEBC_TOOL, 'utf8');
}

test('dist bootstrap: browser resolver uses machine schedule ranges before pointer fallback', () => {
  const src = readWebcSource();

  assert.match(src, /function createMachineAwareBridgeResolver\(runtimeBridgeEntries, availableBridgeSymbols\)/,
    'browser template must define machine-aware resolver');
  assert.match(src, /const stateId = Number\(event\.stateId\) \| 0;/,
    'browser resolver must derive numeric schedule state ID');
  assert.match(src, /if \(Number\.isInteger\(start\) && Number\.isInteger\(end\) && stateId >= start && stateId <= end\) \{\s*return entry\.bridgeSymbol;/s,
    'browser resolver must route by schedule range before pointer hashing fallback');
  assert.match(src, /let index = ptr % availableBridgeSymbols\.length;/,
    'browser resolver must keep pointer-based fallback for unmatched schedule ranges');
});

test('dist bootstrap: browser runtime maps manifest asyncRuntime ranges into resolver entries', () => {
  const src = readWebcSource();

  assert.match(src, /const runtimeBridgeMeta = manifest[\s\S]*Array\.isArray\(manifest\.asyncRuntime\.resumeBridges\)/,
    'browser runtime must consume manifest asyncRuntime.resumeBridges');
  assert.match(src, /scheduleStateStart: Number\.isInteger\(item\.scheduleStateStart\) \? item\.scheduleStateStart : null/,
    'browser runtime must preserve scheduleStateStart metadata');
  assert.match(src, /scheduleStateEnd: Number\.isInteger\(item\.scheduleStateEnd\) \? item\.scheduleStateEnd : null/,
    'browser runtime must preserve scheduleStateEnd metadata');
  assert.match(src, /exceptionRuntime\.scheduler\.setAutoResumeResolver\([\s\S]*createMachineAwareBridgeResolver\(runtimeBridgeEntries, availableBridgeSymbols\)/,
    'browser runtime must wire machine-aware resolver into scheduler');
});

test('dist bootstrap: node runtime uses machine schedule ranges before pointer fallback', () => {
  const src = readWebcSource();

  assert.match(src, /const runtimeBridgeMeta = manifest[\s\S]*Array\.isArray\(manifest\.asyncRuntime\.resumeBridges\)/,
    'node runtime must consume manifest asyncRuntime.resumeBridges');
  assert.match(src, /const stateId = Number\(event\.stateId\) \| 0;[\s\S]*if \(Number\.isInteger\(start\) && Number\.isInteger\(end\) && stateId >= start && stateId <= end\) \{\s*return entry\.bridgeSymbol;/s,
    'node runtime resolver must route by schedule range first');
  assert.match(src, /let index = ptr % availableBridgeSymbols\.length;/,
    'node runtime resolver must keep pointer fallback strategy');
});
