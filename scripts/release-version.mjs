#!/usr/bin/env node
/**
 * `release-version.mjs` — decide which version a publish should ship, and
 * refuse the release when the tag and the manifest disagree.
 *
 * The tag is the source of truth: a `v0.2.0` tag may only publish a
 * `package.json` that already says `0.2.0`. Catching the mismatch here is the
 * whole point of the script — publishing a tarball whose manifest carries a
 * version nobody tagged is silent and irreversible on a registry.
 *
 * Case by case:
 *
 *   - tag push (`v0.2.0`): the manifest must say `0.2.0`.
 *   - GitHub release: the release tag must agree with the manifest, so
 *     publishing a release after editing `version` locally is caught too.
 *   - workflow_dispatch: the `version` input picks the version, defaulting to
 *     the checked-out manifest. Re-running a *failed* publish is then possible
 *     (`npm publish` is not idempotent), which is why this path is explicit.
 *   - local run: pass the same arguments and it prints the version instead of
 *     writing `$GITHUB_OUTPUT`, so the rules are testable without a release.
 *
 * Usage:
 *   node scripts/release-version.mjs <tag-or-empty> [--manifest-version <v>]
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const fail = (message) => {
  process.stderr.write(`release-version: ${message}\n`);
  process.exit(1);
};

const args = process.argv.slice(2);
const tag = (args[0] ?? '').trim();
const flagIndex = args.indexOf('--manifest-version');
const flagValue = flagIndex === -1 ? undefined : (args[flagIndex + 1] ?? '').trim();
if (flagValue === '') fail('--manifest-version needs a value (this is a test hook, not a CI input)');
const manifestVersion =
  flagValue === undefined ? JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version : flagValue;

if (typeof manifestVersion !== 'string' || !SEMVER.test(manifestVersion)) {
  fail(`package.json version is not valid semver: ${JSON.stringify(manifestVersion)}`);
}

// A tag is not the only way in: an empty argument means "use the manifest",
// which is what workflow_dispatch does when no version input is given. The
// workflow always hands over a `v`-prefixed tag, but accepting a bare semver
// here keeps the rule in one place instead of relying on the caller's prefixing:
// `v0.2.0` and `0.2.0` are the same version, and both must match the manifest.
const tagVersion = tag === '' ? undefined : tag.replace(/^v/, '');
if (tagVersion !== undefined && !SEMVER.test(tagVersion)) {
  fail(`tag ${JSON.stringify(tag)} is not a v<semver> tag (expected e.g. v0.2.0)`);
}

const version = tagVersion ?? manifestVersion;

if (tagVersion !== undefined && tagVersion !== manifestVersion) {
  fail(
    `tag ${tag} does not match package.json version ${manifestVersion}: ` +
      `bump \`version\` to ${tagVersion}, commit it, and re-tag (a tag redirect is not enough)`,
  );
}

// GITHUB_OUTPUT is set by the runner; a local run just reports the decision.
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) appendFileSync(outputPath, `version=${version}\ntag=v${version}\n`);
process.stdout.write(`release-version: publishing ${version} (tag v${version})\n`);
