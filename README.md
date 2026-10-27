# MaiaJS (WebJS)
Maia JavaScript Compiler

<img src="images/Rudder.png" style="width: 512px; height: auto;">


## Versioned example artifacts

The project owner explicitly requests committing the generated example artifacts
for GitHub review, including mobile access. Keep the tracked outputs under
`compiler/examples/` alongside their sources: generated C (where applicable),
WAT, WASM and distribution manifests. Regenerate using `npm run test:full`,
review the diff and validate the outputs before publication. WAT and paired WASM
must agree; manifest timestamps may change during generation.

This policy covers the documented example outputs, not temporary build folders,
caches or unrelated test scratch files. Do not hand-edit generated code. Artifact
publication does not imply a release-version change or npm publication.

## Process Documentation

Mandatory cross-repository synchronization workflow:

- [docs/Maia_Ecosystem_Synchronization_Protocol.md](docs/Maia_Ecosystem_Synchronization_Protocol.md)

UTF-8 compiler propagation and separate legacy source/artifact limitations are
recorded in [the synchronization report](docs/UTF8_TOOLCHAIN_SYNC.md).

## Transpiler Status and Diagnosis

For a clear diagnosis of transpiler capabilities, limitations, and remediation roadmap:

- [docs/MAIAJS_Transpiler_Diagnosis.md](docs/MAIAJS_Transpiler_Diagnosis.md)

For fixture-based testing and validation framework:

- [compiler/tests/FIXTURES.md](compiler/tests/FIXTURES.md) — Fixture system guide
- [compiler/tests/run_fixtures.js](compiler/tests/run_fixtures.js) — CLI runner
- Run: `node compiler/tests/run_fixtures.js`
