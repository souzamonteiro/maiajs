# Maia Ecosystem Synchronization Protocol

This protocol is mandatory whenever MaiaCC changes, regardless of change size.

## Goal

Keep parser generation, tests, submodules, and releases synchronized across:

1. MaiaCC
2. MaiaWASM
3. MaiaC
4. MaiaCpp
5. MaiaJS

## Mandatory Order

Follow this exact sequence.

### 1. MaiaCC

1. Regenerate parser.
2. Run the full test suite.
3. Commit and push.

### 2. MaiaWASM

1. Pull the MaiaCC submodule.
2. Regenerate parser.
3. Run the full test suite.
4. Commit and push.

### 3. MaiaC

1. Pull MaiaCC and MaiaWASM submodules.
2. Regenerate parser.
3. Run the full test suite.
4. Compile test.c and validate the produced output.
5. Commit and push.

### 4. MaiaCpp

1. Pull MaiaCC, MaiaWASM, and MaiaC submodules.
2. Regenerate parser.
3. Run the full test suite.
4. Commit and push.

### 5. MaiaJS

1. Pull MaiaCC, MaiaWASM, MaiaC, and MaiaCpp submodules.
2. If the change is in the MaiaJS parser, update grammar in grammar/EcmaScript.ebnf.
3. Regenerate MaiaJS parser from EBNF.
4. Run MaiaJS tests and validation commands.

## Parser Rule (Critical)

Never hand-edit generated parser files.

For MaiaJS parser changes:

1. Edit grammar/EcmaScript.ebnf.
2. Regenerate grammar/EcmaScript.xml and compiler/ecmascript-parser.js using tREx.
3. Re-run parser/compiler tests.

## Definition Of Done

Do not consider the change complete until:

1. All five repositories are synchronized in the required order.
2. All required parser regenerations are complete.
3. All test suites pass.
4. Required commits and pushes are complete.
