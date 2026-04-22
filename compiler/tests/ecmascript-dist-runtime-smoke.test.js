'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { instantiateExceptionRuntime } = require(path.resolve(__dirname, '..', '..', 'lib', 'exception.js'));

function loadRuntimeWasmBytes() {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'lib', 'exception.wasm'));
}

function createMachineAwareBridgeResolver(runtimeBridgeEntries, availableBridgeSymbols) {
  const pointerToBridge = new Map();
  const bridgeToPointer = new Map();

  return function resolveResumeBridge(event) {
    if (!event || availableBridgeSymbols.length === 0) {
      return null;
    }

    const stateId = Number(event.stateId) | 0;
    for (const entry of runtimeBridgeEntries) {
      if (!entry || typeof entry.bridgeSymbol !== 'string') {
        continue;
      }

      const start = entry.scheduleStateStart;
      const end = entry.scheduleStateEnd;
      if (Number.isInteger(start) && Number.isInteger(end) && stateId >= start && stateId <= end) {
        return entry.bridgeSymbol;
      }
    }

    const ptr = Number(event.smPtr) >>> 0;
    const existing = pointerToBridge.get(ptr);
    if (typeof existing === 'string') {
      return existing;
    }

    let index = ptr % availableBridgeSymbols.length;
    for (let attempt = 0; attempt < availableBridgeSymbols.length; attempt += 1) {
      const candidate = availableBridgeSymbols[index];
      const owner = bridgeToPointer.get(candidate);
      if (owner == null || owner === ptr) {
        pointerToBridge.set(ptr, candidate);
        bridgeToPointer.set(candidate, ptr);
        return candidate;
      }
      index = (index + 1) % availableBridgeSymbols.length;
    }

    return null;
  };
}

test('dist runtime smoke: machine-aware resolver routes real scheduled events by state ranges', async () => {
  const calls = [];
  const fakeWasmExports = {
    __async_alpha__resume_bridge: (smPtr) => {
      calls.push({ bridge: '__async_alpha__resume_bridge', smPtr: Number(smPtr) >>> 0 });
    },
    __async_beta__resume_bridge: (smPtr) => {
      calls.push({ bridge: '__async_beta__resume_bridge', smPtr: Number(smPtr) >>> 0 });
    }
  };

  const runtimeBridgeEntries = [
    { bridgeSymbol: '__async_alpha__resume_bridge', scheduleStateStart: 1, scheduleStateEnd: 2 },
    { bridgeSymbol: '__async_beta__resume_bridge', scheduleStateStart: 3, scheduleStateEnd: 4 }
  ];

  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    autoResume: true,
    resumeExports: fakeWasmExports,
    resolveResumeExportName: createMachineAwareBridgeResolver(
      runtimeBridgeEntries,
      runtimeBridgeEntries.map((entry) => entry.bridgeSymbol)
    )
  });

  // Interleave events to emulate concurrent scheduling before a single drain.
  runtime.env.__async_schedule(101, 1); // range -> alpha
  runtime.env.__async_schedule(202, 3); // range -> beta
  runtime.env.__async_schedule(303, 99); // unknown range -> pointer fallback
  runtime.env.__async_schedule(404, 4); // range -> beta

  const drained = runtime.scheduler.drain();
  assert.equal(drained, 4, 'smoke test must process all queued schedule events');
  assert.deepEqual(calls, [
    { bridge: '__async_alpha__resume_bridge', smPtr: 101 },
    { bridge: '__async_beta__resume_bridge', smPtr: 202 },
    { bridge: '__async_beta__resume_bridge', smPtr: 303 },
    { bridge: '__async_beta__resume_bridge', smPtr: 404 }
  ], 'machine-aware state ranges must route first; unknown states must use deterministic pointer fallback');

  runtime.scheduler.unregisterResumeHandler(101);
  runtime.scheduler.unregisterResumeHandler(202);
  runtime.scheduler.unregisterResumeHandler(303);
  runtime.scheduler.unregisterResumeHandler(404);
});
