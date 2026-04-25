'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const Parser = require(path.resolve(__dirname, '..', 'ecmascript-parser'));
const { ParseTreeCollector } = require(path.resolve(__dirname, '..', 'parse-tree-collector'));

function listExpectFiles(fixturesDir) {
  return fs.readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.expect.json'))
    .sort();
}

function loadFixtureSpecs(fixturesDir) {
  const specs = [];
  for (const expectName of listExpectFiles(fixturesDir)) {
    const stem = expectName.slice(0, -'.expect.json'.length);
    const sourceFile = path.join(fixturesDir, `${stem}.js`);
    const expectFile = path.join(fixturesDir, expectName);

    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Missing fixture source for '${stem}': ${sourceFile}`);
    }

    const expect = JSON.parse(fs.readFileSync(expectFile, 'utf8'));
    specs.push({
      name: stem,
      sourceFile,
      expectFile,
      source: fs.readFileSync(sourceFile, 'utf8'),
      expect
    });
  }
  return specs;
}

function loadLexerCtor() {
  const parserPath = path.resolve(__dirname, '..', 'ecmascript-parser.js');
  const parserSrc = fs.readFileSync(parserPath, 'utf8');
  const wrapped = `${parserSrc}\nmodule.exports = { Parser, Lexer };\n`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    TextDecoder,
    TextEncoder
  };
  vm.createContext(sandbox);
  vm.runInContext(wrapped, sandbox, { filename: 'ecmascript-parser.js' });
  return sandbox.module.exports.Lexer;
}

function tokenizeSource(LexerCtor, source) {
  const lexer = new LexerCtor(source);
  return lexer.tokenize();
}

function parseSource(source) {
  const collector = new ParseTreeCollector();
  const parser = new Parser(source, collector);
  parser.parse();
  return collector.root;
}

function transpileSource(repoRoot, source, fixtureName) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-fixture-'));
  const inputFile = path.join(tempDir, `${fixtureName}.js`);
  const cppOut = path.join(tempDir, `${fixtureName}.cpp`);
  const astOut = path.join(tempDir, `${fixtureName}.ast.json`);
  const compiler = path.resolve(repoRoot, 'compiler', 'ecmascript-compiler.js');

  fs.writeFileSync(inputFile, source, 'utf8');

  const proc = spawnSync(process.execPath, [
    compiler,
    '--file', inputFile,
    '--cpp-out', cppOut,
    '--ast-json-out', astOut
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  let cpp = '';
  let ast = '';
  if (fs.existsSync(cppOut)) {
    cpp = fs.readFileSync(cppOut, 'utf8');
  }
  if (fs.existsSync(astOut)) {
    ast = fs.readFileSync(astOut, 'utf8');
  }

  return {
    status: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
    cpp,
    ast,
    cppOut
  };
}

function checkCppSyntax(cppPath) {
  const proc = spawnSync('clang++', ['-std=c++98', '-fsyntax-only', cppPath], {
    encoding: 'utf8'
  });
  return {
    status: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
    toolMissing: proc.error && proc.error.code === 'ENOENT'
  };
}

function includesAll(haystack, needles, label, errors) {
  for (const needle of needles || []) {
    if (!haystack.includes(needle)) {
      errors.push(`missing ${label}: ${needle}`);
    }
  }
}

function includesNone(haystack, needles, label, errors) {
  for (const needle of needles || []) {
    if (haystack.includes(needle)) {
      errors.push(`unexpected ${label}: ${needle}`);
    }
  }
}

function runFixture(repoRoot, LexerCtor, spec, options = {}) {
  const errors = [];
  const result = {
    name: spec.name,
    errors,
    warnings: []
  };

  const expect = spec.expect || {};
  const stages = Array.isArray(expect.stages) ? expect.stages : [];

  let tokens = null;
  let tokenError = null;
  if (stages.includes('lexer')) {
    try {
      tokens = tokenizeSource(LexerCtor, spec.source);
    } catch (error) {
      tokenError = error;
    }

    const shouldLex = expect.shouldLex !== false;
    if (shouldLex && tokenError) {
      errors.push(`lexer failed: ${tokenError.message || tokenError}`);
    }
    if (!shouldLex && !tokenError) {
      errors.push('expected lexer failure, but tokenization succeeded');
    }

    if (tokens) {
      const tokenTypes = tokens.map((t) => t.type);
      const tokenValues = tokens.map((t) => String(t.value || ''));
      includesAll(tokenTypes.join('\n'), expect.tokenTypesInclude || [], 'token type', errors);
      includesAll(tokenValues.join('\n'), expect.tokenValuesInclude || [], 'token value', errors);
      includesNone(tokenTypes.join('\n'), expect.tokenTypesExclude || [], 'token type', errors);
    }
  }

  if (stages.includes('parser')) {
    let parseError = null;
    try {
      parseSource(spec.source);
    } catch (error) {
      parseError = error;
    }

    const shouldParse = expect.shouldParse !== false;
    if (shouldParse && parseError) {
      errors.push(`parser failed: ${parseError.message || parseError}`);
    }
    if (!shouldParse && !parseError) {
      errors.push('expected parser failure, but parsing succeeded');
    }
    if (parseError && Array.isArray(expect.parseErrorContains)) {
      const msg = String(parseError.message || parseError);
      includesAll(msg, expect.parseErrorContains, 'parse error fragment', errors);
    }
  }

  let transpile = null;
  if (stages.includes('transpiler') || stages.includes('cpp-syntax')) {
    transpile = transpileSource(repoRoot, spec.source, spec.name);
    const shouldTranspile = expect.shouldTranspile !== false;

    if (shouldTranspile && transpile.status !== 0) {
      errors.push(`transpiler failed with exit code ${transpile.status}`);
    }
    if (!shouldTranspile && transpile.status === 0) {
      errors.push('expected transpiler failure, but transpilation succeeded');
    }

    const combinedOutput = `${transpile.stdout}\n${transpile.stderr}`;
    includesAll(combinedOutput, expect.compilerOutputContains || [], 'compiler output fragment', errors);
    includesNone(combinedOutput, expect.compilerOutputExclude || [], 'compiler output fragment', errors);

    if (transpile.cpp) {
      includesAll(transpile.cpp, expect.cppContains || [], 'C++ fragment', errors);
      includesNone(transpile.cpp, expect.cppExclude || [], 'C++ fragment', errors);
    }
    if (transpile.ast) {
      includesAll(transpile.ast, expect.astContains || [], 'AST JSON fragment', errors);
    }
  }

  if (stages.includes('cpp-syntax')) {
    if (!transpile || !transpile.cppOut || !fs.existsSync(transpile.cppOut)) {
      errors.push('cannot run C++ syntax check: transpiler output file missing');
    } else {
      const syntax = checkCppSyntax(transpile.cppOut);
      const shouldCppSyntaxPass = expect.shouldCppSyntax !== false;

      if (syntax.toolMissing) {
        const message = 'clang++ not found; C++ syntax check skipped';
        if (options.failOnMissingClang) {
          errors.push(message);
        } else {
          result.warnings.push(message);
        }
      } else {
        if (shouldCppSyntaxPass && syntax.status !== 0) {
          errors.push(`C++ syntax failed with exit code ${syntax.status}`);
        }
        if (!shouldCppSyntaxPass && syntax.status === 0) {
          errors.push('expected C++ syntax failure, but clang++ accepted output');
        }
        includesAll(`${syntax.stdout}\n${syntax.stderr}`, expect.cppSyntaxOutputContains || [], 'C++ syntax output fragment', errors);
      }
    }
  }

  return result;
}

function runFixtures(opts = {}) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const fixturesDir = path.resolve(
    repoRoot,
    opts.fixturesDir || path.join('compiler', 'tests', 'fixtures')
  );

  const specs = loadFixtureSpecs(fixturesDir);
  const filterCases = String(opts.cases || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = filterCases.length > 0
    ? specs.filter((spec) => filterCases.includes(spec.name))
    : specs;

  if (selected.length === 0) {
    throw new Error(`No fixtures selected in ${fixturesDir}`);
  }

  const LexerCtor = loadLexerCtor();
  const results = selected.map((spec) => runFixture(repoRoot, LexerCtor, spec, opts));
  const failures = results.filter((r) => r.errors.length > 0);

  return {
    fixturesDir,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    results,
    failures
  };
}

module.exports = {
  runFixtures
};
