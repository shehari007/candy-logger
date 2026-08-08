import type {
  CandyLoggerOptions,
  LogAction,
  LogEntry,
  LogLevel,
  LogTag,
  MessagePart,
  PanelPosition,
  PanelTheme,
} from './core/types.js';
import { LOG_LEVELS, isLogLevel } from './core/types.js';
import type { LogStore, StoreEvent } from './core/store.js';
import { previewOf, safeStringify, tokenizeJson } from './core/serialize.js';
import { CANDY_CSS } from './styles.js';

const STYLE_ID = 'candy-logger-styles-v21';
const PINNED_KEY = 'candy-logger-pins-v21';
const UI_STATE_KEY = 'candy-logger-ui-v21';
const MAX_PIN_BYTES = 64 * 1024;

/** Only these CSS properties may come from log data (`%c` payloads, tag colors). */
const STYLE_ALLOWLIST = new Set([
  'color',
  'background',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'font-family',
  'text-decoration',
  'text-transform',
  'padding',
  'border',
  'border-radius',
  'opacity',
]);

interface StoredPin {
  level: LogLevel;
  message: string;
  timestamp: string;
  tags?: LogTag[];
}

let styleRefCount = 0;

/** Escape an id for use inside an attribute selector, without depending on CSS.escape. */
function cssEsc(value: string): string {
  return String(value).replace(/["\\]/g, '\\$&');
}

function supportsStyle(prop: string, value: string): boolean {
  if (!STYLE_ALLOWLIST.has(prop)) return false;
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS.supports(prop, value) : false;
  } catch {
    return false;
  }
}

function applySafeStyle(el: HTMLElement, style: Record<string, string> | undefined): void {
  if (!style) return;
  for (const [prop, value] of Object.entries(style)) {
    if (supportsStyle(prop, value)) el.style.setProperty(prop, value);
  }
}

function looksLikeError(v: unknown): v is { name: string; message: string; stack?: string[] } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as any).name === 'string' &&
    typeof (v as any).message === 'string' &&
    (Array.isArray((v as any).stack) || (v as any).stack === undefined)
  );
}

export class CandyLoggerUI {
  private store: LogStore;
  private options: Required<
    Pick<CandyLoggerOptions, 'position' | 'maxLogs' | 'showTimestamp' | 'collapsed' | 'tags' | 'dimWhenIdle' | 'persistPins'>
  > &
    CandyLoggerOptions;
  private customActions: LogAction[];

  private container: HTMLDivElement | null = null;
  private tableBody: HTMLTableSectionElement | null = null;
  private pinnedBody: HTMLTableSectionElement | null = null;
  private wrapEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private newPillEl: HTMLButtonElement | null = null;
  private countEls = new Map<string, HTMLElement>();
  private rows = new Map<string, HTMLTableRowElement>();

  private abort = new AbortController();
  private mql: MediaQueryList | null = null;
  private themeSetting: PanelTheme;
  private resolvedTheme: 'light' | 'dark';

  private isMinimized = false;
  private isPanelPinned = false;
  private currentFilter: LogLevel | 'all' = 'all';
  private searchTerm = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private stickToBottom = true;
  private unseen = 0;
  private dragPointerId: number | null = null;
  private dragOffset = { x: 0, y: 0 };
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor(store: LogStore, options: CandyLoggerOptions = {}) {
    this.store = store;
    this.options = {
      position: 'bottom-right',
      theme: 'dark',
      maxLogs: 500,
      showTimestamp: true,
      collapsed: false,
      tags: true,
      dimWhenIdle: false,
      persistPins: true,
      ...options,
    };
    this.customActions = options.actions || [];
    this.themeSetting = this.options.theme || 'dark';
    this.resolvedTheme = this.resolveTheme(this.themeSetting);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') this.init();
  }

  /* ============================== lifecycle ============================== */

  private resolveTheme(setting: PanelTheme): 'light' | 'dark' {
    if (setting === 'light' || setting === 'dark') return setting;
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  private init(): void {
    this.injectStyles();

    const el = document.createElement('div');
    el.className = `candy-logger candy-logger--${this.resolvedTheme}`;
    if (this.options.dimWhenIdle) el.classList.add('candy-logger--dim');
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Candy Logger panel');
    this.container = el;
    this.applyPosition(this.options.position);

    if (this.options.collapsed) {
      el.classList.add('candy-logger--minimized');
      this.isMinimized = true;
    }

    this.buildSkeleton();
    this.cacheNodes();
    this.attachEvents();
    this.watchSystemTheme();

    const append = () => {
      if (!this.destroyed && this.container) document.body.appendChild(this.container);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', append, { once: true, signal: this.abort.signal });
    } else {
      append();
    }

    this.loadPinnedFromStorage();
    this.unsubscribe = this.store.subscribe((e) => this.onStoreEvent(e));
    // Backfill anything logged before the panel attached (the UI loads lazily).
    for (const entry of this.store.all()) this.insertRow(entry, this.store.isPinned(entry.id));
    this.refreshCounts();
  }

  /** Removes the panel, every listener, and the stylesheet. Safe to call twice. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.mql = null;
    this.container?.remove();
    this.container = null;
    this.rows.clear();
    this.countEls.clear();
    styleRefCount = Math.max(0, styleRefCount - 1);
    if (styleRefCount === 0) document.getElementById(STYLE_ID)?.remove();
  }

  private injectStyles(): void {
    styleRefCount++;
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CANDY_CSS;
    document.head.appendChild(s);
  }

  private watchSystemTheme(): void {
    if (this.themeSetting !== 'auto' || typeof window.matchMedia !== 'function') return;
    try {
      this.mql = window.matchMedia('(prefers-color-scheme: light)');
      this.mql.addEventListener(
        'change',
        () => {
          if (this.themeSetting === 'auto') this.setTheme(this.resolveTheme('auto'));
        },
        { signal: this.abort.signal },
      );
    } catch {
      /* older browsers */
    }
  }

  /* ============================== skeleton ============================== */

  private get columnCount(): number {
    return 3 + (this.options.showTimestamp ? 1 : 0) + (this.options.tags ? 1 : 0);
  }

  private buildSkeleton(): void {
    const el = this.container!;
    const h = (tag: string, cls?: string, text?: string) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const iconBtn = (action: string, glyph: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'candy-hbtn';
      b.dataset.act = action;
      b.setAttribute('aria-label', label);
      b.title = label;
      const g = h('span', undefined, glyph);
      g.setAttribute('aria-hidden', 'true');
      b.appendChild(g);
      return b;
    };

    /* header */
    const header = h('div', 'candy-header');
    const left = h('div', 'candy-header-left');
    left.appendChild(h('span', 'candy-title', '🍬 Candy Logger'));
    if (this.options.badgeText) left.appendChild(h('span', 'candy-badge', this.options.badgeText));
    const counter = h('span', 'candy-log-counter', '0');
    counter.setAttribute('aria-label', 'Total logs');
    left.appendChild(counter);

    const right = h('div', 'candy-header-right');
    right.appendChild(iconBtn('theme', this.resolvedTheme === 'dark' ? '☀️' : '🌙', 'Switch color theme'));
    const pinBtn = iconBtn('pin', '📌', 'Keep panel fully visible');
    pinBtn.setAttribute('aria-pressed', 'false');
    right.appendChild(pinBtn);
    right.appendChild(iconBtn('export', '💾', 'Export logs as JSON'));
    right.appendChild(iconBtn('copy-all', '📋', 'Copy all logs to clipboard'));
    right.appendChild(iconBtn('clear', '🗑️', 'Clear logs (pinned rows are kept)'));
    const minBtn = iconBtn('minimize', '−', 'Minimize panel');
    minBtn.setAttribute('aria-expanded', String(!this.options.collapsed));
    right.appendChild(minBtn);
    header.append(left, right);

    /* toolbar */
    const toolbar = h('div', 'candy-toolbar');
    const filters = h('div', 'candy-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter by level');
    const defs: { level: LogLevel | 'all'; label: string; icon: string }[] = [
      { level: 'all', label: 'All', icon: '📊' },
      { level: 'log', label: 'Log', icon: '📝' },
      { level: 'info', label: 'Info', icon: 'ℹ️' },
      { level: 'debug', label: 'Debug', icon: '🐛' },
      { level: 'success', label: 'OK', icon: '✅' },
      { level: 'warn', label: 'Warn', icon: '⚠️' },
      { level: 'error', label: 'Error', icon: '❌' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'candy-fbtn' + (d.level === 'all' ? ' candy-fbtn--active' : '');
      b.dataset.level = d.level;
      b.setAttribute('aria-pressed', String(d.level === 'all'));
      const icon = h('span', undefined, d.icon);
      icon.setAttribute('aria-hidden', 'true');
      const count = h('span', 'candy-fcount', '0');
      b.append(icon, document.createTextNode(' ' + d.label + ' '), count);
      filters.appendChild(b);
    }
    const searchWrap = h('div', 'candy-search-wrap');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'candy-search';
    search.placeholder = 'Search logs…';
    search.spellcheck = false;
    search.setAttribute('aria-label', 'Search logs');
    searchWrap.appendChild(search);
    toolbar.append(filters, searchWrap);

    /* body */
    const body = h('div', 'candy-body');
    const wrap = h('div', 'candy-table-wrap');
    const table = document.createElement('table');
    table.className = 'candy-table';
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    const th = (cls: string, text: string) => {
      const n = document.createElement('th');
      n.className = `candy-th ${cls}`;
      n.scope = 'col';
      n.textContent = text;
      return n;
    };
    if (this.options.showTimestamp) hrow.appendChild(th('candy-th--time', 'Time'));
    hrow.appendChild(th('candy-th--level', 'Level'));
    if (this.options.tags) hrow.appendChild(th('candy-th--tags', 'Tags'));
    hrow.appendChild(th('candy-th--message', 'Message'));
    hrow.appendChild(th('candy-th--actions', 'Actions'));
    thead.appendChild(hrow);
    const pinnedBody = document.createElement('tbody');
    pinnedBody.className = 'candy-pinned-body';
    const tableBody = document.createElement('tbody');
    tableBody.className = 'candy-table-body';
    tableBody.setAttribute('aria-live', 'polite');
    tableBody.setAttribute('aria-relevant', 'additions');
    table.append(thead, pinnedBody, tableBody);
    wrap.appendChild(table);

    const empty = h('div', 'candy-empty');
    const icon = h('div', 'candy-empty-icon', '🍬');
    icon.setAttribute('aria-hidden', 'true');
    empty.append(icon, h('div', 'candy-empty-title', 'No logs yet'), h('div', 'candy-empty-sub', 'Start logging to see entries here'));

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'candy-newpill candy-newpill--hidden';
    pill.dataset.act = 'scroll-bottom';
    pill.textContent = '↓ new logs';
    this.newPillEl = pill;

    body.append(wrap, empty, pill);
    el.append(header, toolbar, body);
  }

  private cacheNodes(): void {
    const el = this.container!;
    this.tableBody = el.querySelector('.candy-table-body');
    this.pinnedBody = el.querySelector('.candy-pinned-body');
    this.wrapEl = el.querySelector('.candy-table-wrap');
    this.emptyEl = el.querySelector('.candy-empty');
    this.counterEl = el.querySelector('.candy-log-counter');
    for (const b of el.querySelectorAll<HTMLElement>('.candy-fbtn')) {
      const c = b.querySelector<HTMLElement>('.candy-fcount');
      if (c && b.dataset.level) this.countEls.set(b.dataset.level, c);
    }
  }

  private applyPosition(pos: PanelPosition): void {
    const s = this.container!.style;
    s.top = s.bottom = s.left = s.right = '';
    s.width = s.maxWidth = s.borderRadius = '';
    switch (pos) {
      case 'bottom-left':
        s.bottom = '16px';
        s.left = '16px';
        break;
      case 'top-right':
        s.top = '16px';
        s.right = '16px';
        break;
      case 'top-left':
        s.top = '16px';
        s.left = '16px';
        break;
      case 'full-bottom':
        s.bottom = '0';
        s.left = '0';
        s.right = '0';
        s.width = '100%';
        s.maxWidth = '100%';
        s.borderRadius = '12px 12px 0 0';
        break;
      default:
        s.bottom = '16px';
        s.right = '16px';
    }
  }

  /* ============================== events ============================== */

  private attachEvents(): void {
    const el = this.container!;
    const signal = this.abort.signal;

    // ONE delegated listener. No inline handlers, so the panel works under
    // `script-src 'self'`, and no `window.__candy*` globals are needed.
    el.addEventListener(
      'click',
      (ev) => {
        const target = ev.target as HTMLElement | null;
        const btn = target?.closest<HTMLElement>('[data-act]');
        if (btn && el.contains(btn)) {
          ev.stopPropagation();
          this.handleAction(btn.dataset.act!, btn);
          return;
        }
        const fbtn = target?.closest<HTMLElement>('.candy-fbtn');
        if (fbtn && el.contains(fbtn)) {
          ev.stopPropagation();
          this.setFilter((fbtn.dataset.level || 'all') as LogLevel | 'all');
        }
      },
      { signal },
    );

    const search = el.querySelector<HTMLInputElement>('.candy-search')!;
    search.addEventListener(
      'input',
      () => {
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          this.searchTerm = search.value.trim().toLowerCase();
          this.applyFilters();
        }, 120);
      },
      { signal },
    );

    this.wrapEl?.addEventListener(
      'scroll',
      () => {
        const w = this.wrapEl!;
        this.stickToBottom = w.scrollHeight - w.scrollTop - w.clientHeight < 40;
        if (this.stickToBottom) this.clearUnseen();
      },
      { signal, passive: true },
    );

    // Pointer events cover mouse, touch and pen in one path, and pointer capture
    // means the drag survives leaving the header.
    const header = el.querySelector<HTMLElement>('.candy-header')!;
    header.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as HTMLElement).closest('.candy-hbtn')) return;
        e.preventDefault(); // stop the host page's text selection
        this.dragPointerId = e.pointerId;
        header.setPointerCapture(e.pointerId);
        const r = el.getBoundingClientRect();
        this.dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
      },
      { signal },
    );
    header.addEventListener(
      'pointermove',
      (e) => {
        if (this.dragPointerId !== e.pointerId || !this.container) return;
        const r = this.container.getBoundingClientRect();
        // Always leave a grabbable strip of the header on screen.
        const left = Math.min(Math.max(e.clientX - this.dragOffset.x, 80 - r.width), window.innerWidth - 80);
        const top = Math.min(Math.max(e.clientY - this.dragOffset.y, 0), window.innerHeight - 36);
        Object.assign(this.container.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
      },
      { signal },
    );
    const endDrag = (e: PointerEvent) => {
      if (this.dragPointerId === e.pointerId) {
        try {
          header.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        this.dragPointerId = null;
      }
    };
    header.addEventListener('pointerup', endDrag, { signal });
    header.addEventListener('pointercancel', endDrag, { signal });
  }

  private handleAction(act: string, btn: HTMLElement): void {
    const id = btn.dataset.id || btn.closest<HTMLElement>('tr')?.dataset.id || '';
    switch (act) {
      case 'minimize':
        this.toggleMinimize();
        break;
      case 'clear':
        this.store.clear();
        break;
      case 'pin':
        this.togglePanelPin(btn);
        break;
      case 'theme':
        this.cycleTheme();
        break;
      case 'export':
        this.exportLogs();
        break;
      case 'copy-all':
        this.copyAll(btn);
        break;
      case 'scroll-bottom':
        this.scrollToBottom();
        break;
      case 'row-pin':
        if (this.store.isPinned(id)) this.store.unpin(id);
        else if (!this.store.pin(id)) this.flash(btn, '✕');
        break;
      case 'row-del':
        this.store.remove(id);
        break;
      case 'row-copy':
        this.copyText(this.store.get(id)?.message ?? '', btn);
        break;
      case 'row-tag':
        this.showTagInput(id, btn);
        break;
      case 'row-toggle':
        this.toggleDetail(id, btn);
        break;
      case 'custom': {
        const action = this.customActions[Number(btn.dataset.index)];
        const entry = this.store.get(id);
        // Index-based dispatch: a label can never be parsed as code, and
        // duplicate labels no longer collide.
        if (action && entry) {
          try {
            action.onClick(entry);
          } catch {
            /* a custom action must not break the panel */
          }
        }
        break;
      }
    }
  }

  /* ============================== store sync ============================== */

  private onStoreEvent(e: StoreEvent): void {
    if (this.destroyed) return;
    switch (e.type) {
      case 'add':
        this.insertRow(e.entry, this.store.isPinned(e.entry.id));
        this.refreshCounts();
        if (this.stickToBottom) this.scrollToBottom();
        else this.bumpUnseen();
        break;
      case 'evict':
      case 'remove':
        this.dropRow(e.id);
        this.refreshCounts();
        break;
      case 'pin':
      case 'unpin':
        this.relocateRow(e.id);
        this.savePinnedToStorage();
        break;
      case 'update':
        this.rebuildRow(e.entry);
        break;
      case 'clear':
        this.rebuildAll();
        break;
    }
  }

  private rebuildAll(): void {
    if (!this.tableBody || !this.pinnedBody) return;
    this.tableBody.replaceChildren();
    this.pinnedBody.replaceChildren();
    this.rows.clear();
    for (const entry of this.store.all()) this.insertRow(entry, this.store.isPinned(entry.id));
    this.refreshCounts();
    this.savePinnedToStorage();
  }

  private dropRow(id: string): void {
    this.rows.get(id)?.remove();
    this.rows.delete(id);
    this.container?.querySelector(`tr.candy-detail-row[data-detail-for="${cssEsc(id)}"]`)?.remove();
  }

  private rebuildRow(entry: LogEntry): void {
    const old = this.rows.get(entry.id);
    if (!old) return;
    const next = this.createRow(entry, this.store.isPinned(entry.id));
    old.replaceWith(next);
    this.rows.set(entry.id, next);
  }

  private relocateRow(id: string): void {
    const entry = this.store.get(id);
    if (!entry) return;
    this.dropRow(id);
    this.insertRow(entry, this.store.isPinned(id));
  }

  private insertRow(entry: LogEntry, pinned: boolean): void {
    if (!this.tableBody || !this.pinnedBody || this.rows.has(entry.id)) return;
    const row = this.createRow(entry, pinned);
    (pinned ? this.pinnedBody : this.tableBody).appendChild(row);
    this.rows.set(entry.id, row);
    this.updateEmptyState();
  }

  /* ============================== rows ============================== */

  private createRow(entry: LogEntry, pinned: boolean): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'candy-tr' + (pinned ? ' candy-tr--pinned' : '');
    row.dataset.level = entry.level;
    row.dataset.id = entry.id;

    const td = (cls: string) => {
      const n = document.createElement('td');
      n.className = `candy-td ${cls}`;
      return n;
    };

    if (this.options.showTimestamp) {
      const t = td('candy-td--time');
      t.textContent = entry.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      t.title = entry.timestamp.toISOString();
      row.appendChild(t);
    }

    const lvl = td('candy-td--level');
    const badge = document.createElement('span');
    // Whitelisted, so a level from JS callers or storage can never reach the class attribute raw.
    const safeLevel: LogLevel = isLogLevel(entry.level) ? entry.level : 'log';
    badge.className = `candy-level candy-level--${safeLevel}`;
    badge.textContent = safeLevel.toUpperCase();
    lvl.appendChild(badge);
    row.appendChild(lvl);

    if (this.options.tags) {
      const tags = td('candy-td--tags');
      this.renderTags(tags, entry.tags);
      row.appendChild(tags);
    }

    const msg = td('candy-td--message');
    this.renderMessage(msg, entry);
    row.appendChild(msg);

    const actions = td('candy-td--actions');
    this.renderActions(actions, entry, pinned);
    row.appendChild(actions);

    if (!this.matches(entry)) row.classList.add('candy-tr--hidden');
    return row;
  }

  private renderTags(cell: HTMLElement, tags?: LogTag[]): void {
    cell.replaceChildren();
    if (!tags || tags.length === 0) {
      const dash = document.createElement('span');
      dash.className = 'candy-dash';
      dash.textContent = '—';
      cell.appendChild(dash);
      return;
    }
    for (const t of tags) {
      const el = document.createElement('span');
      el.className = 'candy-tag';
      el.textContent = String(t?.label ?? ''); // textContent: markup in a label is text, never nodes
      // Colors go through CSSOM with a property allowlist — they can never
      // terminate the attribute and inject an event handler.
      applySafeStyle(el, { ...(t?.bg ? { 'background-color': t.bg } : {}), ...(t?.color ? { color: t.color } : {}) });
      cell.appendChild(el);
    }
  }

  private renderMessage(cell: HTMLElement, entry: LogEntry): void {
    cell.replaceChildren();
    // When format specifiers were used, `parts` already holds the substituted (and
    // `%c`-styled) text — rendering args separately would show the raw template.
    if (entry.formatted && entry.parts?.length) {
      for (const part of entry.parts) cell.appendChild(this.renderPart(part));
      return;
    }
    const snapshot = entry.snapshot.length ? entry.snapshot : [entry.message];
    snapshot.forEach((value, i) => {
      if (i > 0) cell.appendChild(document.createTextNode(' '));
      cell.appendChild(this.renderValue(value, `${entry.id}-${i}`));
    });
  }

  private renderPart(part: MessagePart): HTMLElement {
    const span = document.createElement('span');
    span.textContent = part.text;
    applySafeStyle(span, part.style);
    return span;
  }

  private renderValue(value: unknown, uid: string): Node {
    if (value === null || typeof value !== 'object') {
      return document.createTextNode(String(value));
    }
    if (looksLikeError(value)) return this.renderError(value, uid);

    const { text } = safeStringify(value, { space: 2 });
    const isLong = text.split('\n').length > 3;
    if (!isLong) {
      const pre = document.createElement('pre');
      pre.className = 'candy-json-pre candy-json-pre--inline';
      this.paintJson(pre, text);
      return pre;
    }

    const frag = document.createDocumentFragment();
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'candy-json-toggle collapsed';
    toggle.dataset.act = 'row-toggle';
    toggle.dataset.uid = uid;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `Expand ${previewOf(value)}`);
    toggle.textContent = '▼';

    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'candy-json-preview';
    preview.dataset.act = 'row-toggle';
    preview.dataset.uid = uid;
    preview.tabIndex = -1;
    // Object KEYS reach the DOM here. textContent means a key named
    // `<img src=x onerror=...>` renders as characters, not as an element.
    preview.textContent = previewOf(value);

    frag.append(toggle, preview);
    return frag;
  }

  private renderError(err: { name: string; message: string; stack?: string[] }, uid: string): Node {
    const frag = document.createDocumentFragment();
    const head = document.createElement('span');
    head.className = 'candy-err';
    head.textContent = `${err.name}: ${err.message}`;
    frag.appendChild(head);
    const extras = Object.keys(err).filter((k) => !['name', 'message', 'stack'].includes(k));
    if (err.stack?.length || extras.length) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'candy-json-toggle collapsed';
      toggle.dataset.act = 'row-toggle';
      toggle.dataset.uid = uid;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Expand stack trace');
      toggle.textContent = '▼';
      frag.appendChild(toggle);
    }
    return frag;
  }

  private paintJson(host: HTMLElement, json: string): void {
    for (const tok of tokenizeJson(json)) {
      if (tok.type === 'plain') {
        host.appendChild(document.createTextNode(tok.text));
      } else {
        const s = document.createElement('span');
        s.className = `candy-json-${tok.type}`;
        s.textContent = tok.text;
        host.appendChild(s);
      }
    }
  }

  private renderActions(cell: HTMLElement, entry: LogEntry, pinned: boolean): void {
    const mk = (act: string, cls: string, glyph: string, label: string, pressed?: boolean) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `candy-abtn ${cls}` + (pressed ? ' active' : '');
      b.dataset.act = act;
      b.dataset.id = entry.id;
      b.setAttribute('aria-label', label);
      b.title = label;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      const g = document.createElement('span');
      g.textContent = glyph;
      g.setAttribute('aria-hidden', 'true');
      b.appendChild(g);
      return b;
    };
    cell.append(
      mk('row-copy', 'candy-abtn--copy', '📋', 'Copy log text'),
      mk('row-pin', 'candy-abtn--pin', '📌', pinned ? 'Unpin this log' : 'Pin this log to the top', pinned),
      mk('row-tag', 'candy-abtn--tag', '🏷️', 'Add a tag to this log'),
      mk('row-del', 'candy-abtn--del', '🗑️', 'Delete this log'),
    );
    this.customActions.forEach((a, i) => {
      const b = mk('custom', 'candy-abtn--custom', a.icon || '⚡', a.label);
      b.dataset.index = String(i);
      cell.appendChild(b);
    });
  }

  /* ============================== detail rows ============================== */

  private toggleDetail(id: string, btn: HTMLElement): void {
    const uid = btn.dataset.uid || id;
    const row = this.rows.get(id);
    const entry = this.store.get(id);
    if (!row || !entry) return;

    const existing = this.container?.querySelector<HTMLElement>(
      `tr.candy-detail-row[data-detail-uid="${cssEsc(uid)}"]`,
    );
    const toggle = row.querySelector<HTMLElement>(`.candy-json-toggle[data-uid="${cssEsc(uid)}"]`);
    if (existing) {
      existing.remove();
      toggle?.classList.add('collapsed');
      toggle?.setAttribute('aria-expanded', 'false');
      return;
    }

    const index = Number(uid.split('-').pop());
    const value = Number.isFinite(index) ? entry.snapshot[index] : entry.snapshot[0];

    const detail = document.createElement('tr');
    detail.className = 'candy-detail-row' + (this.store.isPinned(id) ? ' candy-tr--pinned' : '');
    detail.dataset.detailFor = id;
    detail.dataset.detailUid = uid;
    const cell = document.createElement('td');
    cell.className = 'candy-td candy-td--detail';
    cell.colSpan = this.columnCount;

    if (entry.truncated) {
      const warn = document.createElement('span');
      warn.className = 'candy-truncated';
      warn.textContent = '⚠ truncated for display';
      cell.appendChild(warn);
    }

    const pre = document.createElement('pre');
    pre.className = 'candy-json-pre';
    const { text } = safeStringify(value, { space: 2 });
    this.paintJson(pre, text);
    cell.appendChild(pre);

    const bar = document.createElement('div');
    bar.className = 'candy-copy-row';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'candy-copy-btn';
    copy.textContent = '📋 Copy JSON';
    copy.addEventListener('click', () => this.copyText(text, copy), { signal: this.abort.signal });
    bar.appendChild(copy);
    cell.appendChild(bar);

    detail.appendChild(cell);
    row.after(detail);
    toggle?.classList.remove('collapsed');
    toggle?.setAttribute('aria-expanded', 'true');
  }

  /* ============================== tagging ============================== */

  private showTagInput(id: string, btn: HTMLElement): void {
    const host = btn.parentElement;
    if (!host) return;
    const open = host.querySelector('.candy-tag-input');
    if (open) {
      open.remove();
      return;
    }
    const wrap = document.createElement('span');
    wrap.className = 'candy-tag-input';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.placeholder = 'Tag name…';
    input.setAttribute('aria-label', 'New tag name');
    wrap.appendChild(input);
    btn.after(wrap);
    input.focus();

    const commit = () => {
      const label = input.value.trim();
      wrap.remove();
      if (!label) return;
      const entry = this.store.get(id);
      if (!entry) return;
      entry.tags = [...(entry.tags || []), { label: label.toUpperCase(), color: '#bb9af7', bg: 'rgba(187,154,247,.18)' }];
      entry.search = `${entry.search} ${label.toLowerCase()}`;
      this.store.touch(entry);
      if (this.store.isPinned(id)) this.savePinnedToStorage();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') wrap.remove();
    });
    input.addEventListener('blur', () => setTimeout(() => wrap.isConnected && wrap.remove(), 150));
  }

  /* ============================== filtering ============================== */

  private matches(entry: LogEntry): boolean {
    if (this.currentFilter !== 'all' && entry.level !== this.currentFilter) return false;
    // Search the model, not `textContent` — the DOM does not contain the text of
    // a collapsed object, so DOM search returned false negatives on big payloads.
    return !this.searchTerm || entry.search.includes(this.searchTerm);
  }

  private setFilter(level: LogLevel | 'all'): void {
    this.currentFilter = level;
    for (const b of this.container!.querySelectorAll<HTMLElement>('.candy-fbtn')) {
      const on = b.dataset.level === level;
      b.classList.toggle('candy-fbtn--active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.applyFilters();
  }

  private applyFilters(): void {
    for (const entry of this.store.all()) {
      const row = this.rows.get(entry.id);
      if (!row) continue;
      const hide = !this.matches(entry);
      row.classList.toggle('candy-tr--hidden', hide);
      const detail = this.container?.querySelector<HTMLElement>(
        `tr.candy-detail-row[data-detail-for="${cssEsc(entry.id)}"]`,
      );
      detail?.classList.toggle('candy-tr--hidden', hide);
    }
    this.updateEmptyState();
  }

  private refreshCounts(): void {
    const counts = this.store.counts();
    for (const key of ['all', ...LOG_LEVELS]) {
      const el = this.countEls.get(key);
      if (el) el.textContent = String(counts[key as LogLevel | 'all'] ?? 0);
    }
    if (this.counterEl) this.counterEl.textContent = String(counts.all);
    this.updateEmptyState();
  }

  private updateEmptyState(): void {
    this.emptyEl?.classList.toggle('hidden', this.store.size > 0);
  }

  /* ============================== scroll ============================== */

  private scrollToBottom(): void {
    const w = this.wrapEl;
    if (!w) return;
    w.scrollTop = w.scrollHeight;
    this.stickToBottom = true;
    this.clearUnseen();
  }

  private bumpUnseen(): void {
    this.unseen++;
    if (this.newPillEl) {
      this.newPillEl.textContent = `↓ ${this.unseen} new`;
      this.newPillEl.classList.remove('candy-newpill--hidden');
    }
  }

  private clearUnseen(): void {
    this.unseen = 0;
    this.newPillEl?.classList.add('candy-newpill--hidden');
  }

  /* ============================== header actions ============================== */

  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.container!.classList.toggle('candy-logger--minimized', this.isMinimized);
    const btn = this.container!.querySelector<HTMLElement>('[data-act="minimize"]');
    if (btn) {
      const glyph = btn.firstElementChild;
      if (glyph) glyph.textContent = this.isMinimized ? '+' : '−';
      btn.setAttribute('aria-expanded', String(!this.isMinimized));
      btn.setAttribute('aria-label', this.isMinimized ? 'Expand panel' : 'Minimize panel');
    }
  }

  private togglePanelPin(btn: HTMLElement): void {
    this.isPanelPinned = !this.isPanelPinned;
    this.container!.classList.toggle('candy-logger--pinned', this.isPanelPinned);
    btn.classList.toggle('active', this.isPanelPinned);
    btn.setAttribute('aria-pressed', String(this.isPanelPinned));
  }

  private setTheme(theme: 'light' | 'dark'): void {
    this.resolvedTheme = theme;
    const el = this.container!;
    el.classList.toggle('candy-logger--dark', theme === 'dark');
    el.classList.toggle('candy-logger--light', theme === 'light');
    const btn = el.querySelector<HTMLElement>('[data-act="theme"] span');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  private cycleTheme(): void {
    this.themeSetting = this.resolvedTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(this.themeSetting);
  }

  private exportLogs(): void {
    const data = this.store.all().map((l) => ({
      time: isNaN(l.timestamp.getTime()) ? null : l.timestamp.toISOString(),
      level: l.level,
      message: l.message,
      tags: l.tags?.map((t) => t.label) || [],
      data: l.snapshot,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candy-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private copyAll(btn: HTMLElement): void {
    const text = this.store
      .all()
      .map((l) => `[${l.timestamp.toISOString()}] ${l.level.toUpperCase()} ${l.message}`)
      .join('\n');
    this.copyText(text, btn);
  }

  private copyText(text: string, btn: HTMLElement): void {
    const done = () => this.flash(btn, '✓');
    try {
      navigator.clipboard?.writeText(text).then(done, () => this.flash(btn, '✕'));
    } catch {
      this.flash(btn, '✕');
    }
  }

  private flash(btn: HTMLElement, glyph: string): void {
    const host = btn.firstElementChild ?? btn;
    const prev = host.textContent;
    host.textContent = glyph;
    setTimeout(() => {
      if (host.isConnected) host.textContent = prev;
    }, 900);
  }

  /* ============================== pin persistence ============================== */

  private loadPinnedFromStorage(): void {
    if (!this.options.persistPins) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PINNED_KEY);
    } catch {
      return; // storage disabled (private mode, blocked cookies)
    }
    if (!raw) return;
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      try {
        localStorage.removeItem(PINNED_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!Array.isArray(list)) return;
    // Validate per record so one bad entry cannot abort the whole batch.
    for (const d of list as StoredPin[]) {
      try {
        if (!d || !isLogLevel(d.level) || typeof d.message !== 'string') continue;
        const ts = new Date(d.timestamp);
        if (isNaN(ts.getTime())) continue;
        const entry: LogEntry = {
          id: this.store.nextId(),
          level: d.level,
          message: d.message,
          timestamp: ts,
          args: [],
          snapshot: [d.message],
          tags: Array.isArray(d.tags) ? d.tags.filter((t) => t && typeof t.label === 'string') : undefined,
          search: `${d.message} ${(d.tags || []).map((t) => t?.label ?? '').join(' ')}`.toLowerCase(),
        };
        this.store.adopt(entry, true);
      } catch {
        /* skip this record */
      }
    }
  }

  private savePinnedToStorage(): void {
    if (!this.options.persistPins) return;
    try {
      const pinned = this.store.pinnedEntries();
      // Arguments are deliberately NOT persisted — logged payloads routinely hold
      // tokens and PII, and localStorage outlives the session.
      const data: StoredPin[] = pinned.map((l) => ({
        level: l.level,
        message: l.message,
        timestamp: isNaN(l.timestamp.getTime()) ? new Date(0).toISOString() : l.timestamp.toISOString(),
        tags: l.tags,
      }));
      while (data.length && JSON.stringify(data).length > MAX_PIN_BYTES) data.shift();
      if (data.length === 0) localStorage.removeItem(PINNED_KEY);
      else localStorage.setItem(PINNED_KEY, JSON.stringify(data));
    } catch {
      /* quota exceeded or storage disabled — pins stay in memory */
    }
  }

  /* ============================== public ============================== */

  show(): void {
    if (this.isMinimized) this.toggleMinimize();
  }
  hide(): void {
    if (!this.isMinimized) this.toggleMinimize();
  }
  get element(): HTMLElement | null {
    return this.container;
  }
}

export { UI_STATE_KEY };
