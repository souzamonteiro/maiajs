const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMPILER_PATH = path.resolve(__dirname, '..', 'ecmascript-compiler.js');

function compileStrictCpp(source, name = 'test.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiajs-es8-feat-'));
  const inFile = path.join(dir, name);
  const outFile = path.join(dir, 'out.cpp');
  fs.writeFileSync(inFile, source, 'utf8');
  execFileSync('node', [COMPILER_PATH, '--strict-lowering', '--file', inFile, '--cpp-out', outFile], {
    stdio: 'pipe'
  });
  return fs.readFileSync(outFile, 'utf8');
}

test('ES8 features: in operator lowers to __maia_runtime_value_has_property', () => {
  const cpp = compileStrictCpp(`
    const person = { name: 'Ana', age: 30 };
    console.log('name' in person);
  `);
  assert.match(cpp, /__maia_runtime_value_has_property/);
});

test('ES8 features: dynamic object property assignment lowers to __maia_runtime_value_set_property', () => {
  const cpp = compileStrictCpp(`
    const obj = {};
    obj.regular = 'normal';
    console.log(obj.regular);
  `);
  assert.match(cpp, /__maia_runtime_value_set_property\(\(void\*\)\(obj\), "regular"/);
});

test('ES8 features: contextual keyword identifierReference (set) lowers in primaryExpression', () => {
  const cpp = compileStrictCpp(`
    const set = new Set([1, 2, 3]);
    console.log(Array.from(set));
  `);
  assert.match(cpp, /__maia_set_new/);
  assert.match(cpp, /__maia_array_from\(\(void\*\)\(set\)\)/);
});

test('ES8 features: Set and Map runtime helpers lower add/has/size/set/get', () => {
  const cpp = compileStrictCpp(`
    const s = new Set([1, 2]);
    s.add(3);
    console.log(s.size, s.has(2));
    const m = new Map();
    m.set('k', 'v');
    console.log(m.size, m.get('k'));
  `);
  assert.match(cpp, /__maia_set_add/);
  assert.match(cpp, /__maia_set_has/);
  assert.match(cpp, /__maia_set_size/);
  assert.match(cpp, /__maia_map_set/);
  assert.match(cpp, /__maia_map_get/);
  assert.match(cpp, /__maia_map_size/);
});

test('ES8 features: unsigned right shift >>> lowers to C++98 unsigned shift', () => {
  const cpp = compileStrictCpp(`
    console.log(5 >>> 1);
  `);
  assert.match(cpp, /__maia_ushift_r/);
  assert.doesNotMatch(cpp, />>>/);
});

test('ES8 features: try-finally without catch emits C++98 catch (...)', () => {
  const cpp = compileStrictCpp(`
    try {
      console.log('a');
    } finally {
      console.log('b');
    }
  `);
  assert.match(cpp, /catch\s*\(const char\*\s+__maia_unused_err\)\s*\{/);
});

test('ES8 features: tagged template lowers strings array and interpolated arguments', () => {
  const cpp = compileStrictCpp(`
    function tag(strings, a, b) {
      return strings[0];
    }
    const name = 'World';
    console.log(tag\`Hello \${name}, count=\${10}.\`);
  `);
  assert.match(cpp, /__maia_tag_strings_/);
  assert.match(cpp, /tag\(__maia_tag_strings_/);
});

test('ES8 features: regularExpressionLiteral and .test() lower to __maiaregex__new / __maiaregex__test', () => {
  const cpp = compileStrictCpp(`
    const re = /abc/i;
    console.log(re.test('ABC'));
  `);
  assert.match(cpp, /extern void\* __maiaregex__new\(const char\*, const char\*\);/);
  assert.match(cpp, /extern int __maiaregex__test\(void\*, const char\*\);/);
  assert.match(cpp, /__maiaregex__new\("abc", "i"\)/);
  assert.match(cpp, /__maiaregex__test\(\(void\*\)\(re\), \(const char\*\)\("ABC"\)\)/);
});

test('ES8 features: new RegExp(pattern, flags) lowers to __maiaregex__new', () => {
  const cpp = compileStrictCpp(`
    const re = new RegExp('foo[0-9]+', 'g');
    console.log(re.test('foo42'));
  `);
  assert.match(cpp, /__maiaregex__new\(\(const char\*\)\("foo\[0-9\]\+"\), \(const char\*\)\("g"\)\)/);
  assert.match(cpp, /__maiaregex__test/);
});
