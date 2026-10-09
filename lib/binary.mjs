/**
 * Desktop binary management for dsh-computer-use-linux.
 *
 * One job: make sure a real, verified `computer-use-linux` executable is on
 * disk, then hand it to the MCP client. Resolution order is explicit so a
 * user can always override what the plugin picks:
 *
 *   1. `COMPUTER_USE_LINUX_BIN`            — an absolute path the user chose
 *   2. the plugin's own version cache      — `~/.cache/computer-use-linux/plugin/v<version>`
 *   3. the `@agent-sh/computer-use-linux`  — an npm-installed copy, if present
 *      npm package's bundled binary
 *   4. `PATH`
 *   5. a verified GitHub release download  — only when nothing above exists
 *
 * The cache layout is intentionally identical to the upstream Claude
 * Code / Codex plugin launcher, so one download serves every host on the
 * machine and the two integrations never fight over the cache.
 *
 * @module dsh-computer-use-linux/binary
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';

/** Upstream release this plugin pins. Override with `COMPUTER_USE_LINUX_VERSION`. */
export const PINNED_VERSION = '0.7.13';

/** Release assets, in install order: the main binary gates cache reuse. */
const ASSETS = [
  { name: 'computer-use-linux', optional: false },
  { name: 'computer-use-linux-cosmic', optional: false },
  { name: 'computer-use-linux-indicator', optional: true },
];

/** Marker written when the pinned release ships no indicator asset. */
const NO_INDICATOR_MARKER = '.no-indicator';

/** @returns {string} the release version this plugin resolves. */
export function releaseVersion(env = process.env) {
  const override = env.COMPUTER_USE_LINUX_VERSION?.trim();
  return override ? override.replace(/^v/, '') : PINNED_VERSION;
}

/**
 * The Rust target triple of the pinned release assets.
 * @param {string} [arch] - `process.arch` by default.
 * @returns {string}
 */
export function targetTriple(arch = process.arch) {
  switch (arch) {
    case 'x64':
      return 'x86_64-unknown-linux-gnu';
    case 'arm64':
      return 'aarch64-unknown-linux-gnu';
    default:
      throw new Error(
        `computer-use-linux: unsupported CPU architecture "${arch}". Supported: x64, arm64.`,
      );
  }
}

/**
 * The upstream plugin cache. Shared with the Claude Code / Codex integration.
 * @param {{ env?: NodeJS.ProcessEnv, version?: string }} [options]
 */
export function cachePaths({ env = process.env, version = releaseVersion(env) } = {}) {
  const cacheRoot =
    env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.trim() !== ''
      ? env.XDG_CACHE_HOME
      : join(env.HOME && env.HOME.trim() !== '' ? env.HOME : homedir(), '.cache');
  const root = join(cacheRoot, 'computer-use-linux', 'plugin');
  const dir = join(root, `v${version}`);
  return {
    root,
    dir,
    version,
    binary: join(dir, 'computer-use-linux'),
    cosmic: join(dir, 'computer-use-linux-cosmic'),
    indicator: join(dir, 'computer-use-linux-indicator'),
    noIndicator: join(dir, NO_INDICATOR_MARKER),
  };
}

/** The GitHub release base URL assets are fetched from. */
export function downloadBase(env = process.env, version = releaseVersion(env)) {
  const override = env.COMPUTER_USE_LINUX_DOWNLOAD_BASE?.trim();
  if (override) return override.replace(/\/+$/, '');
  return `https://github.com/agent-sh/computer-use-linux/releases/download/v${version}`;
}

/** True when `path` is an executable regular file. */
export function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** SHA-256 of a file, lowercase hex. */
export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** First 64-hex-character digest in a `.sha256` file, or `undefined`. */
export function parseSha256(text) {
  return /\b[0-9a-fA-F]{64}\b/.exec(text)?.[0]?.toLowerCase();
}

/** Fetch `url` into `destination`. Rejects with `error.statusCode === 404` on a missing asset. */
export function fetchToFile(url, destination, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (url.startsWith('file://')) {
      try {
        copyFileSync(new URL(url), destination);
        resolve({ status: 200 });
      } catch (error) {
        reject(error);
      }
      return;
    }

    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? httpGet : httpsGet;
    const request = client(parsed, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(fetchToFile(new URL(response.headers.location, parsed).toString(), destination, redirects - 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        const error = new Error(`download failed with HTTP ${status}: ${url}`);
        error.statusCode = status;
        reject(error);
        return;
      }
      const file = createWriteStream(destination, { mode: 0o600 });
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve({ status })));
      file.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(180_000, () => request.destroy(new Error(`download timed out: ${url}`)));
  });
}

/**
 * Every place a usable binary may already live, in priority order.
 * @param {{ env?: NodeJS.ProcessEnv, version?: string, require?: NodeJS.Require }} [options]
 * @returns {Array<{ path: string, source: string }>}
 */
export function candidates({ env = process.env, version = releaseVersion(env), require: req = createRequire(import.meta.url) } = {}) {
  const found = [];
  const override = env.COMPUTER_USE_LINUX_BIN?.trim();
  // Upstream ignores relative overrides for the same reason: a relative path
  // means nothing to a child spawned from an unknown working directory.
  if (override && isAbsolute(override)) found.push({ path: override, source: 'COMPUTER_USE_LINUX_BIN' });

  const paths = cachePaths({ env, version });
  found.push({ path: paths.binary, source: 'plugin cache' });

  try {
    const pkg = req.resolve('@agent-sh/computer-use-linux/package.json');
    const binDir = join(dirname(pkg), 'npm', 'bin');
    found.push({
      path: join(binDir, `computer-use-linux-${process.platform}-${process.arch}`),
      source: '@agent-sh/computer-use-linux npm package',
    });
  } catch {
    // The npm package is not installed; that is a normal configuration.
  }

  for (const entry of (env.PATH ?? '').split(delimiter)) {
    if (entry.trim() !== '') found.push({ path: join(entry, 'computer-use-linux'), source: 'PATH' });
  }

  return found;
}

/**
 * First usable binary that already exists, or `undefined`.
 * @returns {{ path: string, source: string } | undefined}
 */
export function resolveBinary(options = {}) {
  for (const candidate of candidates(options)) {
    if (candidate.path !== undefined && isExecutableFile(candidate.path)) {
      return { path: candidate.path, source: candidate.source };
    }
  }
  return undefined;
}

/**
 * Download and verify every pinned asset into the plugin cache.
 * Downloads land in a staging directory inside the cache root and are renamed
 * into place, so a killed download never leaves a half-written binary behind
 * and two concurrent first starts cannot corrupt each other.
 * @param {{ env?: NodeJS.ProcessEnv, version?: string, log?: (message: string) => void }} [options]
 * @returns {Promise<ReturnType<typeof cachePaths>>}
 */
export async function downloadBinary({ env = process.env, version = releaseVersion(env), log = () => {} } = {}) {
  if (process.platform !== 'linux') {
    throw new Error(`computer-use-linux: unsupported platform "${process.platform}". Linux only.`);
  }
  if (env.COMPUTER_USE_LINUX_SKIP_DOWNLOAD === '1') {
    throw new Error(
      'computer-use-linux: COMPUTER_USE_LINUX_SKIP_DOWNLOAD=1 is set and no binary is installed. ' +
        'Point COMPUTER_USE_LINUX_BIN at a local build, or unset the variable and retry.',
    );
  }

  const triple = targetTriple();
  const base = downloadBase(env, version);
  const paths = cachePaths({ env, version });
  mkdirSync(paths.root, { recursive: true });
  const staging = mkdtempSync(join(paths.root, '.download.'));

  try {
    let indicatorMissing = false;
    for (const asset of ASSETS) {
      const assetName = `${asset.name}-${triple}`;
      const url = `${base}/${assetName}`;
      const staged = join(staging, asset.name);
      log(`downloading ${assetName} v${version}`);
      try {
        await fetchToFile(url, staged);
      } catch (error) {
        if (asset.optional && error.statusCode === 404) {
          indicatorMissing = true;
          log(`release v${version} has no ${assetName}; running without the on-screen indicator`);
          continue;
        }
        throw error;
      }
      const shaFile = `${staged}.sha256`;
      await fetchToFile(`${url}.sha256`, shaFile);
      const expected = parseSha256(readFileSync(shaFile, 'utf8'));
      const actual = sha256File(staged);
      if (expected === undefined || expected !== actual) {
        throw new Error(
          `computer-use-linux: sha256 mismatch for ${assetName}: expected ${expected ?? '<none>'}, got ${actual}`,
        );
      }
      rmSync(shaFile, { force: true });
      chmodSync(staged, 0o755);
    }

    mkdirSync(paths.dir, { recursive: true });
    for (const asset of [...ASSETS].reverse()) {
      const staged = join(staging, asset.name);
      if (existsSync(staged)) renameSync(staged, join(paths.dir, asset.name));
    }
    if (indicatorMissing) writeFileSync(paths.noIndicator, '');
    else rmSync(paths.noIndicator, { force: true });
    return paths;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Resolve a usable binary, downloading and verifying the pinned release only
 * when nothing else is available.
 * @param {{ env?: NodeJS.ProcessEnv, version?: string, allowDownload?: boolean, log?: (message: string) => void }} [options]
 * @returns {Promise<{ path: string, source: string, paths: ReturnType<typeof cachePaths> }>}
 */
export async function ensureBinary({ env = process.env, version = releaseVersion(env), allowDownload = true, log = () => {} } = {}) {
  const existing = resolveBinary({ env, version });
  const paths = cachePaths({ env, version });
  if (existing) return { ...existing, paths };
  if (!allowDownload) throw missingBinaryError(env);
  const installed = await downloadBinary({ env, version, log });
  const resolved = resolveBinary({ env, version });
  if (!resolved) {
    throw new Error(`computer-use-linux: download completed but ${installed.binary} is not executable`);
  }
  return { ...resolved, paths };
}

/** The actionable error a user sees when nothing can be resolved. */
export function missingBinaryError(env = process.env) {
  return new Error(
    [
      'computer-use-linux: no usable desktop binary was found.',
      'Install one of these, then reload the harness:',
      '  - run `node scripts/install-binary.mjs` inside dsh-computer-use-linux (downloads and verifies the pinned release),',
      '  - `cargo install computer-use-linux`, or',
      '  - point COMPUTER_USE_LINUX_BIN at an absolute binary path.',
      `Searched: COMPUTER_USE_LINUX_BIN, ${cachePaths({ env }).binary}, the @agent-sh/computer-use-linux npm package, and PATH.`,
    ].join('\n'),
  );
}

/**
 * Environment for the server process: the launcher's own environment plus the
 * helper paths this plugin manages, never overriding a value the user set.
 * @param {{ path: string, paths: ReturnType<typeof cachePaths> }} resolved
 */
export function serverEnvironment(resolved, env = process.env) {
  const next = { ...env };
  const { path, paths } = resolved;
  const cosmic = existsSync(join(dirname(path), 'computer-use-linux-cosmic'))
    ? join(dirname(path), 'computer-use-linux-cosmic')
    : paths.cosmic;
  const indicator = existsSync(join(dirname(path), 'computer-use-linux-indicator'))
    ? join(dirname(path), 'computer-use-linux-indicator')
    : paths.indicator;
  if (!next.COMPUTER_USE_LINUX_COSMIC_HELPER && existsSync(cosmic)) {
    next.COMPUTER_USE_LINUX_COSMIC_HELPER = cosmic;
  }
  if (!next.COMPUTER_USE_LINUX_INDICATOR_BIN && existsSync(indicator)) {
    next.COMPUTER_USE_LINUX_INDICATOR_BIN = indicator;
  }
  return next;
}

/**
 * Run the desktop server, replacing this process. Used by the MCP launcher:
 * stdin/stdout carry the MCP stream and must never be written to here.
 * @param {string[]} args - defaults to `['mcp']`.
 * @returns {Promise<never>} resolves only if the child could not be spawned.
 */
export async function runServer(args = ['mcp'], { env = process.env, log = (message) => process.stderr.write(`computer-use-linux: ${message}\n`) } = {}) {
  const resolved = await ensureBinary({ env, log });
  log(`using ${resolved.source}: ${resolved.path}`);
  const child = spawn(resolved.path, args, { stdio: 'inherit', env: serverEnvironment(resolved, env) });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  child.on('error', (error) => {
    log(`failed to start ${resolved.path}: ${error.message}`);
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    const signalCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
    process.exit(signal ? (signalCodes[signal] ?? 1) : (code ?? 1));
  });
  return new Promise(() => {});
}
