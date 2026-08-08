# 🍬 Candy Logger

A browser console panel that **can't crash your app** — safe serialization, real stack traces, CSP-friendly, zero dependencies.

**~6 kB gzipped core.** The panel is a lazy chunk, so builds that never enable it ship almost nothing.

## 🚀 [Live Demo](https://candy-logger.msyb.dev)

---

## ✨ Why

Most in-page loggers serialize your arguments with `JSON.stringify`. That throws on circular
objects, renders every `Error` as `{}`, and drops `Map`, `Set`, `BigInt` and `Date` on the floor.
Candy Logger uses a serializer that is **total** — it cannot throw, for any input.

```js
const a = {}; a.self = a;
console.log(a);                         // → { "self": "[Circular]" }
console.error(new Error('boom'));       // → Error: boom, with the full stack
console.log(new Map([['k', 'v']]), 1n); // → Map(1) contents, and 1n
```

| Feature | Description |
| --- | --- |
| 🛡️ **Safe serialization** | Circular refs, `Error` + stack + `cause`, `Map`/`Set`/`Date`/`RegExp`/`BigInt`, DOM nodes, throwing getters, depth + size caps |
| 🔒 **Injection-safe** | Every cell is built with `textContent`. Object keys, tag labels and action labels from untrusted data render as text |
| 🚫 **No inline handlers** | One delegated listener and zero `window.__*` globals, so the panel works under `script-src 'self'` |
| 📊 **Table view** | Time · Level · Tags · Message · Actions, with per-level filters and live counts |
| 🔍 **Real search** | Debounced search over the log *data*, so text inside collapsed objects still matches |
| 📌 **Pins** | Pinned rows stay on top, survive `clear()`, are exempt from `maxLogs`, and persist across reloads |
| 💅 **Format specifiers** | `%s %d %i %f %o %O %j %c %%` applied the way browsers do |
| 🌗 **Real themes** | Dark, light, or `auto` following `prefers-color-scheme` and updating live |
| ♿ **Accessible** | Named buttons, `aria-pressed` toggles, a polite live region, focus rings, reduced-motion support |
| 📱 **Mobile-ready** | Full-screen sheet under 640px; pointer-event dragging that works on touch |
| 🔌 **Sinks** | Pipe entries to a server, Sentry, or a test spy. The panel is just one consumer |
| 🪶 **Zero deps** | No runtime dependencies. Tree-shakeable, ESM + CJS + IIFE |

---

## 📦 Install

```bash
npm install candy-logger
```

Or a single self-contained file, no build step:

```html
<script src="https://unpkg.com/candy-logger@2"></script>
<script>
  overrideConsole({ enabled: true });
</script>
```

---

## 🚀 Quick start

### Capture `console.*`

```js
import { overrideConsole } from 'candy-logger';

// Idempotent — safe under React StrictMode and HMR.
const logger = overrideConsole({
  enabled: import.meta.env.DEV,   // or process.env.NODE_ENV !== 'production'
});

console.log('Hello World!');
console.info('User signed in', { userId: 123 });
console.error('Payment failed', new Error('CARD_DECLINED'));
```

### Or use the logger directly

```js
import { createLogger } from 'candy-logger';

const log = createLogger({ enabled: true });

log.log('App started');
log.info('Config loaded', config);
log.debug('Cache hit', { key });
log.success('Build passed!');
log.warn('Rate limit close');
log.error('Uncaught', err);
```

### Shared instance

`candy` is always a real logger — never `null` — so importing it under SSR is safe.
It captures logs immediately; call `attachUI()` when you want to see them.

```js
import candy from 'candy-logger';

candy.log('captured even with no panel');
candy.getLogs();          // → [LogEntry, …]

await candy.attachUI();   // panel appears, backfilled with everything above
```

---

## 🏷️ Tagged logging

```js
log.tagged({ label: 'AUTH', bg: 'rgba(139,92,246,.2)', color: '#a78bfa' },
  'info', 'Token refreshed', { expiresIn: '1h' });

log.tagged([
  { label: 'DB',   bg: 'rgba(234,179,8,.18)',  color: '#eab308' },
  { label: 'SLOW', bg: 'rgba(239,68,68,.18)',  color: '#f87171' }
], 'warn', 'Query took 3.1s', { query: 'SELECT * FROM orders' });
```

Tag colors are validated against a CSS property allowlist, so a color from an API
response can never break out into markup.

---

## ⚙️ Configuration

```js
createLogger({
  enabled: true,               // create the panel (alias: forceUI)
  theme: 'auto',               // 'dark' | 'light' | 'auto'
  position: 'bottom-right',    // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'full-bottom'
  maxLogs: 500,                // ring buffer for UNPINNED rows
  showTimestamp: true,         // show the Time column
  tags: true,                  // show the Tags column
  collapsed: false,            // start minimized
  dimWhenIdle: false,          // fade to 12% until hovered
  persistPins: true,           // save pinned rows to localStorage
  retainArgs: false,           // keep references to logged objects (prevents GC)
  maxDepth: 8,                 // object depth captured
  maxString: 1000,             // chars kept per string
  defaultTags: [{ label: 'v2.1', color: '#7aa2f7' }],
  badgeText: 'DEV',
  actions: [{ label: 'Copy id', icon: '🔗', onClick: (entry) => {} }],
});
```

Every option above does something. v2.0 accepted four (`tableView`, `showTimestamp`,
`tags`, `theme: 'auto'`) that were silently ignored.

---

## 🎯 API

```ts
// Levels
log.log(...args)  log.info(...args)  log.debug(...args)
log.success(...args)  log.warn(...args)  log.error(...args)
log.tagged(tag | tag[], level, ...args)

// Data — works with or without a panel
log.getLogs(): LogEntry[]
log.getStats(): Record<LogLevel | 'all', number>
log.clear(options?: { includePinned?: boolean })

// Panel
await log.attachUI(options?)
log.detachUI()
log.showPanel() / log.hidePanel()

// Console capture
log.captureConsole(): () => void      // returns a disposer
overrideConsole(options?): CandyLogger
restoreConsole()
isConsoleOverridden(): boolean

// Extensibility
log.addSink(sink: Sink): () => void
log.destroy()                          // removes panel, listeners, sinks; restores console
```

### Sinks

The panel is one consumer of the store. Add your own:

```js
const off = log.addSink({
  write(entry) {
    if (entry.level === 'error') {
      navigator.sendBeacon('/api/logs', JSON.stringify(entry));
    }
  },
});
```

A sink that throws can never break the `console.log` call that triggered it.

### Serializer

The serialization primitives are exported, in case you want them on their own:

```ts
import { safeStringify, normalize, serializeError, formatArgs } from 'candy-logger';

safeStringify(anythingAtAll);   // { text, truncated } — never throws
serializeError(err);            // { name, message, stack[], cause?, ...ownProps }
formatArgs(['%s: %d', 'hits', 42]);
```

---

## 🖼️ Framework examples

```jsx
// React / Next.js — src/main.jsx or a client component
import { overrideConsole } from 'candy-logger';
overrideConsole({ enabled: import.meta.env.DEV });
```

```js
// Vue — main.js
import { createApp } from 'vue';
import { overrideConsole } from 'candy-logger';
overrideConsole({ enabled: import.meta.env.DEV });
createApp(App).mount('#app');
```

```ts
// Angular — main.ts
import { overrideConsole } from 'candy-logger';
overrideConsole({ enabled: !environment.production });
```

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { createLogger } from 'candy-logger';
  const log = createLogger({ enabled: true });
  onMount(() => log.success('Ready!'));
  onDestroy(() => log.destroy());
</script>
```

`overrideConsole()` is idempotent, so StrictMode's double-invoke and Fast Refresh
re-runs reuse the same logger instead of stacking panels.

---

## 🔒 Security notes

- **Don't ship the panel to end users.** Gate `enabled` on your dev flag. The logger keeps
  a buffer in memory; anything you log is readable by any script that can reach the instance.
- **Pinned rows are written to `localStorage`** as rendered text so they survive a reload.
  Don't pin rows containing tokens or PII, or set `persistPins: false`. Raw arguments are
  never persisted, and the store is capped at 64 kB.
- **`retainArgs` is off by default.** Arguments are serialized once and then released, so the
  logger doesn't hold your objects (and their DOM subtrees) alive. Turn it on only if a custom
  action needs the live value.
- **Tag colors and `%c` styles** are filtered through a CSS property allowlist.

---

## 📝 TypeScript

```ts
import type {
  LogLevel, LogEntry, LogTag, LogAction,
  CandyLoggerOptions, PanelPosition, PanelTheme, Sink,
} from 'candy-logger';
```

---

## 🛠️ Development

```bash
npm install
npm run build      # tsup → ESM + CJS + IIFE, with .d.ts and sourcemaps
npm test           # vitest (118 tests)
npm run typecheck
npm run demo       # build, then serve demo-ui.html at :4321
```

---

## 📋 Changelog

### v2.1.0 — correctness release

**Fixed**

- `console.log(circularObject)` no longer throws a `TypeError` into the calling code
- `Error` objects render with message, stack, `cause` and custom fields instead of `{}`
- `Map`, `Set`, `Date`, `RegExp`, `BigInt`, `Symbol`, functions and DOM nodes all serialize
- **XSS** via object keys, tag labels/colors, log levels and custom action labels
- Panel is fully functional under a strict CSP — no inline `onclick`, no `window.__candy*` globals
- `overrideConsole()` is idempotent — StrictMode and HMR no longer stack panels or double logs
- `restoreConsole()` can no longer leave `console` permanently hijacked
- Level counters stay accurate past `maxLogs` (previously drifted upward forever)
- Pinned rows are exempt from eviction and no longer silently disappear
- `clear()` keeps pinned rows instead of wiping them from `localStorage`
- Search matches text inside collapsed objects (it searched the DOM before)
- JSON keys and strings are actually highlighted; apostrophes no longer show as `&#039;`
- Light theme defines its own level badge colors (contrast was ~1.6:1)
- Drag works on touch via pointer events, with on-screen clamping
- Corrupt `localStorage` records are skipped individually instead of aborting the batch
- `showTimestamp`, `tags` and `theme: 'auto'` now work (they were accepted and ignored)

**Added**

- `destroy()` on the logger and the panel — removes DOM, listeners and stylesheet
- `captureConsole()` — route `console.*` into an existing logger, returns a disposer
- `addSink()` — pipe entries to a server, Sentry, or a test spy
- `createLogger()`, `attachUI()`, `detachUI()`, `showPanel()`, `hidePanel()`, `isConsoleOverridden()`
- Console format specifiers: `%s %d %i %f %o %O %j %c %%`
- Sticky-bottom scrolling with a “N new” pill instead of yanking you to the bottom
- Exported serializer primitives: `safeStringify`, `normalize`, `serializeError`, `formatArgs`
- Accessibility pass: accessible names, `aria-pressed`, live region, focus rings, reduced motion
- Mobile: full-screen sheet under 640px
- `retainArgs`, `persistPins`, `dimWhenIdle`, `maxDepth`, `maxString` options
- CJS and IIFE builds; `unpkg`/`jsdelivr` now serve a working `<script src>` bundle
- 118 tests

**Changed**

- `getLogs()` / `getStats()` read from the core store, so they work with **no panel**
- The panel is a dynamic import, so bundlers drop it from builds that never enable it
- The panel is **opaque by default**; the old 12%-until-hover behaviour is `dimWhenIdle: true`
- `maxLogs` now bounds *unpinned* rows only
- `window.*` globals moved to the CDN build only; the npm entry is `sideEffects: false`
- Removed `tableView` (there was no alternative view) and the dead v1 `terminal-ui.ts`

**Compatible** — `overrideConsole()`, `restoreConsole()`, `candy`, `CandyLogger`, `tagged()`,
`getLogs()`, `getStats()` and every v2.0 option except `tableView` keep working. `forceUI` is
still accepted as an alias for `enabled`.

### v2.0.0

Browser-only rewrite: table view UI, 6 levels, tags, action buttons, themes, JSON export.

### v1.x (deprecated)

Node.js terminal support. Install `candy-logger@1` if you need it.

---

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome. `npm test` must pass; new behaviour needs a test.

---

Made with 🍬 by [shehari007](https://github.com/shehari007)
