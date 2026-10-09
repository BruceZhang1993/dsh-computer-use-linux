import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

test('check-package.mjs passes on this package', () => {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'check-package.mjs')], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /check-package: ok/);
});

test('the bundle patch is the only loader contract and it is well formed', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(existsSync(join(root, 'cordis.patch.yml')));

  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  // Exactly one insert list, so the patch cannot silently split the bundle.
  assert.equal(patch.match(/^- insert:/gm)?.length, 1);
  assert.match(patch, /id: mcp-computer-use-linux/);
  assert.match(patch, /serverName: cul/);
  assert.match(patch, /command: !!js process\.execPath/);
  assert.match(patch, /ELECTRON_RUN_AS_NODE: '1'/);
  // Non-Linux hosts must not load the Linux-only rows.
  assert.equal(patch.match(/process\.platform !== 'linux'/g)?.length, 2);
  // bundledSkillDir is a single shared slot: overriding it would displace
  // whatever else owns it, so the skill is registered from the plugin instead.
  assert.doesNotMatch(patch, /^\s*-\s*id:\s*skill-filesystem\s*$/m);
  assert.doesNotMatch(patch, /bundledSkillDir:/);
});

test('the plugin entry registers the skill and only claims a free provider slot', () => {
  const entry = readFileSync(join(root, 'lib', 'index.js'), 'utf8');
  assert.match(entry, /export const name = 'dsh-computer-use-linux'/);
  assert.match(entry, /export function apply\(ctx\)/);
  assert.match(entry, /ctx\.inject\?\.\(\['skills'\]/);
  assert.match(entry, /skills\.register\(skill\)/);
  assert.match(entry, /ctx\.inject\?\.\(\['computerUse'\]/);
  // A registry conflict or a malformed skill must warn, never throw: the MCP
  // tools are independent of both.
  assert.equal(entry.match(/catch \(error\)/g)?.length, 2);
});
