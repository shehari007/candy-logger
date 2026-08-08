import { describe, expect, it } from 'vitest';
import {
  formatArgs,
  normalize,
  previewOf,
  safeStringify,
  serializeError,
  tokenizeJson,
} from '../src/core/serialize.js';

describe('safeStringify — never throws', () => {
  it('handles a circular object instead of throwing (v2.0 crashed console.log here)', () => {
    const a: any = { name: 'user' };
    a.self = a;
    expect(() => safeStringify(a)).not.toThrow();
    expect(safeStringify(a).text).toContain('[Circular]');
  });

  it('handles BigInt, which raw JSON.stringify refuses to serialize', () => {
    expect(() => JSON.stringify({ id: 1n })).toThrow();
    expect(safeStringify({ id: 1n }).text).toBe('{"id":"1n"}');
  });

  it('survives a getter that throws', () => {
    const obj = {
      ok: 1,
      get boom() {
        throw new Error('nope');
      },
    };
    expect(safeStringify(obj).text).toContain('[Throws]');
  });

  it('survives a toJSON that throws', () => {
    const obj = {
      a: 1,
      toJSON() {
        throw new Error('nope');
      },
    };
    expect(() => safeStringify(obj)).not.toThrow();
    expect(safeStringify(obj).text).toContain('"a":1');
  });

  it('does not flag a repeated sibling reference as circular', () => {
    const shared = { v: 1 };
    const text = safeStringify({ a: shared, b: shared }).text;
    expect(text).not.toContain('[Circular]');
  });

  it('caps depth and reports truncation', () => {
    let deep: any = { end: true };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    const r = safeStringify(deep, { maxDepth: 4 });
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('[Object]');
  });

  it('truncates long strings and flags it', () => {
    const r = normalize({ blob: 'x'.repeat(5000) }, { maxString: 100 });
    expect(r.truncated).toBe(true);
    expect((r.value as any).blob).toMatch(/\+4900 chars/);
  });

  it('caps very large collections', () => {
    const r = normalize(Array.from({ length: 5000 }, (_, i) => i), { maxItems: 10 });
    expect(r.truncated).toBe(true);
    expect((r.value as unknown[]).length).toBe(11); // 10 items + the "more" marker
  });

  it('uses own enumerable keys only — never walks the prototype chain', () => {
    class Foo {}
    Object.defineProperty(Foo.prototype, 'inherited', { get: () => 42, enumerable: true });
    const f: any = new Foo();
    f.own = 1;
    const text = safeStringify(f).text;
    expect(text).toContain('own');
    expect(text).not.toContain('inherited');
  });
});

describe('exotic values render as something useful, not {}', () => {
  it('serializes an Error with name, message and stack', () => {
    // The v2.0 bug: message/stack are non-enumerable, so JSON.stringify gives '{}'.
    expect(JSON.stringify(new Error('boom'))).toBe('{}');
    const out = serializeError(new Error('boom'));
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(Array.isArray(out.stack)).toBe(true);
    expect(out.stack!.length).toBeGreaterThan(0);
  });

  it('keeps custom error fields and cause', () => {
    const err: any = new Error('failed', { cause: new Error('root') });
    err.code = 'E_CARD';
    const out = serializeError(err);
    expect(out.code).toBe('E_CARD');
    expect(out.cause).toBeDefined();
  });

  it('serializes a nested Error inside a payload', () => {
    const text = safeStringify({ err: new TypeError('bad input') }).text;
    expect(text).toContain('TypeError');
    expect(text).toContain('bad input');
  });

  it.each([
    [new Date(0), '1970-01-01T00:00:00.000Z'],
    [new Date('nope'), 'Invalid Date'],
    [/ab+c/gi, '/ab+c/gi'],
    [undefined, '[undefined]'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [10n, '10n'],
  ])('normalizes %s', (input, expected) => {
    expect(normalize(input).value).toBe(expected);
  });

  it('serializes Map and Set with their contents', () => {
    expect(safeStringify(new Map([['a', 1]])).text).toContain('"entries":[["a",1]]');
    expect(safeStringify(new Set([1, 2])).text).toContain('"values":[1,2]');
  });

  it('names functions', () => {
    function namedFn() {}
    expect(normalize(namedFn).value).toBe('[Function: namedFn]');
  });

  it('summarises a DOM node without enumerating its layout getters', () => {
    const div = document.createElement('div');
    div.id = 'app';
    div.className = 'a b';
    expect(normalize(div).value).toBe('<div#app.a.b>');
  });
});

describe('console format specifiers', () => {
  it('substitutes %s and %d instead of printing them literally', () => {
    expect(formatArgs(['%s scored %d points', 'Alice', 42]).message).toBe('Alice scored 42 points');
  });

  it('marks that a template was used', () => {
    expect(formatArgs(['%s!', 'hi']).usedSpecifiers).toBe(true);
    expect(formatArgs(['plain', 'text']).usedSpecifiers).toBe(false);
  });

  it('handles %i, %f, %o and %%', () => {
    expect(formatArgs(['%i', 3.9]).message).toBe('3');
    expect(formatArgs(['%f', 3.5]).message).toBe('3.5');
    expect(formatArgs(['%o', { a: 1 }]).message).toBe('{"a":1}');
    expect(formatArgs(['100%%']).message).toBe('100%');
  });

  it('turns %c into a style bag rather than leaking CSS into the text', () => {
    const r = formatArgs(['%cBanner', 'color:red;font-weight:bold']);
    expect(r.message).toBe('Banner');
    expect(r.parts[0].style).toEqual({ color: 'red', 'font-weight': 'bold' });
  });

  it('appends leftover arguments like the browser does', () => {
    expect(formatArgs(['%s', 'a', 'b']).message).toBe('a b');
  });

  it('prints the specifier literally when no argument is left', () => {
    expect(formatArgs(['%s %s', 'only']).message).toBe('only %s');
  });

  it('joins plain arguments without a template', () => {
    expect(formatArgs(['count', 5, { a: 1 }]).message).toBe('count 5 {"a":1}');
  });
});

describe('tokenizeJson', () => {
  it('highlights keys and strings (v2.0 escaped first, so these never matched)', () => {
    const tokens = tokenizeJson('{"user": "bob", "n": 42, "ok": true, "z": null}');
    const types = tokens.map((t) => t.type);
    expect(types).toContain('key');
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    expect(types).toContain('null');
  });

  it('round-trips the exact input text', () => {
    const json = JSON.stringify({ a: [1, 'two', false, null] }, null, 2);
    expect(tokenizeJson(json).map((t) => t.text).join('')).toBe(json);
  });

  it('does not mangle apostrophes', () => {
    const json = JSON.stringify({ msg: "it's fine" });
    expect(tokenizeJson(json).map((t) => t.text).join('')).toBe(json);
  });
});

describe('previewOf', () => {
  it('summarises objects and arrays', () => {
    expect(previewOf({ a: 1, b: 2 })).toBe('{ a, b }');
    expect(previewOf({ a: 1, b: 2, c: 3, d: 4 })).toBe('{ a, b, c, +1 }');
    expect(previewOf([1, 2, 3])).toBe('Array(3)');
    expect(previewOf({})).toBe('{}');
  });
});
