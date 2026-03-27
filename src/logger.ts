/**
 * Logger module - Public API
 * 
 * Re-exports from infrastructure/logger.ts for backward compatibility.
 * This allows existing imports to continue working without changes.
 */

export {
  type LogLevel,
  type LogWriter,
  type Logger,
  type CorrelatedLogger,
  logger,
  createLogger,
  getLogger,
  log,
} from './infrastructure/logger.js';
