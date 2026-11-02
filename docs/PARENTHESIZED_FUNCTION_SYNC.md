# Parenthesized function compiler synchronization

2026-11-02. Root gitlinks MaiaC9793ab9 and MaiaCppa638403 were recorded
before `npm run test:full`. All recursive checkouts are clean and consume
published commits; no sibling compiler checkout is used.

The full suite passed: unit checks, eleven C++ and eleven JavaScript suite
examples rebuilt/executed, 48 course programs through MaiaCpp/WASM, and the
complete distribution example. Existing course exclusions remain: 48 missing
native expected-output references and 48 missing JS-port sources; those are not
independent native/JS comparisons, even though its final summary prints zero
skips. The detailed per-case diagnostics remain in the suite log.

The 46 tracked example manifests were reviewed by parsed JSON comparison:
only generatedAt/input metadata changed; executable artifacts are unchanged.
They are versioned under the owner's artifact policy. No MaiaJS compiler,
grammar, version or npm publication changed.

Owning regression: MaiaC39 positive/five negative native C89/ASan/UBSan/WASM
cases plus full suite/example. MaiaCpp's default suite and complete three-
generation guest MaiaCC bootstrap passed, both emitters/seven grammars and27
memory growths. Node reference WASM evidence is separate from VM/device testing.
