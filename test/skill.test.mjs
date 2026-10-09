import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { apply } from '../lib/index.js';
import { BUNDLED_SKILL_NAME, loadBundledSkill, parseSkillDocument } from '../lib/skill.mjs';

test('parseSkillDocument reads flat scalars and returns the body without frontmatter', () => {
  const { frontmatter, content } = parseSkillDocument(
    ['---', 'name: demo', 'description: "a \\"quoted\\" string"', "whenToUse: 'single'", 'ignored: 1', '---', '', '# Title', '', 'Body.'].join('\n'),
  );
  assert.deepEqual(frontmatter, {
    name: 'demo',
    description: 'a "quoted" string',
    whenToUse: 'single',
  });
  assert.equal(content, '# Title\n\nBody.');
});

test('parseSkillDocument tolerates CRLF and a BOM', () => {
  const { frontmatter } = parseSkillDocument('\uFEFF---\r\nname: demo\r\ndescription: text\r\n---\r\nbody\r\n');
  assert.equal(frontmatter.name, 'demo');
  assert.equal(frontmatter.description, 'text');
});

test('parseSkillDocument rejects a document without frontmatter', () => {
  assert.throws(() => parseSkillDocument('# no frontmatter\n'), /missing its YAML frontmatter/);
});

test('the bundled skill loads with the metadata DSH requires', () => {
  const skill = loadBundledSkill();
  assert.equal(skill.name, BUNDLED_SKILL_NAME);
  assert.ok(skill.description.length > 0);
  assert.ok(skill.whenToUse.length > 0);
  assert.match(skill.content, /^# computer-use-linux/);
  assert.match(skill.content, /mcp__cul__/);
  assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true });
  assert.equal(skill.resourceBase.kind, 'directory');
  assert.equal(skill.provider, 'dsh-computer-use-linux');
});

test('loadBundledSkill rejects a mismatched name or empty description', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cul-skill-'));
  try {
    const wrongName = join(dir, 'wrong.md');
    writeFileSync(wrongName, '---\nname: other\ndescription: d\n---\nbody\n');
    assert.throws(() => loadBundledSkill(pathToFileURL(wrongName)), /name must be computer-use-linux/);

    const noDescription = join(dir, 'nodesc.md');
    writeFileSync(noDescription, '---\nname: computer-use-linux\ndescription: ""\n---\nbody\n');
    assert.throws(() => loadBundledSkill(pathToFileURL(noDescription)), /requires a non-empty description/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply registers the skill and claims a free computer-use slot', () => {
  const registered = [];
  const providerNames = [];
  const logs = [];
  const logger = { info: (m) => logs.push(m), warn: (m) => logs.push(m) };

  const services = {
    skills: { register: (skill) => registered.push(skill) },
    computerUse: {
      register: (providerName) => {
        providerNames.push(providerName);
        return () => {};
      },
    },
  };

  const ctx = {
    logger,
    effect: (callback) => {
      callback();
      return () => {};
    },
    inject: (deps, callback) => {
      const service = services[deps[0]];
      // Mirror Cordis: the callback runs only when the service exists.
      if (service !== undefined) callback({ ...ctx, [deps[0]]: service });
    },
  };

  apply(ctx);

  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'computer-use-linux');
  assert.deepEqual(providerNames, ['dsh-computer-use-linux']);
  assert.ok(logs.some((line) => line.includes('skill "computer-use-linux" registered')));
  assert.ok(logs.some((line) => line.includes('registered as the computer-use provider')));
});

test('apply stays inert when neither optional service is present', () => {
  const logs = [];
  const ctx = {
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
    effect: () => () => {},
    inject: () => {},
  };
  assert.doesNotThrow(() => apply(ctx));
  assert.equal(logs.filter((line) => line.includes('registered')).length, 0);
});
