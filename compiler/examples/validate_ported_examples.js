#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walkFiles(root, predicate, out = []) {
  if (!fs.existsSync(root)) {
    return out;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, predicate, out);
      continue;
    }
    if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function normalizeOutput(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter((line) => !/^\[webc\] program returned: \d+$/.test(line));
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }
  return filtered.join('\n') + '\n';
}

function runNodeScript(filePath, input) {
  const result = spawnSync('node', [filePath], {
    encoding: 'utf8',
    input: input || '',
    timeout: 20000,
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT')
  };
}

function rel(base, target) {
  return path.relative(base, target).replace(/\\/g, '/');
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const examplesRoot = path.join(repoRoot, 'compiler', 'examples');
  const courseRoot = path.join(examplesRoot, 'programming_in_javascript_course_en');
  const suiteRoot = path.join(examplesRoot, 'suite');

  if (!fs.existsSync(courseRoot) || !fs.existsSync(suiteRoot)) {
    console.error('[validate] missing ported directories under compiler/examples');
    process.exit(2);
  }

  const suiteJsFiles = walkFiles(
    suiteRoot,
    (p) => p.endsWith('.js') && !p.includes('/dist/')
  ).sort();

  const courseJsFiles = walkFiles(
    courseRoot,
    (p) => p.endsWith('.js') && !p.includes('/dist/')
  ).sort();

  const failures = [];
  let suitePass = 0;
  let coursePass = 0;

  for (const jsFile of suiteJsFiles) {
    const dir = path.dirname(jsFile);
    const expectedFile = path.join(dir, 'expected_output.txt');
    const inputFile = jsFile.replace(/\.js$/, '.input.txt');
    const input = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : '';

    if (!fs.existsSync(expectedFile)) {
      failures.push({
        type: 'suite-missing-expected',
        file: rel(repoRoot, jsFile),
        message: 'expected_output.txt not found'
      });
      continue;
    }

    const run = runNodeScript(jsFile, input);
    if (run.timedOut || run.status !== 0) {
      failures.push({
        type: 'suite-runtime',
        file: rel(repoRoot, jsFile),
        message: `status=${run.status} signal=${run.signal || 'none'} stderr=${run.stderr.trim().slice(0, 500)}`
      });
      continue;
    }

    const actual = normalizeOutput(run.stdout);
    const expected = normalizeOutput(fs.readFileSync(expectedFile, 'utf8'));

    if (actual !== expected) {
      failures.push({
        type: 'suite-output-mismatch',
        file: rel(repoRoot, jsFile),
        message: 'stdout differs from expected_output.txt after normalization'
      });
      continue;
    }

    suitePass += 1;
  }

  for (const jsFile of courseJsFiles) {
    const inputFile = jsFile.replace(/\.js$/, '.input.txt');
    const input = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : '';
    const run = runNodeScript(jsFile, input);

    if (run.timedOut || run.status !== 0) {
      failures.push({
        type: 'course-runtime',
        file: rel(repoRoot, jsFile),
        message: `status=${run.status} signal=${run.signal || 'none'} stderr=${run.stderr.trim().slice(0, 500)}`
      });
      continue;
    }

    coursePass += 1;
  }

  console.log(`[validate] suite passed: ${suitePass}/${suiteJsFiles.length}`);
  console.log(`[validate] course passed: ${coursePass}/${courseJsFiles.length}`);

  if (failures.length > 0) {
    console.log(`[validate] failures: ${failures.length}`);
    for (const f of failures) {
      console.log(`- ${f.type}: ${f.file} :: ${f.message}`);
    }
    process.exit(1);
  }

  console.log('[validate] all checks passed');
}

main();
