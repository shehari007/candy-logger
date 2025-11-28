import { LogLevel, LogMessage } from './types.js';

export class CandyLoggerUI {
  private container: HTMLDivElement | null = null;
  private logContainer: HTMLDivElement | null = null;
  private isMinimized = false;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private currentFilter = 'all';
  private filterPanelOpen = false;
  private logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0 };
  private searchTerm = '';
  private isPinned = false;
  private originalValues = new Map<string, any>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    this.container = document.createElement('div');
    this.container.className = 'candy-logger-container';
    this.container.innerHTML = `
      <div class="candy-logger-header">
        <span class="candy-logger-title">🍬 Candy Logger</span>
        <div class="candy-logger-controls">
          <button class="candy-logger-btn candy-logger-pin" title="Pin (Keep visible)">📌</button>
          <button class="candy-logger-btn candy-logger-filter" data-filter="all" title="Filters">🔍</button>
          <button class="candy-logger-btn candy-logger-minimize" title="Minimize">−</button>
          <button class="candy-logger-btn candy-logger-clear" title="Clear logs">✖</button>
        </div>
      </div>
      <div class="candy-logger-search">
        <input type="text" class="candy-search-input" placeholder="🔍 Search logs..." />
      </div>
      <div class="candy-logger-filters" style="display: none;">
        <button class="candy-filter-btn active" data-filter="all">All <span class="filter-count">(0)</span></button>
        <button class="candy-filter-btn" data-filter="log">Log <span class="filter-count">(0)</span></button>
        <button class="candy-filter-btn" data-filter="info">Info <span class="filter-count">(0)</span></button>
        <button class="candy-filter-btn" data-filter="warn">Warn <span class="filter-count">(0)</span></button>
        <button class="candy-filter-btn" data-filter="error">Error <span class="filter-count">(0)</span></button>
      </div>
      <div class="candy-logger-body">
        <div class="candy-logger-logs"></div>
        <div class="candy-logger-empty" style="display: none;">
          <div class="candy-emoji">🍬</div>
          <div class="candy-text">Bring me some candy!</div>
          <div class="candy-subtext">No logs yet. Start logging to see them here.</div>
        </div>
      </div>
    `;

    this.logContainer = this.container.querySelector('.candy-logger-logs');
    this.addStyles();
    this.attachEventListeners();

    // Expose UI instance globally for copy original functionality
    if (typeof window !== 'undefined') {
      (window as any).__candyLoggerUI = this;
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(this.container!);
      });
    } else {
      document.body.appendChild(this.container);
    }
  }

  public getOriginalValue(uniqueId: string): any {
    return this.originalValues.get(uniqueId);
  }

  private addStyles(): void {
    const styleId = 'candy-logger-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .candy-logger-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        min-width: 300px;
        max-width: 800px;
        height: 500px;
        min-height: 200px;
        max-height: 80vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        z-index: 999999;
        transition: opacity 0.3s ease;
        opacity: 0.1;
        display: flex;
        flex-direction: column;
        resize: both;
        overflow: hidden;
      }

      .candy-logger-container:hover {
        opacity: 1;
      }

      .candy-logger-container.pinned {
        opacity: 1 !important;
      }

      .candy-logger-pin.active {
        background: rgba(255, 255, 255, 0.3);
      }

      .candy-logger-container.minimized {
        height: auto;
        min-height: auto;
        max-height: none;
      }

      .candy-logger-container.minimized .candy-logger-body {
        display: none !important;
      }

      .candy-logger-header {
        background: rgba(0, 0, 0, 0.2);
        padding: 12px 16px;
        border-radius: 12px 12px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }

      .candy-logger-title {
        color: white;
        font-weight: 600;
        font-size: 14px;
      }

      .candy-logger-controls {
        display: flex;
        gap: 8px;
      }

      .candy-logger-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .candy-logger-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .candy-logger-body {
        background: white;
        border-radius: 0 0 12px 12px;
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .candy-logger-logs {
        padding: 12px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }

      .candy-logger-logs::-webkit-scrollbar {
        width: 6px;
      }

      .candy-logger-logs::-webkit-scrollbar-track {
        background: #f1f1f1;
      }

      .candy-logger-logs::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 3px;
      }

      .candy-logger-logs::-webkit-scrollbar-thumb:hover {
        background: #555;
      }

      .candy-log-entry {
        padding: 8px 12px;
        margin-bottom: 8px;
        border-radius: 6px;
        font-size: 13px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        border-left: 4px solid;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(20px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .candy-log-entry.log {
        background: #f0f4ff;
        border-left-color: #3b82f6;
        color: #1e40af;
      }

      .candy-log-entry.info {
        background: #f0fdfa;
        border-left-color: #14b8a6;
        color: #115e59;
      }

      .candy-log-entry.warn {
        background: #fffbeb;
        border-left-color: #f59e0b;
        color: #92400e;
      }

      .candy-log-entry.error {
        background: #fef2f2;
        border-left-color: #ef4444;
        color: #991b1b;
      }

      .candy-log-timestamp {
        font-size: 10px;
        opacity: 0.6;
        margin-right: 8px;
      }

      .candy-log-message {
        word-break: break-word;
      }

      .candy-logger-empty {
        text-align: center;
        padding: 40px 20px;
        color: #999;
      }

      .candy-emoji {
        font-size: 48px;
        margin-bottom: 12px;
        animation: bounce 2s infinite;
      }

      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }

      .candy-text {
        font-size: 18px;
        font-weight: 600;
        color: #667eea;
        margin-bottom: 8px;
      }

      .candy-subtext {
        font-size: 13px;
        color: #999;
      }

      .candy-logger-filters {
        background: rgba(0, 0, 0, 0.15);
        padding: 8px 12px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .candy-filter-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
        font-weight: 500;
      }

      .candy-filter-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .candy-filter-btn.active {
        background: rgba(255, 255, 255, 0.9);
        color: #667eea;
      }

      .candy-log-entry.hidden {
        display: none;
      }

      .filter-count {
        opacity: 0.7;
        font-size: 11px;
      }

      .candy-json-toggle {
        display: inline-block;
        cursor: pointer;
        user-select: none;
        margin-right: 6px;
        font-weight: bold;
        color: #888;
        transition: transform 0.2s;
      }

      .candy-json-toggle.collapsed {
        transform: rotate(-90deg);
      }

      .candy-json-container {
        position: relative;
        display: inline-block;
        width: 100%;
      }

      .candy-json-container.collapsed pre {
        display: none;
      }

      .candy-json-container.collapsed .candy-copy-btn {
        display: none;
      }

      .candy-json-preview {
        color: #888;
        font-style: italic;
        font-size: 11px;
      }

      .candy-copy-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #667eea;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
        z-index: 10;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .candy-copy-btn:hover {
        background: #5568d3;
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(0,0,0,0.15);
      }

      .candy-copy-btn:active {
        transform: translateY(0);
      }

      .candy-copy-btn.copied {
        background: #10b981;
      }

      .candy-truncated-notice {
        display: inline-block;
        color: #f59e0b;
        font-size: 11px;
        font-style: italic;
        margin-left: 4px;
      }

      .candy-copy-original-btn {
        display: inline-block;
        color: #667eea;
        font-size: 11px;
        text-decoration: underline;
        cursor: pointer;
        margin-left: 8px;
        background: none;
        border: none;
        padding: 0;
        font-weight: 500;
      }

      .candy-copy-original-btn:hover {
        color: #5568d3;
      }

      .candy-logger-search {
        background: rgba(0, 0, 0, 0.15);
        padding: 8px 12px;
      }

      .candy-search-input {
        width: 100%;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: #333;
        font-size: 13px;
        outline: none;
        transition: all 0.2s;
        box-sizing: border-box;
        text-align: left;
        margin: 0;
      }

      .candy-search-input:focus {
        background: white;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
      }

      .candy-search-input::placeholder {
        color: #999;
      }

      .candy-logger-container.minimized .candy-logger-filters,
      .candy-logger-container.minimized .candy-logger-search {
        display: none !important;
      }
      
      .candy-logger-container::-webkit-resizer {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 0 0 12px 0;
      }
      
      .candy-logger-container::after {
        content: "⋰";
        position: absolute;
        bottom: 2px;
        right: 2px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const header = this.container.querySelector('.candy-logger-header') as HTMLElement;
    const minimizeBtn = this.container.querySelector('.candy-logger-minimize') as HTMLElement;
    const clearBtn = this.container.querySelector('.candy-logger-clear') as HTMLElement;
    const filterBtn = this.container.querySelector('.candy-logger-filter') as HTMLElement;
    const pinBtn = this.container.querySelector('.candy-logger-pin') as HTMLElement;
    const filterPanel = this.container.querySelector('.candy-logger-filters') as HTMLElement;
    const filterBtns = this.container.querySelectorAll('.candy-filter-btn');
    const searchInput = this.container.querySelector('.candy-search-input') as HTMLInputElement;

    // Search functionality
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
        this.applyFilters();
      });
    }

    // Pin toggle
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePin();
    });

    // Filter toggle
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFilterPanel();
    });

    // Filter buttons
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const filter = btn.getAttribute('data-filter') || 'all';
        this.setFilter(filter);
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Minimize/Maximize
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    // Clear logs
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearLogs();
    });

    // Dragging
    header.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const rect = this.container!.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      this.container!.style.transition = 'opacity 0.3s ease';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.container) return;
      
      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;
      
      this.container.style.left = `${x}px`;
      this.container.style.top = `${y}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  private toggleMinimize(): void {
    if (!this.container) return;
    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
      this.container.classList.add('minimized');
    } else {
      this.container.classList.remove('minimized');
    }
  }

  private togglePin(): void {
    if (!this.container) return;
    this.isPinned = !this.isPinned;
    const pinBtn = this.container.querySelector('.candy-logger-pin') as HTMLElement;
    
    if (this.isPinned) {
      this.container.classList.add('pinned');
      pinBtn.classList.add('active');
      pinBtn.title = 'Unpin (Auto fade)';
    } else {
      this.container.classList.remove('pinned');
      pinBtn.classList.remove('active');
      pinBtn.title = 'Pin (Keep visible)';
    }
  }

  private toggleFilterPanel(): void {
    const filterPanel = this.container!.querySelector('.candy-logger-filters') as HTMLElement;
    this.filterPanelOpen = !this.filterPanelOpen;
    filterPanel.style.display = this.filterPanelOpen ? 'flex' : 'none';
  }

  private setFilter(filter: string): void {
    this.currentFilter = filter;
    this.applyFilters();
  }

  private applyFilters(): void {
    const entries = this.logContainer!.querySelectorAll('.candy-log-entry');
    entries.forEach(entry => {
      const matchesFilter = this.currentFilter === 'all' || entry.classList.contains(this.currentFilter);
      const text = entry.textContent?.toLowerCase() || '';
      const matchesSearch = !this.searchTerm || text.includes(this.searchTerm);
      
      if (matchesFilter && matchesSearch) {
        entry.classList.remove('hidden');
      } else {
        entry.classList.add('hidden');
      }
    });
  }

  private clearLogs(): void {
    if (this.logContainer) {
      this.logContainer.innerHTML = '';
      this.logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0 };
      this.updateFilterCounts();
      this.updateEmptyState();
    }
  }

  public addLog(logMessage: LogMessage): void {
    if (!this.logContainer) return;

    const entry = document.createElement('div');
    entry.className = `candy-log-entry ${logMessage.level}`;
    
    // Update counts
    this.logCounts.all++;
    (this.logCounts as any)[logMessage.level]++;
    this.updateFilterCounts();
    this.updateEmptyState();
    
    // Apply current filter
    if (this.currentFilter !== 'all' && this.currentFilter !== logMessage.level) {
      entry.classList.add('hidden');
    }
    
    const time = logMessage.timestamp.toLocaleTimeString();
    const messageText = this.formatMessage(logMessage.args);
    
    entry.innerHTML = `
      <span class="candy-log-timestamp">${time}</span>
      <div class="candy-log-message">${messageText}</div>
    `;

    this.logContainer.appendChild(entry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private updateFilterCounts(): void {
    const filterBtns = this.container!.querySelectorAll('.candy-filter-btn');
    filterBtns.forEach(btn => {
      const filter = btn.getAttribute('data-filter') as keyof typeof this.logCounts;
      const countSpan = btn.querySelector('.filter-count');
      if (countSpan && this.logCounts[filter] !== undefined) {
        countSpan.textContent = `(${this.logCounts[filter]})`;
      }
    });
  }

  private updateEmptyState(): void {
    const emptyState = this.container!.querySelector('.candy-logger-empty') as HTMLElement;
    if (this.logCounts.all === 0) {
      this.logContainer!.style.display = 'none';
      emptyState.style.display = 'block';
    } else {
      this.logContainer!.style.display = 'block';
      emptyState.style.display = 'none';
    }
  }

  private getJsonPreview(obj: any): string {
    if (Array.isArray(obj)) {
      return `Array(${obj.length})`;
    }
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) {
      return `{ ${keys.join(', ')} }`;
    }
    return `{ ${keys.slice(0, 3).join(', ')}, ... }`;
  }

  private truncateLongStrings(obj: any, maxLength: number = 1000, uniqueId?: string): { result: any; hasTruncated: boolean } {
    let hasTruncated = false;
    
    const truncate = (value: any): any => {
      if (typeof value === 'string') {
        if (value.length > maxLength) {
          hasTruncated = true;
          return value.substring(0, maxLength) + `... [truncated ${value.length - maxLength} chars]`;
        }
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(item => truncate(item));
      }
      if (typeof value === 'object' && value !== null) {
        const result: any = {};
        for (const key in value) {
          result[key] = truncate(value[key]);
        }
        return result;
      }
      return value;
    };
    
    const result = truncate(obj);
    
    // Store original value if truncated
    if (hasTruncated && uniqueId) {
      this.originalValues.set(uniqueId, obj);
    }
    
    return { result, hasTruncated };
  }

  private formatMessage(args: any[]): string {
    return args.map((arg, index) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          const uniqueId = `json-${Date.now()}-${index}-${Math.random()}`;
          
          // Truncate long strings (like base64) to prevent UI freezing
          const { result: truncatedArg, hasTruncated } = this.truncateLongStrings(arg, 1000, uniqueId);
          const jsonString = JSON.stringify(truncatedArg, null, 2);
          const lines = jsonString.split('\n').length;
          const isLong = lines > 10;
          const preview = this.getJsonPreview(arg);
          
          const copyOriginalBtn = hasTruncated 
            ? `<button class="candy-copy-original-btn" onclick="window.candyLoggerCopyOriginal('${uniqueId}', this)">📋 Copy Original (Full)</button>`
            : '';
          
          return `
            <div class="candy-json-container ${isLong ? 'collapsed' : ''}" id="container-${uniqueId}">
              <span class="candy-json-toggle ${isLong ? 'collapsed' : ''}" onclick="window.candyLoggerToggle('${uniqueId}')">
                ▼
              </span>
              ${isLong ? `<span class="candy-json-preview" id="preview-${uniqueId}">${preview}</span>` : ''}
              ${hasTruncated ? '<span class="candy-truncated-notice">⚠️ Long values truncated</span>' : ''}
              ${copyOriginalBtn}
              <button class="candy-copy-btn" onclick="window.candyLoggerCopy('${uniqueId}', this)">Copy</button>
              <pre id="${uniqueId}">${this.syntaxHighlight(jsonString)}</pre>
            </div>
          `;
        } catch {
          return String(arg);
        }
      }
      return this.escapeHtml(String(arg));
    }).join(' ');
  }

  private syntaxHighlight(json: string): string {
    json = this.escapeHtml(json);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'candy-json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'candy-json-key';
        } else {
          cls = 'candy-json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'candy-json-boolean';
      } else if (/null/.test(match)) {
        cls = 'candy-json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
