import { LogLevel, LogEntry, LogTag, LogAction, CandyLoggerOptions, PanelPosition, PanelTheme } from './types.js';

let _idCounter = 0;
const PINNED_KEY = 'candy-logger-pins-v2';

interface StoredPin {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  args: any[];
  tags?: LogTag[];
}

export class CandyLoggerUI {
  private container: HTMLDivElement | null = null;
  private tableBody: HTMLTableSectionElement | null = null;
  private pinnedBody: HTMLTableSectionElement | null = null;
  private isMinimized = false;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private currentFilter: LogLevel | 'all' = 'all';
  private logCounts: Record<string, number> = { all: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0, success: 0 };
  private searchTerm = '';
  private isPanelPinned = false;
  private logs: LogEntry[] = [];
  private originalValues = new Map<string, any>();
  private jsonHtmlMap = new Map<string, string>();
  private options: CandyLoggerOptions;
  private customActions: LogAction[];
  private theme: PanelTheme;
  private pinnedLogIds = new Set<string>();

  constructor(options: CandyLoggerOptions = {}) {
    this.options = {
      position: 'bottom-right',
      theme: 'dark',
      maxLogs: 500,
      tableView: true,
      showTimestamp: true,
      collapsed: false,
      tags: true,
      ...options,
    };
    this.customActions = options.actions || [];
    this.theme = this.options.theme === 'auto' ? 'dark' : (this.options.theme || 'dark');
    if (typeof window !== 'undefined') this.init();
  }

  /* ================================================================ */
  /*  Initialisation                                                   */
  /* ================================================================ */

  private init(): void {
    this.container = document.createElement('div');
    this.container.className = `candy-logger candy-logger--${this.theme}`;
    this.applyPosition(this.options.position || 'bottom-right');

    if (this.options.collapsed) {
      this.container.classList.add('candy-logger--minimized');
      this.isMinimized = true;
    }

    this.container.innerHTML = this.buildHTML();
    this.tableBody = this.container.querySelector('.candy-table-body') as HTMLTableSectionElement;
    this.pinnedBody = this.container.querySelector('.candy-pinned-body') as HTMLTableSectionElement;

    this.injectStyles();
    this.attachEvents();
    this.registerGlobalHelpers();
    this.loadPinnedFromStorage();

    const append = () => document.body.appendChild(this.container!);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', append);
    } else {
      append();
    }
  }

  /* ================================================================ */
  /*  HTML skeleton                                                    */
  /* ================================================================ */

  private buildHTML(): string {
    const badge = this.options.badgeText
      ? `<span class="candy-badge">${this.escapeHtml(this.options.badgeText)}</span>`
      : '';
    return `
      <div class="candy-header">
        <div class="candy-header-left">
          <span class="candy-title">🍬 Candy Logger</span>
          ${badge}
          <span class="candy-log-counter" title="Total logs">0</span>
        </div>
        <div class="candy-header-right">
          <button class="candy-hbtn" data-action="theme" title="Switch to ${this.theme === 'dark' ? 'light' : 'dark'} theme">${this.theme === 'dark' ? '☀️' : '🌙'}</button>
          <button class="candy-hbtn" data-action="pin" title="Pin panel (keep visible)">📌</button>
          <button class="candy-hbtn" data-action="export" title="Export logs as JSON">💾</button>
          <button class="candy-hbtn" data-action="clear" title="Clear all logs">🗑️</button>
          <button class="candy-hbtn" data-action="minimize" title="Minimize panel">−</button>
        </div>
      </div>
      <div class="candy-toolbar">
        <div class="candy-filters">${this.buildFilterButtons()}</div>
        <div class="candy-search-wrap">
          <input type="text" class="candy-search" placeholder="Search logs…" spellcheck="false" />
        </div>
      </div>
      <div class="candy-body">
        <div class="candy-table-wrap">
          <table class="candy-table">
            <thead>
              <tr>
                <th class="candy-th candy-th--time">Time</th>
                <th class="candy-th candy-th--level">Level</th>
                <th class="candy-th candy-th--tags">Tags</th>
                <th class="candy-th candy-th--message">Message</th>
                <th class="candy-th candy-th--actions">Actions</th>
              </tr>
            </thead>
            <tbody class="candy-pinned-body"></tbody>
            <tbody class="candy-table-body"></tbody>
          </table>
        </div>
        <div class="candy-empty">
          <div class="candy-empty-icon">🍬</div>
          <div class="candy-empty-title">No logs yet</div>
          <div class="candy-empty-sub">Start logging to see entries here</div>
        </div>
      </div>
    `;
  }

  private buildFilterButtons(): string {
    const f: { level: LogLevel | 'all'; label: string; icon: string }[] = [
      { level: 'all', label: 'All', icon: '📊' },
      { level: 'log', label: 'Log', icon: '📝' },
      { level: 'info', label: 'Info', icon: 'ℹ️' },
      { level: 'debug', label: 'Debug', icon: '🐛' },
      { level: 'success', label: 'OK', icon: '✅' },
      { level: 'warn', label: 'Warn', icon: '⚠️' },
      { level: 'error', label: 'Error', icon: '❌' },
    ];
    return f
      .map(
        (x) =>
          `<button class="candy-fbtn${x.level === 'all' ? ' candy-fbtn--active' : ''}" data-level="${x.level}">${x.icon} ${x.label} <span class="candy-fcount">0</span></button>`,
      )
      .join('');
  }

  /* ================================================================ */
  /*  Position                                                         */
  /* ================================================================ */

  private applyPosition(pos: PanelPosition): void {
    if (!this.container) return;
    const s = this.container.style;
    s.top = s.bottom = s.left = s.right = '';
    s.width = '';
    s.maxWidth = '';
    s.borderRadius = '';
    switch (pos) {
      case 'bottom-right':  s.bottom = '16px'; s.right = '16px'; break;
      case 'bottom-left':   s.bottom = '16px'; s.left = '16px'; break;
      case 'top-right':     s.top = '16px'; s.right = '16px'; break;
      case 'top-left':      s.top = '16px'; s.left = '16px'; break;
      case 'full-bottom':   s.bottom = '0'; s.left = '0'; s.right = '0'; s.width = '100%'; s.maxWidth = '100%'; s.borderRadius = '12px 12px 0 0'; break;
    }
  }

  /* ================================================================ */
  /*  Styles                                                           */
  /* ================================================================ */

  private injectStyles(): void {
    if (document.getElementById('candy-logger-v2-styles')) return;
    const s = document.createElement('style');
    s.id = 'candy-logger-v2-styles';
    s.textContent = this.getCSS();
    document.head.appendChild(s);
  }

  private getCSS(): string {
    return `
/* ========= Candy Logger v2 – Table UI ========= */
.candy-logger{position:fixed;width:700px;min-width:420px;max-width:95vw;height:500px;min-height:200px;max-height:85vh;display:flex;flex-direction:column;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.32);font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;z-index:999999;opacity:.12;transition:opacity .25s ease,box-shadow .25s ease;resize:both;overflow:hidden}
.candy-logger:hover,.candy-logger.candy-logger--pinned{opacity:1}
.candy-logger.candy-logger--minimized{height:auto!important;min-height:auto!important;max-height:none!important;resize:none}
.candy-logger.candy-logger--minimized .candy-toolbar,.candy-logger.candy-logger--minimized .candy-body{display:none!important}

/* ── Dark theme ── */
.candy-logger--dark{background:#1a1b26;color:#c0caf5;border:1px solid #292e42}
.candy-logger--dark .candy-header{background:#16161e;border-bottom:1px solid #292e42}
.candy-logger--dark .candy-toolbar{background:#1a1b26;border-bottom:1px solid #292e42}
.candy-logger--dark .candy-body{background:#1a1b26}
.candy-logger--dark .candy-table-wrap{background:#1a1b26}
.candy-logger--dark .candy-th{background:#16161e;color:#565f89;border-bottom:2px solid #292e42}
.candy-logger--dark .candy-tr{border-bottom:1px solid #292e42}
.candy-logger--dark .candy-tr:hover{background:#1e2030}
.candy-logger--dark .candy-td{color:#c0caf5}
.candy-logger--dark .candy-search{background:#16161e;color:#c0caf5;border:1px solid #292e42}
.candy-logger--dark .candy-search:focus{border-color:#7aa2f7;box-shadow:0 0 0 2px rgba(122,162,247,.2)}
.candy-logger--dark .candy-search::placeholder{color:#565f89}
.candy-logger--dark .candy-fbtn{background:#16161e;color:#565f89;border:1px solid #292e42}
.candy-logger--dark .candy-fbtn:hover{background:#1e2030;color:#c0caf5}
.candy-logger--dark .candy-fbtn--active{background:#7aa2f7;color:#1a1b26;border-color:#7aa2f7}
.candy-logger--dark .candy-empty{color:#565f89}
.candy-logger--dark .candy-json-pre{background:#16161e;border:1px solid #292e42;color:#c0caf5}
.candy-logger--dark .candy-json-key{color:#7aa2f7}
.candy-logger--dark .candy-json-string{color:#9ece6a}
.candy-logger--dark .candy-json-number{color:#ff9e64}
.candy-logger--dark .candy-json-boolean{color:#bb9af7}
.candy-logger--dark .candy-json-null{color:#565f89}
.candy-logger--dark .candy-abtn--copy{background:rgba(122,162,247,.12);color:#7aa2f7}
.candy-logger--dark .candy-abtn--copy:hover{background:rgba(122,162,247,.28)}
.candy-logger--dark .candy-abtn--pin{background:rgba(224,175,104,.12);color:#e0af68}
.candy-logger--dark .candy-abtn--pin:hover,.candy-logger--dark .candy-abtn--pin.active{background:rgba(224,175,104,.28);color:#e0af68}
.candy-logger--dark .candy-abtn--tag{background:rgba(187,154,247,.12);color:#bb9af7}
.candy-logger--dark .candy-abtn--tag:hover{background:rgba(187,154,247,.28)}
.candy-logger--dark .candy-abtn--del{background:rgba(247,118,142,.10);color:#f7768e}
.candy-logger--dark .candy-abtn--del:hover{background:rgba(247,118,142,.25)}
.candy-logger--dark .candy-tag-input input{background:#16161e;color:#c0caf5;border-color:#292e42}
.candy-logger--dark .candy-tag-input input:focus{border-color:#bb9af7}
.candy-logger--dark .candy-copy-btn{background:rgba(122,162,247,.15);color:#7aa2f7}
.candy-logger--dark .candy-copy-btn:hover{background:rgba(122,162,247,.3)}
.candy-logger--dark .candy-log-counter{background:rgba(255,255,255,.08);color:#c0caf5}

/* ── Light theme ── */
.candy-logger--light{background:#ffffff;color:#1e293b;border:1px solid #e2e8f0}
.candy-logger--light .candy-header{background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#1e293b}
.candy-logger--light .candy-toolbar{background:#ffffff;border-bottom:1px solid #e2e8f0}
.candy-logger--light .candy-body{background:#ffffff}
.candy-logger--light .candy-table-wrap{background:#ffffff}
.candy-logger--light .candy-th{background:#f8fafc;color:#64748b;border-bottom:2px solid #e2e8f0}
.candy-logger--light .candy-tr{border-bottom:1px solid #f1f5f9}
.candy-logger--light .candy-tr:hover{background:#f8fafc}
.candy-logger--light .candy-td{color:#1e293b}
.candy-logger--light .candy-td--time{color:#64748b}
.candy-logger--light .candy-search{background:#f8fafc;color:#1e293b;border:1px solid #e2e8f0}
.candy-logger--light .candy-search:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
.candy-logger--light .candy-search::placeholder{color:#94a3b8}
.candy-logger--light .candy-fbtn{background:#f8fafc;color:#64748b;border:1px solid #e2e8f0}
.candy-logger--light .candy-fbtn:hover{background:#f1f5f9;color:#1e293b}
.candy-logger--light .candy-fbtn--active{background:#6366f1;color:#fff;border-color:#6366f1}
.candy-logger--light .candy-empty{color:#94a3b8}
.candy-logger--light .candy-json-pre{background:#f8fafc;border:1px solid #e2e8f0;color:#1e293b}
.candy-logger--light .candy-json-key{color:#6366f1}
.candy-logger--light .candy-json-string{color:#059669}
.candy-logger--light .candy-json-number{color:#d97706}
.candy-logger--light .candy-json-boolean{color:#8b5cf6}
.candy-logger--light .candy-json-null{color:#94a3b8}
.candy-logger--light .candy-abtn--copy{background:rgba(59,130,246,.10);color:#2563eb}
.candy-logger--light .candy-abtn--copy:hover{background:rgba(59,130,246,.20)}
.candy-logger--light .candy-abtn--pin{background:rgba(217,119,6,.10);color:#b45309}
.candy-logger--light .candy-abtn--pin:hover,.candy-logger--light .candy-abtn--pin.active{background:rgba(217,119,6,.22);color:#92400e}
.candy-logger--light .candy-abtn--tag{background:rgba(139,92,246,.10);color:#7c3aed}
.candy-logger--light .candy-abtn--tag:hover{background:rgba(139,92,246,.20)}
.candy-logger--light .candy-abtn--del{background:rgba(239,68,68,.08);color:#dc2626}
.candy-logger--light .candy-abtn--del:hover{background:rgba(239,68,68,.18)}
.candy-logger--light .candy-tag-input input{background:#f8fafc;color:#1e293b;border-color:#e2e8f0}
.candy-logger--light .candy-tag-input input:focus{border-color:#8b5cf6}
.candy-logger--light .candy-copy-btn{background:rgba(99,102,241,.12);color:#4f46e5}
.candy-logger--light .candy-copy-btn:hover{background:rgba(99,102,241,.22)}
.candy-logger--light .candy-log-counter{background:rgba(0,0,0,.06);color:#475569}
.candy-logger--light .candy-title{color:#1e293b}
.candy-logger--light .candy-hbtn{color:#475569}
.candy-logger--light .candy-hbtn:hover{background:rgba(0,0,0,.06)}
.candy-logger--light .candy-hbtn.active{background:rgba(99,102,241,.15)}
.candy-logger--light .candy-badge{background:#6366f1;color:#fff}

/* ── Header ── */
.candy-header{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;border-radius:12px 12px 0 0;flex-shrink:0}
.candy-header-left{display:flex;align-items:center;gap:8px}
.candy-title{font-weight:700;font-size:13px;letter-spacing:-.3px}
.candy-badge{font-size:10px;padding:2px 7px;border-radius:10px;background:#7aa2f7;color:#1a1b26;font-weight:600}
.candy-log-counter{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600;min-width:18px;text-align:center}
.candy-header-right{display:flex;gap:4px}
.candy-hbtn{background:none;border:none;color:inherit;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s}
.candy-hbtn:hover{background:rgba(255,255,255,.12)}
.candy-hbtn.active{background:rgba(122,162,247,.25)}

/* ── Toolbar ── */
.candy-toolbar{padding:8px 12px;display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.candy-filters{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.candy-fbtn{padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;transition:all .15s;white-space:nowrap;border:1px solid transparent;background:none}
.candy-fcount{opacity:.6;font-size:10px;margin-left:2px}
.candy-search-wrap{flex:0 0 180px}
.candy-search{width:100%;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;transition:all .2s;box-sizing:border-box}

/* ── Body / Table ── */
.candy-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;border-radius:0 0 12px 12px;position:relative}
.candy-table-wrap{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0}
.candy-table-wrap::-webkit-scrollbar{width:5px}
.candy-table-wrap::-webkit-scrollbar-track{background:transparent}
.candy-table-wrap::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:3px}
.candy-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.candy-th{padding:6px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px;position:sticky;top:0;z-index:2}
.candy-th--time{width:72px}
.candy-th--level{width:68px}
.candy-th--tags{width:110px}
.candy-th--message{width:auto}
.candy-th--actions{width:160px}

/* ── Table rows ── */
.candy-tr{transition:background .1s;animation:candy-fadeIn .2s ease}
@keyframes candy-fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.candy-tr.candy-tr--hidden{display:none}
.candy-td{padding:6px 10px;vertical-align:top;font-size:12px;line-height:1.5}
.candy-td--time{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;font-size:11px;opacity:.6;white-space:nowrap}
.candy-td--level{white-space:nowrap}
.candy-td--message{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0}
.candy-td--message:hover{white-space:normal;overflow:visible;word-break:break-word}
.candy-td--actions{white-space:nowrap}

/* ── Pinned rows ── */
.candy-tr--pinned{border-left:3px solid #e0af68!important}
.candy-logger--dark .candy-tr--pinned{background:rgba(224,175,104,.05)}
.candy-logger--light .candy-tr--pinned{background:rgba(217,119,6,.04)}
.candy-pinned-body .candy-tr:last-child{border-bottom:2px solid rgba(224,175,104,.3)}

/* ── Level badges ── */
.candy-level{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
.candy-level--log{background:rgba(122,162,247,.15);color:#7aa2f7}
.candy-level--info{background:rgba(125,211,252,.15);color:#7dcfff}
.candy-level--debug{background:rgba(187,154,247,.15);color:#bb9af7}
.candy-level--success{background:rgba(158,206,106,.15);color:#9ece6a}
.candy-level--warn{background:rgba(224,175,104,.15);color:#e0af68}
.candy-level--error{background:rgba(247,118,142,.15);color:#f7768e}

/* ── Tags ── */
.candy-tag{display:inline-block;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;margin-right:3px;margin-bottom:2px;white-space:nowrap}

/* ── Action buttons (colorful) ── */
.candy-abtn{border:none;cursor:pointer;font-size:12px;padding:3px 7px;border-radius:5px;transition:all .15s;font-weight:500;display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-right:3px;line-height:1}

/* ── Tag inline input ── */
.candy-tag-input{display:inline-flex;align-items:center;gap:4px;margin-left:2px;animation:candy-fadeIn .15s ease}
.candy-tag-input input{width:80px;padding:3px 7px;border-radius:5px;font-size:11px;outline:none;font-family:inherit}

/* ── Detail row (full-width JSON expansion) ── */
.candy-detail-row{animation:candy-fadeIn .15s ease}
.candy-detail-row td{padding:2px 14px 12px!important}
.candy-detail-row .candy-json-pre{margin:0;max-height:420px;overflow:auto}

/* ── JSON formatting ── */
.candy-json-toggle{cursor:pointer;user-select:none;margin-right:4px;font-size:10px;display:inline-block;transition:transform .15s;opacity:.5}
.candy-json-toggle:hover{opacity:1}
.candy-json-toggle.collapsed{transform:rotate(-90deg)}
.candy-json-pre{padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.5;overflow-x:auto;margin:4px 0;font-family:'SF Mono','Cascadia Code','Fira Code',monospace;white-space:pre-wrap;word-break:break-word}
.candy-json-pre--inline{margin:2px 0;padding:4px 8px;display:inline-block;max-width:100%}
.candy-json-preview{opacity:.5;font-style:italic;font-size:11px;cursor:pointer}
.candy-json-preview:hover{opacity:.8}
.candy-copy-row{display:flex;gap:4px;margin-top:6px}
.candy-copy-btn{padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;border:none;font-weight:600;transition:all .15s}
.candy-truncated{color:#e0af68;font-size:10px;font-style:italic}

/* ── Empty state ── */
.candy-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.candy-empty.hidden{display:none}
.candy-empty-icon{font-size:40px;margin-bottom:8px;animation:candy-bounce 2s infinite}
@keyframes candy-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.candy-empty-title{font-size:15px;font-weight:600;margin-bottom:4px}
.candy-empty-sub{font-size:12px;opacity:.6}

/* ── Resize handle ── */
.candy-logger::after{content:"⋮⋮";position:absolute;bottom:3px;right:6px;font-size:10px;opacity:.25;pointer-events:none;letter-spacing:2px}
    `;
  }

  /* ================================================================ */
  /*  Events                                                           */
  /* ================================================================ */

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelectorAll('.candy-hbtn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        switch ((btn as HTMLElement).dataset.action) {
          case 'minimize': this.toggleMinimize(); break;
          case 'clear':    this.clearLogs(); break;
          case 'pin':      this.togglePanelPin(); break;
          case 'theme':    this.cycleTheme(); break;
          case 'export':   this.exportLogs(); break;
        }
      });
    });

    this.container.querySelectorAll('.candy-fbtn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const level = (btn as HTMLElement).dataset.level as LogLevel | 'all';
        this.setFilter(level);
        this.container!.querySelectorAll('.candy-fbtn').forEach((b) => b.classList.remove('candy-fbtn--active'));
        btn.classList.add('candy-fbtn--active');
      });
    });

    const search = this.container.querySelector('.candy-search') as HTMLInputElement;
    if (search) {
      search.addEventListener('input', () => {
        this.searchTerm = search.value.toLowerCase();
        this.applyFilters();
      });
    }

    const header = this.container.querySelector('.candy-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.candy-hbtn')) return;
      this.isDragging = true;
      const rect = this.container!.getBoundingClientRect();
      this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.container) return;
      this.container.style.left = `${e.clientX - this.dragOffset.x}px`;
      this.container.style.top = `${e.clientY - this.dragOffset.y}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { this.isDragging = false; });
  }

  /* ================================================================ */
  /*  Global helpers (for onclick in generated HTML)                    */
  /* ================================================================ */

  private registerGlobalHelpers(): void {
    if (typeof window === 'undefined') return;
    (window as any).__candyUI = this;

    (window as any).__candyCopy = (id: string, btn: HTMLButtonElement) => {
      const el = document.getElementById(id);
      if (!el) return;
      navigator.clipboard.writeText(el.textContent || '').then(() => {
        const orig = btn.innerHTML;
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1200);
      });
    };

    (window as any).__candyCopyFull = (id: string, btn: HTMLButtonElement) => {
      const val = this.originalValues.get(id);
      if (!val) return;
      navigator.clipboard.writeText(JSON.stringify(val, null, 2)).then(() => {
        const orig = btn.innerHTML;
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1200);
      });
    };

    (window as any).__candyToggle = (uid: string, toggleEl: HTMLElement) => {
      const row = toggleEl.closest('tr') as HTMLElement;
      if (!row) return;
      const detailId = `detail-${uid}`;
      const existing = document.getElementById(detailId);

      if (existing) {
        existing.remove();
        toggleEl.classList.add('collapsed');
        const preview = row.querySelector(`[data-preview="${uid}"]`) as HTMLElement;
        if (preview) preview.style.display = 'inline';
      } else {
        const html = this.jsonHtmlMap.get(uid);
        if (!html) return;
        const detailRow = document.createElement('tr');
        detailRow.id = detailId;
        detailRow.className = 'candy-detail-row';
        detailRow.dataset.logId = row.dataset.id || '';
        if (row.classList.contains('candy-tr--pinned')) detailRow.classList.add('candy-tr--pinned');
        detailRow.innerHTML = `<td colspan="5" class="candy-td candy-td--detail">${html}</td>`;
        row.after(detailRow);
        toggleEl.classList.remove('collapsed');
        const preview = row.querySelector(`[data-preview="${uid}"]`) as HTMLElement;
        if (preview) preview.style.display = 'none';
      }
    };

    (window as any).__candyPin = (logId: string) => {
      if (this.pinnedLogIds.has(logId)) this.unpinLog(logId);
      else this.pinLog(logId);
    };

    (window as any).__candyShowTagInput = (logId: string, btn: HTMLElement) => {
      const existing = btn.parentElement?.querySelector('.candy-tag-input');
      if (existing) { existing.remove(); return; }

      const wrap = document.createElement('span');
      wrap.className = 'candy-tag-input';
      wrap.innerHTML = `<input type="text" placeholder="Tag name…" maxlength="20" />`;
      btn.after(wrap);
      const input = wrap.querySelector('input') as HTMLInputElement;
      input.focus();

      const commit = () => {
        const label = input.value.trim();
        if (!label) { wrap.remove(); return; }
        const entry = this.logs.find((l) => l.id === logId);
        if (entry) {
          const tag: LogTag = { label: label.toUpperCase(), color: '#bb9af7', bg: 'rgba(187,154,247,.18)' };
          if (!entry.tags) entry.tags = [];
          entry.tags.push(tag);
          const row =
            this.pinnedBody?.querySelector(`tr[data-id="${logId}"]`) ||
            this.tableBody?.querySelector(`tr[data-id="${logId}"]`);
          if (row) {
            const cell = row.querySelector('.candy-td--tags');
            if (cell) cell.innerHTML = this.renderTags(entry.tags);
          }
          if (this.pinnedLogIds.has(logId)) this.savePinnedToStorage();
        }
        wrap.remove();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') wrap.remove();
      });
      input.addEventListener('blur', () => setTimeout(() => { if (wrap.parentElement) wrap.remove(); }, 200));
    };

    (window as any).__candyDeleteRow = (logId: string) => {
      this.container?.querySelectorAll(`tr[data-id="${logId}"]`).forEach((r) => r.remove());
      this.container?.querySelectorAll(`tr.candy-detail-row[data-log-id="${logId}"]`).forEach((r) => r.remove());
      const idx = this.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        const entry = this.logs[idx];
        this.logs.splice(idx, 1);
        this.logCounts.all = Math.max(0, this.logCounts.all - 1);
        this.logCounts[entry.level] = Math.max(0, (this.logCounts[entry.level] || 0) - 1);
        this.updateCounts();
        this.updateEmptyState();
      }
      if (this.pinnedLogIds.has(logId)) {
        this.pinnedLogIds.delete(logId);
        this.savePinnedToStorage();
      }
    };
  }

  /* ================================================================ */
  /*  Header actions                                                   */
  /* ================================================================ */

  private toggleMinimize(): void {
    if (!this.container) return;
    this.isMinimized = !this.isMinimized;
    this.container.classList.toggle('candy-logger--minimized', this.isMinimized);
    const btn = this.container.querySelector('[data-action="minimize"]');
    if (btn) btn.textContent = this.isMinimized ? '+' : '−';
  }

  private togglePanelPin(): void {
    if (!this.container) return;
    this.isPanelPinned = !this.isPanelPinned;
    this.container.classList.toggle('candy-logger--pinned', this.isPanelPinned);
    const btn = this.container.querySelector('[data-action="pin"]') as HTMLElement;
    if (btn) btn.classList.toggle('active', this.isPanelPinned);
  }

  private cycleTheme(): void {
    if (!this.container) return;
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.container.className =
      `candy-logger candy-logger--${this.theme}` +
      (this.isPanelPinned ? ' candy-logger--pinned' : '') +
      (this.isMinimized ? ' candy-logger--minimized' : '');
    const btn = this.container.querySelector('[data-action="theme"]');
    if (btn) {
      btn.textContent = this.theme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('title', `Switch to ${this.theme === 'dark' ? 'light' : 'dark'} theme`);
    }
  }

  private exportLogs(): void {
    const data = this.logs.map((l) => ({
      time: l.timestamp.toISOString(),
      level: l.level,
      message: l.message,
      tags: l.tags?.map((t) => t.label) || [],
      args: l.args,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candy-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ================================================================ */
  /*  Pinning                                                          */
  /* ================================================================ */

  private pinLog(logId: string): void {
    const entry = this.logs.find((l) => l.id === logId);
    if (!entry || !this.pinnedBody || !this.tableBody) return;
    this.pinnedLogIds.add(logId);

    const row = this.tableBody.querySelector(`tr[data-id="${logId}"]`) as HTMLElement;
    if (row) {
      row.classList.add('candy-tr--pinned');
      this.pinnedBody.appendChild(row);
      this.container?.querySelectorAll(`tr.candy-detail-row[data-log-id="${logId}"]`).forEach((dr) => {
        dr.classList.add('candy-tr--pinned');
        row.after(dr);
      });
      const pinBtn = row.querySelector('.candy-abtn--pin');
      if (pinBtn) { pinBtn.classList.add('active'); pinBtn.setAttribute('title', 'Unpin — remove from top'); }
    }
    this.savePinnedToStorage();
  }

  private unpinLog(logId: string): void {
    if (!this.pinnedBody || !this.tableBody) return;
    this.pinnedLogIds.delete(logId);

    const row = this.pinnedBody.querySelector(`tr[data-id="${logId}"]`) as HTMLElement;
    if (row) {
      row.classList.remove('candy-tr--pinned');
      this.tableBody.appendChild(row);
      this.container?.querySelectorAll(`tr.candy-detail-row[data-log-id="${logId}"]`).forEach((dr) => {
        dr.classList.remove('candy-tr--pinned');
        row.after(dr);
      });
      const pinBtn = row.querySelector('.candy-abtn--pin');
      if (pinBtn) { pinBtn.classList.remove('active'); pinBtn.setAttribute('title', 'Pin — keep at top & persist on reload'); }
    }
    this.savePinnedToStorage();
  }

  private loadPinnedFromStorage(): void {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      if (!raw) return;
      const entries: StoredPin[] = JSON.parse(raw);
      for (let i = 0; i < entries.length; i++) {
        const d = entries[i];
        const entry: LogEntry = {
          id: `pin${i}_${Date.now()}`,
          level: d.level,
          message: d.message,
          timestamp: new Date(d.timestamp),
          args: d.args,
          tags: d.tags,
        };
        this.pinnedLogIds.add(entry.id);
        this.logs.push(entry);
        this.logCounts.all++;
        this.logCounts[entry.level] = (this.logCounts[entry.level] || 0) + 1;

        if (this.pinnedBody) {
          const row = this.createRow(entry, true);
          this.pinnedBody.appendChild(row);
        }
      }
      this.updateCounts();
      this.updateEmptyState();
    } catch { /* ignore corrupt storage */ }
  }

  private savePinnedToStorage(): void {
    try {
      const pinned = this.logs.filter((l) => this.pinnedLogIds.has(l.id));
      const data: StoredPin[] = pinned.map((l) => ({
        id: l.id,
        level: l.level,
        message: l.message,
        timestamp: l.timestamp.toISOString(),
        args: l.args,
        tags: l.tags,
      }));
      if (data.length === 0) localStorage.removeItem(PINNED_KEY);
      else localStorage.setItem(PINNED_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  /* ================================================================ */
  /*  Filtering                                                        */
  /* ================================================================ */

  private setFilter(level: LogLevel | 'all'): void {
    this.currentFilter = level;
    this.applyFilters();
  }

  private applyFilters(): void {
    const filterRows = (tbody: HTMLTableSectionElement | null) => {
      if (!tbody) return;
      tbody.querySelectorAll('.candy-tr').forEach((row) => {
        const el = row as HTMLElement;
        const lvl = el.dataset.level || '';
        const text = el.textContent?.toLowerCase() || '';
        const matchLevel = this.currentFilter === 'all' || lvl === this.currentFilter;
        const matchSearch = !this.searchTerm || text.includes(this.searchTerm);
        el.classList.toggle('candy-tr--hidden', !(matchLevel && matchSearch));
      });
    };
    filterRows(this.pinnedBody);
    filterRows(this.tableBody);

    this.container?.querySelectorAll('.candy-detail-row').forEach((dr) => {
      const logId = (dr as HTMLElement).dataset.logId;
      if (logId) {
        const parent =
          this.pinnedBody?.querySelector(`tr[data-id="${logId}"]`) ||
          this.tableBody?.querySelector(`tr[data-id="${logId}"]`);
        (dr as HTMLElement).classList.toggle('candy-tr--hidden', !parent || parent.classList.contains('candy-tr--hidden'));
      }
    });
  }

  private updateCounts(): void {
    if (!this.container) return;
    this.container.querySelectorAll('.candy-fbtn').forEach((btn) => {
      const lvl = (btn as HTMLElement).dataset.level || 'all';
      const span = btn.querySelector('.candy-fcount');
      if (span) span.textContent = String(this.logCounts[lvl] || 0);
    });
    const counter = this.container.querySelector('.candy-log-counter');
    if (counter) counter.textContent = String(this.logCounts.all);
  }

  private updateEmptyState(): void {
    if (!this.container) return;
    const empty = this.container.querySelector('.candy-empty') as HTMLElement;
    if (empty) empty.classList.toggle('hidden', this.logCounts.all > 0);
  }

  /* ================================================================ */
  /*  Clear                                                            */
  /* ================================================================ */

  private clearLogs(): void {
    if (this.tableBody) this.tableBody.innerHTML = '';
    if (this.pinnedBody) this.pinnedBody.innerHTML = '';
    this.container?.querySelectorAll('.candy-detail-row').forEach((r) => r.remove());
    this.logs = [];
    this.logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0, success: 0 };
    this.originalValues.clear();
    this.jsonHtmlMap.clear();
    this.pinnedLogIds.clear();
    this.savePinnedToStorage();
    this.updateCounts();
    this.updateEmptyState();
  }

  /* ================================================================ */
  /*  Row creation                                                     */
  /* ================================================================ */

  private createRow(entry: LogEntry, isPinned: boolean): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'candy-tr' + (isPinned ? ' candy-tr--pinned' : '');
    row.dataset.level = entry.level;
    row.dataset.id = entry.id;

    const time = entry.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    row.innerHTML = `
      <td class="candy-td candy-td--time">${time}</td>
      <td class="candy-td candy-td--level"><span class="candy-level candy-level--${entry.level}">${entry.level.toUpperCase()}</span></td>
      <td class="candy-td candy-td--tags">${this.renderTags(entry.tags)}</td>
      <td class="candy-td candy-td--message">${this.formatMessage(entry.args)}</td>
      <td class="candy-td candy-td--actions">${this.renderActions(entry, isPinned)}</td>
    `;

    if (this.currentFilter !== 'all' && entry.level !== this.currentFilter) row.classList.add('candy-tr--hidden');
    if (this.searchTerm && !(row.textContent?.toLowerCase() || '').includes(this.searchTerm)) row.classList.add('candy-tr--hidden');

    return row;
  }

  /* ================================================================ */
  /*  Public: add a log                                                */
  /* ================================================================ */

  public addLog(entry: LogEntry): void {
    if (!this.tableBody) return;

    this.logs.push(entry);
    if (this.options.maxLogs && this.logs.length > this.options.maxLogs) {
      const removed = this.logs.shift();
      if (removed && !this.pinnedLogIds.has(removed.id) && this.tableBody.firstChild) {
        this.tableBody.removeChild(this.tableBody.firstChild);
      }
    }

    this.logCounts.all++;
    this.logCounts[entry.level] = (this.logCounts[entry.level] || 0) + 1;
    this.updateCounts();
    this.updateEmptyState();

    const row = this.createRow(entry, false);
    this.tableBody.appendChild(row);
    const wrap = this.container!.querySelector('.candy-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  /* ================================================================ */
  /*  Render helpers                                                   */
  /* ================================================================ */

  private renderTags(tags?: LogTag[]): string {
    if (!tags || tags.length === 0) return '<span style="opacity:.3">—</span>';
    return tags
      .map((t) => {
        const bg = t.bg || 'rgba(122,162,247,.15)';
        const color = t.color || '#7aa2f7';
        return `<span class="candy-tag" style="background:${bg};color:${color}">${this.escapeHtml(t.label)}</span>`;
      })
      .join('');
  }

  private renderActions(entry: LogEntry, isPinned: boolean): string {
    const id = entry.id;
    const safeMsg = this.escapeHtml(JSON.stringify(JSON.stringify(entry.message)));
    let h = '';
    h += `<button class="candy-abtn candy-abtn--copy" title="Copy log text to clipboard" onclick="navigator.clipboard.writeText(${safeMsg});let o=this.innerHTML;this.textContent='✓';setTimeout(()=>this.innerHTML=o,900)">📋</button>`;
    h += `<button class="candy-abtn candy-abtn--pin${isPinned ? ' active' : ''}" title="${isPinned ? 'Unpin — remove from top' : 'Pin — keep at top & persist on reload'}" onclick="__candyPin('${id}')">📌</button>`;
    h += `<button class="candy-abtn candy-abtn--tag" title="Add a custom tag to this log" onclick="__candyShowTagInput('${id}',this)">🏷️</button>`;
    h += `<button class="candy-abtn candy-abtn--del" title="Delete this log entry" onclick="__candyDeleteRow('${id}')">🗑️</button>`;
    for (const a of this.customActions) {
      h += `<button class="candy-abtn" title="${this.escapeHtml(a.label)}" onclick="__candyUI.runAction('${this.escapeHtml(a.label)}','${id}')">${a.icon || '⚡'}</button>`;
    }
    return h;
  }

  public runAction(label: string, logId: string): void {
    const action = this.customActions.find((a) => a.label === label);
    const log = this.logs.find((l) => l.id === logId);
    if (action && log) action.onClick(log);
  }

  /* ================================================================ */
  /*  Message formatting                                               */
  /* ================================================================ */

  private formatMessage(args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            const uid = `j${++_idCounter}`;
            const { result: truncated, hasTruncated } = this.truncateStrings(arg, 1000, uid);
            const json = JSON.stringify(truncated, null, 2);
            const lines = json.split('\n').length;
            const isLong = lines > 3;
            const preview = this.jsonPreview(arg);

            const fullBtn = hasTruncated
              ? `<button class="candy-copy-btn" onclick="__candyCopyFull('${uid}',this)">📋 Full</button>`
              : '';
            const detailHtml = `
              ${hasTruncated ? '<span class="candy-truncated">⚠ truncated</span>' : ''}
              <pre class="candy-json-pre" id="${uid}">${this.highlightJson(json)}</pre>
              <div class="candy-copy-row">
                <button class="candy-copy-btn" onclick="__candyCopy('${uid}',this)">📋 Copy</button>
                ${fullBtn}
              </div>`;
            this.jsonHtmlMap.set(uid, detailHtml);

            if (isLong) {
              return `<span class="candy-json-toggle collapsed" onclick="__candyToggle('${uid}',this)">▼</span><span class="candy-json-preview" data-preview="${uid}" onclick="__candyToggle('${uid}',this.previousElementSibling)">${preview}</span>`;
            }
            return `<pre class="candy-json-pre candy-json-pre--inline" id="${uid}">${this.highlightJson(json)}</pre>`;
          } catch {
            return this.escapeHtml(String(arg));
          }
        }
        return this.escapeHtml(String(arg));
      })
      .join(' ');
  }

  private jsonPreview(obj: any): string {
    if (Array.isArray(obj)) return `Array(${obj.length})`;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return keys.length <= 3 ? `{ ${keys.join(', ')} }` : `{ ${keys.slice(0, 3).join(', ')}, +${keys.length - 3} }`;
  }

  private truncateStrings(obj: any, max: number, uid: string): { result: any; hasTruncated: boolean } {
    let hasTruncated = false;
    const walk = (v: any): any => {
      if (typeof v === 'string' && v.length > max) { hasTruncated = true; return v.slice(0, max) + `...[+${v.length - max}]`; }
      if (Array.isArray(v)) return v.map(walk);
      if (typeof v === 'object' && v !== null) { const o: any = {}; for (const k in v) o[k] = walk(v[k]); return o; }
      return v;
    };
    const result = walk(obj);
    if (hasTruncated) this.originalValues.set(uid, obj);
    return { result, hasTruncated };
  }

  private highlightJson(json: string): string {
    return this.escapeHtml(json).replace(
      /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (m) => {
        let cls = 'candy-json-number';
        if (/^"/.test(m)) cls = /:$/.test(m) ? 'candy-json-key' : 'candy-json-string';
        else if (/true|false/.test(m)) cls = 'candy-json-boolean';
        else if (/null/.test(m)) cls = 'candy-json-null';
        return `<span class="${cls}">${m}</span>`;
      },
    );
  }

  private escapeHtml(text: string): string {
    const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (c) => m[c]);
  }

  /* ================================================================ */
  /*  Public getters                                                   */
  /* ================================================================ */

  public getOriginalValue(uid: string): any { return this.originalValues.get(uid); }
  public getLogs(): LogEntry[] { return [...this.logs]; }
  public getLogCounts(): Record<string, number> { return { ...this.logCounts }; }
}
