/**
 * A dependency-free MCP stdio probe.
 *
 * The plugin has no runtime dependencies by design — the harness owns the MCP
 * SDK — so the selftest and the tests need their own tiny client: newline
 * framed JSON-RPC 2.0 over a child process's stdio, with per-request timeouts
 * and the server's stderr captured rather than interleaved.
 *
 * @module dsh-computer-use-linux/mcp-probe
 */

import { spawn } from 'node:child_process';

/**
 * Start an MCP server and return a session that can send requests.
 *
 * @param {string} command - executable to spawn.
 * @param {string[]} args - its arguments.
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string }} [options]
 */
export function createMcpSession(command, args, { env = process.env, cwd } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd });
  const pending = new Map();
  const stderrChunks = [];
  let stdout = '';
  let nextId = 1;
  let closed = false;

  child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    let newline;
    while ((newline = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (line === '') continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = message.id !== undefined ? pending.get(message.id) : undefined;
      if (waiter === undefined) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error !== undefined) {
        waiter.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
      } else {
        waiter.resolve(message.result);
      }
    }
  });
  child.on('error', (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  });
  child.on('exit', (code) => {
    closed = true;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP server exited with code ${code ?? 'null'}: ${stderr()}`));
    }
    pending.clear();
  });

  const stderr = () => stderrChunks.join('');

  return {
    child,
    stderr,
    /** Send a JSON-RPC request and await its result. */
    request(method, params = {}, timeoutMs = 120_000) {
      if (closed) return Promise.reject(new Error(`MCP server already exited: ${stderr()}`));
      const id = nextId++;
      const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP request ${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(payload);
      });
    },
    /** Send a JSON-RPC notification (no response). */
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    /** Terminate the server. */
    close() {
      if (!closed) child.kill('SIGTERM');
    },
  };
}

/**
 * Initialize a session and list its tools.
 *
 * @param {{ command: string, args?: string[], env?: NodeJS.ProcessEnv, cwd?: string, clientName?: string, timeoutMs?: number }} options
 * @returns {Promise<{ serverInfo: unknown, protocolVersion: string, instructions?: string, tools: Array<{ name: string, description?: string }>, stderr: () => string, session: ReturnType<typeof createMcpSession> }>}
 */
export async function probeServer({
  command,
  args = [],
  env = process.env,
  cwd,
  clientName = 'dsh-computer-use-linux-probe',
  timeoutMs = 120_000,
}) {
  const session = createMcpSession(command, args, { env, cwd });
  try {
    const initialized = await session.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: clientName, version: '0.1.0' },
      },
      timeoutMs,
    );
    session.notify('notifications/initialized');
    const listed = await session.request('tools/list', {}, timeoutMs);
    return {
      serverInfo: initialized?.serverInfo,
      protocolVersion: initialized?.protocolVersion,
      instructions: initialized?.instructions,
      tools: listed?.tools ?? [],
      stderr: session.stderr,
      session,
    };
  } catch (error) {
    session.close();
    throw error;
  }
}
