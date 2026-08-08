import type { LogEntry, LogLevel } from './types.js';
import { LOG_LEVELS } from './types.js';

export type StoreEvent =
  | { type: 'add'; entry: LogEntry }
  | { type: 'evict'; id: string; entry: LogEntry }
  | { type: 'remove'; id: string; entry: LogEntry }
  | { type: 'update'; entry: LogEntry }
  | { type: 'pin'; id: string }
  | { type: 'unpin'; id: string }
  | { type: 'clear' };

export type StoreCounts = Record<LogLevel | 'all', number>;

export interface LogStoreOptions {
  /** Ring-buffer size. Pinned entries are exempt (default 500). */
  maxLogs?: number;
  /** Hard cap on pinned entries so pins cannot grow without bound (default 50). */
  maxPins?: number;
}

function emptyCounts(): StoreCounts {
  const c = { all: 0 } as StoreCounts;
  for (const l of LOG_LEVELS) c[l] = 0;
  return c;
}

/**
 * The canonical record of what was logged. Holds no DOM and no storage, so it works
 * headlessly, in Node, and in tests — and `getLogs()` is meaningful with no panel.
 */
export class LogStore {
  private entries: LogEntry[] = [];
  private byId = new Map<string, LogEntry>();
  private pinned = new Set<string>();
  private listeners = new Set<(e: StoreEvent) => void>();
  private countCache: StoreCounts = emptyCounts();
  private seq = 0;

  readonly maxLogs: number;
  readonly maxPins: number;

  constructor(options: LogStoreOptions = {}) {
    this.maxLogs = Math.max(1, options.maxLogs ?? 500);
    this.maxPins = Math.max(0, options.maxPins ?? 50);
  }

  nextId(): string {
    return `e${++this.seq}`;
  }

  subscribe(listener: (e: StoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: StoreEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch {
        // A broken sink must never break the log call that triggered it.
      }
    }
  }

  private bump(level: LogLevel, delta: number): void {
    this.countCache.all = Math.max(0, this.countCache.all + delta);
    this.countCache[level] = Math.max(0, (this.countCache[level] || 0) + delta);
  }

  add(entry: LogEntry): void {
    this.entries.push(entry);
    this.byId.set(entry.id, entry);
    this.bump(entry.level, 1);
    this.emit({ type: 'add', entry });
    this.evictOverflow();
  }

  /**
   * `maxLogs` bounds the *unpinned* rows only. Pinned rows are the ones the user
   * explicitly kept, so they must not consume the ring-buffer budget — otherwise a
   * panel with maxLogs pinned rows could never show a new log again.
   */
  private evictOverflow(): void {
    while (this.entries.length - this.pinned.size > this.maxLogs) {
      const idx = this.entries.findIndex((e) => !this.pinned.has(e.id));
      if (idx === -1) break;
      const [removed] = this.entries.splice(idx, 1);
      this.byId.delete(removed.id);
      this.bump(removed.level, -1);
      this.emit({ type: 'evict', id: removed.id, entry: removed });
    }
  }

  remove(id: string): LogEntry | null {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const [removed] = this.entries.splice(idx, 1);
    this.byId.delete(id);
    this.pinned.delete(id);
    this.bump(removed.level, -1);
    this.emit({ type: 'remove', id, entry: removed });
    return removed;
  }

  /** Clears unpinned entries. Pass `includePinned` to drop everything. */
  clear(options: { includePinned?: boolean } = {}): void {
    if (options.includePinned) {
      this.entries = [];
      this.pinned.clear();
    } else {
      this.entries = this.entries.filter((e) => this.pinned.has(e.id));
    }
    this.byId = new Map(this.entries.map((e) => [e.id, e]));
    this.countCache = emptyCounts();
    for (const e of this.entries) this.bump(e.level, 1);
    this.emit({ type: 'clear' });
  }

  pin(id: string): boolean {
    if (!this.byId.has(id) || this.pinned.has(id)) return false;
    if (this.pinned.size >= this.maxPins) return false;
    this.pinned.add(id);
    this.emit({ type: 'pin', id });
    return true;
  }

  unpin(id: string): boolean {
    if (!this.pinned.delete(id)) return false;
    this.emit({ type: 'unpin', id });
    this.evictOverflow(); // it now counts against the ring buffer again
    return true;
  }

  isPinned(id: string): boolean {
    return this.pinned.has(id);
  }

  pinnedEntries(): LogEntry[] {
    return this.entries.filter((e) => this.pinned.has(e.id));
  }

  /** Re-attach an entry restored from storage without disturbing the ring buffer order. */
  adopt(entry: LogEntry, pinned: boolean): void {
    if (this.byId.has(entry.id)) return;
    this.entries.unshift(entry);
    this.byId.set(entry.id, entry);
    if (pinned && this.pinned.size < this.maxPins) this.pinned.add(entry.id);
    this.bump(entry.level, 1);
    this.emit({ type: 'add', entry });
  }

  touch(entry: LogEntry): void {
    this.emit({ type: 'update', entry });
  }

  get(id: string): LogEntry | undefined {
    return this.byId.get(id);
  }

  all(): readonly LogEntry[] {
    return this.entries;
  }

  counts(): StoreCounts {
    return { ...this.countCache };
  }

  get size(): number {
    return this.entries.length;
  }
}
