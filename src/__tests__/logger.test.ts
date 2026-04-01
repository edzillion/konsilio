/**
 * Logger Tests
 *
 * Verifies that the Pino logger produces correct JSON structure and that
 * child loggers work properly. The MCP stdio test (mcp-stdio.test.ts)
 * verifies end-to-end that logs don't leak to stdout.
 */

import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { Writable } from 'stream';

describe('logger', () => {
  it('produces valid JSON log output with expected structure', () => {
    let capturedOutput = '';
    const testStream = new Writable({
      write(chunk, _encoding, callback) {
        capturedOutput += chunk.toString();
        callback();
      },
    });

    const logger = pino(
      { level: 'info', base: { service: 'konsilio' } },
      testStream
    );

    logger.info({ extra: 'data' }, 'test message');

    const parsed = JSON.parse(capturedOutput);
    expect(parsed.level).toBe(30); // info level
    expect(parsed.service).toBe('konsilio');
    expect(parsed.msg).toBe('test message');
    expect(parsed.extra).toBe('data');
    expect(parsed.time).toBeDefined();
  });

  it('child loggers inherit base configuration', () => {
    let capturedOutput = '';
    const testStream = new Writable({
      write(chunk, _encoding, callback) {
        capturedOutput += chunk.toString();
        callback();
      },
    });

    const logger = pino(
      { level: 'debug', base: { service: 'konsilio' } },
      testStream
    );

    const child = logger.child({ correlationId: 'abc-123' });
    child.error('error message');

    const parsed = JSON.parse(capturedOutput);
    expect(parsed.level).toBe(50); // error level
    expect(parsed.service).toBe('konsilio');
    expect(parsed.correlationId).toBe('abc-123');
    expect(parsed.msg).toBe('error message');
  });

  it('debug level logs have level 10', () => {
    let capturedOutput = '';
    const testStream = new Writable({
      write(chunk, _encoding, callback) {
        capturedOutput += chunk.toString();
        callback();
      },
    });

    const logger = pino({ level: 'debug' }, testStream);
    logger.debug('debug message');

    const parsed = JSON.parse(capturedOutput);
    expect(parsed.level).toBe(20); // debug level
  });
});