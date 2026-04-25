# MaiaJS Fixture Suite

This fixture suite validates MaiaJS in four explicit stages:

1. `lexer`: tokenization from generated `Lexer`
2. `parser`: AST parse success/failure from generated `Parser`
3. `transpiler`: JS to C++ generation (`ecmascript-compiler.js`)
4. `cpp-syntax`: optional `clang++ -fsyntax-only` check on generated C++

## File format

Each fixture is a pair in `compiler/tests/fixtures`:

1. `NNN_name.js`
2. `NNN_name.expect.json`

## Supported expectation keys

1. `stages`: array of stage names (`lexer`, `parser`, `transpiler`, `cpp-syntax`)
2. `shouldLex`: boolean
3. `shouldParse`: boolean
4. `shouldTranspile`: boolean
5. `shouldCppSyntax`: boolean
6. `tokenTypesInclude`: array of token type strings
7. `tokenValuesInclude`: array of token value strings
8. `tokenTypesExclude`: array of token type strings
9. `parseErrorContains`: array of parse error fragments
10. `compilerOutputContains`: array of compiler stdout/stderr fragments
11. `compilerOutputExclude`: array of compiler stdout/stderr fragments
12. `cppContains`: array of generated C++ fragments
13. `cppExclude`: array of generated C++ fragments
14. `astContains`: array of generated AST JSON fragments
15. `cppSyntaxOutputContains`: array of `clang++` output fragments

## Run

From repository root:

```sh
node compiler/tests/run_fixtures.js
```

Run only selected fixtures:

```sh
node compiler/tests/run_fixtures.js --cases 001_lexer_keywords,201_transpiler_host_console
```
