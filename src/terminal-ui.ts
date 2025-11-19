import { LogMessage, LogLevel } from './types.js';

// Dynamically import blessed only in Node.js
let blessed: any = null;

export class CandyTerminalUI {
  private screen: any;
  private logBox: any;
  private filterBox: any;
  private statsBox: any;
  private headerBox: any;
  private helpBox: any;
  private filterButtons: any[] = [];
  private clearButton: any;
  private quitButton: any;
  private logs: LogMessage[] = [];
  private currentFilter: LogLevel | 'all' = 'all';
  private logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0 };
  private collapsedLogs = new Set<number>();
  private selectedIndex = 0;
  private isRunning = false;

  constructor() {
    // Clear screen immediately to prevent any output bleeding
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[2J\x1b[H\x1b[?25l');
    }
    this.loadBlessed().then(() => this.initUI());
  }

  private async loadBlessed(): Promise<void> {
    if (!blessed) {
      blessed = (await import('blessed')).default;
    }
  }

  private initUI(): void {
    // Create screen with output capture
    this.screen = blessed.screen({
      smartCSR: true,
      title: '🍬 Candy Logger',
      mouse: true,
      fullUnicode: true,
      forceUnicode: true,
      dockBorders: true,
      ignoreLocked: ['C-c'],
      warnings: false
    });

    // Prevent any writes to stdout/stderr from bleeding through
    this.screen.ignoreLocked = ['C-c'];

    // Header
    this.headerBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}🍬 CANDY LOGGER - Interactive Terminal UI (Mouse Enabled!){/bold}{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'magenta',
        bold: true
      }
    });

    // Filter buttons container
    this.statsBox = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: 5,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    });

    // Create clickable filter buttons
    this.createFilterButtons();

    // Log box
    this.logBox = blessed.box({
      top: 8,
      left: 0,
      width: '100%',
      height: '100%-12',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'magenta'
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      border: {
        type: 'line'
      },
      label: ' 📜 Logs (Click [▶ Expand] or [▼ Collapse] buttons to toggle JSON) '
    });

    // Setup mouse events for log box
    this.setupLogBoxMouseEvents();

    // Help box
    this.helpBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 4,
      content: '{center}🖱️  {bold}MOUSE!{/bold} Click filter buttons | Click {green-fg}[▶ Expand]{/green-fg} or {yellow-fg}[▼ Collapse]{/yellow-fg} | Scroll with wheel | Keys: ↑↓ Enter 1-5 C Q{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Create action buttons (Clear & Quit)
    this.createActionButtons();

    // Add to screen
    this.screen.append(this.headerBox);
    this.screen.append(this.statsBox);
    this.screen.append(this.logBox);
    this.screen.append(this.helpBox);

    // Key bindings
    this.setupKeyBindings();

    // Initial render
    this.screen.render();
    this.isRunning = true;
  }

  private createFilterButtons(): void {
    const filters: Array<{ label: string, value: LogLevel | 'all', color: string }> = [
      { label: '🔵 ALL', value: 'all', color: 'white' },
      { label: '🔷 LOG', value: 'log', color: 'cyan' },
      { label: '🟢 INFO', value: 'info', color: 'green' },
      { label: '🟡 WARN', value: 'warn', color: 'yellow' },
      { label: '🔴 ERROR', value: 'error', color: 'red' }
    ];

    let leftPosition = 2;
    
    filters.forEach((filter) => {
      const button = blessed.button({
        parent: this.statsBox,
        top: 1,
        left: leftPosition,
        width: 12,
        height: 3,
        content: `{center}${filter.label}{/center}`,
        tags: true,
        mouse: true,
        keys: true,
        shrink: true,
        padding: {
          left: 1,
          right: 1
        },
        style: {
          fg: filter.color,
          bg: 'black',
          border: {
            fg: filter.color
          },
          hover: {
            bg: filter.color,
            fg: 'black'
          },
          focus: {
            bg: filter.color,
            fg: 'black',
            border: {
              fg: 'white'
            }
          }
        },
        border: {
          type: 'line'
        }
      });

      button.on('press', () => {
        this.setFilter(filter.value);
      });

      this.filterButtons.push(button);
      leftPosition += 14;
    });
  }

  private createActionButtons(): void {
    // Clear button
    this.clearButton = blessed.button({
      parent: this.helpBox,
      bottom: 1,
      right: 15,
      width: 10,
      height: 1,
      content: '{center}🗑️ Clear{/center}',
      tags: true,
      mouse: true,
      keys: true,
      shrink: true,
      style: {
        fg: 'yellow',
        bg: 'black',
        hover: {
          bg: 'yellow',
          fg: 'black'
        }
      }
    });

    this.clearButton.on('press', () => {
      this.clearLogs();
    });

    // Quit button
    this.quitButton = blessed.button({
      parent: this.helpBox,
      bottom: 1,
      right: 3,
      width: 10,
      height: 1,
      content: '{center}❌ Quit{/center}',
      tags: true,
      mouse: true,
      keys: true,
      shrink: true,
      style: {
        fg: 'red',
        bg: 'black',
        hover: {
          bg: 'red',
          fg: 'black'
        }
      }
    });

    this.quitButton.on('press', () => {
      this.isRunning = false;
      // Show cursor again before exiting
      if (process.stdout.isTTY) {
        process.stdout.write('\x1b[?25h'); // Show cursor
      }
      process.exit(0);
    });
  }

  private setupLogBoxMouseEvents(): void {
    // Mouse wheel scrolling
    this.logBox.on('wheeldown', () => {
      const filteredLogs = this.getFilteredLogs();
      if (this.selectedIndex < filteredLogs.length - 1) {
        this.selectedIndex++;
        this.updateDisplay();
      }
    });

    this.logBox.on('wheelup', () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.updateDisplay();
      }
    });

    // Click to select and expand/collapse
    this.logBox.on('click', (data: any) => {
      const filteredLogs = this.getFilteredLogs();
      if (filteredLogs.length === 0) return;

      // Calculate which log was clicked based on relative Y position
      const relativeY = data.y - this.logBox.atop - 1; // Adjust for border
      
      // Each log entry takes multiple lines, estimate based on content
      let lineCount = 0;
      let clickedIndex = -1;

      for (let i = 0; i < filteredLogs.length; i++) {
        const log = filteredLogs[i];
        const logLines = this.countLogLines(log);
        
        if (relativeY >= lineCount && relativeY < lineCount + logLines) {
          clickedIndex = i;
          break;
        }
        
        lineCount += logLines + 1; // +1 for spacing
      }

      if (clickedIndex >= 0 && clickedIndex < filteredLogs.length) {
        // If clicking the same log, toggle collapse
        if (clickedIndex === this.selectedIndex) {
          const logIndex = this.logs.indexOf(filteredLogs[clickedIndex]);
          if (this.collapsedLogs.has(logIndex)) {
            this.collapsedLogs.delete(logIndex);
          } else {
            this.collapsedLogs.add(logIndex);
          }
        }
        this.selectedIndex = clickedIndex;
        this.updateDisplay();
      }
    });
  }

  private countLogLines(log: LogMessage): number {
    let lines = 1; // Minimum one line for timestamp and level
    
    for (const arg of log.args) {
      if (typeof arg === 'object' && arg !== null) {
        const logIndex = this.logs.indexOf(log);
        const isCollapsed = this.collapsedLogs.has(logIndex);
        const jsonStr = JSON.stringify(arg, null, 2);
        const jsonLines = jsonStr.split('\n');
        
        if (jsonLines.length > 10 && isCollapsed) {
          lines += 1; // Collapsed preview is 1 line
        } else {
          lines += jsonLines.length;
        }
      }
    }
    
    return lines;
  }

  private clearLogs(): void {
    this.logs = [];
    this.logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0 };
    this.collapsedLogs.clear();
    this.selectedIndex = 0;
    this.updateDisplay();
  }

  private setupKeyBindings(): void {
    // Quit
    this.screen.key(['q', 'Q', 'C-c'], () => {
      this.isRunning = false;
      // Show cursor again before exiting
      if (process.stdout.isTTY) {
        process.stdout.write('\x1b[?25h'); // Show cursor
      }
      return process.exit(0);
    });

    // Clear logs
    this.screen.key(['c', 'C'], () => {
      this.clearLogs();
    });

    // Filter keys
    this.screen.key(['1'], () => this.setFilter('all'));
    this.screen.key(['2'], () => this.setFilter('log'));
    this.screen.key(['3'], () => this.setFilter('info'));
    this.screen.key(['4'], () => this.setFilter('warn'));
    this.screen.key(['5'], () => this.setFilter('error'));

    // Navigation
    this.screen.key(['up', 'k'], () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.updateDisplay();
      }
    });

    this.screen.key(['down', 'j'], () => {
      const filteredLogs = this.getFilteredLogs();
      if (this.selectedIndex < filteredLogs.length - 1) {
        this.selectedIndex++;
        this.updateDisplay();
      }
    });

    // Toggle collapse
    this.screen.key(['enter'], () => {
      const filteredLogs = this.getFilteredLogs();
      if (filteredLogs.length > 0 && this.selectedIndex < filteredLogs.length) {
        const logIndex = this.logs.indexOf(filteredLogs[this.selectedIndex]);
        if (this.collapsedLogs.has(logIndex)) {
          this.collapsedLogs.delete(logIndex);
        } else {
          this.collapsedLogs.add(logIndex);
        }
        this.updateDisplay();
      }
    });
  }

  private setFilter(filter: LogLevel | 'all'): void {
    this.currentFilter = filter;
    this.selectedIndex = 0;
    this.updateFilterButtonStyles();
    this.updateDisplay();
  }

  private getFilteredLogs(): LogMessage[] {
    if (this.currentFilter === 'all') {
      return this.logs;
    }
    return this.logs.filter(log => log.level === this.currentFilter);
  }

  private updateFilterButtonStyles(): void {
    const filters = ['all', 'log', 'info', 'warn', 'error'];
    const colors = ['white', 'cyan', 'green', 'yellow', 'red'];
    
    this.filterButtons.forEach((button, index) => {
      const isActive = this.currentFilter === filters[index];
      button.style.bg = isActive ? colors[index] : 'black';
      button.style.fg = isActive ? 'black' : colors[index];
    });
  }

  private formatLogEntry(log: LogMessage, index: number, isSelected: boolean): string {
    const time = log.timestamp.toLocaleTimeString();
    const prefix = isSelected ? '▶ ' : '  ';
    
    let levelColor = 'white';
    let levelBadge = 'LOG';
    
    switch (log.level) {
      case 'log':
        levelColor = 'cyan';
        levelBadge = 'LOG ';
        break;
      case 'info':
        levelColor = 'green';
        levelBadge = 'INFO';
        break;
      case 'warn':
        levelColor = 'yellow';
        levelBadge = 'WARN';
        break;
      case 'error':
        levelColor = 'red';
        levelBadge = 'ERR ';
        break;
    }

    // No background color for easier text selection and copying
    let line = `${prefix}{${levelColor}-fg}[${time}] [${levelBadge}]{/${levelColor}-fg} `;

    // Format message
    for (const arg of log.args) {
      if (typeof arg === 'object' && arg !== null) {
        const logIndex = this.logs.indexOf(log);
        const isCollapsed = this.collapsedLogs.has(logIndex);
        const jsonStr = JSON.stringify(arg, null, 2);
        const lines = jsonStr.split('\n');
        
        if (isCollapsed) {
          // Collapsed view - show preview with expand button
          const keys = Object.keys(arg);
          const preview = Array.isArray(arg) 
            ? `Array(${arg.length})` 
            : keys.length > 3 
              ? `Object {${keys.slice(0, 3).join(', ')}...}`
              : `Object {${keys.join(', ')}}`;
          
          if (isSelected) {
            line += `{white-fg}[{/white-fg}{green-fg}\u25b6 Expand{/green-fg}{white-fg}]{/white-fg} {cyan-fg}${preview}{/cyan-fg}\n`;
          } else {
            line += `{gray-fg}[\u25b6 Expand] ${preview}{/gray-fg}\n`;
          }
        } else {
          // Expanded view - show JSON with collapse button
          if (isSelected) {
            line += `{white-fg}[{/white-fg}{yellow-fg}\u25bc Collapse{/yellow-fg}{white-fg}]{/white-fg}\n`;
          } else {
            line += `{gray-fg}[\u25bc Collapse]{/gray-fg}\n`;
          }
          line += `{cyan-fg}${jsonStr}{/cyan-fg}\n`;
        }
      } else {
        line += String(arg) + ' ';
      }
    }

    return line;
  }

  private updateDisplay(): void {
    if (!this.isRunning) return;

    const filteredLogs = this.getFilteredLogs();
    
    if (filteredLogs.length === 0) {
      this.logBox.setContent('{center}{magenta-fg}{bold}\n\n🍬\n\nBring me some candy!\n\nNo logs yet. Start logging to see them here.{/bold}{/magenta-fg}{/center}');
    } else {
      const content = filteredLogs
        .map((log, idx) => this.formatLogEntry(log, idx, idx === this.selectedIndex))
        .join('\n');
      this.logBox.setContent(content);
    }

    this.updateFilterButtonStyles();
    this.screen.render();
  }

  public addLog(logMessage: LogMessage): void {
    this.logs.push(logMessage);
    this.logCounts.all++;
    (this.logCounts as any)[logMessage.level]++;
    
    // Auto-collapse ALL JSON objects by default
    const hasJson = logMessage.args.some(arg => {
      return typeof arg === 'object' && arg !== null;
    });
    
    if (hasJson) {
      this.collapsedLogs.add(this.logs.length - 1);
    }
    
    this.updateDisplay();
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
