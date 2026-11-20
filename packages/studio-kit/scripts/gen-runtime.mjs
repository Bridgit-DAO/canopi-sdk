#!/usr/bin/env node
import fs from 'node:fs';
import { buildRuntimeModule, RUNTIME_OUT } from './runtime-build.mjs';

fs.writeFileSync(RUNTIME_OUT, await buildRuntimeModule());
console.log(`wrote ${RUNTIME_OUT}`);
