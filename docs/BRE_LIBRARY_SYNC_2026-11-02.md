# Additive BRE dependency propagation

2026-11-02. All five affected root gitlinks were recorded after completed
git_pull and before test:full: MaiaCCfe00596, MaiaWASM8f5d02b, MaiaC3007495,
MaiaCpp16cca71 and MaiaRegex8a1dcbf. No JS compiler/grammar/parser change.

npm run test:full passed: unit checks, eleven C++/eleven JavaScript suite
examples built/executed,48 course programs through MaiaCpp/WASM, and complete
distribution example. Existing course exclusions remain48 missing native output
references and48 missing JS-port sources (not independent native/JS comparisons).
The46 tracked manifests were compared as parsed JSON: only generatedAt/input
metadata differs; executable artifacts are unchanged. Versioned under the
owner's explicit example-artifact policy.

Ordered lexer runtime source/API is unchanged; new BRE acceptance belongs to
principal Regex. Its development tools/maiacpp submodules are intentionally
uninitialized (`update=none`), so normal recursion preserves the fixed historical
bootstrap. No npm/version/history or root MaiaOS publication. Reference Node
WASM evidence is separate from MaiaWASMVM/device conformance.
