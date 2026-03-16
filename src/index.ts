import { LogLevel, LogEntry, LogTag, LogAction, CandyLoggerOptions } from './types.js';
import { CandyLoggerUI } from './ui.js';

let _entryId = 0;

class CandyLogger {
  private ui: CandyLoggerUI | null = null;
  private defaultTags: LogTag[];
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor(options: CandyLoggerOptions = {}) {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: (console.debug || console.log).bind(console),
    };
    this.defaultTags = options.defaultTags || [];

    if (typeof window !== 'undefined' && options.forceUI) {
      this.ui = new CandyLoggerUI(options);
    }
  }

  /* ---------- Private helpers ---------- */
  private createEntry(level: LogLevel, args: any[], tags?: LogTag[], source?: string, group?: string): LogEntry {
    return {
      id: `e${++_entryId}`,
      level,
      message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      timestamp: new Date(),
      args,
      tags: [...this.defaultTags, ...(tags || [])],
      source,
      group,
    };
  }

  /* ---------- Core logging methods ---------- */
  public log(...args: any[]): void {
    this.originalConsole.log(...args);
    if (this.ui) this.ui.addLog(this.createEntry('log', args));
  }

  public info(...args: any[]): void {
    this.originalConsole.info(...args);
    if (this.ui) this.ui.addLog(this.createEntry('info', args));
  }

  public warn(...args: any[]): void {
    this.originalConsole.warn(...args);
    if (this.ui) this.ui.addLog(this.createEntry('warn', args));
  }

  public error(...args: any[]): void {
    this.originalConsole.error(...args);
    if (this.ui) this.ui.addLog(this.createEntry('error', args));
  }

  public debug(...args: any[]): void {
    this.originalConsole.debug(...args);
    if (this.ui) this.ui.addLog(this.createEntry('debug', args));
  }

  public success(...args: any[]): void {
    this.originalConsole.log(...args);
    if (this.ui) this.ui.addLog(this.createEntry('success', args));
  }

  /* ---------- Tagged logging ---------- */
  public tagged(tags: LogTag | LogTag[], level: LogLevel, ...args: any[]): void {
    const tagArr = Array.isArray(tags) ? tags : [tags];
    const consoleFn = this.originalConsole[level === 'success' ? 'log' : level === 'debug' ? 'debug' : level] || this.originalConsole.log;
    consoleFn(...args);
    if (this.ui) this.ui.addLog(this.createEntry(level, args, tagArr));
  }

  /* ---------- Utilities ---------- */
  public getStats(): Record<string, number> {
    return this.ui ? this.ui.getLogCounts() : {};
  }

  public getLogs(): LogEntry[] {
    return this.ui ? this.ui.getLogs() : [];
  }
}

/* ===== Global helpers for browser ===== */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const candy = isBrowser ? new CandyLogger() : (null as any);

/**
 * Override global console to use Candy Logger.
 * Call once in your app entry point.
 */
export function overrideConsole(options: CandyLoggerOptions = {}): CandyLogger {
  const logger = new CandyLogger(options);

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (...a: any[]) => logger.log(...a);
  console.info = (...a: any[]) => logger.info(...a);
  console.warn = (...a: any[]) => logger.warn(...a);
  console.error = (...a: any[]) => logger.error(...a);
  console.debug = (...a: any[]) => logger.debug(...a);

  (logger as any)._originalConsole = original;
  return logger;
}

/**
 * Restore original console methods.
 */
export function restoreConsole(logger: CandyLogger): void {
  const o = (logger as any)._originalConsole;
  if (o) {
    console.log = o.log;
    console.info = o.info;
    console.warn = o.warn;
    console.error = o.error;
    console.debug = o.debug;
  }
}

export default candy;
export { candy, CandyLogger };
export type { LogLevel, LogEntry, LogTag, LogAction, CandyLoggerOptions } from './types.js';

if (typeof window !== 'undefined') {
  (window as any).candy = candy;
  (window as any).CandyLogger = CandyLogger;
  (window as any).overrideConsole = overrideConsole;
  (window as any).restoreConsole = restoreConsole;
}
