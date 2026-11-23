// React / Next.js
//
// overrideConsole() is idempotent, so StrictMode's double-invoke and Fast Refresh
// re-runs reuse the same logger instead of stacking panels.
import { Component, useEffect } from 'react';
import { overrideConsole } from 'candy-logger';

// Call once, as high in the tree as possible (main.jsx / a client component).
const logger = overrideConsole({
  enabled: import.meta.env.DEV, // Next.js: process.env.NODE_ENV !== 'production'
  theme: 'auto',
  badgeText: 'DEV',
  defaultTags: [{ label: 'WEB', color: '#2563eb' }],
});

export default function App() {
  useEffect(() => {
    logger.success('React app started');

    // Errors keep their message, stack and custom fields — not `{}`.
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => console.info('Profile loaded', data))
      .catch((err) => console.error('Profile request failed', err));
  }, []);

  return (
    <button
      onClick={() => {
        logger.tagged({ label: 'UI', bg: 'rgba(99,102,241,.15)', color: '#818cf8' }, 'info', 'Button clicked', {
          component: 'App',
        });
      }}
    >
      Log something
    </button>
  );
}

// Error boundaries pair well with the panel:
export class LoggingErrorBoundary extends Component {
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error, info) {
    logger.error('React tree crashed', error, { componentStack: info.componentStack });
  }
  render() {
    return this.state?.crashed ? <p>Something went wrong.</p> : this.props.children;
  }
}
