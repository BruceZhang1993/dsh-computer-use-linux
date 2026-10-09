/**
 * dsh-computer-use-linux — DSH plugin entry.
 *
 * The bundle patch (`cordis.patch.yml`) mounts the computer-use-linux MCP
 * server through `@deepseek-ai/dsh-mcp-client`. This entry adds the two things
 * a patch cannot express:
 *
 *   - it registers the bundled skill on `ctx.skills`, so the model can load
 *     `computer-use-linux` on demand without taking over the shared
 *     `skill-filesystem.bundledSkillDir` slot; and
 *   - it claims the harness's sole computer-use provider slot when
 *     `@deepseek-ai/dsh-computer-use` is mounted in the same composition, so
 *     two desktop drivers can never run at once.
 *
 * Both are optional capabilities, so every step is guarded: an absent service,
 * a conflicting provider, or a malformed skill must never take the plugin — or
 * the profile — down.
 *
 * @module dsh-computer-use-linux
 */

import { cachePaths, releaseVersion, resolveBinary } from './binary.mjs';
import { loadBundledSkill } from './skill.mjs';

/** Plugin name, as registered by the loader. */
export const name = 'dsh-computer-use-linux';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 */
export function apply(ctx) {
  const logger = ctx.logger ?? ctx.root?.logger;

  reportBinary(logger);
  registerSkill(ctx, logger);
  claimComputerUseProvider(ctx, logger);
}

/** Log how the desktop binary resolved — the first thing to check on failure. */
function reportBinary(logger) {
  const resolved = resolveBinary();
  if (resolved) {
    logger?.info?.(`computer-use-linux: desktop binary resolved from ${resolved.source}: ${resolved.path}`);
    return;
  }
  const paths = cachePaths();
  logger?.warn?.(
    'computer-use-linux: no desktop binary is installed yet. The MCP launcher will download and ' +
      `verify release v${releaseVersion()} into ${paths.dir} on first use; ` +
      'set COMPUTER_USE_LINUX_BIN to use a local build instead.',
  );
}

/** Publish the bundled skill to the session catalog. */
function registerSkill(ctx, logger) {
  ctx.inject?.(['skills'], (skillCtx) => {
    const skills = skillCtx.skills;
    if (typeof skills?.register !== 'function') return;
    try {
      const skill = loadBundledSkill();
      skills.register(skill);
      logger?.info?.(`computer-use-linux: skill "${skill.name}" registered from ${skill.path}`);
    } catch (error) {
      logger?.warn?.(`computer-use-linux: bundled skill not registered: ${String(error)}`);
    }
  });
}

/** Reserve the exclusive computer-use provider slot when its registry exists. */
function claimComputerUseProvider(ctx, logger) {
  ctx.inject?.(['computerUse'], (registryCtx) => {
    const registry = registryCtx.computerUse;
    if (typeof registry?.register !== 'function') return;
    try {
      registryCtx.effect?.(() => {
        const release = registry.register(name);
        return () => {
          void release?.();
        };
      }, 'computer-use-linux provider registration');
      logger?.info?.('computer-use-linux: registered as the computer-use provider');
    } catch (error) {
      logger?.warn?.(
        `computer-use-linux: another computer-use provider already holds the slot (${String(error)}); ` +
          'the MCP tools still work, but only one desktop driver should be enabled per profile.',
      );
    }
  });
}
