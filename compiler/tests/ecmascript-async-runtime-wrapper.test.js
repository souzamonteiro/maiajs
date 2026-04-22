'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { instantiateExceptionRuntime } = require(path.resolve(__dirname, '..', '..', 'lib', 'exception.js'));

function loadRuntimeWasmBytes() {
  const wasmPath = path.resolve(__dirname, '..', '..', 'lib', 'exception.wasm');
  return fs.readFileSync(wasmPath);
}

test('async runtime wrapper exposes exception and scheduler env imports', async () => {
  const runtime = await instantiateExceptionRuntime({ wasmBytes: loadRuntimeWasmBytes() });

  assert.ok(runtime.env, 'env map must be defined');
  assert.equal(typeof runtime.env.__exc_push, 'function');
  assert.equal(typeof runtime.env.__exc_active, 'function');
  assert.equal(typeof runtime.env.__exc_matches, 'function');
  assert.equal(typeof runtime.env.__async_schedule, 'function');
  assert.equal(typeof runtime.env.__async_complete, 'function');
});

test('async runtime wrapper queues schedule events and drains manually', async () => {
  const events = [];
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    onSchedule: (event) => events.push(event)
  });

  runtime.env.__async_schedule(100, 1);
  runtime.env.__async_schedule(100, 2);

  assert.equal(events.length, 0, 'events must remain queued before manual drain');
  assert.equal(runtime.scheduler.pendingCount(), 2, 'pending count must track queued schedules');
  assert.equal(runtime.scheduler.lastState(), 2, 'last state must reflect latest schedule');

  const drained = runtime.scheduler.drain();
  assert.equal(drained, 2, 'manual drain must process all queued events');
  assert.deepEqual(events, [
    { smPtr: 100, stateId: 1 },
    { smPtr: 100, stateId: 2 }
  ]);
});

test('async runtime wrapper invokes completion callback and decrements pending count', async () => {
  const completions = [];
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    onComplete: (info) => completions.push(info)
  });

  runtime.env.__async_schedule(9, 4);
  runtime.env.__async_schedule(9, 5);
  assert.equal(runtime.scheduler.pendingCount(), 2, 'two schedules must increment pending count');

  runtime.env.__async_complete(9);

  assert.equal(completions.length, 1, 'completion callback must run once');
  assert.equal(completions[0].smPtr, 9, 'completion callback must receive state machine pointer');
  assert.equal(completions[0].pendingCount, 1, 'completion callback must report decremented pending count');
  assert.equal(runtime.scheduler.pendingCount(), 1, 'pending count must decrement after completion');
});

test('async runtime wrapper dispatches scheduled state to registered resume handler', async () => {
  const resumedStates = [];
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    autoResume: true
  });

  runtime.scheduler.registerResumeHandler(77, (stateId, event) => {
    resumedStates.push({ stateId, smPtr: event.smPtr });
  });

  runtime.env.__async_schedule(77, 10);
  runtime.env.__async_schedule(77, 11);

  const drained = runtime.scheduler.drain();
  assert.equal(drained, 2, 'drain must process both scheduled events');
  assert.deepEqual(resumedStates, [
    { stateId: 10, smPtr: 77 },
    { stateId: 11, smPtr: 77 }
  ], 'registered resume handler must receive scheduled states in order');

  runtime.scheduler.unregisterResumeHandler(77);
});

test('async runtime wrapper can bind dispatch to wasm export bridge function name', async () => {
  const calls = [];
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    autoResume: true
  });

  const fakeWasmExports = {
    __async_load__resume_bridge: (smPtr) => {
      calls.push(smPtr);
    }
  };

  runtime.scheduler.registerResumeExport(345, fakeWasmExports, '__async_load__resume_bridge');
  runtime.env.__async_schedule(345, 1);

  const drained = runtime.scheduler.drain();
  assert.equal(drained, 1, 'drain must process queued schedule item');
  assert.deepEqual(calls, [345], 'registered export bridge must be invoked with state machine pointer');

  runtime.scheduler.unregisterResumeHandler(345);
});

test('async runtime wrapper lazy-binds bridge via resolver and caches by sm pointer', async () => {
  const calls = [];
  let resolverCalls = 0;

  const fakeWasmExports = {
    __async_auto__resume_bridge: (smPtr) => {
      calls.push(smPtr);
    }
  };

  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    autoResume: true,
    resumeExports: fakeWasmExports,
    resolveResumeExportName: (event) => {
      resolverCalls += 1;
      if (event.stateId === 1) {
        return '__async_auto__resume_bridge';
      }
      return null;
    }
  });

  runtime.env.__async_schedule(901, 1);
  runtime.scheduler.drain();
  assert.deepEqual(calls, [901], 'first event must auto-bind and invoke bridge');

  runtime.env.__async_schedule(901, 2);
  runtime.scheduler.drain();
  assert.deepEqual(calls, [901, 901], 'second event must reuse cached binding for same pointer');
  assert.equal(resolverCalls, 1, 'resolver should be called only until pointer is bound');

  runtime.scheduler.unregisterResumeHandler(901);
});
