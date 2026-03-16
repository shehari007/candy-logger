# 🍬 Candy Logger v2

A professional, zero-dependency browser logger with a **table-view UI**, tags, color-coded levels, action buttons, dark/light themes, and JSON export — all in one floating panel.

## 🚀 [Live Demo](https://candy-logger.msyb.dev)

> **v2 Breaking Change** — Node.js / terminal support has been removed. Candy Logger is now **browser-only**. If you need the legacy terminal output, stay on `v1.x`.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Table View** | Logs displayed in a structured table (Time, Level, Tags, Message, Actions) |
| 🏷️ **Tags** | Attach custom colored tags (e.g. `AUTH`, `API`, `DB`, `PERF`) to any log |
| 🎨 **6 Log Levels** | `log` · `info` · `debug` · `success` · `warn` · `error` — each color-coded |
| ⚡ **Action Buttons** | Copy, bookmark, delete per row — plus custom actions via config |
| 🌗 **Dark / Light** | Toggle themes on the fly with one-click switch |
| 🔍 **Search & Filter** | Real-time search + filter by level with live counts |
| 💾 **Export** | Download all logs as a `.json` file |
| 📌 **Pin, Drag, Resize** | Pin to stay visible, drag anywhere, resize from corner |
| 📦 **Collapsible JSON** | Large objects auto-collapse with preview; syntax-highlighted |
| 🚀 **Zero Config** | One line to start; just set `forceUI: true` |
| 🪶 **Zero Dependencies** | No runtime deps — just your browser |

---

## 📦 Installation

```bash
npm install candy-logger
```

Or via CDN:

```html
<script type="module">
  import { overrideConsole } from 'https://unpkg.com/candy-logger@latest/dist/index.js';
  overrideConsole({ forceUI: true });
</script>
```

---

## 🚀 Quick Start

### Option 1 — Override Console (Recommended)

Call once in your entry file. Every `console.log/info/warn/error/debug` is automatically captured.

```js
import { overrideConsole } from 'candy-logger';

overrideConsole({ forceUI: true });

// That's it — use console as usual
console.log('Hello World!');
console.info('User signed in', { userId: 123 });
console.warn('Disk usage > 90%');
console.error('Payment failed', { code: 'CARD_DECLINED' });
console.debug('Render took 12ms');
```

### Option 2 — Direct API

```js
import candy from 'candy-logger';

candy.log('App started');
candy.info('Config loaded', config);
candy.debug('Cache hit', { key });
candy.success('Build passed!');
candy.warn('Rate limit close');
candy.error('Uncaught', err);
```

---

## 🏷️ Tagged Logging

Attach one or more tags to any log for easy categorization and filtering.

```js
import { overrideConsole } from 'candy-logger';
const candy = overrideConsole({ forceUI: true });

// Single tag
candy.tagged(
  { label: 'AUTH', bg: 'rgba(139,92,246,.2)', color: '#a78bfa' },
  'info',
  'Token refreshed',
  { expiresIn: '1h' }
);

// Multiple tags
candy.tagged(
  [
    { label: 'DB', bg: 'rgba(234,179,8,.18)', color: '#eab308' },
    { label: 'SLOW', bg: 'rgba(239,68,68,.18)', color: '#f87171' }
  ],
  'warn',
  'Query took 3.1s',
  { query: 'SELECT * FROM orders' }
);
```

---

## ⚙️ Configuration

```js
overrideConsole({
  forceUI: true,               // Show UI even in production
  theme: 'dark',               // 'dark' | 'light' | 'auto'
  position: 'bottom-right',    // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'full-bottom'
  maxLogs: 500,                // Max logs in memory (oldest removed first)
  collapsed: false,            // Start minimized
  defaultTags: [               // Tags applied to every log
    { label: 'v2.0', color: '#7aa2f7' }
  ],
  badgeText: 'DEV',            // Optional badge next to title
});
```

---

## 🖼️ Framework Examples

### React

```jsx
// src/main.jsx
import { overrideConsole } from 'candy-logger';
overrideConsole({ forceUI: true });

// Now use console.log anywhere — it's enhanced!
function App() {
  return <button onClick={() => console.log('Clicked!')}>Click</button>;
}
```

### Vue

```js
// main.js
import { createApp } from 'vue';
import { overrideConsole } from 'candy-logger';
import App from './App.vue';

overrideConsole({ forceUI: true });
createApp(App).mount('#app');
```

### Angular

```ts
// main.ts
import { overrideConsole } from 'candy-logger';
overrideConsole({ forceUI: true });
platformBrowserDynamic().bootstrapModule(AppModule);
```

### Svelte

```svelte
<script>
  import { onMount } from 'svelte';
  import { overrideConsole } from 'candy-logger';
  const candy = overrideConsole({ forceUI: true });

  onMount(() => candy.success('Ready!'));
</script>
```

### Next.js (client only)

```tsx
'use client';
import { useEffect } from 'react';
import { overrideConsole } from 'candy-logger';

export default function Providers({ children }) {
  useEffect(() => { overrideConsole({ forceUI: true }); }, []);
  return <>{children}</>;
}
```

---

## 🎯 API

### Log Methods

```js
candy.log(...args)      // 📝 General log (blue)
candy.info(...args)     // ℹ️  Informational (cyan)
candy.debug(...args)    // 🐛 Debug (purple)
candy.success(...args)  // ✅ Success (green)
candy.warn(...args)     // ⚠️  Warning (amber)
candy.error(...args)    // ❌ Error (red)
```

### Tagged Logging

```js
candy.tagged(tag | tag[], level, ...args)
```

### Console Override

```js
import { overrideConsole, restoreConsole } from 'candy-logger';

const logger = overrideConsole(options);

// ... your code ...

restoreConsole(logger); // Restore original console
```

### Utilities

```js
candy.getStats()   // { all: 10, log: 3, info: 2, ... }
candy.getLogs()    // LogEntry[]
```

---

## 🔧 Showing the UI

The UI is **opt-in** — set `forceUI: true` to display it:

```js
overrideConsole({ forceUI: true });
```

- When `forceUI` is omitted or `false`, logs pass through to the native console with zero overhead
- Works on any domain — localhost, staging, production

---

## 📝 TypeScript

Fully typed. All interfaces are exported:

```ts
import type { LogLevel, LogEntry, LogTag, LogAction, CandyLoggerOptions } from 'candy-logger';
```

---

## 📋 Changelog

### v2.0.0

**🔥 Complete Rewrite — Browser Only**

- Removed all Node.js / terminal support (blessed dependency dropped)
- New **table-view UI** replacing the old list view
- **6 log levels**: added `debug` and `success`
- **Tagged logging** with custom colors
- **Action buttons** per row: copy, bookmark, delete
- **Dark / Light** themes with one-click toggle
- **Export logs** as JSON
- **Configurable position**, max logs, default tags, badge text
- Zero runtime dependencies
- Full TypeScript rewrite with exported types

### v1.x (Deprecated)

Legacy version with Node.js terminal support and list-based browser UI. Install `candy-logger@1` if you need it.

---

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Open an issue or submit a PR.

---

Made with 🍬 by [shehari007](https://github.com/shehari007)
