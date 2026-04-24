# Maia Workflow Requirements

These rules are mandatory for any MaiaCC modification and must be followed in this exact order.

## Cross-Repository Synchronization Order

1. MaiaCC: regenerate parser, run full test suite, commit and push.
2. MaiaWASM: pull MaiaCC submodule, regenerate parser, run full test suite, commit and push.
3. MaiaC: pull MaiaCC and MaiaWASM submodules, regenerate parser, run full test suite, compile test.c, validate output, commit and push.
4. MaiaCpp: pull MaiaCC, MaiaWASM, and MaiaC submodules, regenerate parser, run full test suite, commit and push.
5. MaiaJS: pull MaiaCC, MaiaWASM, MaiaC, and MaiaCpp submodules before MaiaJS validation work.

## MaiaJS Parser Rule

If the change affects the MaiaJS parser:

1. Change grammar in grammar/EcmaScript.ebnf.
2. Regenerate parser artifacts from EBNF with tREx.
3. Do not hand-edit compiler/ecmascript-parser.js.

## Reference

Full process document:

docs/Maia_Ecosystem_Synchronization_Protocol.md
