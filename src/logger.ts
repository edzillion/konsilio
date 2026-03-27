/**
 * Structured JSON Logger with correlation ID support
 * 
 * Outputs structured JSON logs for observability and debugging.
 */

import type { LogLevel } from './config.js';

// Re-export LogLevel for backward compatibility
export type { LogLevel };

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerConfig {
  level: LogLevel;
  service?: string;
}

export interface LogWriter {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export class Logger implements LogWriter {
  private readonly level: LogLevel;
  private readonly service: string;

  constructor(config: LoggerConfig) {
    this.level = config.level;
    this.service = config.service ?? 'konsilio';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>, correlationId?: string): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...data,
    };
    
    if (correlationId) {
      entry.correlationId = correlationId;
    }

    return JSON.stringify(entry);
  }

  debug(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (this.shouldLog('debug')) {
      process.stdout.write(this.formatEntry('debug', message, data, correlationId) + '\n');
    }
  }

  info(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (this.shouldLog('info')) {
      process.stdout.write(this.formatEntry('info', message, data, correlationId) + '\n');
    }
  }

  warn(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (this.shouldLog('warn')) {
      process.stderr.write(this.formatEntry('warn', message, data, correlationId) + '\n');
    }
  }

  error(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (this.shouldLog('error')) {
      process.stderr.write(this.formatEntry('error', message, data, correlationId) + '\n');
    }
  }

  withCorrelationId(correlationId: string): CorrelatedLogger {
    return new CorrelatedLogger(this, correlationId);
  }
}

/**
 * Logger wrapper that automatically includes correlation ID in all logs
 */
export class CorrelatedLogger implements LogWriter {
  private readonly logger: Logger;
  private readonly correlationId: string;

  constructor(logger: Logger, correlationId: string) {
    this.logger = logger;
    this.correlationId = correlationId;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data, this.correlationId);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, data, this.correlationId);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, data, this.correlationId);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(message, data, this.correlationId);
  }
}

/**
 * Create a logger instance with the specified log level
 * @param level - Optional log level (defaults to 'info')
 */
export function createLogger(level?: LogLevel): Logger {
  return new Logger({ level: level ?? 'info' });
}
