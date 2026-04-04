/**
 * Client-safe logger for browser-side code.
 *
 * In development: delegates to console methods for easy debugging.
 * In production: silenced to avoid noisy browser console output.
 *
 * Server-side code should use the pino-based `@/lib/logger` instead.
 */

const isDev = process.env.NODE_ENV !== "production";

/* eslint-disable no-console */
const clientLogger = {
  info: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  error: isDev ? console.error.bind(console) : () => {},
  debug: isDev ? console.log.bind(console) : () => {},
};
/* eslint-enable no-console */

export default clientLogger;
