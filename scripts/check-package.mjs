#!/usr/bin/env node
/**
 * `check-package.mjs` — static self-consistency checks that run without a
 * desktop and without DSH. Catches the mistakes that are otherwise only
 * visible as "the tools never appeared" or "the skill never loaded":
 *
 *   - the bundle patch is declared and exists;
 *   - the launcher entry point exists and is exported;
 *   - every specifier the patch resolves is reachable through this package's
 *     `exports` map (a missing export is a hard loader failure);
 *   - the patch does not take over the shared `skill-filesystem` row;
 *   - the plugin entry registers the bundled skill, and that skill parses;
 *   - the skill directory name, frontmatter name, and patch `serverName` agree.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadBundledSkill } from '../lib/skill.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const patchPath = pkg.dsh?.bundle?.patch;
check(typeof patchPath === 'string', 'package.json is missing dsh.bundle.patch');
check(
  typeof patchPath === 'string' && existsSync(join(root, patchPath)),
  `dsh.bundle.patch does not exist: ${patchPath}`,
);

const exportsMap = pkg.exports ?? {};
check('./launcher' in exportsMap, 'exports must expose ./launcher (the patch resolves it)');

const launcher = exportsMap['./launcher'];
check(
  typeof launcher === 'string' && existsSync(join(root, launcher)),
  `launcher entry point does not exist: ${launcher}`,
);
check(existsSync(join(root, 'lib/index.js')), 'lib/index.js (the plugin entry) does not exist');
check(pkg.main === 'lib/index.js', `package.json main must be lib/index.js, got ${pkg.main}`);

const patch = readFileSync(join(root, patchPath), 'utf8');
check(patch.includes("'@deepseek-ai/dsh-mcp-client'"), 'the patch must mount @deepseek-ai/dsh-mcp-client');
check(patch.includes('dsh-computer-use-linux/launcher'), 'the patch must resolve the launcher');
check(
  !/^\s*-\s*id:\s*skill-filesystem\s*$/m.test(patch),
  'the patch must not override skill-filesystem: bundledSkillDir is a single shared slot',
);

const entry = readFileSync(join(root, 'lib/index.js'), 'utf8');
check(entry.includes('loadBundledSkill'), 'the plugin entry must load the bundled skill');
check(/skills\.register\(/.test(entry), 'the plugin entry must register the skill on ctx.skills');
check(entry.includes("'computerUse'"), 'the plugin entry must claim the computer-use provider slot');

const serverName = /serverName:\s*["']?([A-Za-z0-9_-]+)["']?/.exec(patch)?.[1];
check(serverName !== undefined, 'the patch must declare a serverName');
check(
  serverName === undefined || /^[A-Za-z0-9_-]{1,32}$/.test(serverName),
  `serverName must match [A-Za-z0-9_-]{1,32}, got ${serverName}`,
);

try {
  const skill = loadBundledSkill();
  check(skill.name === 'computer-use-linux', `skill name must be computer-use-linux, got ${skill.name}`);
  check(skill.description.length > 0, 'skill must carry a description');
  check(typeof skill.whenToUse === 'string' && skill.whenToUse.length > 0, 'skill should carry whenToUse');
  check(skill.content.trim().length > 0, 'skill body must not be empty');
  check(
    skill.content.startsWith('# computer-use-linux'),
    'skill body must start with its title, i.e. the frontmatter block was not split cleanly',
  );
  if (serverName !== undefined) {
    check(
      skill.content.includes(`mcp__${serverName}__`),
      `the skill must document tool names as mcp__${serverName}__<tool>`,
    );
  }
} catch (error) {
  failures.push(`bundled skill does not load: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check-package: ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`check-package: ok (serverName=${serverName}, launcher=${launcher}, skill=computer-use-linux)\n`);
