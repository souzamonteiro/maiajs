# MaiaJS Validation Baseline - 2026-09-16

## Scope

This baseline validates the supported ECMAScript 2017 (ES8) MaiaJS path through
MaiaCpp, MaiaC/WebC, Node, and Chrome headless. It does not expand the claimed
language scope to general JavaScript or to ES2018 extensions such as object
spread.

## Results

| Gate | Result |
| --- | --- |
| `npm run test:full` | Passed: 346 compiler tests, suite build/run, course corpus, and distributable sample. |
| `bash compiler/examples/validate_full_es8_dist.sh` | Passed: strict JS lowering, C++98, C, WASM, and Node markers matched source behavior. |
| `npm run test:browser:es8` | Passed: Chrome headless reproduced all required ES8 browser-runner markers. |
| `npm run test:browser:async-nested-loops` | Passed: all nested `for`/`while`, `break`, and `continue` browser cases. |

The full command logs were captured during the run in `/private/tmp`:

- `maiajs-repro-2026-09-16-test-full.log`
- `maiajs-repro-2026-09-16-full-es8.log`
- `maiajs-repro-2026-09-16-browser-es8.log`

Generated `compiler/examples/dist` and suite artifacts are intentionally not
part of this baseline record because they are build outputs and may already be
present in a developer worktree.
