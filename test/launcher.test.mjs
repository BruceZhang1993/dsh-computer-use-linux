import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { probeServer } from '../lib/mcp-probe.mjs';
import { resolveBinary } from '../lib/binary.mjs';

const launcher = fileURLToPath(new URL('../bin/computer-use-linux-mcp.mjs', import.meta.url));

/**
 * The launcher downloads the pinned release when nothing is installed, so this
 * test only runs where a binary already resolves — which is exactly the state
 * `scripts/install-binary.mjs` establishes before installing the plugin.
 */
const resolved = resolveBinary();

test(
  'the launcher speaks MCP over stdio and lists the desktop tools',
  { skip: resolved === undefined ? 'no computer-use-linux binary installed' : false },
  async () => {
    const probe = await probeServer({
      command: process.execPath,
      args: [launcher],
      clientName: 'dsh-computer-use-linux-test',
    });
    try {
      assert.equal(probe.serverInfo?.name, 'computer-use-linux');
      const names = probe.tools.map((tool) => tool.name);
      assert.ok(names.includes('doctor'), `expected a doctor tool, got ${names.join(', ')}`);
      assert.ok(names.includes('get_app_state'), 'expected get_app_state');
      assert.ok(names.includes('screenshot'), 'expected screenshot');
      assert.ok(names.length >= 18, `expected at least 18 tools, got ${names.length}`);
      assert.equal(new Set(names).size, names.length, 'tool names must be unique');
      assert.equal(
        names.includes('run_shell'),
        false,
        'run_shell must stay unregistered unless COMPUTER_USE_LINUX_ENABLE_SHELL=1',
      );
      assert.match(String(probe.instructions ?? ''), /get_app_state/);
    } finally {
      probe.session.close();
    }
  },
);
