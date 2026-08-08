// Plain JS / no framework — Candy Logger v2.1
import { overrideConsole, restoreConsole, createLogger } from 'candy-logger';

/* ---------------------------------------------------------------- *
 * 1. Capture console.*                                              *
 * ---------------------------------------------------------------- */
const logger = overrideConsole({
  enabled: true,
  theme: 'auto',
  maxLogs: 500,
  badgeText: 'DEV',
});

console.log('Plain log');
console.info('With data', { userId: 42 });
console.warn('Heads up');
console.error('Something failed', new Error('CARD_DECLINED'));

/* ---------------------------------------------------------------- *
 * 2. Things that used to crash the logger — all safe now            *
 * ---------------------------------------------------------------- */
const circular = { name: 'root' };
circular.self = circular;
console.log('Circular graph', circular); // → "[Circular]"

console.log('Exotic values', new Map([['k', 'v']]), new Set([1, 2]), 10n, new Date(), document.body);

console.log('%c BANNER %c styled via %%c', 'background:#ff6ba8;color:#fff;padding:2px 6px', 'color:#4ade80');
console.log('%s scored %d points', 'Alice', 42);

/* ---------------------------------------------------------------- *
 * 3. Ship errors somewhere — the panel is just one sink             *
 * ---------------------------------------------------------------- */
const detachSink = logger.addSink({
  write(entry) {
    if (entry.level === 'error') {
      navigator.sendBeacon('/api/client-errors', JSON.stringify({
        message: entry.message,
        level: entry.level,
        at: entry.timestamp.toISOString(),
        data: entry.snapshot,
      }));
    }
  },
});

/* ---------------------------------------------------------------- *
 * 4. Headless capture — no panel required                           *
 * ---------------------------------------------------------------- */
const headless = createLogger({ maxLogs: 200 }); // enabled defaults to false
headless.debug('Recorded without any UI');
console.table?.(headless.getStats());
// headless.attachUI();  // ...and show it later if you want to look

/* ---------------------------------------------------------------- *
 * 5. Clean up                                                       *
 * ---------------------------------------------------------------- */
window.addEventListener('beforeunload', () => {
  detachSink();
  restoreConsole();
  logger.destroy(); // removes the panel, its listeners and its stylesheet
});
