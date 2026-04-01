/**
 * MCP Stdio Protocol Test
 *
 * Verifies that the MCP server only writes valid JSON-RPC messages to stdout.
 * Any log output leaking to stdout will break the MCP protocol.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('MCP stdio protocol', () => {
  let server: ChildProcess;
  let stdoutChunks: string[] = [];

  beforeAll(async () => {
    // Build first
    server = spawn('node', ['build/index.js'], {
      env: {
        ...process.env,
        OPENROUTER_API_KEY: 'test-key',
        LOG_LEVEL: 'debug',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    server.stdout?.on('data', (chunk) => {
      stdoutChunks.push(chunk.toString());
    });

    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      server.stderr?.once('data', () => resolve());
    });
  });

  afterAll(() => {
    server.kill();
  });

  it('sends valid JSON-RPC response to ping request', async () => {
    const pingRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} },
    }) + '\n';

    server.stdin?.write(pingRequest);

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(stdoutChunks.length).toBeGreaterThan(0);

    // Every stdout chunk should be parseable JSON with jsonrpc field
    for (const chunk of stdoutChunks) {
      const lines = chunk.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('jsonrpc', '2.0');
        expect(parsed).toHaveProperty('id');
      }
    }
  });

  it('does not leak log messages to stdout', async () => {
    const logPatterns = ['"level":', '"time":', '"service":', '"msg":'];

    for (const chunk of stdoutChunks) {
      for (const pattern of logPatterns) {
        // Log patterns should not appear at the top level of JSON-RPC messages
        const lines = chunk.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          // Valid JSON-RPC should not have these as top-level keys
          expect(parsed).not.toHaveProperty('level');
          expect(parsed).not.toHaveProperty('time');
          expect(parsed).not.toHaveProperty('service');
        }
      }
    }
  });
});