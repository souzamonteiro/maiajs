#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const options = {
    runRuntime: true,
    runTranspile: true,
    runtimeTimeoutMs: 20000,
    transpileTimeoutMs: 45000
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runtime-only') {
      options.runRuntime = true;
      options.runTranspile = false;
      continue;
    }
    if (arg === '--transpile-only') {
      options.runRuntime = false;
      options.runTranspile = true;
      continue;
    }
    if (arg === '--skip-transpile') {
      options.runTranspile = false;
      continue;
    }
    if (arg === '--runtime-timeout-ms') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('invalid value for --runtime-timeout-ms');
      }
      options.runtimeTimeoutMs = Math.trunc(value);
      i += 1;
      continue;
    }
    if (arg === '--transpile-timeout-ms') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('invalid value for --transpile-timeout-ms');
      }
      options.transpileTimeoutMs = Math.trunc(value);
      i += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      console.log('Usage: node validate_ported_examples.js [--runtime-only|--transpile-only|--skip-transpile] [--runtime-timeout-ms N] [--transpile-timeout-ms N]');
      process.exit(0);
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!options.runRuntime && !options.runTranspile) {
    throw new Error('both runtime and transpile checks are disabled');
  }

  return options;
}

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

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveSuiteExpectedFile(jsFile) {
  const dir = path.dirname(jsFile);
  const baseName = path.basename(jsFile);
  const portExpected = path.join(dir, `${baseName}_expected_output.txt`);
  const sharedExpected = path.join(dir, 'expected_output.txt');
  if (fs.existsSync(portExpected)) {
    return portExpected;
  }
  return sharedExpected;
}

function collectTranspileCorpus(repoRoot) {
  const examplesRoot = path.join(repoRoot, 'compiler', 'examples');
  const fixturesRoot = path.join(repoRoot, 'compiler', 'tests', 'fixtures');
  const files = [];

  for (const name of ['test.js', 'full_es8_test.js']) {
    const filePath = path.join(examplesRoot, name);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }

  if (fs.existsSync(fixturesRoot)) {
    const expectFiles = fs.readdirSync(fixturesRoot)
      .filter((name) => name.endsWith('.expect.json'))
      .sort();

    for (const expectName of expectFiles) {
      const expectPath = path.join(fixturesRoot, expectName);
      const expect = loadJsonIfExists(expectPath);
      const stages = expect && Array.isArray(expect.stages) ? expect.stages : [];
      if (!expect || !stages.includes('transpiler') || expect.shouldTranspile === false) {
        continue;
      }
      const stem = expectName.slice(0, -'.expect.json'.length);
      const sourcePath = path.join(fixturesRoot, `${stem}.js`);
      if (fs.existsSync(sourcePath)) {
        files.push(sourcePath);
      }
    }
  }

  return Array.from(new Set(files)).sort();
}

function normalizeOutput(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter((line) => !/^\[webc\] program returned: \d+$/.test(line));
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }
  return filtered.join('\n') + '\n';
}

function runNodeScript(filePath, input, timeoutMs) {
  const result = spawnSync('node', [filePath], {
    encoding: 'utf8',
    input: input || '',
    timeout: timeoutMs,
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

function runTranspile(compilerPath, jsFilePath, cppOutPath, timeoutMs) {
  const result = spawnSync('node', [compilerPath, '--file', jsFilePath, '--cpp-out', cppOutPath], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024
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
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const examplesRoot = path.join(repoRoot, 'compiler', 'examples');
  const courseRoot = path.join(examplesRoot, 'programming_in_javascript_course_en');
  const suiteRoot = path.join(examplesRoot, 'suite');
  const compilerPath = path.join(repoRoot, 'compiler', 'ecmascript-compiler.js');
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'validate-ported-'));

  if (!fs.existsSync(courseRoot) || !fs.existsSync(suiteRoot)) {
    console.error('[validate] missing ported directories under compiler/examples');
    process.exit(2);
  }
  if (options.runTranspile && !fs.existsSync(compilerPath)) {
    console.error(`[validate] compiler not found: ${compilerPath}`);
    process.exit(2);
  }

  const suiteJsFiles = walkFiles(
    suiteRoot,
    (p) => p.endsWith('.js') && !p.includes('/dist/') && !p.includes('/dist_js/')
  ).sort();

  const courseJsFiles = walkFiles(
    courseRoot,
    (p) => p.endsWith('.js') && !p.includes('/dist/')
  ).sort();
  const transpileJsFiles = collectTranspileCorpus(repoRoot);

  const failures = [];
  let suitePass = 0;
  let coursePass = 0;
  let transpilePass = 0;

  const checkRuntime = options.runRuntime;
  const checkTranspile = options.runTranspile;

  function validateTranspile(jsFile) {
    if (!checkTranspile) {
      return true;
    }
    const relPath = rel(repoRoot, jsFile);
    const safeName = relPath.replace(/[^a-zA-Z0-9_.-]+/g, '_');
    const cppOutPath = path.join(tmpRoot, `${safeName}.cpp`);
    const transpile = runTranspile(compilerPath, jsFile, cppOutPath, options.transpileTimeoutMs);
    if (transpile.timedOut || transpile.status !== 0 || !fs.existsSync(cppOutPath)) {
      failures.push({
        type: 'maiajs-transpile',
        file: relPath,
        message: `status=${transpile.status} signal=${transpile.signal || 'none'} stderr=${transpile.stderr.trim().slice(0, 500)}`
      });
      return false;
    }
    return true;
  }

  try {

    if (checkTranspile) {
      if (transpileJsFiles.length === 0) {
        failures.push({
          type: 'maiajs-transpile-corpus',
          file: 'compiler/examples',
          message: 'no MaiaJS transpile corpus files found'
        });
      }

      for (const jsFile of transpileJsFiles) {
        if (validateTranspile(jsFile)) {
          transpilePass += 1;
        }
      }
    }

    for (const jsFile of suiteJsFiles) {
    const expectedFile = resolveSuiteExpectedFile(jsFile);
    const inputFile = jsFile.replace(/\.js$/, '.input.txt');
    const input = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : '';

    if (!checkRuntime) {
      continue;
    }

    if (!fs.existsSync(expectedFile)) {
      failures.push({
        type: 'suite-missing-expected',
        file: rel(repoRoot, jsFile),
        message: 'expected output file not found'
      });
      continue;
    }

    const run = runNodeScript(jsFile, input, options.runtimeTimeoutMs);
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
        message: `stdout differs from ${path.basename(expectedFile)} after normalization`
      });
      continue;
    }

    suitePass += 1;
    }

    for (const jsFile of courseJsFiles) {
    const inputFile = jsFile.replace(/\.js$/, '.input.txt');
    const input = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : '';

    if (!checkRuntime) {
      continue;
    }

    const run = runNodeScript(jsFile, input, options.runtimeTimeoutMs);

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

    if (checkRuntime) {
      console.log(`[validate] suite runtime passed: ${suitePass}/${suiteJsFiles.length}`);
      console.log(`[validate] course runtime passed: ${coursePass}/${courseJsFiles.length}`);
    }
    if (checkTranspile) {
      console.log(`[validate] MaiaJS transpile passed: ${transpilePass}/${transpileJsFiles.length}`);
    }

    if (failures.length > 0) {
      console.log(`[validate] failures: ${failures.length}`);
      for (const f of failures) {
        console.log(`- ${f.type}: ${f.file} :: ${f.message}`);
      }
      process.exit(1);
    }

    console.log('[validate] all checks passed');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main();
