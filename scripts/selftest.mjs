#!/usr/bin/env node
/**
 * `selftest.mjs` — prove the plugin can actually serve tools.
 *
 * Spawns exactly what the harness spawns (`process.execPath` + the MCP
 * launcher), performs the MCP handshake, lists tools, and optionally calls one.
 * Nothing here needs DSH installed, so it is the first thing to run when the
 * tools do not show up in a session.
 *
 *   node scripts/selftest.mjs                 # handshake + tools/list
 *   node scripts/selftest.mjs --call doctor   # also call a tool (default: doctor)
 *   node scripts/selftest.mjs --call get_app_state --args '{"include_screenshot":false}'
 */

import { fileURLToPath } from 'node:url';
import { probeServer } from '../lib/mcp-probe.mjs';

const args = process.argv.slice(2);
const callIndex = args.indexOf('--call');
const callTool = callIndex === -1 ? undefined : (args[callIndex + 1] ?? 'doctor');
const argsIndex = args.indexOf('--args');
const callArgs = argsIndex === -1 ? undefined : JSON.parse(args[argsIndex + 1] ?? '{}');

const launcher = fileURLToPath(new URL('../bin/computer-use-linux-mcp.mjs', import.meta.url));
const log = (message) => process.stderr.write(`[selftest] ${message}\n`);

try {
  const probe = await probeServer({
    command: process.execPath,
    args: [launcher],
    env: process.env,
  });

  log(`server: ${probe.serverInfo?.name ?? '<unnamed>'} ${probe.serverInfo?.version ?? ''}`);
  log(`protocol: ${probe.protocolVersion}`);
  log(`tools: ${probe.tools.length}`);
  for (const tool of probe.tools) log(`  ${tool.name} — ${(tool.description ?? '').split('\n')[0]}`);

  if (!probe.tools.some((tool) => tool.name === 'doctor')) {
    throw new Error('the server did not list its expected "doctor" tool');
  }

  if (callTool !== undefined) {
    const result = await probe.session.request(
      'tools/call',
      { name: callTool, arguments: callArgs ?? {} },
      120_000,
    );
    const text = (result?.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    log(`tools/call ${callTool} -> isError=${result?.isError === true}`);
    process.stdout.write(`${text}\n`);
  }

  probe.session.close();
  log('ok');
} catch (error) {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
