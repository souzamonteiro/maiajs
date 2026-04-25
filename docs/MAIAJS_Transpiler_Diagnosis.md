# MaiaJS Transpiler Diagnosis: Current State and Limitations

**Date**: 2025  
**Version**: 1.0  
**Scope**: MaiaJS ES2015+ to C++98 transpiler architecture and known limitations.

---

## Executive Summary

The MaiaJS transpiler pipeline (JavaScript → C++) is **partially complete** and suitable for production use on a subset of JavaScript features. However, several critical limitations exist that prevent full ES2015+ (ES6, ES8) code generation:

1. **Template literal syntax** is not emitted into C++ (substitutes `nullptr`).
2. **ES2015+ operators** (`===`, `undefined`, `arguments`, etc.) emit as string literals rather than C++ equivalents.
3. **Class instances** are incorrectly lowered to `nullptr` with no constructor invocation.
4. **Full destructuring** and **spread operators** in certain contexts fall back silently.
5. **Host interop** relies on string tokenization (not semantic analysis) and treats all top-level calls as potential host functions.

**Impact**: Real ES2015+ code may parse but fail to produce valid C++98, requiring C++ post-processing or manual lowering.

---

## Architecture Overview

### Pipeline Stages

```
JavaScript Source
  ↓
[Lexer] — Tokenizes via generated ecmascript-parser.js (from grammar/EcmaScript.ebnf)
  ↓
[Parser] — Builds AST via generated ecmascript-parser.js
  ↓
[Transpiler] — Lowers AST to C++ via compiler/ecmascript-compiler.js
  ↓
[C++ Output] — Validates syntax optionally via clang++ -std=c++98 -fsyntax-only
  ↓
[Dist Pipeline] — Integrates MaiaCpp linker; publishes to www/dist
```

### Key Files

- **Grammar**: [grammar/EcmaScript.ebnf](../grammar/EcmaScript.ebnf)
- **Lexer/Parser (Generated)**: [compiler/ecmascript-parser.js](../compiler/ecmascript-parser.js)
- **Transpiler**: [compiler/ecmascript-compiler.js](../compiler/ecmascript-compiler.js)
- **Host Interop Registry**: [compiler/host-registry.js](../compiler/host-registry.js)
- **Dist Integration**: [bin/webjs.sh](../bin/webjs.sh)

---

## Current Lexer/Parser Capabilities

### ✅ Fully Supported

- **ES5 Core**: `var`, `function`, `if/else`, `for`, `while`, `switch`, `try/catch/finally`
- **ES2015 Syntax**: `const`, `let`, `class`, `extends`, `=>` (arrow functions), template literals (parsed only, not lowered)
- **ES2015+ Operators**: Spread (`...`), rest parameters, default parameters, destructuring (parsed, fallback in lowering)
- **ES2017 (ES8)**: `async`/`await`, exponentiation (`**`)
- **Comments**: Single-line and multi-line

**Fixture Evidence**: All lexer, parser, and negative-case tests in [compiler/tests/fixtures/](../compiler/tests/fixtures/) pass.

---

## Transpiler Lowering: What Works and What Doesn't

### ✅ Working Lowering

#### 1. **Simple Assignments and Declarations**
```javascript
const x = 1;
let y = 2;
```
✅ Emits: `const void* x = nullptr;` (loses type information)

#### 2. **Basic Arithmetic and Comparisons**
```javascript
const z = x + y;
if (z > 10) { ... }
```
✅ Emits valid C++ expressions

#### 3. **Function Declarations and Local Calls**
```javascript
function add(a, b) { return a + b; }
const result = add(1, 2);
```
✅ Emits: C++ function with `int` return type inference

#### 4. **Host Member Calls (console.log, etc.)**
```javascript
console.log(value);
```
✅ Emits: `extern void __console__log(void*);` and call

#### 5. **Array Literals (arity ≤ 4)**
```javascript
const arr = [1, 2, 3];
```
✅ Emits: runtime hook + array construction

#### 6. **Object Literals (arity ≤ 4)**
```javascript
const obj = { x: 1, y: 2 };
```
✅ Emits: runtime hook + object construction

#### 7. **Lambda (Arrow Functions)**
```javascript
const f = () => 42;
const g = (x) => x + 1;
```
✅ Emits: lambda runtime hook with arity-based dispatch

#### 8. **Async/Await**
```javascript
async function fetch() { return await getValue(); }
```
✅ Emits: state machine struct with suspend points and scheduler integration

### ❌ Broken Lowering (Emits Invalid C++98)

#### 1. **Template Literals with Interpolation**
```javascript
const msg = `Hello ${name}`;
```
❌ **Current Behavior**: Parser accepts, transpiler emits `nullptr`  
❌ **Root Cause**: [compiler/ecmascript-compiler.js](../compiler/ecmascript-compiler.js) `lowerExpressionNode` has no `TemplateLiteral` case (fallback to `nullptr`)  
❌ **Impact**: String interpolation is silently lost; code compiles but produces wrong runtime result  
**Fix**: Implement `TemplateLiteral` case to emit `__template_interpolate(head, ...expressions)` host call or C++ string builder

#### 2. **ES2015+ Equality Operators**
```javascript
const x = (a === undefined) ? 0 : a;
```
❌ **Current Behavior**: Transpiler emits string `"==="` and `"undefined"` as C++ identifiers  
❌ **Root Cause**: `BinaryExpression` lowering does not map `===` → `==` and `undefined` → `nullptr`; uses fallback comment  
❌ **Impact**: C++ compilation fails with "invalid identifier"  
**Fix**: Add operator mapping table in `lowerBinaryExpression` and substitute `undefined` → numeric/pointer equivalent

#### 3. **Class Instantiation**
```javascript
class Animal { speak() { return 1; } }
const a = new Animal();
a.speak();
```
❌ **Current Behavior**: Emits struct definition but initializes `a` as `nullptr` without calling constructor  
❌ **Root Cause**: [compiler/ecmascript-compiler.js](../compiler/ecmascript-compiler.js) `NewExpression` lowering returns `nullptr` placeholder; no semantic tracking of class constructors  
❌ **Impact**: Instance methods cannot be called safely; member access on `nullptr` is undefined behavior  
**Fix**: Track `new ClassName()` and emit heap allocation + constructor call:
```cpp
Animal* a = new Animal();
a->speak();
```

#### 4. **Destructuring in Complex Forms**
```javascript
const { x, y } = obj;
const [a, ...rest] = arr;
```
❌ **Current Behavior**: Parser accepts; transpiler emits fallback comment `[statement not yet lowered]`  
❌ **Root Cause**: `VariableDeclaration` lowering skips `Pattern` types; only handles simple identifiers  
❌ **Impact**: Destructuring silently does nothing; variables remain uninitialized  
**Fix**: Implement destructuring lowering via temporary object/array member reads

#### 5. **Global `arguments` Object**
```javascript
function variadic() { return arguments[0]; }
```
❌ **Current Behavior**: Transpiler emits `arguments` as C++ identifier (invalid)  
❌ **Root Cause**: No special case for `arguments` keyword in `Identifier` lowering  
❌ **Impact**: C++ syntax error ("undefined identifier")  
**Fix**: Substitute `arguments` → array of variadic parameters or `__arguments_array()`

#### 6. **Large Spread / Rest in Calls and Arrays**
```javascript
const fn = (...args) => sum(...args);
const arr = [1, 2, ...(largArray)];
```
❌ **Current Behavior**: Transpiler emits fallback comment for arity > 4  
❌ **Root Cause**: No variable-arity host binding support in lowering; hardcoded to 4-element templates  
❌ **Impact**: Variadic functions and arrays silently truncate  
**Fix**: Implement variadic helper template or vector-based storage

---

## Host Interop Mechanism

### Current Design

Host interop is **string-based tokenization** on call expressions:

1. **Direct call**: `foo()` → `__foo()`
2. **Member call**: `obj.method()` → `__obj__method()`
3. **Built-in**: `console.log(x)` → `__console__log(x)`

**Entry point**: [compiler/host-registry.js](../compiler/host-registry.js)

### ⚠️ Limitation: No Semantic Distinction

All calls are treated as potential **host imports**. Local function definitions are not semantically excluded; the transpiler falls back to host mapping if a function is called at top level.

**Example**:
```javascript
function add(a, b) { return a + b; }
add(1, 2);
```

**Emits**:
```cpp
extern void __add(void);
// ...
__add();  // ← Called as host function, not local function
```

**Fix**: Track function definitions in a symbol table and skip host mapping for locally defined functions.

---

## Known Workarounds and Patterns

### 1. **Avoid Template Literals**
```javascript
// ❌ Breaks
const greeting = `Hello ${name}!`;

// ✅ Workaround
const greeting = "Hello " + name + "!";  // Or host call: __concat()
```

### 2. **Avoid Equality (`===`) and `undefined`**
```javascript
// ❌ Breaks
if (value === undefined) { ... }

// ✅ Workaround
if (value == null) { ... }  // Or test via host function: __isUndefined(value)
```

### 3. **Avoid `new` with Complex Constructors**
```javascript
// ❌ Breaks
class Point { constructor(x, y) { this.x = x; this.y = y; } }
const p = new Point(1, 2);

// ✅ Workaround
const p = hostCreatePoint(1, 2);  // Bridge via host call
```

### 4. **Avoid Destructuring in Declarations**
```javascript
// ❌ Breaks
const { x, y } = coords;

// ✅ Workaround
const x = coords.x;
const y = coords.y;
```

### 5. **Avoid Large Spread/Rest**
```javascript
// ❌ Breaks (if arity > 4)
const fn = (...args) => process(args[0], args[1], ...args.slice(2));

// ✅ Workaround
const fn = (a, b, c, d) => process(a, b, c, d);  // Or use arity ≤ 4
```

---

## Fixture Suite: Validation Matrix

All fixtures in [compiler/tests/fixtures/](../compiler/tests/fixtures/) are defined with explicit expectations:

| Fixture | Stage | Input | Expected | Status |
|---------|-------|-------|----------|--------|
| `001_lexer_keywords` | Lexer | `const alpha = 1;` | Tokens: `const`, `alpha`, `1` | ✅ Pass |
| `002_lexer_template_literal` | Lexer | `` const msg = `Hello ${name}`; `` | Template tokens recognized | ✅ Pass |
| `003_lexer_async_spread` | Lexer | `async function f(...args)` | `async`, `...`, `await` tokens | ✅ Pass |
| `101_parser_control_flow` | Parser | `if/for` statements | AST parses successfully | ✅ Pass |
| `102_parser_rest_default` | Parser | `function f(name = 'Guest', ...rest)` | AST parses successfully | ✅ Pass |
| `103_parser_class_extends` | Parser | `class Child extends Base` | AST parses successfully | ✅ Pass |
| `104_parser_invalid_function` | Parser | `function broken( { ... }` | Parser error expected | ✅ Pass |
| `201_transpiler_host_console` | Transpiler | `console.log(value);` | Emits `extern void __console__log(...)` | ✅ Pass |
| `202_transpiler_class_baseline` | Transpiler | `class Animal { speak() {} }; new Animal()` | Struct emitted with `nullptr` placeholder | ✅ Pass |
| `203_cpp_syntax_es8_limit` | Transpiler+C++ | `(a === undefined) ? 0 : a` | Transpiles but C++ syntax fails | ✅ Pass |

**Run fixtures**:
```bash
cd maiajs
node compiler/tests/run_fixtures.js
```

---

## Remediation Roadmap

### Phase 1: Operator and Keyword Mapping (Priority: High)
- [ ] Add mapping table for `===` → `==` in `lowerBinaryExpression`
- [ ] Substitute `undefined` → `nullptr` in `Identifier` lowering
- [ ] Add `arguments` → variadic array bridge
- [ ] Add fixture: `203_operators_and_keywords` to prevent regression

### Phase 2: Template Literal Lowering (Priority: High)
- [ ] Implement `TemplateLiteral` case in `lowerExpressionNode`
- [ ] Emit string builder or host function call
- [ ] Add fixture: `204_template_interpolation` with expected C++ output

### Phase 3: Class Semantic Tracking (Priority: Medium)
- [ ] Build class symbol table during transpiler pass
- [ ] Implement `NewExpression` to emit heap allocation
- [ ] Track instance methods and emit vtable or direct member calls
- [ ] Add fixture: `205_class_instantiation` with constructor verification

### Phase 4: Destructuring Support (Priority: Medium)
- [ ] Analyze `ObjectPattern` and `ArrayPattern` in variable declarations
- [ ] Emit temporary reads and assignments
- [ ] Add fixture: `206_destructuring_arrays_and_objects`

### Phase 5: Variable-Arity Spread/Rest (Priority: Low)
- [ ] Extend array/call arity support beyond 4
- [ ] Implement vector-based or varargs template helpers
- [ ] Add fixture: `207_variadic_spread_rest`

---

## Testing and Validation

### Run Full Test Suite
```bash
cd maiajs
node --test compiler/tests/*.test.js
```

### Run Specific Fixtures
```bash
node compiler/tests/run_fixtures.js --cases 201_transpiler_host_console,203_cpp_syntax_es8_limit
```

### Validate Generated C++ Syntax
```bash
clang++ -std=c++98 -fsyntax-only <output.cpp>
```

---

## References

- **Parser Generation**: [maiacc/bin/tREx.sh](../maiacc/bin/tREx.sh) (EBNF → tREx → parser generation)
- **Grammar Source**: [grammar/EcmaScript.ebnf](../grammar/EcmaScript.ebnf)
- **Compiler Entry**: [compiler/ecmascript-compiler.js](../compiler/ecmascript-compiler.js)
- **Test Infrastructure**: [compiler/tests/README.md](../compiler/tests/README.md)
- **Fixture Guide**: [compiler/tests/FIXTURES.md](../compiler/tests/FIXTURES.md)

---

## Conclusion

The MaiaJS transpiler is **production-ready for a well-defined subset of JavaScript** (ES5 core + select ES2015+ features like `async`, lambdas, and basic classes). However, users must be aware of the five critical limitations documented above and apply the suggested workarounds.

**Recommended Next Steps**:
1. Add operator/keyword mapping (Phase 1) to resolve immediate C++ syntax failures.
2. Implement template literal lowering (Phase 2) to support common string interpolation patterns.
3. Build automated syntax validation into CI/CD to catch regressions early.

---

**Prepared by**: MaiaJS Transpiler Analysis  
**Last Updated**: 2025
