/**
 * CDN / classic-`<script>` entry point.
 *
 * The window globals live here rather than in `src/index.ts` so the npm entry has
 * no import-time side effects and can be marked `sideEffects: false` — which is what
 * lets a bundler drop the panel entirely from a build that never enables it.
 */
import { CandyLoggerUI } from './ui.js';
import {
  CandyLogger,
  candy,
  createLogger,
  isConsoleOverridden,
  overrideConsole,
  registerPanel,
  restoreConsole,
} from './index.js';

// Statically registered, so the single-file bundle needs no dynamic import.
registerPanel((store, options) => new CandyLoggerUI(store, options));

if (typeof window !== 'undefined') {
  const w = window as any;
  w.candy = candy;
  w.CandyLogger = CandyLogger;
  w.createLogger = createLogger;
  w.overrideConsole = overrideConsole;
  w.restoreConsole = restoreConsole;
}

// Named exports only — a default export here would force CDN users onto
// `CandyLogger.default`, while the window globals above are the intended API.
export * from './index.js';
export { CandyLoggerUI };
