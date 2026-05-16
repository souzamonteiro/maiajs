'use strict';

/**
 * Instantiate the MaiaJS exception/scheduler runtime module and
 * build an env import map that can be merged into app instantiation imports.
 *
 * Options:
 *  - wasmBytes: Uint8Array/ArrayBuffer with module bytes
 *  - wasmUrl: absolute/relative URL to fetch the module (browser/node with fetch)
 *  - autoDrain: if true, scheduled async events are drained on microtask queue (default: true)
 *  - autoResume: if true, drain attempts to invoke registered resume handlers (default: true)
 *  - resumeExports: exports object containing bridge functions (optional)
 *  - resolveResumeExportName: callback(event) -> exportName for lazy auto-binding (optional)
 *  - onSchedule: callback({ smPtr, stateId }) when schedule events are drained
 *  - onComplete: callback({ smPtr, pendingCount }) when completion is reported
 */
async function instantiateExceptionRuntime(options = {}) {
  const {
    wasmBytes,
    wasmUrl,
    autoDrain = true,
    autoResume = true,
    resumeExports = null,
    resolveResumeExportName = null,
    onSchedule = null,
    onComplete = null
  } = options;

  let bytes = wasmBytes || null;
  if (!bytes) {
    if (!wasmUrl) {
      throw new Error('instantiateExceptionRuntime requires wasmBytes or wasmUrl');
    }
    const res = await fetch(wasmUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch runtime wasm: HTTP ${res.status}`);
    }
    bytes = await res.arrayBuffer();
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exp = instance.exports;

  const scheduleQueue = [];
  const resumeHandlers = new Map();
  let autoResumeExports = resumeExports;
  let autoResumeResolver = resolveResumeExportName;
  let drainQueued = false;

  function queueDrain(fn) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
      return;
    }
    setTimeout(fn, 0);
  }

  function bindResumeExportForPointer(smPtr, wasmExports, exportName) {
    if (!wasmExports || typeof wasmExports[exportName] !== 'function') {
      return false;
    }

    const ptr = Number(smPtr) >>> 0;
    const resumeFn = wasmExports[exportName];
    resumeHandlers.set(ptr, () => {
      resumeFn(ptr);
    });
    return true;
  }

  function drainScheduleQueue() {
    let drained = 0;
    while (scheduleQueue.length > 0) {
      const event = scheduleQueue.shift();
      drained += 1;
      if (typeof onSchedule === 'function') {
        onSchedule(event);
      }

      if (autoResume) {
        let resumeHandler = resumeHandlers.get(event.smPtr);

        if (!resumeHandler && typeof autoResumeResolver === 'function') {
          const exportName = autoResumeResolver(event);
          if (typeof exportName === 'string' && exportName.length > 0) {
            bindResumeExportForPointer(event.smPtr, autoResumeExports, exportName);
            resumeHandler = resumeHandlers.get(event.smPtr);
          }
        }

        if (typeof resumeHandler === 'function') {
          resumeHandler(event.stateId, event);
        }
      }
    }
    return drained;
  }

  function enqueueSchedule(smPtr, stateId) {
    scheduleQueue.push({ smPtr, stateId });

    if (!autoDrain || drainQueued) {
      return;
    }

    drainQueued = true;
    queueDrain(() => {
      drainQueued = false;
      drainScheduleQueue();
    });
  }

  const env = {
    __exc_push: exp.__exc_push,
    __exc_pop: exp.__exc_pop,
    __exc_active: exp.__exc_active,
    __exc_type: exp.__exc_type,
    __exc_data: exp.__exc_data,
    __exc_throw: exp.__exc_throw,
    __exc_matches: exp.__exc_matches,
    __exc_clear: exp.__exc_clear,
    __async_schedule: (sm, stateId) => {
      const smPtr = Number(sm) >>> 0;
      const id = Number(stateId) | 0;
      exp.__async_schedule(smPtr, id);
      enqueueSchedule(smPtr, id);
    },
    __async_complete: (sm) => {
      const smPtr = Number(sm) >>> 0;
      exp.__async_complete(smPtr);
      if (typeof onComplete === 'function') {
        onComplete({
          smPtr,
          pendingCount: typeof exp.__async_pending_count === 'function'
            ? exp.__async_pending_count()
            : 0
        });
      }
    }
  };

  return {
    instance,
    exports: exp,
    env,
    scheduler: {
      drain: drainScheduleQueue,
      pendingCount: () => (typeof exp.__async_pending_count === 'function' ? exp.__async_pending_count() : 0),
      lastState: () => (typeof exp.__async_last_state === 'function' ? exp.__async_last_state() : -1),
      registerResumeHandler: (smPtr, handler) => {
        const ptr = Number(smPtr) >>> 0;
        if (typeof handler !== 'function') {
          throw new Error('registerResumeHandler requires a function handler');
        }
        resumeHandlers.set(ptr, handler);
      },
      registerResumeExport: (smPtr, wasmExports, exportName) => {
        if (!bindResumeExportForPointer(smPtr, wasmExports, exportName)) {
          throw new Error(`registerResumeExport could not find export function: ${exportName}`);
        }
      },
      setAutoResumeResolver: (wasmExports, resolver) => {
        autoResumeExports = wasmExports || null;
        autoResumeResolver = typeof resolver === 'function' ? resolver : null;
      },
      unregisterResumeHandler: (smPtr) => {
        const ptr = Number(smPtr) >>> 0;
        resumeHandlers.delete(ptr);
      }
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { instantiateExceptionRuntime };
}
