'use strict';

const http = require('node:http');

function requestJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DevTools request failed (${response.statusCode}): ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message || 'DevTools command failed'));
      return;
    }
    request.resolve(message.result || {});
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true });
  });

  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    }
  };
}

async function main() {
  const [cdpBaseUrl, runnerUrl, timeoutText = '15000'] = process.argv.slice(2);
  if (!cdpBaseUrl || !runnerUrl) {
    throw new Error('Usage: validate_browser_runner_cdp.js <cdp-base-url> <runner-url> [timeout-ms]');
  }

  const targets = await requestJson(`${cdpBaseUrl}/json`);
  const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!target) throw new Error('Chrome did not expose a debuggable page target');

  const cdp = await connect(target.webSocketDebuggerUrl);
  try {
    await cdp.call('Page.enable');
    await cdp.call('Page.navigate', { url: runnerUrl });

    const deadline = Date.now() + Number(timeoutText);
    let latest = { ready: false, status: '', output: '' };
    while (Date.now() < deadline) {
      const result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const run = document.getElementById('run');
          const status = document.getElementById('status');
          const output = document.getElementById('output');
          if (!run || !status || !output) return { ready: false, status: '', output: '' };
          if (!window.__maiaHeadlessRunStarted) {
            window.__maiaHeadlessRunStarted = true;
            run.click();
          }
          return { ready: true, status: status.textContent, output: output.textContent };
        })()`,
        returnByValue: true
      });
      latest = result.result && result.result.value ? result.result.value : latest;
      if (latest.ready && (latest.status === 'Done' || latest.status === 'Error')) break;
      await delay(100);
    }

    process.stdout.write(`${latest.status}\n${latest.output}`);
    if (!latest.ready) throw new Error('Browser runner did not become ready');
    if (latest.status !== 'Done') throw new Error(`Browser runner ended with status '${latest.status}'`);
  } finally {
    cdp.close();
  }
}

main().catch((error) => {
  process.stderr.write(`[validate-browser-runner-cdp] ${error.message}\n`);
  process.exitCode = 1;
});
