#!/usr/bin/env node
// Update dashboard evidence JSON files to reflect passing unit tests.
// Reads vitest JSON results, then flips testing.unit and testing.automated
// for specs that have matching test files with all tests passing.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const REVIEWS_DIR = resolve(ROOT, 'specs/dashboard/spec-meta/reviews');
const RESULTS_FILE = resolve(ROOT, 'specs/testing/results/vitest-results.json');

// Mapping: test file name prefix → spec ID
const TEST_SPEC_MAP = {
  'config': 'VF-CONFIG',
  'terrain-noise': 'VF-TERRAIN',
  'atmosphere': 'VF-ATMOSPHERE',
  'weather-formulas': 'VF-WEATHER',
  'forest-logic': 'VF-FOREST',
  'water-formulas': 'VF-WATER',
};

function main() {
  // Read vitest results
  if (!existsSync(RESULTS_FILE)) {
    console.error('No test results found. Run: npm run test:report');
    process.exit(1);
  }

  const results = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));

  // Determine which test files passed (all tests in file passed)
  const passingSpecs = new Set();

  for (const testFile of results.testResults) {
    // Check if all tests in this file passed
    const allPassed = testFile.assertionResults.every(r => r.status === 'passed');
    if (!allPassed) continue;

    // Match file to spec
    for (const [prefix, specId] of Object.entries(TEST_SPEC_MAP)) {
      if (testFile.name.includes(`${prefix}.test.js`)) {
        passingSpecs.add(specId);
      }
    }
  }

  console.log(`Passing specs: ${[...passingSpecs].join(', ')}`);

  // Update evidence files
  let updated = 0;
  for (const specId of passingSpecs) {
    const filePath = resolve(REVIEWS_DIR, `${specId}.json`);
    if (!existsSync(filePath)) {
      console.warn(`  Skipping ${specId}: no evidence file`);
      continue;
    }

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));

    const changed = !data.evidence.testing.unit || !data.evidence.testing.automated;
    data.evidence.testing.unit = true;
    data.evidence.testing.automated = true;

    if (changed) {
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`  Updated ${specId}: testing.unit=true, testing.automated=true`);
      updated++;
    } else {
      console.log(`  ${specId}: already up to date`);
    }
  }

  console.log(`\nDone. ${updated} spec(s) updated.`);
}

main();
