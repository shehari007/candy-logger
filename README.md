# 🍬 Candy Logger

A beautiful, lightweight logging library for JavaScript/TypeScript with an elegant popup UI for browser and enhanced terminal output for Node.js.

## 🚀 [Live Demo](https://candy-logger.msyb.dev)

Try the interactive demo to see all features in action!

## ✨ Features

- 🎨 **Beautiful Browser UI** - Floating, draggable popup logger (dev mode only)
- 📐 **Resizable UI** - Drag corners to resize the logger (300px-800px × 200px-80vh)
- 🔧 **Force UI Mode** - Show UI in any environment with `forceUI: true`
- 🖥️ **Enhanced Terminal Output** - Colorful, formatted logs in Node.js
- 🔍 **Filter by Level** - Filter logs by type (log, info, warn, error)
- 🔎 **Search Logs** - Real-time log search functionality
- 📋 **Copy to Clipboard** - Easy JSON copying
- 📌 **Pin UI** - Keep the logger visible or auto-fade
- 🎯 **Zero Config** - Works out of the box
- 🚀 **Lightweight** - Minimal performance impact
- 🌐 **Universal** - Works in browser and Node.js

## 📦 Installation

```bash
npm install candy-logger
```

## 🚀 Quick Start

### Browser (React, Vue, Angular, etc.)

**Option 1: Override Console (Recommended)**

All your existing `console.log/info/warn/error` will automatically use Candy Logger:

```javascript
import { overrideConsole } from 'candy-logger';

// Call once in your app entry point (e.g., index.js or App.jsx)
overrideConsole();

// Now use console normally - it's automatically enhanced!
console.log('Hello World!');
console.info('User logged in', { userId: 123 });
console.warn('Low memory');
console.error('API failed', errorObject);
```

**Option 2: Use Directly**

```javascript
import candy from 'candy-logger';

candy.log('Application started');
candy.info('User data', { name: 'John', age: 30 });
candy.warn('Warning message');
candy.error('Error occurred', error);
```

### React Example

```jsx
// src/index.js or src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { overrideConsole } from 'candy-logger';
import App from './App';

// Initialize candy logger once
overrideConsole();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Now use console anywhere in your app
function MyComponent() {
  const handleClick = () => {
    console.log('Button clicked!');
    console.info('User action', { action: 'click', button: 'submit' });
  };

  return <button onClick={handleClick}>Click Me</button>;
}
```

### Node.js / Express Server

```javascript
const express = require('express');
const { overrideConsole } = require('candy-logger');

// Enable in development only
if (process.env.NODE_ENV !== 'production') {
  overrideConsole();
}

const app = express();

app.get('/', (req, res) => {
  console.log('Request received');
  console.info('Request details', { method: req.method, path: req.path });
  res.send('Hello World');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Node.js Scripts (Interactive Terminal UI)

For standalone scripts, you can use the interactive terminal UI:

```javascript
import { createInteractiveLogger } from 'candy-logger';

const logger = createInteractiveLogger();

logger.log('Processing data...');
logger.info('Progress', { completed: 50, total: 100 });
logger.warn('High memory usage');
logger.error('Failed to process item', errorDetails);

// Interactive features:
// - Mouse: Click filter buttons, scroll with wheel
// - Keys: ↑↓ to navigate, Enter to expand/collapse, 1-5 to filter, C to clear, Q to quit
```

## 🎨 UI Features

### Browser UI
- **Auto-fade** - UI fades when not hovering (pin to keep visible)
- **Draggable** - Move the logger anywhere on screen
- **Minimizable** - Collapse to save space
- **Filters** - Show only specific log types
- **Search** - Find logs instantly
- **JSON Formatting** - Auto-formatted with syntax highlighting
- **Copy Buttons** - Copy JSON with one click

### Terminal UI
- **Color-coded** - Different colors for each log level
- **Timestamps** - Automatic timestamps on all logs
- **JSON Formatting** - Pretty-printed JSON objects
- **Interactive Mode** - Full-featured TUI for scripts

## 🎯 API

### Methods

```javascript
candy.log(...args)      // Blue - General logging
candy.info(...args)     // Cyan - Informational messages
candy.warn(...args)     // Yellow - Warnings
candy.error(...args)    // Red - Errors
candy.getStats()        // Get log counts
candy.printStats()      // Print statistics (Node.js only)
```

### Console Override

```javascript
import { overrideConsole, restoreConsole } from 'candy-logger';

// Override console
const logger = overrideConsole();

// Your code here...
console.log('This uses candy logger');

// Restore original console
restoreConsole(logger);
```

## 🔧 Configuration

### Development vs Production

The browser UI **automatically disables in production**:
- Only shows on `localhost`, `127.0.0.1`, or when `NODE_ENV !== 'production'`
- Zero overhead in production builds
- Logs still work but go to regular console

### Interactive Mode (Node.js only)

```javascript
// For servers - DO NOT use interactive mode
overrideConsole(); // ✅ Good

// For standalone scripts - use interactive mode
createInteractiveLogger(); // ✅ Good for scripts
```

⚠️ **Never use interactive mode in servers** - it creates a full-screen UI that blocks your application.

## 📝 TypeScript Support

Fully typed with TypeScript definitions included:

```typescript
import candy, { overrideConsole, createInteractiveLogger } from 'candy-logger';

// All methods are fully typed
candy.log('Hello', { typed: true });
```

## 🌟 Why Candy Logger?

- ✅ **Zero configuration** - Just import and use
- ✅ **Non-intrusive** - Doesn't interfere with your code
- ✅ **Production-safe** - UI auto-disables in production
- ✅ **Beautiful output** - Makes debugging enjoyable
- ✅ **Framework agnostic** - Works with React, Vue, Angular, Express, etc.
- ✅ **Lightweight** - Minimal bundle size impact

## 📋 Changelog

### v1.0.4 (Latest)

**🔧 Critical Bug Fix:**
- Fixed constructor singleton bug in `overrideConsole()` that prevented `forceUI: true` from working properly
- Now correctly creates new logger instances with provided options instead of reusing singleton

### v1.0.3

**🆕 New Features:**
- 📁 **Project Structure** - Organized demo files and documentation

**🔧 Bug Fixes:**
- Fixed directory structure and file organization
- Improved demo page styling and functionality
- Enhanced documentation with demo link

### v1.0.2

**🆕 New Features:**
- 📐 **Resizable UI** - Drag the bottom-right corner to resize the candy logger (300px-800px width, 200px-80vh height)
- 🔧 **Force UI Mode** - New `forceUI` option to bypass development-only restriction
- ⋰ **Resize Handle** - Visual resize indicator in the bottom-right corner

**✨ Enhancements:**
- Dynamic height adjustment when resizing
- Improved minimize behavior (title bar only)
- Better text alignment in search input
- Clean minimized state without background overflow

**Usage:**
```javascript
// Force UI to show in any environment (including production)
overrideConsole({ forceUI: true });

// The logger UI is now fully resizable - just drag the corner!
```

### v1.0.1
- Initial stable release with browser UI and terminal features

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit PRs.

## 📧 Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

Made with 🍬 by shehari007
