/** Test helper: a fresh copy of fixtures/sample-project.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StudioProject } from './types.js';

export const SAMPLE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-project.json');
export const loadSample = (): StudioProject => JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
