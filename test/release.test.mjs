import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'scripts', 'release-version.mjs');

/** Run the release-version decision script the way the workflow does. */
function resolve(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('release-version accepts a tag that matches package.json', () => {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const run = resolve([`v${version}`]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), `release-version: publishing ${version} (tag v${version})`);
});

test('release-version accepts a pre-release tag', () => {
  // Pre-releases follow the same rule as final versions: the manifest must
  // already declare the exact version the tag names.
  const run = resolve(['v0.2.0-rc.1', '--manifest-version', '0.2.0-rc.1']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /publishing 0\.2\.0-rc\.1/);
});

test('release-version refuses a pre-release tag the manifest has moved past', () => {
  const run = resolve(['v0.2.0-rc.1', '--manifest-version', '0.2.0']);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /does not match package\.json version 0\.2\.0/);
});

test('release-version refuses a tag that disagrees with package.json', () => {
  const run = resolve(['v0.2.0', '--manifest-version', '0.1.0']);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /tag v0\.2\.0 does not match package\.json version 0\.1\.0/);
  assert.match(run.stderr, /bump `version` to 0\.2\.0, commit it, and re-tag/);
});

test('release-version rejects anything that is not a v<semver> tag', () => {
  for (const tag of ['release-0.2.0', 'v0.2', 'v0.2.0.1', 'vnext', 'v01.2.3', 'v1.2.3-']) {
    const run = resolve([tag]);
    assert.equal(run.status, 1, `expected ${tag} to be rejected`);
    assert.match(run.stderr, /not a v<semver> tag/, `unexpected message for ${tag}: ${run.stderr}`);
  }
});

test('release-version normalises a tag the caller left unprefixed', () => {
  // workflow_dispatch builds `v${input}`; this also keeps a bare semver from a
  // caller that forgot the prefix working, as long as it matches the manifest.
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const run = resolve([version]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), `release-version: publishing ${version} (tag v${version})`);
});

test('release-version falls back to the manifest when there is no tag', () => {
  // This is the workflow_dispatch path with no `version` input.
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const run = resolve([''], {});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), `release-version: publishing ${version} (tag v${version})`);
});

test('release-version writes the version and tag to GITHUB_OUTPUT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-version-'));
  try {
    const output = join(dir, 'output');
    const run = resolve(['v0.2.0', '--manifest-version', '0.2.0'], { GITHUB_OUTPUT: output });
    assert.equal(run.status, 0, run.stderr);

    const written = readFileSync(output, 'utf8');
    assert.equal(written, 'version=0.2.0\ntag=v0.2.0\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The `- name: …` step block for one step in a workflow, up to the next step. */
function stepBlock(workflow, name) {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `release.yml has no step named ${name}`);
  const next = workflow.indexOf('\n      - name: ', start);
  return workflow.slice(start, next === -1 ? undefined : next);
}

/**
 * One `case` arm of a step's shell body, so an assertion cannot match another
 * arm (or an incidental substring such as the `404)` inside a curl command).
 */
function caseArm(step, label) {
  const lines = step.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${label})`);
  assert.notEqual(start, -1, `no case arm labelled ${label})`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === ';;');
  assert.notEqual(end, -1, `case arm ${label}) has no closing ;;`);
  return lines.slice(start + 1, end).join('\n');
}

test('the release workflow is tag-driven and publishes only with GITHUB_TOKEN', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  // A `v*` tag is the normal trigger; the manual escape hatch stays available.
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /scripts\/release-version\.mjs "\$\{tag\}"/);
  // A dispatch input may arrive with or without the `v`, and must not become
  // `vv0.2.0` (which release-version.mjs rejects as a malformed tag).
  assert.match(workflow, /tag="v\$\{INPUT_VERSION#v\}"/);
  // Registry writes only ever happen with the workflow's own token, never a PAT.
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.(?!GITHUB_TOKEN)/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

test('a version that is already published is skipped, not failed', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const check = stepBlock(workflow, 'Check whether the version is already published');
  const publish = stepBlock(workflow, 'Publish');
  const found = caseArm(check, '200');
  const absent = caseArm(check, '404');
  const inconclusive = caseArm(check, '*');

  // The check must publish a decision for the later steps to gate on. Asserting
  // per case arm matters: a bare grep would still pass if the 200 arm's write
  // were deleted, because the same text appears in another arm.
  assert.match(check, /id: published/);
  assert.match(found, /echo 'published=true' >> "\$\{GITHUB_OUTPUT\}"/);
  assert.match(absent, /echo 'published=false' >> "\$\{GITHUB_OUTPUT\}"/);
  // Only a definite 404 may mean "go ahead"; anything else must fail loudly, so
  // a permission or network problem cannot silently publish nothing.
  assert.match(check, /"https:\/\/npm\.pkg\.github\.com\/\$\{name\}"/);
  assert.match(inconclusive, /exit 1/);
  // A 200 is only trusted when it parses: an unreadable body is inconclusive.
  assert.match(found, /catch \{/);
  assert.match(found, /process\.exit\(2\)/);
  // The node exit status decides which way the 200 arm goes, and it must live in
  // its own variable: reusing the HTTP code is how the presence branch silently
  // degrades into "not published" for every 200 (the sentinel then never moves).
  assert.match(found, /^\s+status=0$/m);
  assert.match(found, /\|\| status=\$\?/);
  assert.doesNotMatch(found, /(^|\|\|)\s*status=["']?\$\{code\}/m);
  assert.match(found, /\[ "\$\{status\}" -eq 0 \]/);
  assert.match(found, /\[ "\$\{status\}" -eq 1 \]/);
  // The "already published" decision must be the 0 branch, not the 1 branch.
  const branches = found.indexOf('-eq 0');
  const otherBranch = found.indexOf('-eq 1');
  assert.ok(branches !== -1 && branches < otherBranch, 'status 0 must mean already published');
  // ...and an unreadable document fails the step instead of publishing blindly.
  const parseError = found.indexOf('could not be parsed');
  const exitAfterError = found.indexOf('exit 1', parseError);
  assert.ok(parseError !== -1, 'the 200 arm must fail loudly when the document cannot be parsed');
  assert.notEqual(exitAfterError, -1, 'the parse failure must exit non-zero');
  assert.ok(
    !/esac/.test(found.slice(parseError, exitAfterError)),
    'the parse failure must not fall through to another case arm',
  );
  // A network failure must reach the case block instead of aborting the step.
  assert.match(check, /\|\| code=000/);
  // GitHub Packages answers 405 on the per-version endpoint, so the version is
  // looked up in the package document instead of being guessed from the URL.
  assert.match(found, /Object\.hasOwn\(body\.versions/);
  assert.doesNotMatch(check, /\/\$\{version\}"/);
  // `npm publish` must be unreachable once the version exists.
  assert.match(publish, /if: steps\.published\.outputs\.published != 'true'/);
  assert.match(publish, /npm publish/);
});

test('the publish asserts where it will actually go', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const publish = stepBlock(workflow, 'Publish');
  // publishConfig.registry is outranked by a scope mapping in any config file,
  // so the target registry is asserted rather than assumed. The comparison must
  // normalise the trailing slash: a project `.npmrc` yields the mapped value
  // verbatim, and `npm config get` does not add one.
  assert.match(publish, /npm config get @brucezhang1993:registry/);
  assert.match(publish, /"\$\{mapped%\/\}" != "https:\/\/npm\.pkg\.github\.com"/);
  assert.doesNotMatch(publish, /github\.com\/"/);
  assert.ok(
    publish.indexOf('npm config get') < publish.indexOf('npm publish'),
    'the registry assertion must run before npm publish',
  );
});

test('the GitHub release is created exactly once per tag push', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const step = stepBlock(workflow, 'Create the GitHub release');
  // Only a tag push creates a release; a `release` event already has one, which
  // is what keeps our own release creation from starting a second publish.
  assert.match(step, /if: github\.event_name == 'push'\n/);
  const view = step.indexOf('gh release view');
  const create = step.indexOf('gh release create');
  const elseBranch = step.indexOf('else');
  assert.ok(view !== -1 && create !== -1 && elseBranch !== -1, 'release step must guard create with view');
  assert.ok(view < elseBranch && elseBranch < create, 'gh release create must sit in the guarded else branch');
});
