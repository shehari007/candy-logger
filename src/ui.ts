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
import { icon, mark, type IconName } from './icons.js';

const STYLE_ID = 'candy-logger-styles-v22';
const PINNED_KEY = 'candy-logger-pins-v21';
const LAYOUT_KEY = 'candy-logger-layout-v22';
const MAX_PIN_BYTES = 64 * 1024;
/** Objects whose one-line JSON fits in this many characters are shown inline. */
const INLINE_JSON_MAX = 100;
const MOBILE_MAX_WIDTH = 640;
const ACTION_SIZE = 24;

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

const FILTERS: { level: LogLevel | 'all'; label: string }[] = [
  { level: 'all', label: 'All' },
  { level: 'log', label: 'Log' },
  { level: 'info', label: 'Info' },
  { level: 'debug', label: 'Debug' },
  { level: 'success', label: 'Success' },
  { level: 'warn', label: 'Warn' },
  { level: 'error', label: 'Error' },
];

interface StoredPin {
  level: LogLevel;
  message: string;
  timestamp: string;
  tags?: LogTag[];
}

/**
 * What the panel remembers between page loads. The option values it was saved
 * under are stored too, so editing `position`, `theme` or `collapsed` in code
 * takes effect instead of being overridden by an old drag or toggle.
 */
interface SavedLayout {
  position?: PanelPosition;
  theme?: PanelTheme;
  collapsed?: boolean;
  minimized?: boolean;
  themeChoice?: 'light' | 'dark';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

type ResolvedOptions = Required<
  Pick<
    CandyLoggerOptions,
    'position' | 'theme' | 'maxLogs' | 'showTimestamp' | 'collapsed' | 'tags' | 'dimWhenIdle' | 'persistPins' | 'persistLayout'
  >
> &
  CandyLoggerOptions;

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage disabled (private mode, blocked cookies)
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* quota exceeded or storage disabled */
  }
}

/** `[HH:MM:SS, .mmm]`; the milliseconds are a separate node so narrow screens can drop them. */
function formatTime(d: Date): [string, string] {
  if (isNaN(d.getTime())) return ['--:--:--', '.---'];
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return [`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, `.${p(d.getMilliseconds(), 3)}`];
}

/** `{ a: undefined }` must not override a default, so drop undefined keys before merging. */
function definedOnly<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as any)[k] = v;
  return out;
}

export class CandyLoggerUI {
  private store: LogStore;
  private options: ResolvedOptions;
  private customActions: LogAction[];

  private container: HTMLDivElement | null = null;
  private header: HTMLElement | null = null;
  private tableBody: HTMLTableSectionElement | null = null;
  private pinnedBody: HTMLTableSectionElement | null = null;
  private wrapEl: HTMLElement | null = null;
  private searchEl: HTMLInputElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private emptyTitleEl: HTMLElement | null = null;
  private emptySubEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private errCountEl: HTMLElement | null = null;
  private newPillEl: HTMLButtonElement | null = null;
  private countEls = new Map<string, HTMLElement>();
  private rows = new Map<string, HTMLTableRowElement>();

  private abort = new AbortController();
  private resizeObserver: ResizeObserver | null = null;
  private themeSetting: PanelTheme;
  private resolvedTheme: 'light' | 'dark';
  private themeChoice: 'light' | 'dark' | undefined;
  private saved: SavedLayout = {};
  private geometry: { x?: number; y?: number; w?: number; h?: number } = {};

  private isMinimized = false;
  private isPanelPinned = false;
  private currentFilter: LogLevel | 'all' = 'all';
  private searchTerm = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private stickToBottom = true;
  private scrollQueued = false;
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
      persistLayout: true,
      ...definedOnly(options),
    };
    this.customActions = Array.isArray(options.actions) ? options.actions : [];
    this.themeSetting = this.options.theme;
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
    this.saved = this.loadLayout();

    if (this.saved.themeChoice && this.saved.theme === this.options.theme) {
      this.themeChoice = this.saved.themeChoice;
      this.themeSetting = this.saved.themeChoice;
      this.resolvedTheme = this.saved.themeChoice;
    }
    this.isMinimized =
      this.saved.collapsed === this.options.collapsed && typeof this.saved.minimized === 'boolean'
        ? this.saved.minimized
        : this.options.collapsed;

    const el = document.createElement('div');
    el.className = `candy-logger candy-logger--${this.resolvedTheme}`;
    if (this.options.dimWhenIdle) el.classList.add('candy-logger--dim');
    if (this.options.position === 'full-bottom') el.classList.add('candy-logger--docked');
    if (this.isMinimized) el.classList.add('candy-logger--minimized');
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Candy Logger');
    el.style.setProperty('--candy-actions-w', `${this.actionCount * ACTION_SIZE + 12}px`);
    this.container = el;
    this.applyPosition(this.options.position);
    this.restoreGeometry();

    this.buildSkeleton();
    this.attachEvents();
    this.watchSystemTheme();
    this.watchResize();

    const append = () => {
      if (!this.destroyed && this.container) {
        document.body.appendChild(this.container);
        this.queueScroll();
      }
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
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
    if (this.options.nonce) s.nonce = this.options.nonce;
    s.textContent = CANDY_CSS;
    document.head.appendChild(s);
  }

  private watchSystemTheme(): void {
    if (this.themeSetting !== 'auto' || typeof window.matchMedia !== 'function') return;
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener(
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

  /* ============================== layout memory ============================== */

  private loadLayout(): SavedLayout {
    if (!this.options.persistLayout) return {};
    const raw = readStorage(LAYOUT_KEY);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as SavedLayout) : {};
    } catch {
      return {};
    }
  }

  private saveLayout(): void {
    if (!this.options.persistLayout || this.destroyed) return;
    const data: SavedLayout = {
      position: this.options.position,
      theme: this.options.theme,
      collapsed: this.options.collapsed,
      minimized: this.isMinimized,
      ...this.geometry,
    };
    if (this.themeChoice) data.themeChoice = this.themeChoice;
    writeStorage(LAYOUT_KEY, JSON.stringify(data));
  }

  private restoreGeometry(): void {
    const s = this.saved;
    if (s.position !== this.options.position) return;
    const style = this.container!.style;
    const docked = this.options.position === 'full-bottom';
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!docked && isFiniteNumber(s.w) && s.w >= 340) {
      this.geometry.w = s.w;
      style.width = `${Math.min(s.w, vw - 16)}px`;
    }
    if (isFiniteNumber(s.h) && s.h >= 160) {
      this.geometry.h = s.h;
      style.height = `${Math.min(s.h, vh - 16)}px`;
    }
    if (!docked && isFiniteNumber(s.x) && isFiniteNumber(s.y)) {
      // The viewport may be smaller than when this was saved; keep a grabbable
      // strip of the header on screen.
      const w = this.geometry.w ?? 720;
      this.geometry.x = s.x;
      this.geometry.y = s.y;
      style.left = `${clamp(s.x, 80 - w, vw - 80)}px`;
      style.top = `${clamp(s.y, 0, vh - 38)}px`;
      style.right = 'auto';
      style.bottom = 'auto';
    }
  }

  /**
   * The browser writes inline `width`/`height` when the user drags the native
   * resize handle, so a size change with no inline px value (a viewport clamp,
   * minimizing) is not mistaken for a user resize.
   */
  private watchResize(): void {
    if (!this.options.persistLayout || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const px = (v: string) => (v.endsWith('px') ? Math.round(parseFloat(v)) : undefined);
    this.resizeObserver = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const el = this.container;
        if (!el || this.destroyed || this.isMinimized || window.innerWidth <= MOBILE_MAX_WIDTH) return;
        const w = this.options.position === 'full-bottom' ? undefined : px(el.style.width);
        const h = px(el.style.height);
        if (w === this.geometry.w && h === this.geometry.h) return;
        if (w !== undefined) this.geometry.w = w;
        if (h !== undefined) this.geometry.h = h;
        this.saveLayout();
      }, 250);
    });
    this.resizeObserver.observe(this.container!);
  }

  /* ============================== skeleton ============================== */

  private get columnCount(): number {
    return 3 + (this.options.showTimestamp ? 1 : 0) + (this.options.tags ? 1 : 0);
  }

  private get actionCount(): number {
    return 3 + (this.options.tags ? 1 : 0) + this.customActions.length;
  }

  private iconHost(name: IconName): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'candy-ico';
    span.setAttribute('aria-hidden', 'true');
    span.appendChild(icon(name));
    return span;
  }

  private buildSkeleton(): void {
    const el = this.container!;
    const h = (tag: string, cls?: string, text?: string) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const iconBtn = (action: string, name: IconName, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'candy-hbtn';
      b.dataset.act = action;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.appendChild(this.iconHost(name));
      return b;
    };

    /* header */
    const header = h('div', 'candy-header');
    this.header = header;
    const left = h('div', 'candy-header-left');
    left.append(mark(), h('span', 'candy-title', 'Candy Logger'));
    if (this.options.badgeText) left.appendChild(h('span', 'candy-badge', String(this.options.badgeText)));
    const counter = h('span', 'candy-log-counter', '0');
    counter.setAttribute('aria-label', 'Total logs');
    counter.title = 'Total logs';
    const errCount = h('span', 'candy-errcount');
    errCount.hidden = true;
    left.append(counter, errCount);
    this.counterEl = counter;
    this.errCountEl = errCount;

    const right = h('div', 'candy-header-right');
    right.appendChild(
      iconBtn(
        'theme',
        this.resolvedTheme === 'dark' ? 'sun' : 'moon',
        this.resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      ),
    );
    if (this.options.dimWhenIdle) {
      const pinBtn = iconBtn('pin', 'pin', 'Keep panel fully visible');
      pinBtn.setAttribute('aria-pressed', 'false');
      right.appendChild(pinBtn);
    }
    right.appendChild(iconBtn('export', 'download', 'Export logs as JSON'));
    right.appendChild(iconBtn('copy-all', 'copy', 'Copy all logs'));
    right.appendChild(iconBtn('clear', 'clear', 'Clear logs (pinned rows are kept)'));
    const minBtn = iconBtn(
      'minimize',
      this.isMinimized ? 'restore' : 'minus',
      this.isMinimized ? 'Expand panel' : 'Minimize panel',
    );
    minBtn.setAttribute('aria-expanded', String(!this.isMinimized));
    right.appendChild(minBtn);
    header.append(left, right);

    /* toolbar */
    const toolbar = h('div', 'candy-toolbar');
    const filters = h('div', 'candy-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter by level');
    for (const d of FILTERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'candy-fbtn' + (d.level === 'all' ? ' candy-fbtn--active' : '');
      b.dataset.level = d.level;
      b.setAttribute('aria-pressed', String(d.level === 'all'));
      if (d.level !== 'all') {
        const dot = h('span', 'candy-fdot');
        dot.setAttribute('aria-hidden', 'true');
        b.appendChild(dot);
      }
      const count = h('span', 'candy-fcount', '0');
      b.append(h('span', 'candy-flabel', d.label), count);
      this.countEls.set(d.level, count);
      filters.appendChild(b);
    }
    const searchWrap = h('div', 'candy-search-wrap');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'candy-search';
    search.placeholder = 'Search';
    search.spellcheck = false;
    search.autocomplete = 'off';
    search.setAttribute('aria-label', 'Search logs');
    searchWrap.append(icon('search'), search);
    this.searchEl = search;
    toolbar.append(filters, searchWrap);

    /* body */
    const body = h('div', 'candy-body');
    const wrap = h('div', 'candy-table-wrap');
    this.wrapEl = wrap;
    const table = document.createElement('table');
    table.className = 'candy-table';
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    const th = (cls: string, text: string, srOnly = false) => {
      const n = document.createElement('th');
      n.className = `candy-th ${cls}`;
      n.scope = 'col';
      if (srOnly) n.appendChild(h('span', 'candy-sr', text));
      else n.textContent = text;
      return n;
    };
    if (this.options.showTimestamp) hrow.appendChild(th('candy-th--time', 'Time'));
    hrow.appendChild(th('candy-th--level', 'Level'));
    if (this.options.tags) hrow.appendChild(th('candy-th--tags', 'Tags'));
    hrow.appendChild(th('candy-th--message', 'Message'));
    hrow.appendChild(th('candy-th--actions', 'Actions', true));
    thead.appendChild(hrow);
    const pinnedBody = document.createElement('tbody');
    pinnedBody.className = 'candy-pinned-body';
    const tableBody = document.createElement('tbody');
    tableBody.className = 'candy-table-body';
    tableBody.setAttribute('aria-live', 'polite');
    tableBody.setAttribute('aria-relevant', 'additions');
    table.append(thead, pinnedBody, tableBody);
    wrap.appendChild(table);
    this.pinnedBody = pinnedBody;
    this.tableBody = tableBody;

    const empty = h('div', 'candy-empty');
    this.emptyTitleEl = h('div', 'candy-empty-title', 'No logs yet');
    this.emptySubEl = h('div', 'candy-empty-sub', 'Anything you log will show up here.');
    empty.append(this.emptyTitleEl, this.emptySubEl);
    this.emptyEl = empty;

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'candy-newpill candy-newpill--hidden';
    pill.dataset.act = 'scroll-bottom';
    pill.textContent = '↓ New logs';
    this.newPillEl = pill;

    body.append(wrap, empty, pill);
    el.append(header, toolbar, body);
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
        s.borderRadius = '10px 10px 0 0';
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

    // ONE delegated listener and no inline handlers, so the panel works under
    // `script-src 'self'` and needs no window globals.
    el.addEventListener(
      'click',
      (ev) => {
        const target = ev.target as Element | null;
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

    const search = this.searchEl!;
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
    search.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && search.value) {
          e.preventDefault();
          search.value = '';
          this.searchTerm = '';
          this.applyFilters();
        }
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

    const header = this.header!;
    header.addEventListener(
      'dblclick',
      (e) => {
        if (!(e.target as Element).closest('button')) this.toggleMinimize();
      },
      { signal },
    );

    // Pointer events cover mouse, touch and pen in one path, and pointer capture
    // keeps the drag alive when the cursor leaves the header.
    header.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 || (e.target as Element).closest('button')) return;
        if (this.options.position === 'full-bottom' || window.innerWidth <= MOBILE_MAX_WIDTH) return;
        e.preventDefault(); // stop the host page's text selection
        this.dragPointerId = e.pointerId;
        try {
          header.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic event */
        }
        const r = el.getBoundingClientRect();
        this.dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
        el.classList.add('candy-logger--dragging');
      },
      { signal },
    );
    header.addEventListener(
      'pointermove',
      (e) => {
        if (this.dragPointerId !== e.pointerId || !this.container) return;
        const r = this.container.getBoundingClientRect();
        // Always leave a grabbable strip of the header on screen.
        const left = clamp(e.clientX - this.dragOffset.x, 80 - r.width, window.innerWidth - 80);
        const top = clamp(e.clientY - this.dragOffset.y, 0, window.innerHeight - 38);
        Object.assign(this.container.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
      },
      { signal },
    );
    const endDrag = (e: PointerEvent) => {
      if (this.dragPointerId !== e.pointerId) return;
      try {
        header.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      this.dragPointerId = null;
      const c = this.container;
      if (!c) return;
      c.classList.remove('candy-logger--dragging');
      const x = parseFloat(c.style.left);
      const y = parseFloat(c.style.top);
      if (isFiniteNumber(x) && isFiniteNumber(y)) {
        this.geometry.x = Math.round(x);
        this.geometry.y = Math.round(y);
        this.saveLayout();
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
        else if (!this.store.pin(id)) this.flash(btn, false);
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
        // Dispatch by index: a label is never parsed as code, and duplicate
        // labels cannot collide.
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
      case 'add': {
        this.insertRow(e.entry, this.store.isPinned(e.entry.id));
        this.refreshCounts();
        if (this.stickToBottom) this.queueScroll();
        else if (this.matches(e.entry)) this.bumpUnseen();
        break;
      }
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
    this.clearUnseen();
    this.savePinnedToStorage();
  }

  private detailRows(id: string): NodeListOf<HTMLElement> | [] {
    return this.container?.querySelectorAll<HTMLElement>(`tr.candy-detail-row[data-detail-for="${cssEsc(id)}"]`) ?? [];
  }

  private dropRow(id: string): void {
    this.rows.get(id)?.remove();
    this.rows.delete(id);
    for (const d of this.detailRows(id)) d.remove();
  }

  private rebuildRow(entry: LogEntry): void {
    const old = this.rows.get(entry.id);
    if (!old) return;
    const next = this.createRow(entry, this.store.isPinned(entry.id));
    old.replaceWith(next);
    this.rows.set(entry.id, next);
    // Keep the chevrons in step with any detail rows that are still open.
    for (const d of this.detailRows(entry.id)) {
      const toggle = next.querySelector<HTMLElement>(`.candy-json-toggle[data-uid="${cssEsc(d.dataset.detailUid || '')}"]`);
      toggle?.classList.remove('collapsed');
      toggle?.setAttribute('aria-expanded', 'true');
    }
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
  }

  /* ============================== rows ============================== */

  private createRow(entry: LogEntry, pinned: boolean): HTMLTableRowElement {
    // Whitelisted, so a level from JS callers or storage never reaches an attribute raw.
    const level: LogLevel = isLogLevel(entry.level) ? entry.level : 'log';
    const row = document.createElement('tr');
    row.className = 'candy-tr' + (pinned ? ' candy-tr--pinned' : '');
    row.dataset.level = level;
    row.dataset.id = entry.id;

    const td = (cls: string) => {
      const n = document.createElement('td');
      n.className = `candy-td ${cls}`;
      return n;
    };

    if (this.options.showTimestamp) {
      const t = td('candy-td--time');
      const [hms, ms] = formatTime(entry.timestamp);
      const msEl = document.createElement('span');
      msEl.className = 'candy-ms';
      msEl.textContent = ms;
      t.append(document.createTextNode(hms), msEl);
      if (!isNaN(entry.timestamp.getTime())) t.title = entry.timestamp.toISOString();
      row.appendChild(t);
    }

    const lvl = td('candy-td--level');
    const badge = document.createElement('span');
    badge.className = `candy-level candy-level--${level}`;
    badge.textContent = level;
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
    if (!Array.isArray(tags)) return;
    for (const t of tags) {
      const el = document.createElement('span');
      el.className = 'candy-tag';
      el.textContent = String(t?.label ?? ''); // markup in a label is text, never nodes
      el.title = el.textContent;
      // Colors go through CSSOM with a property allowlist, so they can never
      // terminate an attribute and inject a handler.
      applySafeStyle(el, { ...(t?.bg ? { 'background-color': t.bg } : {}), ...(t?.color ? { color: t.color } : {}) });
      cell.appendChild(el);
    }
  }

  private renderMessage(cell: HTMLElement, entry: LogEntry): void {
    cell.replaceChildren();
    // With format specifiers, `parts` already holds the substituted (and
    // `%c`-styled) text; rendering args separately would show the raw template.
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

  private toggleButton(uid: string, label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'candy-json-toggle collapsed';
    b.dataset.act = 'row-toggle';
    b.dataset.uid = uid;
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', label);
    b.appendChild(icon('chevron'));
    return b;
  }

  private renderValue(value: unknown, uid: string): Node {
    if (value === null || typeof value !== 'object') {
      return document.createTextNode(String(value));
    }
    if (looksLikeError(value)) return this.renderError(value, uid);

    // Map/Set snapshots carry a `__type` label; show it as a prefix, not a key.
    const typed = typeof (value as any).__type === 'string' ? (value as any) : null;
    const body = typed ? (typed.entries ?? typed.values ?? []) : value;
    const { text } = safeStringify(body);
    if (text.length <= INLINE_JSON_MAX) {
      const span = document.createElement('span');
      span.className = 'candy-json-inline';
      if (typed) {
        const t = document.createElement('span');
        t.className = 'candy-json-type';
        t.textContent = `${typed.__type} `;
        span.appendChild(t);
      }
      this.paintJson(span, text, true);
      return span;
    }

    const frag = document.createDocumentFragment();
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'candy-json-preview';
    preview.dataset.act = 'row-toggle';
    preview.dataset.uid = uid;
    preview.tabIndex = -1;
    // Object KEYS reach the DOM here. textContent means a key named
    // `<img src=x onerror=...>` renders as characters, not as an element.
    preview.textContent = previewOf(value);
    frag.append(this.toggleButton(uid, `Expand ${previewOf(value)}`), preview);
    return frag;
  }

  private renderError(err: { name: string; message: string; stack?: string[] }, uid: string): Node {
    const frag = document.createDocumentFragment();
    const extras = Object.keys(err).filter((k) => !['name', 'message', 'stack'].includes(k));
    if (err.stack?.length || extras.length) frag.appendChild(this.toggleButton(uid, 'Expand stack trace'));
    const head = document.createElement('span');
    head.className = 'candy-err';
    head.textContent = `${err.name}: ${err.message}`;
    frag.appendChild(head);
    return frag;
  }

  /** Highlight JSON. `compact` adds the spaces JSON.stringify leaves out of one-line output. */
  private paintJson(host: HTMLElement, json: string, compact = false): void {
    for (const tok of tokenizeJson(json)) {
      if (tok.type === 'plain') {
        host.appendChild(document.createTextNode(compact ? tok.text.replace(/,/g, ', ') : tok.text));
      } else {
        const s = document.createElement('span');
        s.className = `candy-json-${tok.type}`;
        s.textContent = tok.text;
        host.appendChild(s);
        if (compact && tok.type === 'key') host.appendChild(document.createTextNode(' '));
      }
    }
  }

  private renderActions(cell: HTMLElement, entry: LogEntry, pinned: boolean): void {
    const mk = (act: string, cls: string, label: string, pressed?: boolean) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `candy-abtn ${cls}` + (pressed ? ' active' : '');
      b.dataset.act = act;
      b.dataset.id = entry.id;
      b.setAttribute('aria-label', label);
      b.title = label;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      return b;
    };
    const withIcon = (b: HTMLButtonElement, name: IconName) => {
      b.appendChild(this.iconHost(name));
      return b;
    };

    cell.appendChild(withIcon(mk('row-copy', 'candy-abtn--copy', 'Copy message'), 'copy'));
    if (this.options.tags) cell.appendChild(withIcon(mk('row-tag', 'candy-abtn--tag', 'Add a tag'), 'tag'));
    cell.appendChild(withIcon(mk('row-pin', 'candy-abtn--pin', pinned ? 'Unpin' : 'Pin to top', pinned), 'pin'));
    cell.appendChild(withIcon(mk('row-del', 'candy-abtn--del', 'Delete'), 'trash'));

    this.customActions.forEach((a, i) => {
      const b = mk('custom', 'candy-abtn--custom', String(a?.label ?? 'Action'));
      b.dataset.index = String(i);
      if (a?.icon) {
        // A caller-supplied icon is text (often an emoji), rendered as text.
        const span = document.createElement('span');
        span.className = 'candy-ico candy-abtn-text';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = String(a.icon);
        b.appendChild(span);
      } else {
        b.appendChild(this.iconHost('bolt'));
      }
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
    detail.dataset.level = row.dataset.level || 'log';
    if (row.classList.contains('candy-tr--hidden')) detail.classList.add('candy-tr--hidden');
    const cell = document.createElement('td');
    cell.className = 'candy-td candy-td--detail';
    cell.colSpan = this.columnCount;

    if (entry.truncated) {
      const warn = document.createElement('span');
      warn.className = 'candy-truncated';
      warn.textContent = 'Some values were truncated for display.';
      cell.appendChild(warn);
    }

    let copyText: string;
    if (looksLikeError(value)) {
      const lines = [`${value.name}: ${value.message}`, ...(value.stack ?? []).map((l) => `    ${l}`)];
      copyText = lines.join('\n');
      const pre = document.createElement('pre');
      pre.className = 'candy-json-pre candy-stack';
      const head = document.createElement('span');
      head.className = 'candy-err';
      head.textContent = lines[0];
      pre.append(head, document.createTextNode(lines.length > 1 ? '\n' + lines.slice(1).join('\n') : ''));
      cell.appendChild(pre);

      const extras: Record<string, unknown> = {};
      for (const k of Object.keys(value)) if (!['name', 'message', 'stack'].includes(k)) extras[k] = (value as any)[k];
      if (Object.keys(extras).length) {
        const { text } = safeStringify(extras, { space: 2 });
        const more = document.createElement('pre');
        more.className = 'candy-json-pre';
        this.paintJson(more, text);
        cell.appendChild(more);
        copyText += `\n${text}`;
      }
    } else {
      const { text } = safeStringify(value, { space: 2 });
      copyText = text;
      const pre = document.createElement('pre');
      pre.className = 'candy-json-pre';
      this.paintJson(pre, text);
      cell.appendChild(pre);
    }

    const bar = document.createElement('div');
    bar.className = 'candy-copy-row';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'candy-copy-btn';
    copy.append(this.iconHost('copy'), document.createTextNode(looksLikeError(value) ? 'Copy' : 'Copy JSON'));
    copy.addEventListener('click', () => this.copyText(copyText, copy), { signal: this.abort.signal });
    bar.appendChild(copy);
    cell.appendChild(bar);

    detail.appendChild(cell);
    row.after(detail);
    toggle?.classList.remove('collapsed');
    toggle?.setAttribute('aria-expanded', 'true');
  }

  /* ============================== tagging ============================== */

  private showTagInput(id: string, btn: HTMLElement): void {
    const cell = this.rows.get(id)?.querySelector<HTMLElement>('.candy-td--tags');
    if (!cell) return;
    const open = cell.querySelector('.candy-tag-input');
    if (open) {
      open.remove();
      return;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'candy-tag-input';
    input.maxLength = 24;
    input.placeholder = 'Tag';
    input.setAttribute('aria-label', 'New tag name');
    cell.appendChild(input);
    input.focus();

    let done = false;
    const close = (refocus: boolean) => {
      done = true;
      input.remove();
      if (refocus && btn.isConnected) btn.focus();
    };
    const commit = () => {
      const label = input.value.trim();
      close(false);
      if (!label) return;
      const entry = this.store.get(id);
      if (!entry) return;
      entry.tags = [...(entry.tags || []), { label: label.toUpperCase() }];
      entry.search = `${entry.search} ${label.toLowerCase()}`;
      this.store.touch(entry);
      if (this.store.isPinned(id)) this.savePinnedToStorage();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep host-page shortcuts out of the way while typing
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') close(true);
    });
    input.addEventListener('blur', () => setTimeout(() => !done && input.isConnected && close(false), 150));
  }

  /* ============================== filtering ============================== */

  private matches(entry: LogEntry): boolean {
    if (this.currentFilter !== 'all' && entry.level !== this.currentFilter) return false;
    // Search the model, not the DOM: a collapsed object's contents are not in
    // the DOM, so DOM search would miss them.
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
      for (const d of this.detailRows(entry.id)) d.classList.toggle('candy-tr--hidden', hide);
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
    if (this.errCountEl) {
      const n = counts.error ?? 0;
      this.errCountEl.hidden = n === 0;
      this.errCountEl.textContent = String(n);
      const label = `${n} ${n === 1 ? 'error' : 'errors'}`;
      this.errCountEl.setAttribute('aria-label', label);
      this.errCountEl.title = label;
    }
    this.updateEmptyState();
  }

  private updateEmptyState(): void {
    if (!this.emptyEl) return;
    let title = 'No logs yet';
    let sub = 'Anything you log will show up here.';
    let show = this.store.size === 0;
    if (!show && (this.currentFilter !== 'all' || this.searchTerm)) {
      show = !this.container?.querySelector('.candy-tr:not(.candy-tr--hidden)');
      if (show) {
        title = 'No matching logs';
        const term = this.searchEl?.value.trim() ?? '';
        sub = term
          ? `Nothing matches “${term.length > 40 ? term.slice(0, 40) + '…' : term}”.`
          : `There are no ${this.currentFilter} entries.`;
      }
    }
    this.emptyEl.classList.toggle('hidden', !show);
    if (show) {
      if (this.emptyTitleEl) this.emptyTitleEl.textContent = title;
      if (this.emptySubEl) this.emptySubEl.textContent = sub;
    }
  }

  /* ============================== scroll ============================== */

  /** Coalesce scroll-to-bottom to once per frame, so a burst of logs costs one layout. */
  private queueScroll(): void {
    if (this.scrollQueued) return;
    this.scrollQueued = true;
    const run = () => {
      this.scrollQueued = false;
      if (!this.destroyed && this.stickToBottom) this.scrollToBottom();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

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

  private setIcon(btn: Element | null | undefined, name: IconName): void {
    const host = btn?.querySelector('.candy-ico');
    host?.replaceChildren(icon(name));
  }

  private toggleMinimize(): void {
    if (!this.container) return;
    this.isMinimized = !this.isMinimized;
    this.container.classList.toggle('candy-logger--minimized', this.isMinimized);
    const btn = this.container.querySelector<HTMLElement>('[data-act="minimize"]');
    if (btn) {
      this.setIcon(btn, this.isMinimized ? 'restore' : 'minus');
      const label = this.isMinimized ? 'Expand panel' : 'Minimize panel';
      btn.setAttribute('aria-expanded', String(!this.isMinimized));
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    if (!this.isMinimized && this.stickToBottom) this.queueScroll();
    this.saveLayout();
  }

  private togglePanelPin(btn: HTMLElement): void {
    this.isPanelPinned = !this.isPanelPinned;
    this.container!.classList.toggle('candy-logger--pinned', this.isPanelPinned);
    btn.classList.toggle('active', this.isPanelPinned);
    btn.setAttribute('aria-pressed', String(this.isPanelPinned));
  }

  private setTheme(theme: 'light' | 'dark'): void {
    this.resolvedTheme = theme;
    const el = this.container;
    if (!el) return;
    el.classList.toggle('candy-logger--dark', theme === 'dark');
    el.classList.toggle('candy-logger--light', theme === 'light');
    const btn = el.querySelector<HTMLElement>('[data-act="theme"]');
    if (btn) {
      this.setIcon(btn, theme === 'dark' ? 'sun' : 'moon');
      const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  private cycleTheme(): void {
    this.themeChoice = this.resolvedTheme === 'dark' ? 'light' : 'dark';
    this.themeSetting = this.themeChoice;
    this.setTheme(this.themeChoice);
    this.saveLayout();
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
    a.style.display = 'none';
    // Firefox only follows a download link that is in the document.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private copyAll(btn: HTMLElement): void {
    const text = this.store
      .all()
      .map((l) => {
        const time = isNaN(l.timestamp.getTime()) ? '-' : l.timestamp.toISOString();
        return `${time} ${l.level.toUpperCase().padEnd(7)} ${l.message}`;
      })
      .join('\n');
    this.copyText(text, btn);
  }

  private copyText(text: string, btn: HTMLElement): void {
    this.writeClipboard(text).then(
      () => this.flash(btn, true),
      () => this.flash(btn, false),
    );
  }

  /**
   * `navigator.clipboard` only exists in secure contexts, which rules it out when
   * you open a dev server on your phone over the LAN (http://192.168.x.x). Fall
   * back to a hidden textarea and execCommand there.
   */
  private writeClipboard(text: string): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).catch(() => this.legacyCopy(text));
      }
    } catch {
      /* fall through */
    }
    return this.legacyCopy(text);
  }

  private legacyCopy(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const active = document.activeElement as HTMLElement | null;
      const ta = document.createElement('textarea');
      try {
        ta.value = text;
        ta.setAttribute('readonly', '');
        Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
        document.body.appendChild(ta);
        ta.select();
        const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
        if (ok) resolve();
        else reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        ta.remove();
        active?.focus?.();
      }
    });
  }

  private flash(btn: HTMLElement, ok: boolean): void {
    if (btn.dataset.flashing) return;
    const host = btn.querySelector<HTMLElement>('.candy-ico');
    const prev = host ? Array.from(host.childNodes) : [];
    btn.dataset.flashing = '1';
    host?.replaceChildren(icon(ok ? 'check' : 'x'));
    const cls = ok ? 'candy-flash-ok' : 'candy-flash-fail';
    btn.classList.add(cls);
    setTimeout(() => {
      delete btn.dataset.flashing;
      btn.classList.remove(cls);
      if (host?.isConnected) host.replaceChildren(...prev);
    }, 1000);
  }

  /* ============================== pin persistence ============================== */

  private loadPinnedFromStorage(): void {
    if (!this.options.persistPins) return;
    const raw = readStorage(PINNED_KEY);
    if (!raw) return;
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      writeStorage(PINNED_KEY, null);
      return;
    }
    if (!Array.isArray(list)) return;
    // Validate per record so one bad entry cannot abort the whole batch.
    for (const d of list as StoredPin[]) {
      try {
        if (!d || !isLogLevel(d.level) || typeof d.message !== 'string') continue;
        const ts = new Date(d.timestamp);
        if (isNaN(ts.getTime())) continue;
        const tags = Array.isArray(d.tags) ? d.tags.filter((t) => t && typeof t.label === 'string') : undefined;
        const entry: LogEntry = {
          id: this.store.nextId(),
          level: d.level,
          message: d.message,
          timestamp: ts,
          args: [],
          snapshot: [d.message],
          tags,
          search: `${d.message} ${(tags || []).map((t) => t.label).join(' ')}`.toLowerCase(),
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
      // Arguments are deliberately NOT persisted: logged payloads routinely hold
      // tokens and PII, and localStorage outlives the session.
      const data: StoredPin[] = this.store.pinnedEntries().map((l) => ({
        level: l.level,
        message: l.message,
        timestamp: isNaN(l.timestamp.getTime()) ? new Date(0).toISOString() : l.timestamp.toISOString(),
        tags: l.tags,
      }));
      while (data.length && JSON.stringify(data).length > MAX_PIN_BYTES) data.shift();
      writeStorage(PINNED_KEY, data.length ? JSON.stringify(data) : null);
    } catch {
      /* pins stay in memory */
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
