'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runCompiler(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-host-interop-'));
  const inputFile = path.join(tempDir, 'input.js');
  const irOut = path.join(tempDir, 'out.ir.json');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const compilerPath = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
  const result = spawnSync(process.execPath, [compilerPath, '--file', inputFile, '--ir-json-out', irOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(irOut), 'Expected IR output file');

  return JSON.parse(fs.readFileSync(irOut, 'utf8'));
}

function runCompilerCpp(sourceCode) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-cpp-emit-'));
  const inputFile = path.join(tempDir, 'input.js');
  const cppOut = path.join(tempDir, 'out.cpp');

  fs.writeFileSync(inputFile, sourceCode, 'utf8');

  const compilerPath = path.resolve(__dirname, '..', 'ecmascript-compiler.js');
  const result = spawnSync(process.execPath, [compilerPath, '--file', inputFile, '--cpp-out', cppOut], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compiler failed: ${result.stderr || result.stdout}`);
  assert.ok(fs.existsSync(cppOut), 'Expected C++ output file');

  return fs.readFileSync(cppOut, 'utf8');
}

test('AST-first host interop maps member call to __object__method', () => {
  const ir = runCompiler('console.log("hi");\n');
  const calls = ir.hostInterop.detectedCalls;

  assert.ok(Array.isArray(calls), 'detectedCalls must be an array');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'console.log');
  assert.equal(calls[0].host, '__console__log');
});

test('AST-first host interop maps direct function call to __function', () => {
  const ir = runCompiler('setTimeout();\n');
  const calls = ir.hostInterop.detectedCalls;

  assert.ok(Array.isArray(calls), 'detectedCalls must be an array');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'setTimeout');
  assert.equal(calls[0].host, '__setTimeout');
});

test('AST-first host interop does not classify local top-level function calls as host', () => {
  const ir = runCompiler('function f(){ return 1; }\nf();\n');
  const calls = ir.hostInterop.detectedCalls;

  assert.ok(Array.isArray(calls), 'detectedCalls must be an array');
  assert.equal(calls.length, 0, 'local function invocation must not be emitted as host call');
});

test('C++ lowering emits actual host call statement for console.log string arg', () => {
  const cpp = runCompilerCpp('console.log("hello");\n');

  assert.match(cpp, /__console__log\("hello"\);/, 'C++ body must contain the lowered call');
  assert.match(cpp, /extern void __console__log\(const char\*\);/, 'C++ must declare the host function');
});

test('C++ lowering emits extern void with void params for zero-arg call', () => {
  const cpp = runCompilerCpp('setTimeout();\n');

  assert.match(cpp, /__setTimeout\(\);/, 'C++ body must contain the lowered zero-arg call');
  assert.match(cpp, /extern void __setTimeout\(void\);/, 'C++ must declare zero-arg host function with void');
});

test('C++ lowering emits multiple host calls in program order', () => {
  // Use a string call followed by a zero-arg call to avoid the multi-line string
  // tokenizer ambiguity (StringLiteral spans lines in the current lexer).
  const cpp = runCompilerCpp('console.log("hello");\nsetTimeout();\n');

  const posA = cpp.indexOf('__console__log("hello")');
  const posB = cpp.indexOf('__setTimeout()');
  assert.ok(posA >= 0, 'first call must appear in output');
  assert.ok(posB >= 0, 'second call must appear in output');
  assert.ok(posA < posB, 'calls must appear in program order');
});

test('C++ lowering emits const declaration used by host call', () => {
  const cpp = runCompilerCpp('const msg = "hello";\nconsole.log(msg);\n');

  assert.match(cpp, /const char\* msg = "hello";/, 'C++ must declare the const variable with inferred type');
  assert.doesNotMatch(cpp, /const const char\*/, 'C++ must not duplicate const qualifier');
  assert.match(cpp, /__console__log\(msg\);/, 'C++ call should use the declared variable');

  const declPos = cpp.indexOf('const char* msg = "hello";');
  const callPos = cpp.indexOf('__console__log(msg);');
  assert.ok(declPos >= 0, 'declaration should appear in output');
  assert.ok(callPos >= 0, 'call should appear in output');
  assert.ok(declPos < callPos, 'declaration must appear before use');
});

test('C++ lowering emits multiple let declarations from comma-separated list', () => {
  const cpp = runCompilerCpp('let a = 1, b = 2;\nconsole.log(a);\nconsole.log(b);\n');

  assert.match(cpp, /double a = 1;/, 'C++ must lower first declaration from list');
  assert.match(cpp, /double b = 2;/, 'C++ must lower second declaration from list');
  assert.match(cpp, /__console__log\(a\);/, 'C++ must lower first identifier usage');
  assert.match(cpp, /__console__log\(b\);/, 'C++ must lower second identifier usage');
});

test('C++ lowering emits assignment and compound assignment statements', () => {
  const cpp = runCompilerCpp('let x = 1;\nx = 2;\nx += 3;\nconsole.log(x);\n');

  assert.match(cpp, /double x = 1;/, 'C++ must include lowered declaration');
  assert.match(cpp, /x = 2;/, 'C++ must lower plain assignment');
  assert.match(cpp, /x \+= 3;/, 'C++ must lower compound assignment');
  assert.match(cpp, /__console__log\(x\);/, 'C++ must preserve following host call');
});

test('C++ lowering emits additive and multiplicative binary expressions', () => {
  const cpp = runCompilerCpp('let x = 0;\nx = 1 + 2 * 3;\nconsole.log(x);\n');

  assert.match(cpp, /x = 1 \+ 2 \* 3;/, 'C++ must lower additive/multiplicative expression chain');
  assert.match(cpp, /__console__log\(x\);/, 'C++ must preserve host call after arithmetic expression');
});

test('C++ lowering emits relational and logical expressions in if conditions', () => {
  const cpp = runCompilerCpp('let a = 1;\nlet b = 2;\nif (a < b && b != 0) { console.log(a); }\n');

  assert.match(cpp, /if \(a < b && b != 0\) \{/, 'C++ must lower relational/logical if condition');
  assert.match(cpp, /__console__log\(a\);/, 'C++ must lower then-branch host call');
});

test('C++ lowering emits bitwise and shift expressions', () => {
  const cpp = runCompilerCpp('let a = 1;\nlet b = 2;\nlet y = 0;\ny = a << 1 | b;\nconsole.log(y);\n');

  assert.match(cpp, /y = a << 1 \| b;/, 'C++ must lower shift and bitwise expression chain');
  assert.match(cpp, /__console__log\(y\);/, 'C++ must preserve host call after bitwise expression');
});

test('C++ lowering emits postfix update operators', () => {
  const cpp = runCompilerCpp('let x = 1;\nx++;\nx--;\nconsole.log(x);\n');

  assert.match(cpp, /x\+\+;/, 'C++ must lower postfix increment');
  assert.match(cpp, /x--;/, 'C++ must lower postfix decrement');
  assert.match(cpp, /__console__log\(x\);/, 'C++ must preserve following host call');
});

test('C++ lowering emits prefix update operators', () => {
  const cpp = runCompilerCpp('let x = 1;\n++x;\n--x;\nconsole.log(x);\n');

  assert.match(cpp, /\+\+x;/, 'C++ must lower prefix increment');
  assert.match(cpp, /--x;/, 'C++ must lower prefix decrement');
  assert.match(cpp, /__console__log\(x\);/, 'C++ must preserve following host call');
});

test('C++ lowering emits return statement in main body', () => {
  const cpp = runCompilerCpp('let x = 7;\nreturn x;\n');

  assert.match(cpp, /double x = 7;/, 'C++ must lower declaration before return');
  assert.match(cpp, /return \(int\)\(x\);/, 'C++ must lower return expression as int for main');
});

test('C++ lowering emits if/else blocks with host calls', () => {
  const cpp = runCompilerCpp('if (x) { setTimeout(); } else { setTimeout(); }\n');

  assert.match(cpp, /if \(x\) \{/, 'C++ must lower if condition');
  assert.match(cpp, /\}\s*else\s*\{/, 'C++ must lower else branch');

  const hostCalls = cpp.match(/__setTimeout\(\);/g) || [];
  assert.equal(hostCalls.length, 2, 'C++ must lower host call in both branches');
});

test('C++ lowering emits top-level function and local call without host prefix', () => {
  const cpp = runCompilerCpp('function f(){ return 1; }\nf();\n');

  assert.match(cpp, /int f\(void\) \{/, 'C++ must emit local function definition');
  assert.match(cpp, /return \(int\)\(1\);/, 'C++ function body must lower return expression');
  assert.match(cpp, /\n\s*f\(\);/, 'main must call local function directly');
  assert.doesNotMatch(cpp, /__f\(/, 'local function call must not be treated as host call');
});

test('C++ lowering emits function signature parameters for top-level declaration', () => {
  const cpp = runCompilerCpp('function sum(a,b){ return a; }\n');

  assert.match(cpp, /int sum\(int a, int b\);/, 'C++ must emit top-level function prototype');
  assert.match(cpp, /int sum\(int a, int b\) \{/, 'C++ must emit parameterized function signature');
  assert.match(cpp, /return \(int\)\(a\);/, 'C++ function body must lower identifier return');
});

test('C++ lowering infers string return type for function declaration', () => {
  const cpp = runCompilerCpp('function name(){ return "maia"; }\n');

  assert.match(cpp, /const char\* name\(void\);/, 'C++ must emit string-return function prototype');
  assert.match(cpp, /const char\* name\(void\) \{/, 'C++ must emit string-return function definition');
  assert.match(cpp, /return \(const char\*\)\("maia"\);/, 'C++ must cast string return to inferred function type');
});

test('C++ lowering infers double return type from mixed numeric returns', () => {
  const cpp = runCompilerCpp('function measure(){ if (x) { return 1; } return 2.5; }\n');

  assert.match(cpp, /double measure\(void\);/, 'C++ must emit double-return function prototype');
  assert.match(cpp, /double measure\(void\) \{/, 'C++ must emit double-return function definition');
  assert.match(cpp, /return \(double\)\(1\);/, 'C++ must widen integer return to double');
  assert.match(cpp, /return \(double\)\(2.5\);/, 'C++ must keep numeric return as double');
});

test('C++ lowering propagates string return type through local function calls', () => {
  const cpp = runCompilerCpp('function source(){ return "x"; }\nfunction wrap(){ return source(); }\n');

  assert.match(cpp, /const char\* source\(void\);/, 'C++ must infer source return type as string');
  assert.match(cpp, /const char\* wrap\(void\);/, 'C++ must propagate return type from called local function');
  assert.match(cpp, /const char\* wrap\(void\) \{\n\s*return \(const char\*\)\(source\(\)\);\n\}/, 'C++ must emit casted string return from call');
});

test('C++ lowering propagates double return type through local function calls', () => {
  const cpp = runCompilerCpp('function source(){ return 2.5; }\nfunction wrap(){ return source(); }\n');

  assert.match(cpp, /double source\(void\);/, 'C++ must infer source return type as double');
  assert.match(cpp, /double wrap\(void\);/, 'C++ must propagate double return type through local call');
  assert.match(cpp, /double wrap\(void\) \{\n\s*return \(double\)\(source\(\)\);\n\}/, 'C++ must emit casted double return from call');
});

test('C++ lowering emits forward prototype for cross-function call', () => {
  const cpp = runCompilerCpp('function f(){ return g(); }\nfunction g(){ return 1; }\n');

  assert.match(cpp, /int g\(void\);/, 'C++ must emit prototype for later function declaration');
  assert.match(cpp, /int f\(void\) \{\n\s*return \(int\)\(g\(\)\);\n\}/, 'C++ must lower local cross-function call in function body');

  const protoPos = cpp.indexOf('int g(void);');
  const defPos = cpp.indexOf('int f(void) {');
  assert.ok(protoPos >= 0, 'prototype should be present');
  assert.ok(defPos >= 0, 'function definition should be present');
  assert.ok(protoPos < defPos, 'prototype should appear before first function definition that uses it');
});

test('C++ lowering emits function-body if without else and trailing return', () => {
  const cpp = runCompilerCpp('function f(){ if (x) { return 1; } return 2; }\n');

  assert.match(cpp, /int f\(void\);/, 'C++ must emit function prototype');
  assert.match(cpp, /if \(x\) \{/, 'C++ must lower function-body if condition');
  assert.match(cpp, /return \(int\)\(1\);/, 'C++ must lower return inside if branch');
  assert.match(cpp, /return \(int\)\(2\);/, 'C++ must preserve trailing function-body return');
});

test('C++ lowering emits additive expression in return', () => {
  const cpp = runCompilerCpp('function add(a, b){ return a + b; }\n');

  assert.match(cpp, /int add\(int a, int b\);/, 'C++ must emit function prototype with params');
  assert.match(cpp, /return \(int\)\(a \+ b\);/, 'C++ must lower additive expression in return');
});

test('C++ lowering emits comparison expression in if condition within function', () => {
  const cpp = runCompilerCpp('function check(a, b){ if (a < b) { return 1; } return 0; }\n');

  assert.match(cpp, /int check\(int a, int b\);/, 'C++ must emit function prototype with params');
  assert.match(cpp, /if \(a < b\) \{/, 'C++ must lower relational expression as if condition');
  assert.match(cpp, /return \(int\)\(1\);/, 'C++ must lower return inside branch');
  assert.match(cpp, /return \(int\)\(0\);/, 'C++ must lower trailing return');
});

test('C++ lowering emits logical AND expression in return', () => {
  const cpp = runCompilerCpp('function both(a, b){ return a && b; }\n');

  assert.match(cpp, /int both\(int a, int b\);/, 'C++ must emit function prototype with params');
  assert.match(cpp, /return \(int\)\(a && b\);/, 'C++ must lower logical AND expression in return');
});

test('C++ lowering infers return type from inside while body', () => {
  // while with string return + trailing return causes a known grammar limitation;
  // use int returns to cover the inference path until the grammar is extended.
  const cpp = runCompilerCpp('function scan(){ while (x) { return 2.5; } return 0; }\n');

  assert.match(cpp, /double scan\(void\);/, 'C++ must infer double return type through while body');
  assert.match(cpp, /return \(double\)\(0\);/, 'C++ must widen trailing return to double');
});

test('C++ lowering infers return type from inside for body', () => {
  // for-body lowering is not yet implemented; validate type inference only via prototype
  const cpp = runCompilerCpp('function first(){ for (var i = 0; i < 10; i++) { return 2.5; } return 0; }\n');

  assert.match(cpp, /double first\(void\);/, 'C++ must infer double return type through for body');
  assert.match(cpp, /return \(double\)\(0\);/, 'C++ must widen trailing return to double');
});
