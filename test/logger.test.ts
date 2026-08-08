import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandyLogger, createLogger, isConsoleOverridden, overrideConsole, restoreConsole } from '../src/index.js';

afterEach(() => {
  if (isConsoleOverridden()) restoreConsole();
});

describe('CandyLogger does not break the host app', () => {
  it('never throws on a circular argument (the v2.0 console.log crash)', () => {
    const logger = createLogger();
    const circular: any = { name: 'user' };
    circular.self = circular;
    expect(() => logger.log('state', circular)).not.toThrow();
    expect(logger.getLogs()[0].message).toContain('[Circular]');
  });

  it.each([
    ['BigInt payload', { id: 1n }],
    ['Map', new Map([['k', 'v']])],
    ['Set', new Set([1])],
    ['Symbol', Symbol('x')],
    ['function', () => {}],
    ['undefined', undefined],
    ['null', null],
  ])('never throws on %s', (_label, value) => {
    const logger = createLogger();
    expect(() => logger.log(value)).not.toThrow();
    expect(logger.getLogs()).toHaveLength(1);
  });

  it('captures Errors with message and stack instead of {}', () => {
    const logger = createLogger();
    logger.error(new Error('payment failed'));
    const snap: any = logger.getLogs()[0].snapshot[0];
    expect(snap.name).toBe('Error');
    expect(snap.message).toBe('payment failed');
    expect(snap.stack.length).toBeGreaterThan(0);
  });

  it('still forwards the ORIGINAL objects to the native console', async () => {
    // The native methods are captured once at module load and cached on a global
    // symbol — that is what stops a second overrideConsole() from wrapping a
    // wrapper. So the spy has to be installed before the module is (re)loaded.
    delete (globalThis as any)[Symbol.for('candy-logger.native-console')];
    vi.resetModules();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const fresh = await import('../src/index.js');
      const obj = { a: 1 };
      fresh.createLogger().log('msg', obj);
      // Not a serialized copy — the real object, so devtools stays fully inspectable.
      expect(spy).toHaveBeenCalledWith('msg', obj);
      expect(spy.mock.calls[0][1]).toBe(obj);
    } finally {
      spy.mockRestore();
      delete (globalThis as any)[Symbol.for('candy-logger.native-console')];
      vi.resetModules();
    }
  });
});

describe('headless capture', () => {
  it('getLogs()/getStats() work with no panel (v2.0 returned [] and {})', () => {
    const logger = createLogger();
    logger.log('a');
    logger.warn('b');
    logger.error('c');
    expect(logger.getLogs()).toHaveLength(3);
    expect(logger.getStats()).toMatchObject({ all: 3, log: 1, warn: 1, error: 1 });
  });

  it('does not retain the caller objects by default', () => {
    const logger = createLogger();
    const big = { payload: 'x'.repeat(100) };
    logger.log(big);
    expect(logger.getLogs()[0].args).toEqual([]);
  });

  it('retains them when retainArgs is on', () => {
    const logger = createLogger({ retainArgs: true });
    const big = { payload: 1 };
    logger.log(big);
    expect(logger.getLogs()[0].args[0]).toBe(big);
  });

  it('respects maxLogs', () => {
    const logger = createLogger({ maxLogs: 5 });
    for (let i = 0; i < 50; i++) logger.log(i);
    expect(logger.getLogs()).toHaveLength(5);
    expect(logger.getStats().all).toBe(5);
  });

  it('applies defaultTags and tagged() tags', () => {
    const logger = createLogger({ defaultTags: [{ label: 'APP' }] });
    logger.tagged({ label: 'AUTH' }, 'info', 'token refreshed');
    expect(logger.getLogs()[0].tags?.map((t) => t.label)).toEqual(['APP', 'AUTH']);
  });

  it('falls back to log for an invalid level from JS callers', () => {
    const logger = createLogger();
    (logger as any).tagged({ label: 'X' }, '<img src=x>', 'hi');
    expect(logger.getLogs()[0].level).toBe('log');
  });

  it('indexes tags into the search haystack', () => {
    const logger = createLogger();
    logger.tagged({ label: 'DATABASE' }, 'warn', 'slow query');
    expect(logger.getLogs()[0].search).toContain('database');
  });
});

describe('sinks', () => {
  it('delivers entries and returns a disposer', () => {
    const logger = createLogger();
    const write = vi.fn();
    const off = logger.addSink({ write });
    logger.log('one');
    off();
    logger.log('two');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('a throwing sink cannot break the log call', () => {
    const logger = createLogger();
    logger.addSink({
      write() {
        throw new Error('sink down');
      },
    });
    expect(() => logger.log('still fine')).not.toThrow();
    expect(logger.getLogs()).toHaveLength(1);
  });
});

describe('overrideConsole', () => {
  it('routes console.log through the logger', () => {
    const logger = overrideConsole();
    console.log('captured');
    expect(logger.getLogs().some((l) => l.message === 'captured')).toBe(true);
  });

  it('is idempotent — a second call returns the same logger (StrictMode / HMR)', () => {
    const a = overrideConsole();
    const b = overrideConsole();
    expect(b).toBe(a);
    console.log('once');
    expect(a.getLogs().filter((l) => l.message === 'once')).toHaveLength(1);
  });

  it('restores the real console, not another wrapper', () => {
    const pristine = console.log;
    overrideConsole();
    expect(console.log).not.toBe(pristine);
    restoreConsole();
    expect(isConsoleOverridden()).toBe(false);
    expect(() => console.log('back to normal')).not.toThrow();
  });

  it('console.log(circular) does not throw once installed', () => {
    overrideConsole();
    const circular: any = {};
    circular.self = circular;
    expect(() => console.log(circular)).not.toThrow();
  });

  it('does not double-capture after restore + re-override', () => {
    const first = overrideConsole();
    restoreConsole();
    const second = overrideConsole();
    console.log('single');
    expect(second.getLogs().filter((l) => l.message === 'single')).toHaveLength(1);
    expect(first.getLogs().some((l) => l.message === 'single')).toBe(false);
  });
});

describe('captureConsole', () => {
  it('routes console into an existing logger', () => {
    const logger = createLogger();
    logger.captureConsole();
    console.log('into this one');
    expect(logger.getLogs().some((l) => l.message === 'into this one')).toBe(true);
  });

  it('is idempotent for the same logger', () => {
    const logger = createLogger();
    logger.captureConsole();
    logger.captureConsole();
    console.log('once only');
    expect(logger.getLogs().filter((l) => l.message === 'once only')).toHaveLength(1);
  });

  it('hands over cleanly between two loggers instead of nesting wrappers', () => {
    const first = createLogger();
    const second = createLogger();
    first.captureConsole();
    second.captureConsole();
    console.log('to the second');
    expect(second.getLogs().some((l) => l.message === 'to the second')).toBe(true);
    expect(first.getLogs().some((l) => l.message === 'to the second')).toBe(false);
  });

  it('returns a disposer that restores the console', () => {
    const logger = createLogger();
    const restore = logger.captureConsole();
    restore();
    console.log('not captured');
    expect(isConsoleOverridden()).toBe(false);
    expect(logger.getLogs()).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('destroy() stops capture and clears the store', () => {
    const logger = new CandyLogger();
    logger.log('before');
    logger.destroy();
    logger.log('after');
    expect(logger.getLogs()).toHaveLength(0);
  });

  it('destroy() restores console when it owns the override', () => {
    const logger = overrideConsole();
    logger.destroy();
    expect(isConsoleOverridden()).toBe(false);
  });

  it('clear() keeps the logger usable', () => {
    const logger = createLogger();
    logger.log('a');
    logger.clear();
    logger.log('b');
    expect(logger.getLogs().map((l) => l.message)).toEqual(['b']);
  });
});
