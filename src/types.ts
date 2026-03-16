export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'success';

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

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: Date;
  args: any[];
  tags?: LogTag[];
  source?: string;
  group?: string;
}

export type PanelPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'full-bottom';

export type PanelTheme = 'auto' | 'light' | 'dark';

export interface CandyLoggerOptions {
  /** Force UI to show even in production */
  forceUI?: boolean;
  /** Position of the logger panel */
  position?: PanelPosition;
  /** Color theme */
  theme?: PanelTheme;
  /** Maximum number of logs to keep in memory (default: 500) */
  maxLogs?: number;
  /** Start with table view (default: true) */
  tableView?: boolean;
  /** Show timestamps (default: true) */
  showTimestamp?: boolean;
  /** Start collapsed (default: false) */
  collapsed?: boolean;
  /** Custom action buttons on each log row */
  actions?: LogAction[];
  /** Enable tags feature (default: true) */
  tags?: boolean;
  /** Default tags applied to all logs */
  defaultTags?: LogTag[];
  /** Badge text in the header */
  badgeText?: string;
}
