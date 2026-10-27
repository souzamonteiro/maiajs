# UTF-8 compiler synchronization — 2026-10-27

This consumer records published MaiaC 4fc3ee9 and MaiaCpp 58adfa3 through its
own submodules. No MaiaJS source semantics, version or npm publication changes.
Upstream focused regressions validate raw scalar UTF-8 bytes separately from
explicit numeric byte escapes using native C89/C++98, emitted strict C89 and
actual WASM. The complete MaiaCC WASM selfhost passes three stable generations.

`npm run test:full` passes 379 unit tests, 11 C++/11 JavaScript-port suite cases,
48 existing course executables, and executable distribution checks. Recursive
remote verification confirms all 31 gitlinks across five intended remotes.
Regenerated manifests are retained under the owner artifact policy; their
input temporary paths/timestamps change. These consumer suites do not establish
full source reproducibility or AST-strict conformance for the legacy course.

## Separate legacy artifact/source gaps — not repaired by this change

An additional audit of every tracked example found 52 pre-existing mismatched
WAT/WASM pairs in the course directory. They were unchanged from HEAD before
this task. A trial regeneration exposed unrelated legacy-source gaps:

- `12_namespaces/namespace.cpp`: the default path falls back after the leading
  include, drops numeric::golden/numeric::pi, then MaiaC reports unknown golden.
- `05_inheritance/automobiles_v2.cpp` and
  `09_pointers/pointers_to_arrays.cpp`: fresh default C++ translations produce
  output different from native execution. Loading the pre-correction MaiaCpp
  compiler module from commit 9329dfc and comparing its emitted C89 with 58adfa3
  gives byte-identical output for both sources (using the current in-repository
  generated parser). The UTF-8 correction did not introduce those differences.
- The versioned automobiles_v2.c itself cannot rebuild: duplicate main
  definitions. Existing prebuilt course execution is therefore insufficient
  evidence of reproducible compilation from those source files.

The additional course regeneration trial was reverted completely: only its own
tracked generated outputs were restored from HEAD, and its newly created outputs
were removed. No expected output, test or compiler behavior was weakened. These
legacy sources/artifacts remain at their original versions, outside the UTF-8
correction. The passing course suite is explicitly prebuilt/runtime evidence.
Repairing them needs a separate source-reproducibility contract and owner
semantic corrections; do not claim all legacy WAT/WASM pairs are synchronized.
The new UTF-8 owner tests and MaiaOS guests explicitly require AST-strict
lowering and actual fresh WASM builds without legacy fallbacks.
