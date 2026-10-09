import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  cachePaths,
  candidates,
  isExecutableFile,
  missingBinaryError,
  parseSha256,
  releaseVersion,
  resolveBinary,
  serverEnvironment,
  targetTriple,
} from '../lib/binary.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'dsh-cul-test-'));
}

function executable(path) {
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

test('releaseVersion defaults to the pinned release and strips a leading v', () => {
  assert.equal(releaseVersion({}), '0.7.13');
  assert.equal(releaseVersion({ COMPUTER_USE_LINUX_VERSION: 'v0.8.0' }), '0.8.0');
});

test('cachePaths follows XDG_CACHE_HOME and the release version', () => {
  const paths = cachePaths({ env: { XDG_CACHE_HOME: '/tmp/xdg' }, version: '9.9.9' });
  assert.equal(paths.dir, '/tmp/xdg/computer-use-linux/plugin/v9.9.9');
  assert.equal(paths.binary, '/tmp/xdg/computer-use-linux/plugin/v9.9.9/computer-use-linux');

  const home = cachePaths({ env: { HOME: '/home/tester' }, version: '1.0.0' });
  assert.equal(home.dir, '/home/tester/.cache/computer-use-linux/plugin/v1.0.0');
});

test('targetTriple maps the supported architectures and rejects the rest', () => {
  assert.equal(targetTriple('x64'), 'x86_64-unknown-linux-gnu');
  assert.equal(targetTriple('arm64'), 'aarch64-unknown-linux-gnu');
  assert.throws(() => targetTriple('ia32'), /unsupported CPU architecture/);
});

test('parseSha256 reads the first 64-hex digest, lowercased', () => {
  assert.equal(parseSha256('ABC\n'), undefined);
  assert.equal(
    parseSha256(`${'A'.repeat(64)}  computer-use-linux-x86_64-unknown-linux-gnu\n`),
    'a'.repeat(64),
  );
});

test('isExecutableFile is false for missing, non-executable, and directory targets', () => {
  const dir = temporaryDirectory();
  try {
    assert.equal(isExecutableFile(join(dir, 'missing')), false);
    const plain = join(dir, 'plain');
    writeFileSync(plain, 'x');
    assert.equal(isExecutableFile(plain), false);
    assert.equal(isExecutableFile(dir), false);
    assert.equal(isExecutableFile(executable(join(dir, 'run'))), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBinary prefers COMPUTER_USE_LINUX_BIN over the cache and PATH', () => {
  const dir = temporaryDirectory();
  try {
    const fromEnv = executable(join(dir, 'from-env'));
    const fromPath = executable(join(dir, 'computer-use-linux'));
    const cacheRoot = join(dir, 'cache');
    mkdirSync(join(cacheRoot, 'computer-use-linux', 'plugin', 'v0.7.13'), { recursive: true });
    const fromCache = executable(
      join(cacheRoot, 'computer-use-linux', 'plugin', 'v0.7.13', 'computer-use-linux'),
    );

    const env = {
      COMPUTER_USE_LINUX_BIN: fromEnv,
      XDG_CACHE_HOME: cacheRoot,
      PATH: dir,
      HOME: dir,
    };
    assert.deepEqual(resolveBinary({ env, version: '0.7.13' }), {
      path: fromEnv,
      source: 'COMPUTER_USE_LINUX_BIN',
    });

    assert.deepEqual(resolveBinary({ env: { ...env, COMPUTER_USE_LINUX_BIN: '' }, version: '0.7.13' }), {
      path: fromCache,
      source: 'plugin cache',
    });

    assert.deepEqual(resolveBinary({ env: { XDG_CACHE_HOME: cacheRoot, PATH: dir, HOME: dir }, version: '0.0.0' }), {
      path: fromPath,
      source: 'PATH',
    });

    assert.equal(resolveBinary({ env: { XDG_CACHE_HOME: cacheRoot, PATH: '/nonexistent', HOME: dir }, version: '0.0.0' }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBinary ignores a relative COMPUTER_USE_LINUX_BIN', () => {
  const dir = temporaryDirectory();
  try {
    executable(join(dir, 'relative-bin'));
    const env = { COMPUTER_USE_LINUX_BIN: './relative-bin', HOME: dir, XDG_CACHE_HOME: dir, PATH: '/nonexistent' };
    assert.equal(resolveBinary({ env, version: '0.7.13' }), undefined);
    assert.equal(
      candidates({ env, version: '0.7.13' }).some((candidate) => candidate.source === 'COMPUTER_USE_LINUX_BIN'),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serverEnvironment adds managed helper paths without overriding the user', () => {
  const dir = temporaryDirectory();
  try {
    const binDir = join(dir, 'bin');
    mkdirSync(binDir, { recursive: true });
    const binary = executable(join(binDir, 'computer-use-linux'));
    executable(join(binDir, 'computer-use-linux-cosmic'));
    const paths = cachePaths({ env: { HOME: dir } });

    const env = serverEnvironment({ path: binary, paths }, { HOME: dir });
    assert.equal(env.COMPUTER_USE_LINUX_COSMIC_HELPER, join(binDir, 'computer-use-linux-cosmic'));
    assert.equal(env.COMPUTER_USE_LINUX_INDICATOR_BIN, undefined);

    const pinned = serverEnvironment(
      { path: binary, paths },
      { HOME: dir, COMPUTER_USE_LINUX_COSMIC_HELPER: '/mine/cosmic' },
    );
    assert.equal(pinned.COMPUTER_USE_LINUX_COSMIC_HELPER, '/mine/cosmic');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missingBinaryError lists every place that was searched', () => {
  const message = missingBinaryError({ HOME: '/home/tester' }).message;
  assert.match(message, /COMPUTER_USE_LINUX_BIN/);
  assert.match(message, /\/home\/tester\/\.cache\/computer-use-linux\/plugin\/v0\.7\.13/);
  assert.match(message, /@agent-sh\/computer-use-linux/);
  assert.match(message, /PATH/);
});
