# Published parser/resource prerequisite synchronization

2026-11-02. Local dependencies now pin MaiaCC4cf1083, MaiaWASM9a1c1ce,
MaiaC6c01465 and MaiaCpp2b964ce. All include the published recursive pins.
No MaiaJS compiler implementation or grammar changed.

`npm run test:full` passed after all four direct gitlinks were recorded. This
runs the default tests, builds and executes11 C++/11 JS-port suite cases, runs
48 course C++ programs through WASM and validates the distribution example.
The course fixtures still have48 missing native expected_output references and
48 missing matching JS-port sources, reported by the unchanged harness; this
is not native/JS conformance coverage for those missing references.

The first full run also passed, but direct MaiaWASM was recorded afterward;
the complete second run is the publication evidence. Test-created tracked
manifests are versioned per README policy. Review verified that all46 only
changed generated timestamps/temporary input paths; artifact metadata and all
other JSON values stayed equal. No npm release or version/history change.

Native/generated-parser resource and indexed pointer semantics are tested in
their owning MaiaCC/MaiaC repositories and in the published MaiaCpp own-chain
regressions/full three-generation MaiaCC WASM bootstrap. This consumer uses
repository-local submodules only, with no sibling or host semantic fallback.
