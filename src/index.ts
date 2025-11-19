import { LogLevel, LogMessage } from './types.js';
import { CandyLoggerUI } from './ui.js';

// Cache for dynamically loaded terminal UI
let CandyTerminalUI: any = null;

// ANSI color codes for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

class CandyLogger {
  private ui: CandyLoggerUI | null = null;
  private terminalUI: any = null;
  private isBrowser: boolean;
  private useInteractiveUI: boolean = false;
  private logCounts = { all: 0, log: 0, info: 0, warn: 0, error: 0 };
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
  };

  constructor(options: { interactive?: boolean } = {}) {
    this.isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    this.useInteractiveUI = options.interactive === true;
    
    // Store original console methods before any modifications
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    
    // Only enable UI in development mode
    const isDevelopment = this.isBrowser && (
      (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('local')
    );
    
    if (this.isBrowser && isDevelopment) {
      this.ui = new CandyLoggerUI();
    } else if (!this.isBrowser && this.useInteractiveUI) {
      // Node.js with interactive TUI - load async
      this.initTerminalUI();
    } else if (!this.isBrowser) {
      // Node.js environment - print welcome message
      this.printNodeWelcome();
    }
  }

  private async initTerminalUI(): Promise<void> {
    try {
      // Suppress any console output during initialization
      const originalWrite = process.stdout.write.bind(process.stdout);
      const originalErrWrite = process.stderr.write.bind(process.stderr);
      
      // Temporarily suppress stdout/stderr
      process.stdout.write = () => true;
      process.stderr.write = () => true;
      
      if (!CandyTerminalUI) {
        const module = await import('./terminal-ui.js');
        CandyTerminalUI = module.CandyTerminalUI;
      }
      this.terminalUI = new CandyTerminalUI();
      
      // Wait a bit for blessed to fully initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Restore stdout/stderr but redirect to blessed screen
      process.stdout.write = originalWrite;
      process.stderr.write = originalErrWrite;
    } catch (error) {
      // Fallback to regular mode if terminal UI fails to load
      this.printNodeWelcome();
    }
  }

  private printNodeWelcome(): void {
    this.originalConsole.log(`\n${colors.magenta}${colors.bright}🍬 Candy Logger${colors.reset} ${colors.dim}v1.0.0${colors.reset}`);
    this.originalConsole.log(`${colors.cyan}Terminal mode enabled for Node.js${colors.reset}\n`);
  }

  private formatNodeTimestamp(): string {
    const now = new Date();
    return `${colors.dim}[${now.toLocaleTimeString()}]${colors.reset}`;
  }

  private formatNodeJson(obj: any): string {
    try {
      const jsonString = JSON.stringify(obj, null, 2);
      // Add syntax highlighting for terminal
      return jsonString
        .replace(/"([^"]+)":/g, `${colors.cyan}"$1"${colors.reset}:`)
        .replace(/: "([^"]*)"/g, `: ${colors.green}"$1"${colors.reset}`)
        .replace(/: (\d+)/g, `: ${colors.yellow}$1${colors.reset}`)
        .replace(/: (true|false)/g, `: ${colors.magenta}$1${colors.reset}`)
        .replace(/: null/g, `: ${colors.dim}null${colors.reset}`);
    } catch {
      return String(obj);
    }
  }

  private logToNode(level: LogLevel, args: any[]): void {
    this.logCounts.all++;
    (this.logCounts as any)[level]++;

    const timestamp = this.formatNodeTimestamp();
    let prefix = '';
    let badge = '';

    switch (level) {
      case 'log':
        prefix = `${colors.blue}${colors.bright}LOG${colors.reset}`;
        badge = `${colors.bgBlue}${colors.white} LOG ${colors.reset}`;
        break;
      case 'info':
        prefix = `${colors.cyan}${colors.bright}INFO${colors.reset}`;
        badge = `${colors.bgCyan}${colors.white} INFO ${colors.reset}`;
        break;
      case 'warn':
        prefix = `${colors.yellow}${colors.bright}WARN${colors.reset}`;
        badge = `${colors.bgYellow}${colors.black} WARN ${colors.reset}`;
        break;
      case 'error':
        prefix = `${colors.red}${colors.bright}ERROR${colors.reset}`;
        badge = `${colors.bgRed}${colors.white} ERROR ${colors.reset}`;
        break;
    }

    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return '\n' + this.formatNodeJson(arg);
      }
      return String(arg);
    }).join(' ');

    this.originalConsole.log(`${timestamp} ${badge} ${formattedArgs}`);
  }

  private createLogMessage(level: LogLevel, args: any[]): LogMessage {
    return {
      level,
      message: args.map(arg => String(arg)).join(' '),
      timestamp: new Date(),
      args
    };
  }

  private addToUI(logMessage: LogMessage): void {
    if (this.ui) {
      this.ui.addLog(logMessage);
    } else if (this.terminalUI) {
      this.terminalUI.addLog(logMessage);
    }
  }

  public log(...args: any[]): void {
    if (this.isBrowser) {
      this.originalConsole.log(...args);
      const logMessage = this.createLogMessage('log', args);
      this.addToUI(logMessage);
    } else if (this.useInteractiveUI && this.terminalUI) {
      const logMessage = this.createLogMessage('log', args);
      this.addToUI(logMessage);
    } else {
      this.logToNode('log', args);
    }
  }

  public info(...args: any[]): void {
    if (this.isBrowser) {
      this.originalConsole.info(...args);
      const logMessage = this.createLogMessage('info', args);
      this.addToUI(logMessage);
    } else if (this.useInteractiveUI && this.terminalUI) {
      const logMessage = this.createLogMessage('info', args);
      this.addToUI(logMessage);
    } else {
      this.logToNode('info', args);
    }
  }

  public warn(...args: any[]): void {
    if (this.isBrowser) {
      this.originalConsole.warn(...args);
      const logMessage = this.createLogMessage('warn', args);
      this.addToUI(logMessage);
    } else if (this.useInteractiveUI && this.terminalUI) {
      const logMessage = this.createLogMessage('warn', args);
      this.addToUI(logMessage);
    } else {
      this.logToNode('warn', args);
    }
  }

  public error(...args: any[]): void {
    if (this.isBrowser) {
      this.originalConsole.error(...args);
      const logMessage = this.createLogMessage('error', args);
      this.addToUI(logMessage);
    } else if (this.useInteractiveUI && this.terminalUI) {
      const logMessage = this.createLogMessage('error', args);
      this.addToUI(logMessage);
    } else {
      this.logToNode('error', args);
    }
  }

  public getStats(): { all: number; log: number; info: number; warn: number; error: number } {
    return { ...this.logCounts };
  }

  public printStats(): void {
    if (!this.isBrowser) {
      this.originalConsole.log(`\n${colors.bright}${colors.magenta}📊 Candy Logger Stats:${colors.reset}`);
      this.originalConsole.log(`${colors.cyan}Total:${colors.reset} ${this.logCounts.all}`);
      this.originalConsole.log(`${colors.blue}Logs:${colors.reset} ${this.logCounts.log}`);
      this.originalConsole.log(`${colors.cyan}Info:${colors.reset} ${this.logCounts.info}`);
      this.originalConsole.log(`${colors.yellow}Warnings:${colors.reset} ${this.logCounts.warn}`);
      this.originalConsole.log(`${colors.red}Errors:${colors.reset} ${this.logCounts.error}\n`);
    }
  }
}

// Copy function for JSON
if (typeof window !== 'undefined') {
  (window as any).candyLoggerCopy = function(elementId: string, button: HTMLButtonElement) {
    const element = document.getElementById(elementId);
    if (element) {
      const text = element.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  };

  (window as any).candyLoggerToggle = function(uniqueId: string) {
    const container = document.getElementById(`container-${uniqueId}`);
    if (!container) return;
    
    const toggle = container.querySelector('.candy-json-toggle');
    const preview = document.getElementById(`preview-${uniqueId}`);
    
    if (container.classList.contains('collapsed')) {
      container.classList.remove('collapsed');
      toggle?.classList.remove('collapsed');
      if (preview) preview.style.display = 'none';
    } else {
      container.classList.add('collapsed');
      toggle?.classList.add('collapsed');
      if (preview) preview.style.display = 'inline';
    }
  };

  (window as any).candyLoggerCopyOriginal = function(uniqueId: string, button: HTMLButtonElement) {
    // Access the UI instance to get original values
    const uiInstance = (window as any).__candyLoggerUI;
    if (!uiInstance) return;
    
    const originalValue = uiInstance.getOriginalValue(uniqueId);
    if (originalValue) {
      const text = JSON.stringify(originalValue, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied Full';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  };
}

// Create singleton only in browser or when explicitly needed
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const candy = isBrowser ? new CandyLogger() : (null as any);

// Factory function for creating interactive logger
export function createInteractiveLogger(): CandyLogger {
  return new CandyLogger({ interactive: true });
}

/**
 * Override global console to use candy-logger
 * Call this once in your app entry point to intercept all console calls
 * @param options - Configuration options
 * @returns The candy logger instance
 * 
 * @example
 * // In your main.ts or index.js
 * import { overrideConsole } from 'candy-logger';
 * overrideConsole();
 * 
 * // Now all console calls use candy-logger
 * console.log('Hello'); // Uses candy-logger
 * console.info('Info'); // Uses candy-logger
 */
export function overrideConsole(options: { interactive?: boolean } = {}): CandyLogger {
  const logger = options.interactive ? new CandyLogger({ interactive: true }) : (candy || new CandyLogger());
  
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  
  // Override console methods
  console.log = (...args: any[]) => {
    logger.log(...args);
  };
  
  console.info = (...args: any[]) => {
    logger.info(...args);
  };
  
  console.warn = (...args: any[]) => {
    logger.warn(...args);
  };
  
  console.error = (...args: any[]) => {
    logger.error(...args);
  };
  
  // Store originals for restoration
  (logger as any)._originalConsole = originalConsole;
  
  return logger;
}

/**
 * Restore original console methods
 * @param logger - The logger instance returned from overrideConsole
 * 
 * @example
 * const logger = overrideConsole();
 * // ... use console normally
 * restoreConsole(logger); // Restore original console
 */
export function restoreConsole(logger: CandyLogger): void {
  const originalConsole = (logger as any)._originalConsole;
  if (originalConsole) {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
}

// For ES modules
export default candy;
export { candy, CandyLogger };

// For browser/global environments
if (typeof window !== 'undefined') {
  (window as any).candy = candy;
  (window as any).overrideConsole = overrideConsole;
  (window as any).restoreConsole = restoreConsole;
}
