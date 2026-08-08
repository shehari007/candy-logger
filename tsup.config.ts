import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // npm entry: ESM + CJS. The panel is a dynamic import, so a bundler can drop
    // it entirely from builds that never call attachUI().
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    outDir: 'dist',
    target: 'es2020',
    dts: true,
    sourcemap: true,
    splitting: true,
    clean: true,
    treeshake: true,
  },
  {
    // Classic <script src> / unpkg build: one self-contained minified file.
    // tsup appends ".global.js" for the iife format → dist/candy-logger.global.js
    entry: { 'candy-logger': 'src/global.ts' },
    format: ['iife'],
    // Deliberately not "CandyLogger": tsup emits `var <globalName> = (...)` which
    // would overwrite the class that global.ts assigns to window.CandyLogger.
    globalName: 'CandyLoggerBundle',
    outDir: 'dist',
    target: 'es2020',
    dts: false,
    sourcemap: true,
    minify: true,
    treeshake: true,
  },
]);
