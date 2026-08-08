import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogStore } from '../src/core/store.js';
import { CandyLoggerUI } from '../src/ui.js';
import type { CandyLoggerOptions, LogEntry, LogLevel, LogTag } from '../src/core/types.js';
import { formatArgs } from '../src/core/serialize.js';

let store: LogStore;
let ui: CandyLoggerUI;

function mount(options: CandyLoggerOptions = {}) {
  store = new LogStore(options.maxLogs ? { maxLogs: options.maxLogs } : {});
  ui = new CandyLoggerUI(store, options);
  return { store, ui, panel: ui.element! };
}

function push(level: LogLevel, args: unknown[], tags?: LogTag[]): LogEntry {
  const { message, parts, snapshot, truncated, usedSpecifiers } = formatArgs(args);
  const e: LogEntry = {
    id: store.nextId(),
    level,
    message,
    timestamp: new Date(),
    args: [],
    snapshot,
    parts,
    formatted: usedSpecifiers,
    tags,
    search: `${message} ${(tags || []).map((t) => t.label).join(' ')}`.toLowerCase(),
    truncated,
  };
  store.add(e);
  return e;
}

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

afterEach(() => {
  ui?.destroy();
});

describe('injection safety', () => {
  it('renders a malicious OBJECT KEY as text, not markup', () => {
    // The most common call in the wild: console.log(await res.json()).
    const { panel } = mount();
    push('log', [{ '<img src=x onerror=alert(1)>': 1, user: 2, role: 3, extra: 4 }]);
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders a malicious tag LABEL as text', () => {
    const { panel } = mount();
    push('log', ['hi'], [{ label: '<svg onload=alert(1)>' }]);
    expect(panel.querySelector('svg')).toBeNull();
    expect(panel.querySelector('.candy-tag')!.textContent).toBe('<svg onload=alert(1)>');
  });

  it('cannot break out of the style attribute via tag colors', () => {
    const { panel } = mount();
    push('log', ['hi'], [{ label: 'X', bg: 'red" onmouseover="alert(1)', color: 'javascript:alert(1)' }]);
    const tag = panel.querySelector('.candy-tag')! as HTMLElement;
    expect(tag.getAttribute('onmouseover')).toBeNull();
    expect(tag.outerHTML).not.toContain('alert(1)');
  });

  it('dispatches custom actions by index, so an apostrophe in a label is harmless', () => {
    const onClick = vi.fn();
    const { panel } = mount({ actions: [{ label: "Send to Bob's API'),alert(1),('", icon: '🚀', onClick }] });
    push('log', ['hi']);
    const btn = panel.querySelector<HTMLElement>('.candy-abtn--custom')!;
    // Dispatch is by integer index, so the label never reaches a code position.
    // It appears only as inert attribute text (aria-label/title), never as a handler.
    expect(btn.dataset.index).toBe('0');
    expect(btn.getAttribute('onclick')).toBeNull();
    expect(btn.getAttribute('aria-label')).toContain('alert(1)');
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a malicious message body as text', () => {
    const { panel } = mount();
    push('error', ['<script>alert(1)</script>']);
    expect(panel.querySelector('script')).toBeNull();
    expect(panel.textContent).toContain('<script>alert(1)</script>');
  });

  it('whitelists the level before it reaches a class attribute', () => {
    const { panel } = mount();
    push('"><img src=x>' as LogLevel, ['hi']);
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('.candy-level')!.className).toBe('candy-level candy-level--log');
  });
});

describe('CSP compatibility', () => {
  it('emits no inline event handler attributes anywhere', () => {
    const { panel } = mount({ actions: [{ label: 'Run', onClick: () => {} }] });
    push('log', [{ a: 1, b: 2, c: 3, d: 4 }]);
    push('error', [new Error('x').message]);
    for (const el of panel.querySelectorAll('*')) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith('on')).toBe(false);
      }
    }
  });

  it('defines no window.__candy* globals', () => {
    mount();
    push('log', ['hi']);
    const leaked = Object.keys(globalThis).filter((k) => k.startsWith('__candy'));
    expect(leaked).toEqual([]);
  });

  it('row buttons work through the delegated listener', () => {
    const { panel } = mount();
    const e = push('log', ['hi']);
    panel.querySelector<HTMLElement>('.candy-abtn--pin')!.click();
    expect(store.isPinned(e.id)).toBe(true);
    panel.querySelector<HTMLElement>('.candy-abtn--del')!.click();
    expect(store.get(e.id)).toBeUndefined();
  });
});

describe('rendering', () => {
  it('shows an Error with its message, not {}', () => {
    const { panel } = mount();
    const { snapshot } = formatArgs([new Error('checkout failed')]);
    store.add({
      id: store.nextId(),
      level: 'error',
      message: 'x',
      timestamp: new Date(),
      args: [],
      snapshot,
      search: 'checkout failed',
    });
    const text = panel.querySelector('.candy-td--message')!.textContent!;
    expect(text).toContain('Error: checkout failed');
    expect(text).not.toBe('{}');
  });

  it('highlights JSON keys and strings', () => {
    const { panel } = mount();
    push('log', [{ user: 'bob' }]);
    expect(panel.querySelector('.candy-json-key')).not.toBeNull();
    expect(panel.querySelector('.candy-json-string')).not.toBeNull();
  });

  it('renders %c banners as styled text without leaking the CSS', () => {
    const { panel } = mount();
    push('log', ['%cVite%c ready', 'color:#646cff', 'color:inherit']);
    const text = panel.querySelector('.candy-td--message')!.textContent!;
    expect(text).toBe('Vite ready');
    expect(text).not.toContain('color:');
  });

  it('drops the Time column when showTimestamp is false (v2.0 ignored this option)', () => {
    const { panel } = mount({ showTimestamp: false });
    push('log', ['hi']);
    expect(panel.querySelector('.candy-th--time')).toBeNull();
    expect(panel.querySelector('.candy-td--time')).toBeNull();
  });

  it('drops the Tags column when tags is false', () => {
    const { panel } = mount({ tags: false });
    push('log', ['hi']);
    expect(panel.querySelector('.candy-th--tags')).toBeNull();
  });

  it('is opaque by default and only dims when asked', () => {
    const { panel } = mount();
    expect(panel.classList.contains('candy-logger--dim')).toBe(false);
    ui.destroy();
    expect(mount({ dimWhenIdle: true }).panel.classList.contains('candy-logger--dim')).toBe(true);
  });

  it('resolves theme:auto from prefers-color-scheme', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as any);
    const { panel } = mount({ theme: 'auto' });
    expect(panel.classList.contains('candy-logger--light')).toBe(true);
  });
});

describe('search and filters', () => {
  it('finds text inside a collapsed object (v2.0 searched the DOM and missed it)', () => {
    const { panel } = mount();
    const hit = push('log', [{ alpha: 1, beta: 2, gamma: 3, needle: 'findme' }]);
    const miss = push('log', ['unrelated']);
    const input = panel.querySelector<HTMLInputElement>('.candy-search')!;
    input.value = 'findme';
    input.dispatchEvent(new Event('input'));
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(panel.querySelector(`tr[data-id="${hit.id}"]`)!.classList.contains('candy-tr--hidden')).toBe(false);
        expect(panel.querySelector(`tr[data-id="${miss.id}"]`)!.classList.contains('candy-tr--hidden')).toBe(true);
        resolve();
      }, 200);
    });
  });

  it('filters by level and reflects it in aria-pressed', () => {
    const { panel } = mount();
    const err = push('error', ['bad']);
    const log = push('log', ['fine']);
    const btn = panel.querySelector<HTMLElement>('.candy-fbtn[data-level="error"]')!;
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(panel.querySelector(`tr[data-id="${err.id}"]`)!.classList.contains('candy-tr--hidden')).toBe(false);
    expect(panel.querySelector(`tr[data-id="${log.id}"]`)!.classList.contains('candy-tr--hidden')).toBe(true);
  });

  it('keeps the level counters in sync through eviction', () => {
    const { panel } = mount({ maxLogs: 3 });
    for (let i = 0; i < 12; i++) push('warn', [`w${i}`]);
    expect(panel.querySelector('.candy-log-counter')!.textContent).toBe('3');
    expect(panel.querySelector('.candy-fbtn[data-level="warn"] .candy-fcount')!.textContent).toBe('3');
  });
});

describe('pinning', () => {
  it('moves the row into the pinned tbody and back', () => {
    const { panel } = mount();
    const e = push('log', ['pin me']);
    panel.querySelector<HTMLElement>('.candy-abtn--pin')!.click();
    expect(panel.querySelector(`.candy-pinned-body tr[data-id="${e.id}"]`)).not.toBeNull();
    panel.querySelector<HTMLElement>('.candy-abtn--pin')!.click();
    expect(panel.querySelector(`.candy-table-body tr[data-id="${e.id}"]`)).not.toBeNull();
  });

  it('survives eviction pressure and persists across a remount', () => {
    mount({ maxLogs: 3 });
    const e = push('error', ['keep me']);
    store.pin(e.id);
    for (let i = 0; i < 20; i++) push('log', [`noise ${i}`]);
    expect(store.get(e.id)).toBeDefined();

    ui.destroy();
    const remounted = mount({ maxLogs: 3 });
    expect(remounted.panel.textContent).toContain('keep me');
  });

  it('persists only the rendered message, never the raw argument graph', () => {
    mount({ retainArgs: true });
    const e = push('log', [{ user: 'bob' }]);
    e.args = [{ user: 'bob', internalRef: 'do-not-persist' }];
    store.pin(e.id);
    const raw = localStorage.getItem('candy-logger-pins-v21')!;
    const stored = JSON.parse(raw);
    expect(Object.keys(stored[0]).sort()).toEqual(['level', 'message', 'timestamp']);
    expect(raw).not.toContain('do-not-persist');
  });

  it('writes nothing at all when persistPins is false', () => {
    mount({ persistPins: false });
    const e = push('log', [{ accessToken: 'super-secret-token' }]);
    store.pin(e.id);
    expect(localStorage.getItem('candy-logger-pins-v21')).toBeNull();
  });

  it('clear() keeps pinned rows on screen', () => {
    const { panel } = mount();
    const keep = push('error', ['important']);
    store.pin(keep.id);
    push('log', ['noise']);
    panel.querySelector<HTMLElement>('[data-act="clear"]')!.click();
    expect(panel.textContent).toContain('important');
    expect(panel.textContent).not.toContain('noise');
  });

  it('ignores corrupt storage records without losing the good ones', () => {
    localStorage.setItem(
      'candy-logger-pins-v21',
      JSON.stringify([
        { level: 'nope', message: 'bad level', timestamp: new Date().toISOString() },
        { level: 'warn', message: 'bad date', timestamp: 'not-a-date' },
        { level: 'warn', message: 'good one', timestamp: new Date().toISOString() },
      ]),
    );
    const { panel } = mount();
    expect(panel.textContent).toContain('good one');
    expect(panel.textContent).not.toContain('bad level');
    expect(panel.textContent).not.toContain('bad date');
  });
});

describe('accessibility', () => {
  it('gives every button an accessible name', () => {
    const { panel } = mount();
    push('log', ['hi']);
    for (const btn of panel.querySelectorAll('button')) {
      const name = btn.getAttribute('aria-label') || btn.textContent?.trim();
      expect(name, btn.outerHTML).toBeTruthy();
    }
  });

  it('hides decorative emoji from screen readers', () => {
    const { panel } = mount();
    push('log', ['hi']);
    const glyph = panel.querySelector('.candy-abtn span')!;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the log body as a polite live region', () => {
    const { panel } = mount();
    expect(panel.querySelector('.candy-table-body')!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('lifecycle', () => {
  it('destroy() removes the panel and the stylesheet', () => {
    mount();
    expect(document.querySelector('.candy-logger')).not.toBeNull();
    ui.destroy();
    expect(document.querySelector('.candy-logger')).toBeNull();
    expect(document.getElementById('candy-logger-styles-v21')).toBeNull();
  });

  it('destroy() detaches from the store', () => {
    mount();
    ui.destroy();
    expect(() => push('log', ['after destroy'])).not.toThrow();
  });

  it('destroy() is safe to call twice', () => {
    mount();
    ui.destroy();
    expect(() => ui.destroy()).not.toThrow();
  });

  it('backfills entries logged before the panel attached', () => {
    store = new LogStore();
    push('log', ['logged first']);
    push('warn', ['and second']);
    ui = new CandyLoggerUI(store, {});
    expect(ui.element!.textContent).toContain('logged first');
    expect(ui.element!.textContent).toContain('and second');
    expect(ui.element!.querySelector('.candy-log-counter')!.textContent).toBe('2');
  });
});
