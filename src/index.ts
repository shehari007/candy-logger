import type { CandyLoggerOptions, LogEntry, LogLevel, LogTag, Sink } from './core/types.js';
import { LOG_LEVELS, isLogLevel } from './core/types.js';
import { LogStore, type StoreCounts } from './core/store.js';
import { formatArgs } from './core/serialize.js';

export interface PanelInstance {
  destroy(): void;
  show(): void;
  hide(): void;
  readonly element: HTMLElement | null;
}

type PanelFactory = (store: LogStore, options: CandyLoggerOptions) => PanelInstance;

let panelFactory: PanelFactory | null = null;

/**
 * Pre-register the panel implementation. The bundled/CDN build calls this so the
 * single-file artifact needs no dynamic import; the npm build lazy-loads instead,
 * which keeps the panel out of production bundles that never enable it.
 */
export function registerPanel(factory: PanelFactory): void {
  panelFactory = factory;
}

/* ---------- native console, captured once and shared across duplicate copies ---------- */

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const CONSOLE_METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];
const NATIVE_KEY = Symbol.for('candy-logger.native-console');
const WRAPPER_FLAG = '__candyLoggerWrapper';

type NativeConsole = Record<ConsoleMethod, (...args: unknown[]) => void>;

function captureNative(): NativeConsole {
  const g = globalThis as any;
  if (g[NATIVE_KEY]) return g[NATIVE_KEY];
  const noop = () => {};
  const out = {} as NativeConsole;
  for (const m of CONSOLE_METHODS) {
    const c: any = typeof console !== 'undefined' ? console : undefined;
    const fn = c?.[m] ?? c?.log;
    // Never capture our own wrapper as "native" — that is what turned a second
    // overrideConsole() call into a chain of nested loggers.
    out[m] = typeof fn === 'function' && !fn[WRAPPER_FLAG] ? fn.bind(c) : noop;
  }
  g[NATIVE_KEY] = out;
  return out;
}

const nativeConsole = captureNative();

/* ---------------------------------- logger ---------------------------------- */

export class CandyLogger {
  private store: LogStore;
  private panel: PanelInstance | null = null;
  private panelPending: Promise<PanelInstance | null> | null = null;
  /** Bumped by detachUI(), so an attach that is still loading knows it was cancelled. */
  private panelGeneration = 0;
  private sinks = new Set<Sink>();
  private defaultTags: LogTag[];
  private options: CandyLoggerOptions;
  private destroyed = false;

  constructor(options: CandyLoggerOptions = {}) {
    this.options = { ...options };
    this.defaultTags = options.defaultTags ? [...options.defaultTags] : [];
    this.store = new LogStore({ maxLogs: options.maxLogs });
    if (options.enabled ?? options.forceUI) void this.attachUI();
  }

  /* ---------- entry construction ---------- */

  private createEntry(level: LogLevel, args: unknown[], tags?: LogTag[]): LogEntry {
    // formatArgs is total: it cannot throw, for any input. A plain JSON.stringify
    // here would throw on a circular argument, straight out of console.log.
    const { message, parts, snapshot, truncated, usedSpecifiers } = formatArgs(args, {
      maxString: this.options.maxString,
      maxDepth: this.options.maxDepth,
    });
    const allTags = this.defaultTags.length || tags?.length ? [...this.defaultTags, ...(tags || [])] : undefined;
    return {
      id: this.store.nextId(),
      level,
      message,
      timestamp: new Date(),
      // Holding the caller's objects keeps them (and everything they reference)
      // alive. Opt in only when custom actions need the live value.
      args: this.options.retainArgs ? args : [],
      snapshot,
      parts,
      formatted: usedSpecifiers,
      tags: allTags,
      search: `${message} ${(allTags || []).map((t) => t?.label ?? '').join(' ')}`.toLowerCase(),
      truncated,
    };
  }

  private emit(level: LogLevel, args: unknown[], tags?: LogTag[]): void {
    const native = nativeConsole[level === 'success' ? 'log' : (level as ConsoleMethod)] ?? nativeConsole.log;
    native(...args);
    if (this.destroyed) return;
    try {
      const entry = this.createEntry(level, args, tags);
      this.store.add(entry);
      for (const sink of this.sinks) {
        try {
          sink.write(entry);
        } catch {
          /* a broken sink must never break the caller's log statement */
        }
      }
    } catch {
      /* capture is best-effort; the native console call already happened */
    }
  }

  /* ---------- logging ---------- */

  log(...args: unknown[]): void {
    this.emit('log', args);
  }
  info(...args: unknown[]): void {
    this.emit('info', args);
  }
  warn(...args: unknown[]): void {
    this.emit('warn', args);
  }
  error(...args: unknown[]): void {
    this.emit('error', args);
  }
  debug(...args: unknown[]): void {
    this.emit('debug', args);
  }
  success(...args: unknown[]): void {
    this.emit('success', args);
  }

  tagged(tags: LogTag | LogTag[], level: LogLevel, ...args: unknown[]): void {
    this.emit(isLogLevel(level) ? level : 'log', args, Array.isArray(tags) ? tags : [tags]);
  }

  /* ---------- panel lifecycle ---------- */

  /** Create the panel. Idempotent; resolves once the panel is on screen. */
  async attachUI(options: CandyLoggerOptions = {}): Promise<PanelInstance | null> {
    if (this.destroyed) return null;
    if (this.panel) return this.panel;
    if (this.panelPending) return this.panelPending;
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;

    this.options = { ...this.options, ...options };
    const opts = this.options;
    const generation = this.panelGeneration;

    const pending: Promise<PanelInstance | null> = (async () => {
      // Read the registry before awaiting: TS drops narrowing on a module-level
      // `let` across an await, and the bundled build registers this synchronously.
      const registered = panelFactory;
      const factory: PanelFactory =
        registered ??
        (await import('./ui.js').then(
          (m): PanelFactory =>
            (store, o) =>
              new m.CandyLoggerUI(store, o),
        ));
      // detachUI() or destroy() while the chunk was loading: don't add a panel
      // nobody asked for any more.
      if (this.destroyed || generation !== this.panelGeneration) return null;
      // The store already holds everything logged before now, and the panel
      // backfills from it, so nothing logged during the import is lost.
      this.panel = factory(this.store, opts);
      return this.panel;
    })().catch(() => {
      // A failed chunk load (flaky network, deploy mid-session) must not block
      // a later attachUI() call from trying again.
      if (this.panelPending === pending) this.panelPending = null;
      return null;
    });

    this.panelPending = pending;
    return pending;
  }

  detachUI(): void {
    this.panelGeneration++;
    this.panel?.destroy();
    this.panel = null;
    this.panelPending = null;
  }

  showPanel(): void {
    this.panel?.show();
  }
  hidePanel(): void {
    this.panel?.hide();
  }

  /**
   * Route `console.log/info/warn/error/debug` into *this* logger and return a
   * disposer. Idempotent: calling it twice, or while another logger holds the
   * console, never stacks wrappers — the previous capture is handed over cleanly.
   */
  captureConsole(): () => void {
    const active = getActive();
    if (active) {
      if (active.logger === this) return active.restore;
      active.restore(); // take over from the other logger rather than nesting
    }

    const previous: Partial<Record<ConsoleMethod, unknown>> = {};
    for (const m of CONSOLE_METHODS) {
      previous[m] = (console as any)[m];
      const wrapper = (...args: unknown[]) => (this as any)[m](...args);
      (wrapper as any)[WRAPPER_FLAG] = true;
      (console as any)[m] = wrapper;
    }

    const restore = () => {
      for (const m of CONSOLE_METHODS) {
        // Hand back what was there unless somebody patched on top of us; in that
        // case restore the pristine native so console is never left hijacked.
        const current = (console as any)[m];
        (console as any)[m] = (current as any)?.[WRAPPER_FLAG] ? nativeConsole[m] : previous[m] ?? nativeConsole[m];
      }
      setActive(null);
      activeOverride = null;
    };

    activeOverride = { logger: this, restore };
    setActive(activeOverride);
    return restore;
  }

  /* ---------- sinks ---------- */

  /** Register an extra destination (server, Sentry, a test spy). Returns a disposer. */
  addSink(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => {
      this.sinks.delete(sink);
      try {
        sink.dispose?.();
      } catch {
        /* ignore */
      }
    };
  }

  /* ---------- data ---------- */

  /** Works with or without a panel — the store is the source of truth. */
  getLogs(): LogEntry[] {
    return [...this.store.all()];
  }

  getStats(): StoreCounts {
    return this.store.counts();
  }

  /** Clears unpinned entries. Pass `{ includePinned: true }` to drop everything. */
  clear(options?: { includePinned?: boolean }): void {
    this.store.clear(options);
  }

  /** Removes the panel, every listener it added, and all sinks. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachUI();
    for (const sink of this.sinks) {
      try {
        sink.dispose?.();
      } catch {
        /* ignore */
      }
    }
    this.sinks.clear();
    this.store.clear({ includePinned: true });
    if (activeOverride?.logger === this) restoreConsole();
  }
}

/* ------------------------------ console override ------------------------------ */

interface ActiveOverride {
  logger: CandyLogger;
  restore: () => void;
}

const OVERRIDE_KEY = Symbol.for('candy-logger.active-override');

function getActive(): ActiveOverride | null {
  return (globalThis as any)[OVERRIDE_KEY] ?? null;
}
function setActive(v: ActiveOverride | null): void {
  (globalThis as any)[OVERRIDE_KEY] = v;
}

let activeOverride: ActiveOverride | null = getActive();

/**
 * Route `console.log/info/warn/error/debug` through Candy Logger.
 *
 * Idempotent: React StrictMode, Vite HMR, or two copies of the package reuse the
 * existing logger instead of stacking panels and multiplying every log line.
 */
export function overrideConsole(options: CandyLoggerOptions = {}): CandyLogger {
  activeOverride = getActive();
  if (activeOverride) {
    if (options.enabled ?? options.forceUI) void activeOverride.logger.attachUI(options);
    return activeOverride.logger;
  }

  const logger = new CandyLogger(options);
  logger.captureConsole();
  return logger;
}

/** Restore the original console methods. The argument is optional and ignored. */
export function restoreConsole(_logger?: CandyLogger): void {
  (getActive() ?? activeOverride)?.restore();
}

/** Is a console override currently installed? */
export function isConsoleOverridden(): boolean {
  return getActive() !== null;
}

/* ---------------------------------- exports ---------------------------------- */

export function createLogger(options: CandyLoggerOptions = {}): CandyLogger {
  return new CandyLogger(options);
}

/**
 * Shared instance. Always a real logger — never `null` — so importing it under SSR
 * cannot crash, and `candy.getLogs()` is meaningful before any panel exists.
 * Call `candy.attachUI()` to show the panel.
 */
export const candy: CandyLogger = new CandyLogger();

export default candy;
export { LogStore, LOG_LEVELS, isLogLevel };
export { formatArgs, normalize, safeStringify, serializeError, escapeHtml, tokenizeJson, previewOf } from './core/serialize.js';
export type { StoreCounts, StoreEvent, LogStoreOptions } from './core/store.js';
export type {
  LogLevel,
  LogEntry,
  LogTag,
  LogAction,
  MessagePart,
  CandyLoggerOptions,
  PanelPosition,
  PanelTheme,
  Sink,
} from './core/types.js';
