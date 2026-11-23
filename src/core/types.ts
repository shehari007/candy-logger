export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'success';

/** Runtime whitelist — never trust a level that came from JS callers or storage. */
export const LOG_LEVELS: readonly LogLevel[] = ['log', 'info', 'warn', 'error', 'debug', 'success'];

export function isLogLevel(v: unknown): v is LogLevel {
  return typeof v === 'string' && (LOG_LEVELS as readonly string[]).includes(v);
}

export interface LogTag {
  label: string;
  color?: string;
  bg?: string;
}

export interface LogAction {
  label: string;
  icon?: string;
  onClick: (log: LogEntry) => void;
}

/** A single styled run produced by a `%c` directive. */
export interface MessagePart {
  text: string;
  style?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  /** Plain-text rendering of the whole line, with format specifiers applied. */
  message: string;
  timestamp: Date;
  /**
   * The original arguments. Empty when `retainArgs` is off (the default) — the
   * logger must not keep application objects alive just to display them.
   */
  args: unknown[];
  /** JSON-safe snapshot of each argument, taken once at log time. */
  snapshot: unknown[];
  /** Styled runs from `console.log('%cfoo', 'color:red')`. */
  parts?: MessagePart[];
  /** True when args[0] was a format template, so `parts` is the authoritative rendering. */
  formatted?: boolean;
  tags?: LogTag[];
  source?: string;
  /** Lowercased haystack for search — message + tags + serialized args. */
  search: string;
  truncated?: boolean;
}

export type PanelPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'full-bottom';

export type PanelTheme = 'auto' | 'light' | 'dark';

/** A destination for log entries. The panel is just one of these. */
export interface Sink {
  name?: string;
  write(entry: LogEntry): void;
  evict?(id: string): void;
  clear?(): void;
  dispose?(): void;
}

export interface CandyLoggerOptions {
  /**
   * Create the panel. Kept for compatibility; `enabled` is the clearer name and
   * takes precedence when both are given.
   */
  forceUI?: boolean;
  /** Show the panel. Defaults to false — call `attachUI()` to add it later. */
  enabled?: boolean;
  /** Position of the logger panel */
  position?: PanelPosition;
  /** Color theme. 'auto' follows `prefers-color-scheme` and updates live. */
  theme?: PanelTheme;
  /** Maximum number of logs to keep in memory (default: 500). Pinned rows are exempt. */
  maxLogs?: number;
  /** Show the Time column (default: true) */
  showTimestamp?: boolean;
  /** Start collapsed (default: false) */
  collapsed?: boolean;
  /** Custom action buttons on each log row */
  actions?: LogAction[];
  /** Show the Tags column (default: true) */
  tags?: boolean;
  /** Default tags applied to all logs */
  defaultTags?: LogTag[];
  /** Badge text in the header */
  badgeText?: string;
  /** Fade the panel until it is hovered or focused (default: false) */
  dimWhenIdle?: boolean;
  /** Persist pinned rows to localStorage (default: true). Args are never persisted. */
  persistPins?: boolean;
  /**
   * Remember where the panel was dragged, its size, whether it was minimized and
   * the theme picked in the panel, across reloads (default: true). A saved value is
   * ignored once the matching option (`position`, `theme`, `collapsed`) changes.
   */
  persistLayout?: boolean;
  /** Nonce for the injected `<style>` element, for a CSP without `'unsafe-inline'` styles. */
  nonce?: string;
  /**
   * Keep references to the original logged objects (default: false).
   * Only enable if custom `actions` need the live object — it prevents GC.
   */
  retainArgs?: boolean;
  /** Max characters kept per string inside a logged object (default: 1000) */
  maxString?: number;
  /** Max object/array depth captured (default: 8) */
  maxDepth?: number;
}
