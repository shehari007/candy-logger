import { describe, expect, it, vi } from 'vitest';
import { LogStore, type StoreEvent } from '../src/core/store.js';
import type { LogEntry, LogLevel } from '../src/core/types.js';

function entry(store: LogStore, level: LogLevel = 'log', message = 'm'): LogEntry {
  return {
    id: store.nextId(),
    level,
    message,
    timestamp: new Date(),
    args: [],
    snapshot: [message],
    search: message.toLowerCase(),
  };
}

describe('LogStore retention', () => {
  it('decrements counts on eviction (v2.0 only ever incremented)', () => {
    const store = new LogStore({ maxLogs: 3 });
    for (let i = 0; i < 10; i++) store.add(entry(store, 'error'));
    expect(store.size).toBe(3);
    expect(store.counts().all).toBe(3);
    expect(store.counts().error).toBe(3);
  });

  it('evicts the oldest UNPINNED entry, never a pinned one', () => {
    const store = new LogStore({ maxLogs: 3 });
    const first = entry(store, 'warn', 'keep me');
    store.add(first);
    store.pin(first.id);
    for (let i = 0; i < 20; i++) store.add(entry(store, 'log', `noise ${i}`));

    expect(store.size).toBe(4); // 1 pinned + 3 unpinned
    expect(store.isPinned(first.id)).toBe(true);
    expect(store.get(first.id)?.message).toBe('keep me');
    expect(store.counts().warn).toBe(1);
  });

  it('emits evict with the id of the entry actually removed', () => {
    const store = new LogStore({ maxLogs: 2 });
    const events: StoreEvent[] = [];
    store.subscribe((e) => events.push(e));
    const a = entry(store, 'log', 'a');
    store.add(a);
    store.add(entry(store, 'log', 'b'));
    store.add(entry(store, 'log', 'c'));
    const evicted = events.filter((e) => e.type === 'evict');
    expect(evicted).toHaveLength(1);
    expect((evicted[0] as any).id).toBe(a.id);
  });

  it('pinned rows do not consume the maxLogs budget', () => {
    const store = new LogStore({ maxLogs: 2, maxPins: 3 });
    for (let i = 0; i < 3; i++) {
      const e = entry(store, 'error', `pinned ${i}`);
      store.add(e);
      store.pin(e.id);
    }
    for (let i = 0; i < 20; i++) store.add(entry(store, 'log', `noise ${i}`));
    // 3 pinned + 2 unpinned — a full pin set never starves the live log.
    expect(store.size).toBe(5);
    expect(store.counts().error).toBe(3);
    expect(store.counts().log).toBe(2);
  });

  it('caps pins at maxPins', () => {
    const store = new LogStore({ maxLogs: 100, maxPins: 2 });
    const ids = [0, 1, 2].map(() => {
      const e = entry(store);
      store.add(e);
      return e.id;
    });
    expect(store.pin(ids[0])).toBe(true);
    expect(store.pin(ids[1])).toBe(true);
    expect(store.pin(ids[2])).toBe(false);
  });

  it('re-evicts once an entry is unpinned', () => {
    const store = new LogStore({ maxLogs: 2 });
    const keep = entry(store, 'warn', 'keep');
    store.add(keep);
    store.pin(keep.id);
    store.add(entry(store, 'log', 'a'));
    store.add(entry(store, 'log', 'b'));
    expect(store.size).toBe(3);
    store.unpin(keep.id);
    expect(store.size).toBe(2);
    expect(store.get(keep.id)).toBeUndefined();
  });
});

describe('LogStore mutation', () => {
  it('clear() keeps pinned entries by default', () => {
    const store = new LogStore();
    const pinned = entry(store, 'error', 'important');
    store.add(pinned);
    store.pin(pinned.id);
    store.add(entry(store, 'log', 'noise'));

    store.clear();
    expect(store.size).toBe(1);
    expect(store.get(pinned.id)).toBeDefined();
    expect(store.counts().error).toBe(1);
    expect(store.counts().log).toBe(0);
  });

  it('clear({ includePinned: true }) drops everything', () => {
    const store = new LogStore();
    const e = entry(store);
    store.add(e);
    store.pin(e.id);
    store.clear({ includePinned: true });
    expect(store.size).toBe(0);
    expect(store.counts().all).toBe(0);
  });

  it('remove() updates counts and unpins', () => {
    const store = new LogStore();
    const e = entry(store, 'warn');
    store.add(e);
    store.pin(e.id);
    expect(store.remove(e.id)).toBeTruthy();
    expect(store.counts().warn).toBe(0);
    expect(store.isPinned(e.id)).toBe(false);
    expect(store.remove(e.id)).toBeNull();
  });

  it('a throwing subscriber cannot break the log call', () => {
    const store = new LogStore();
    store.subscribe(() => {
      throw new Error('bad sink');
    });
    const ok = vi.fn();
    store.subscribe(ok);
    expect(() => store.add(entry(store))).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });

  it('unsubscribe stops delivery', () => {
    const store = new LogStore();
    const spy = vi.fn();
    const off = store.subscribe(spy);
    store.add(entry(store));
    off();
    store.add(entry(store));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
