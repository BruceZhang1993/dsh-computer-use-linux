#!/usr/bin/env node
/**
 * `install-binary.mjs` — put a verified desktop binary in the plugin cache.
 *
 *   node scripts/install-binary.mjs           # resolve, downloading if needed
 *   node scripts/install-binary.mjs --check   # report resolution only, no download
 *   node scripts/install-binary.mjs --force   # re-download even if one exists
 *
 * Why run this before installing the plugin: the MCP launcher can download by
 * itself, but doing it here keeps the first `tools/call` fast and tells you
 * immediately whether this host can reach the release assets.
 */

import {
  cachePaths,
  candidates,
  downloadBinary,
  isExecutableFile,
  releaseVersion,
  resolveBinary,
} from '../lib/binary.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const force = args.includes('--force');
const log = (message) => process.stderr.write(`[dsh-computer-use-linux] ${message}\n`);

const version = releaseVersion();
const paths = cachePaths();

if (checkOnly) {
  log(`release v${version}; cache ${paths.dir}`);
  let found = false;
  let pathEntries = 0;
  for (const candidate of candidates()) {
    const exists = candidate.path !== undefined && isExecutableFile(candidate.path);
    if (exists) found = true;
    if (candidate.source === 'PATH' && !exists) {
      pathEntries += 1;
      continue;
    }
    log(`  ${exists ? 'OK  ' : 'miss'} ${candidate.source}: ${candidate.path ?? '<none>'}`);
  }
  if (pathEntries > 0) log(`  miss PATH: ${pathEntries} directories searched, no computer-use-linux`);
  if (!found) {
    log('no usable binary; run `node scripts/install-binary.mjs` to download the pinned release');
    process.exit(1);
  }
  process.exit(0);
}

const existing = resolveBinary();
if (existing && !force) {
  log(`already installed from ${existing.source}: ${existing.path}`);
  process.exit(0);
}

try {
  await downloadBinary({ version, log });
  const resolved = resolveBinary();
  if (!resolved) throw new Error('download finished but no executable was found');
  log(`done: ${resolved.path}`);
} catch (error) {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
