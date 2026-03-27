/**
 * Pino-based Structured Logger with correlation ID support
 * 
 * Outputs structured JSON logs to stdout for observability and debugging.
 * Maintains backward compatibility with the original logger API.
 */

import pino from 'pino';
import type { LogLevel } from '../config.js';

// Re-export LogLevel for backward compatibility
export type { LogLevel };

/**
 * Get the log level from environment variables
 * Defaults to 'info' if not set or invalid
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  
  if (envLevel && validLevels.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  
  return 'info';
}

/**
 * LogWriter interface - standard logging methods
 * Used for correlated logger instances
 */
export interface LogWriter {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Logger interface - extends LogWriter with correlation ID support
 */
export interface Logger extends LogWriter {
  /**
   * Create a child logger with correlation ID embedded in all logs
   */
  withCorrelationId(correlationId: string): CorrelatedLogger;
  
  /**
   * Debug with optional correlation ID (backward compatibility)
   */
  debug(message: string, data?: Record<string, unknown>, correlationId?: string): void;
  /**
   * Info with optional correlation ID (backward compatibility)
   */
  info(message: string, data?: Record<string, unknown>, correlationId?: string): void;
  /**
   * Warn with optional correlation ID (backward compatibility)
   */
  warn(message: string, data?: Record<string, unknown>, correlationId?: string): void;
  /**
   * Error with optional correlation ID (backward compatibility)
   */
  error(message: string, data?: Record<string, unknown>, correlationId?: string): void;
}

/**
 * CorrelatedLogger - logger that automatically includes correlation ID
 */
export interface CorrelatedLogger extends LogWriter {}

/**
 * Pino-backed Logger implementation
 */
class PinoLogger implements Logger {
  protected readonly pino: pino.Logger;

  constructor(level?: LogLevel) {
    this.pino = pino({
      level: level ?? getLogLevelFromEnv(),
      base: {
        service: 'konsilio',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  debug(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (correlationId) {
      this.pino.child({ correlationId }).debug(data ?? {}, message);
    } else {
      this.pino.debug(data ?? {}, message);
    }
  }

  info(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (correlationId) {
      this.pino.child({ correlationId }).info(data ?? {}, message);
    } else {
      this.pino.info(data ?? {}, message);
    }
  }

  warn(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (correlationId) {
      this.pino.child({ correlationId }).warn(data ?? {}, message);
    } else {
      this.pino.warn(data ?? {}, message);
    }
  }

  error(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    if (correlationId) {
      this.pino.child({ correlationId }).error(data ?? {}, message);
    } else {
      this.pino.error(data ?? {}, message);
    }
  }

  withCorrelationId(correlationId: string): CorrelatedLogger {
    return new PinoCorrelatedLogger(this.pino.child({ correlationId }));
  }
}

/**
 * Correlated logger implementation using Pino child logger
 */
class PinoCorrelatedLogger implements CorrelatedLogger {
  constructor(private readonly childLogger: pino.Logger) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.childLogger.debug(data ?? {}, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.childLogger.info(data ?? {}, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.childLogger.warn(data ?? {}, message);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.childLogger.error(data ?? {}, message);
  }
}

/**
 * Singleton logger instance configured from LOG_LEVEL env var
 */
export const logger = new PinoLogger();

/**
 * Create a logger instance with the specified log level
 * @param level - Optional log level (defaults to LOG_LEVEL env var or 'info')
 */
export function createLogger(level?: LogLevel): Logger {
  return new PinoLogger(level);
}

/**
 * Get a child logger with correlation ID embedded in all log entries
 * Convenience function equivalent to logger.withCorrelationId()
 * 
 * @param correlationId - The correlation ID to include in all log entries
 * @returns A logger instance with the correlation ID
 */
export function getLogger(correlationId: string): CorrelatedLogger {
  return logger.withCorrelationId(correlationId);
}

// Export convenience methods for direct use without correlation ID
export const log = {
  debug: (message: string, data?: Record<string, unknown>) => logger.debug(message, data),
  info: (message: string, data?: Record<string, unknown>) => logger.info(message, data),
  warn: (message: string, data?: Record<string, unknown>) => logger.warn(message, data),
  error: (message: string, data?: Record<string, unknown>) => logger.error(message, data),
};
