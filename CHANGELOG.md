# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [2.2.0] - 2026-11-23

A redesign of the panel, plus fixes found while doing it. The public API is
unchanged apart from two new options.

### Changed

- New panel design. Emoji glyphs are replaced with SVG icons, the palette is
  neutral, and warning and error rows are tinted the way browser devtools tint them.
- Row actions (copy, tag, pin, delete) appear when you hover or focus a row,
  instead of sitting on every row. They are always visible on touch screens.
- Messages wrap instead of being cut off with an ellipsis. Previously the row
  height jumped whenever the pointer moved across it.
- Short objects (up to about 100 characters of JSON) are shown inline. Longer
  ones collapse to a preview such as `{ meta, data }`.
- Timestamps include milliseconds (`14:32:08.112`). Phones show `HH:MM:SS` only.
- An expanded `Error` shows its stack as plain lines, with custom fields such as
  `code` or `cause` underneath as JSON.
- Minimizing shrinks the panel to a small bar showing the log count and error count.
- The "keep panel visible" button is only shown when `dimWhenIdle` is on, since
  it does nothing otherwise.
- Tags added from a row are edited in the Tags column and use the neutral tag style.

### Added

- `persistLayout` option (default `true`). The panel remembers where you dragged
  it, its size, whether it was minimized and the theme picked in the panel. A
  saved value is ignored once you change the matching option in code.
- `nonce` option, applied to the injected `<style>` element for a CSP without
  `'unsafe-inline'` styles.
- An error count in the header, visible even when the panel is minimized.
- "No matching logs" message when a filter or search hides every row.
- Escape clears the search box. Double-clicking the header minimizes the panel.

### Fixed

- Calling `detachUI()` while the panel chunk was still loading no longer leaves
  a panel on screen afterwards.
- A failed panel chunk load no longer stops later `attachUI()` calls from retrying.
- Copy buttons work on plain-HTTP origins (for example a dev server opened on a
  phone over the LAN), where `navigator.clipboard` does not exist.
- Export downloads work in Firefox.
- Host-page CSS such as `table { min-width: … }` or `button { padding: … }` no
  longer leaks into the panel.
- Passing an option as `undefined` no longer overrides its default.
- A `full-bottom` panel can no longer be dragged out of its docked layout.
- The "N new" counter only counts rows that pass the current filter.
- Auto-scroll is batched to once per frame, so a burst of logs costs one layout.

## [2.1.0]

A correctness release.

### Fixed

- `console.log(circularObject)` no longer throws a `TypeError` into the calling code.
- `Error` objects render with message, stack, `cause` and custom fields instead of `{}`.
- `Map`, `Set`, `Date`, `RegExp`, `BigInt`, `Symbol`, functions and DOM nodes serialize.
- XSS via object keys, tag labels and colors, log levels and custom action labels.
- The panel works under a strict CSP: no inline `onclick`, no `window.__candy*` globals.
- `overrideConsole()` is idempotent, so StrictMode and HMR no longer stack panels or double logs.
- `restoreConsole()` can no longer leave `console` permanently hijacked.
- Level counters stay accurate past `maxLogs`.
- Pinned rows are exempt from eviction.
- `clear()` keeps pinned rows instead of wiping them from `localStorage`.
- Search matches text inside collapsed objects.
- JSON keys and strings are highlighted; apostrophes no longer show as `&#039;`.
- The light theme defines its own level colors (contrast was about 1.6:1).
- Dragging works on touch screens via pointer events, and stays on screen.
- Corrupt `localStorage` records are skipped one by one instead of aborting the batch.
- `showTimestamp`, `tags` and `theme: 'auto'` work (they were accepted and ignored).

### Added

- `destroy()` on the logger and the panel.
- `captureConsole()`, `addSink()`, `createLogger()`, `attachUI()`, `detachUI()`,
  `showPanel()`, `hidePanel()` and `isConsoleOverridden()`.
- Console format specifiers: `%s %d %i %f %o %O %j %c %%`.
- Sticky-bottom scrolling with an "N new" button.
- Exported serializer functions: `safeStringify`, `normalize`, `serializeError`, `formatArgs`.
- `retainArgs`, `persistPins`, `dimWhenIdle`, `maxDepth` and `maxString` options.
- CommonJS and IIFE builds; `unpkg` and `jsdelivr` serve a working `<script>` bundle.

### Changed

- `getLogs()` and `getStats()` read from the core store, so they work with no panel.
- The panel is loaded with a dynamic import, so bundlers can leave it out.
- The panel is opaque by default; the old fade-until-hover is `dimWhenIdle: true`.
- `maxLogs` bounds unpinned rows only.
- `window.*` globals are defined by the CDN build only; the npm entry is side-effect free.
- Removed `tableView` and the unused v1 terminal UI.

## [2.0.0]

Browser-only rewrite: table view, six levels, tags, row actions, themes and JSON export.

## 1.x

Node.js terminal logger. Deprecated; install `candy-logger@1` if you need it.

[2.2.0]: https://github.com/shehari007/candy-logger/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/shehari007/candy-logger/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/shehari007/candy-logger/releases/tag/v2.0.0
