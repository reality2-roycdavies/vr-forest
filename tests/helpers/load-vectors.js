import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR = resolve(__dirname, '../../specs/testing/test-vectors');

/**
 * Load a test vector JSON file by spec name (e.g. 'config', 'terrain').
 * @param {string} name - Short name without vf- prefix or -vectors suffix
 * @returns {object} Parsed JSON with spec, version, description, vectors[]
 */
export function loadVectors(name) {
  const filePath = resolve(VECTORS_DIR, `vf-${name}-vectors.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Get a single vector by ID from a loaded vector file.
 * @param {object} data - Loaded vector data from loadVectors()
 * @param {string} id - Vector ID (e.g. 'config-001')
 * @returns {object} The matching vector
 */
export function getVector(data, id) {
  const v = data.vectors.find(v => v.id === id);
  if (!v) throw new Error(`Vector ${id} not found in ${data.spec}`);
  return v;
}
