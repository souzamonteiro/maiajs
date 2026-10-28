# Local struct compiler synchronization — 2026-10-27

This consumer records published MaiaCpp6aa8eac through its own submodule;
MaiaC remains4fc3ee9. The owning correction preserves named local plain struct
object declarations, lexical identities/shadowing and static storage in the
AST-strict C89 path. Native C++98/emitted C89 sanitizer and actual WASM
regressions, full readiness and three-generation MaiaCC WASM selfhost passed
before dependency publication. No MaiaJS source/API/version/npm change.

Following ./git_pull.sh, local pointer commit f18d008 recorded the published
dependency before downstream tests. `npm run test:full` passes379unit tests,
11C++/11JavaScript suite examples,48existing course WASM executables and
executable Node/browser distributions. The changed example artifacts are46
regenerated JSON manifests (timestamps/temporary input paths), all valid JSON;
C89/WAT/WASM bytes are unchanged. They are retained under the owner artifact
policy. Logs:/tmp/maiajs-local-struct-{pull,full}.log.

The historical [legacy source/artifact gaps](UTF8_TOOLCHAIN_SYNC.md#separate-legacy-artifactsource-gaps--not-repaired-by-this-change)
remain separate and unresolved. Course evidence is prebuilt execution; it does
not prove fresh source regeneration, native output equivalence or repair of the
52existing WAT/WASM mismatches. No unrelated course regeneration or test weakening.
All builds/tests use this repository's own dependencies. Reference WASM/host
tests do not establish MaiaWASMVM/device conformance. No npm or version change.
