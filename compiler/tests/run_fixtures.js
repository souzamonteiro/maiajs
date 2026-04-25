#!/usr/bin/env node
'use strict';

const { runFixtures } = require('./fixtures-runner');

function parseArgs(argv) {
  const out = {
    fixturesDir: null,
    cases: '',
    failOnMissingClang: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixtures-dir' && i + 1 < argv.length) {
      out.fixturesDir = argv[++i];
    } else if (a === '--cases' && i + 1 < argv.length) {
      out.cases = argv[++i];
    } else if (a === '--fail-on-missing-clang') {
      out.failOnMissingClang = true;
    }
  }

  return out;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = runFixtures(args);

    for (const result of summary.results) {
      if (result.errors.length > 0) {
        console.log(`[fail] ${result.name}`);
        for (const err of result.errors) {
          console.log(`  - ${err}`);
        }
      } else {
        console.log(`[ok] ${result.name}`);
      }
      for (const warning of result.warnings || []) {
        console.log(`  - warning: ${warning}`);
      }
    }

    console.log('');
    if (summary.failed > 0) {
      console.log(`Fixture failures: ${summary.failed}/${summary.total}`);
      process.exit(1);
    }

    console.log(`All fixtures passed: ${summary.total}`);
  } catch (error) {
    console.error(`[fail] ${error && error.message ? error.message : String(error)}`);
    process.exit(2);
  }
}

main();
