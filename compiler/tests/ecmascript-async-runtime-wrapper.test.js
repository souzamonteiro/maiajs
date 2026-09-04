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

test('async runtime transports a scalar resolved by a host promise', async () => {
  const events = [];
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    onSchedule: (event) => events.push(event)
  });
  const imports = {
    __delayedValue: () => Promise.resolve(42),
    ...runtime.env
  };

  runtime.attachPromiseImports(imports);
  imports.__async_prepare_await(123, 7);
  assert.equal(imports.__delayedValue(), 0, 'a promise import must yield the WASM scalar placeholder');
  imports.__async_schedule(123, 7);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.scheduler.drain(), 1, 'resolved promise must schedule exactly one resume event');
  assert.deepEqual(events, [{ smPtr: 123, stateId: 7, valueTag: 1, value: 42 }]);
  assert.equal(imports.__async_take_value_tag(123), 1, 'resolved scalar must expose its value tag');
  assert.equal(imports.__async_take_i32(123), 42, 'resolved scalar must be readable by resumed WASM code');
});

test('async runtime transports string and object promise values through handles', async () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let nextPtr = 128;
  const runtime = await instantiateExceptionRuntime({
    wasmBytes: loadRuntimeWasmBytes(),
    autoDrain: false,
    getMemory: () => memory
  });
  const imports = {
    __getResponse: () => Promise.resolve({ status: 201 }),
    __getMessage: () => Promise.resolve('async handle text'),
    __malloc: (size) => {
      const ptr = nextPtr;
      nextPtr += Number(size) | 0;
      return ptr;
    },
    ...runtime.env
  };
  new TextEncoder().encodeInto('status\0', new Uint8Array(memory.buffer).subarray(16));

  runtime.attachPromiseImports(imports);
  imports.__async_prepare_await(200, 1);
  imports.__getResponse();
  imports.__async_schedule(200, 1);
  imports.__async_prepare_await(201, 2);
  imports.__getMessage();
  imports.__async_schedule(201, 2);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.scheduler.drain(), 2, 'each fulfilled promise must resume its own machine');
  const responseHandle = imports.__async_take_i32(200);
  const messageHandle = imports.__async_take_i32(201);
  assert.equal(imports.__async_handle_get_i32(responseHandle, 16), 201, 'object property must be readable through its handle');
  const stringPtr = imports.__async_handle_get_string(messageHandle);
  const bytes = new Uint8Array(memory.buffer);
  const end = bytes.indexOf(0, stringPtr);
  assert.equal(new TextDecoder().decode(bytes.subarray(stringPtr, end)), 'async handle text');
});
