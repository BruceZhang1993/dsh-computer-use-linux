#!/usr/bin/env node
/**
 * `doctor.mjs` — human-readable desktop readiness without going through DSH.
 *
 * Resolves the binary the same way the MCP launcher does, runs
 * `computer-use-linux doctor`, and prints its JSON readiness report. This is
 * the command to run on a machine where the tools exist but misbehave.
 *
 *   node scripts/doctor.mjs            # full report (pretty-printed)
 *   node scripts/doctor.mjs --raw      # exactly what the binary printed
 */

import { spawn } from 'node:child_process';
import { ensureBinary } from '../lib/binary.mjs';

const raw = process.argv.slice(2).includes('--raw');
const log = (message) => process.stderr.write(`[doctor] ${message}\n`);

let resolved;
try {
  resolved = await ensureBinary({ log });
} catch (error) {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

log(`binary: ${resolved.path} (${resolved.source})`);

const child = spawn(resolved.path, ['doctor'], { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});
child.on('error', (error) => {
  log(`failed to start: ${error.message}`);
  process.exit(127);
});
child.on('exit', (code) => {
  if (stderr.trim() !== '') process.stderr.write(stderr);
  if (raw) {
    process.stdout.write(stdout);
  } else {
    try {
      process.stdout.write(`${JSON.stringify(JSON.parse(stdout), null, 2)}\n`);
    } catch {
      process.stdout.write(stdout);
    }
  }
  process.exit(code ?? 1);
});
