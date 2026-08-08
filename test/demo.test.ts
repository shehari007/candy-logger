import { readFileSync, existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Drives the real demo page against the real built bundle, so a change to either
 * the library or the demo cannot silently break the thing people evaluate first.
 * Requires `npm run build` to have produced dist/candy-logger.global.js.
 */
const BUNDLE = 'dist/candy-logger.global.js';
const hasBuild = existsSync(BUNDLE);

const win = () => globalThis as any;

function loadDemo() {
  const html = readFileSync('demo-ui.html', 'utf8');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
  // Evaluate the shipped bundle, then the demo controller, exactly as the page does.
  new Function(readFileSync(BUNDLE, 'utf8'))();
  new Function(readFileSync('demo.js', 'utf8'))();
}

const click = (sel: string) => document.querySelector<HTMLElement>(sel)!.click();
const panel = () => document.querySelector('.candy-logger');
const panelText = () => panel()?.textContent ?? '';

describe.skipIf(!hasBuild)('demo page', () => {
  beforeAll(() => {
    localStorage.clear();
    loadDemo();
  });

  it('has no inline <script> left in the HTML (works under a strict CSP)', () => {
    expect(readFileSync('demo-ui.html', 'utf8')).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });

  it('exposes the documented window globals', () => {
    for (const g of ['candy', 'CandyLogger', 'createLogger', 'overrideConsole', 'restoreConsole']) {
      expect(typeof win()[g], g).not.toBe('undefined');
    }
  });

  it('defines no legacy window.__candy* globals', () => {
    expect(Object.keys(win()).filter((k) => k.startsWith('__candy'))).toEqual([]);
  });

  it('launches a panel with seeded rows', () => {
    click('#demo-start');
    expect(panel()).not.toBeNull();
    expect(document.querySelectorAll('.candy-table-body .candy-tr').length).toBe(5);
  });

  it('renders the values that used to break v2.0', () => {
    click('[data-demo="circular"]');
    click('[data-demo="error"]');
    click('[data-demo="bigint"]');
    click('[data-demo="fmt-basic"]');

    // Errors and formatted text render inline in the Message cell...
    expect(panelText()).toContain('TypeError');
    expect(panelText()).toContain("reading 'total'");
    expect(panelText()).toContain('Alice scored 42 points');

    // ...while objects collapse to a preview, so expand every row to see the JSON.
    for (const t of document.querySelectorAll<HTMLElement>('.candy-json-toggle')) t.click();
    expect(panelText()).toContain('[Circular]');
    expect(panelText()).toContain('90071992547409911n');
    expect(document.querySelectorAll('.candy-detail-row').length).toBeGreaterThan(0);
  });

  it('applies %c as style, not as visible text', () => {
    click('[data-demo="fmt-css"]');
    expect(panelText()).toContain('CANDY');
    expect(panelText()).not.toContain('border-radius:4px');
  });

  it('renders the hostile payloads inertly', () => {
    click('[data-demo="xss-key"]');
    click('[data-demo="xss-tag"]');
    click('[data-demo="xss-msg"]');
    expect(panel()!.querySelector('img')).toBeNull();
    expect(panel()!.querySelector('script')).toBeNull();
    expect(panel()!.querySelector('svg')).toBeNull();
    expect(panelText()).toContain('onerror'); // present as text, not as an attribute

    let inlineHandlers = 0;
    for (const el of panel()!.querySelectorAll('*')) {
      for (const a of Array.from(el.attributes)) if (a.name.startsWith('on')) inlineHandlers++;
    }
    expect(inlineHandlers).toBe(0);
  });

  it('keeps exactly one panel when console capture is installed twice', () => {
    click('[data-demo="override"]');
    expect(document.querySelectorAll('.candy-logger').length).toBe(1);
    const before = document.querySelectorAll('.candy-tr').length;
    console.log('routed through the panel');
    expect(document.querySelectorAll('.candy-tr').length).toBe(before + 1); // once, not twice
    click('[data-demo="restore"]');
  });

  // Runs last: the burst fills the ring buffer and evicts everything above.
  it('every demo button runs without throwing', () => {
    const buttons = [...document.querySelectorAll<HTMLElement>('[data-demo],[data-fire]')];
    expect(buttons.length).toBeGreaterThan(25);
    const failures: string[] = [];
    for (const b of buttons) {
      const id = b.dataset.demo || b.dataset.fire!;
      if (id === 'stream') continue; // starts an interval
      try {
        b.click();
      } catch (e) {
        failures.push(`${id}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    expect(document.querySelectorAll('.candy-logger').length).toBe(1);
  });

  it('rebuild() replaces rather than stacks panels', () => {
    click('#rebuild');
    expect(document.querySelectorAll('.candy-logger').length).toBe(1);
  });

  it('destroy() removes the panel and its stylesheet', () => {
    click('#destroy');
    expect(document.querySelectorAll('.candy-logger').length).toBe(0);
    expect(document.getElementById('candy-logger-styles-v21')).toBeNull();
  });
});
