// Vue 3 — Candy Logger v2.1
import { createApp } from 'vue';
import { overrideConsole } from 'candy-logger';
import App from './App.vue';

const logger = overrideConsole({
  enabled: import.meta.env.DEV,
  theme: 'auto',
  position: 'bottom-right',
  badgeText: 'VUE',
});

const app = createApp(App);

// Route Vue's own error and warning handlers into the panel.
app.config.errorHandler = (err, instance, info) => {
  logger.error('Vue error', err, { info, component: instance?.$options?.name });
};
app.config.warnHandler = (msg, instance, trace) => {
  logger.warn('Vue warning', { msg, trace });
};

app.mount('#app');

// Optional: expose it for ad-hoc use from the browser console.
if (import.meta.env.DEV) window.$log = logger;
