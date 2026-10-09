#!/usr/bin/env node
/**
 * MCP stdio launcher for dsh-computer-use-linux.
 *
 * `@deepseek-ai/dsh-mcp-client` spawns this file with `process.execPath`
 * (`node`, or the Electron binary with ELECTRON_RUN_AS_NODE=1) and speaks MCP
 * over inherited stdio. This launcher resolves the real desktop binary —
 * downloading and sha256-verifying the pinned release on first use — then
 * replaces itself with it. Nothing is ever written to stdout here, because
 * stdout is the MCP stream.
 */

import { runServer } from '../lib/binary.mjs';

const args = process.argv.slice(2);
await runServer(args.length > 0 ? args : ['mcp']).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(127);
});
