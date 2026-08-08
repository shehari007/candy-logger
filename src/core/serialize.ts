import type { MessagePart } from './types.js';

export interface NormalizeOptions {
  /** Max object/array nesting captured (default 8). */
  maxDepth?: number;
  /** Max characters kept per string (default 1000). */
  maxString?: number;
  /** Max entries captured per object/array (default 250). */
  maxItems?: number;
}

export interface NormalizeResult {
  value: unknown;
  truncated: boolean;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string[];
  cause?: unknown;
  [extra: string]: unknown;
}

const DEFAULTS = { maxDepth: 8, maxString: 1000, maxItems: 250 } as const;

function isNode(v: any): boolean {
  if (typeof Node !== 'undefined' && v instanceof Node) return true;
  return typeof v?.nodeType === 'number' && typeof v?.nodeName === 'string';
}

function describeNode(v: any): string {
  try {
    const name = String(v.nodeName || 'node').toLowerCase();
    if (v.nodeType === 3) return `#text "${String(v.nodeValue ?? '').slice(0, 40)}"`;
    if (v.nodeType === 8) return `<!-- ${String(v.nodeValue ?? '').slice(0, 40)} -->`;
    if (v.nodeType === 9) return '#document';
    const id = v.id ? `#${v.id}` : '';
    const cls =
      typeof v.className === 'string' && v.className.trim()
        ? '.' + v.className.trim().split(/\s+/).slice(0, 4).join('.')
        : '';
    return `<${name}${id}${cls}>`;
  } catch {
    return '<node>';
  }
}

function isError(v: any): boolean {
  if (v instanceof Error) return true;
  // Cross-realm errors (iframes, workers) fail instanceof.
  return typeof v?.name === 'string' && typeof v?.message === 'string' && typeof v?.stack === 'string';
}

/** Errors carry `message`/`stack` as NON-enumerable props, which is why JSON.stringify yields `{}`. */
export function serializeError(err: any): SerializedError {
  const out: SerializedError = {
    name: safeString(() => err.name) || 'Error',
    message: safeString(() => err.message) || '',
  };
  const stack = safeString(() => err.stack);
  if (stack) {
    out.stack = stack
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      // The first stack line usually repeats "Name: message" — drop the duplicate.
      .filter((l, i) => !(i === 0 && l === `${out.name}: ${out.message}`));
  }
  // Own enumerable extras (err.code, err.response, ...) plus `cause`.
  try {
    for (const key of Object.keys(err)) {
      if (key === 'name' || key === 'message' || key === 'stack') continue;
      out[key] = err[key];
    }
  } catch {
    /* exotic error object */
  }
  if ('cause' in Object(err)) {
    try {
      if (err.cause !== undefined) out.cause = err.cause;
    } catch {
      /* getter threw */
    }
  }
  return out;
}

function safeString(read: () => unknown): string {
  try {
    const v = read();
    return typeof v === 'string' ? v : v == null ? '' : String(v);
  } catch {
    return '';
  }
}

/**
 * Convert any value into a JSON-safe structure. Total: this never throws, for any
 * input — circular graphs, BigInts, getters that throw, DOM nodes, proxies.
 */
export function normalize(input: unknown, opts: NormalizeOptions = {}): NormalizeResult {
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxDepth;
  const maxString = opts.maxString ?? DEFAULTS.maxString;
  const maxItems = opts.maxItems ?? DEFAULTS.maxItems;
  let truncated = false;

  // Ancestors only, so the same object appearing in two siblings is not
  // mislabelled as circular.
  const ancestors = new Set<unknown>();

  const walk = (v: unknown, depth: number): unknown => {
    switch (typeof v) {
      case 'string':
        if (v.length > maxString) {
          truncated = true;
          return `${v.slice(0, maxString)}…[+${v.length - maxString} chars]`;
        }
        return v;
      case 'number':
        return Number.isFinite(v) ? v : String(v); // NaN / Infinity are not JSON-safe
      case 'boolean':
        return v;
      case 'undefined':
        return '[undefined]';
      case 'bigint':
        return `${v}n`;
      case 'symbol':
        return String(v);
      case 'function':
        return `[Function: ${(v as Function).name || 'anonymous'}]`;
    }

    if (v === null) return null;
    if (isError(v)) {
      if (depth >= maxDepth) {
        truncated = true;
        return `[${safeString(() => (v as any).name) || 'Error'}]`;
      }
      return walkObjectLike(serializeError(v), depth);
    }
    if (v instanceof Date) return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (isNode(v)) return describeNode(v);

    if (ancestors.has(v)) {
      truncated = true;
      return '[Circular]';
    }
    if (depth >= maxDepth) {
      truncated = true;
      return Array.isArray(v) ? `[Array(${v.length})]` : '[Object]';
    }

    ancestors.add(v);
    try {
      if (Array.isArray(v)) {
        const out: unknown[] = [];
        const n = Math.min(v.length, maxItems);
        for (let i = 0; i < n; i++) out.push(walk(v[i], depth + 1));
        if (v.length > n) {
          truncated = true;
          out.push(`…[+${v.length - n} more]`);
        }
        return out;
      }
      if (v instanceof Map) {
        const entries: unknown[] = [];
        let i = 0;
        for (const [k, val] of v) {
          if (i++ >= maxItems) {
            truncated = true;
            break;
          }
          entries.push([walk(k, depth + 1), walk(val, depth + 1)]);
        }
        return { __type: `Map(${v.size})`, entries };
      }
      if (v instanceof Set) {
        const values: unknown[] = [];
        let i = 0;
        for (const val of v) {
          if (i++ >= maxItems) {
            truncated = true;
            break;
          }
          values.push(walk(val, depth + 1));
        }
        return { __type: `Set(${v.size})`, values };
      }
      if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
        const arr = Array.from(v as unknown as ArrayLike<number>).slice(0, maxItems);
        return { __type: `${(v as any).constructor?.name || 'TypedArray'}(${(v as any).length})`, values: arr };
      }
      return walkObjectLike(v, depth);
    } catch {
      truncated = true;
      return '[Unserializable]';
    } finally {
      ancestors.delete(v);
    }
  };

  const walkObjectLike = (v: any, depth: number): unknown => {
    // Honour toJSON (Decimal, Luxon, ...) but never let it break the log call.
    if (typeof v.toJSON === 'function') {
      try {
        const replaced = v.toJSON();
        if (replaced !== v) return walk(replaced, depth);
      } catch {
        /* fall through to the plain walk */
      }
    }
    const out: Record<string, unknown> = {};
    let keys: string[];
    try {
      // Object.keys, not for…in: `for…in` walks the prototype chain, which on a
      // DOM node means reading hundreds of layout-forcing getters.
      keys = Object.keys(v);
    } catch {
      return '[Unserializable]';
    }
    const n = Math.min(keys.length, maxItems);
    for (let i = 0; i < n; i++) {
      const k = keys[i];
      try {
        out[k] = walk(v[k], depth + 1); // a getter may throw
      } catch {
        out[k] = '[Throws]';
      }
    }
    if (keys.length > n) {
      truncated = true;
      out['…'] = `[+${keys.length - n} more keys]`;
    }
    return out;
  };

  return { value: walk(input, 0), truncated };
}

/** JSON.stringify that cannot throw. */
export function safeStringify(
  input: unknown,
  opts: NormalizeOptions & { space?: number } = {},
): { text: string; truncated: boolean } {
  const { value, truncated } = normalize(input, opts);
  try {
    return { text: JSON.stringify(value, null, opts.space) ?? String(value), truncated };
  } catch {
    return { text: String(value), truncated: true };
  }
}

/** Compact one-line text for the Message column. */
export function toDisplayText(value: unknown): string {
  if (typeof value === 'string') return value;
  const { text } = safeStringify(value);
  return text;
}

const SPECIFIER_RE = /%([sdifoOjc%])/g;

/** Parse a `%c` CSS payload into a property bag. Validation happens at render time. */
export function parseStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of String(css).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop && val) out[prop] = val;
  }
  return out;
}

export interface FormattedArgs {
  message: string;
  parts: MessagePart[];
  snapshot: unknown[];
  truncated: boolean;
  /** True when args[0] was a format template, so `parts` is the authoritative rendering. */
  usedSpecifiers: boolean;
}

/**
 * Apply console format specifiers (%s %d %i %f %o %O %j %c %%) the way browsers do,
 * then append any leftover arguments space-separated.
 */
export function formatArgs(args: readonly unknown[], opts: NormalizeOptions = {}): FormattedArgs {
  let truncated = false;
  const snapshot = args.map((a) => {
    const r = normalize(a, opts);
    if (r.truncated) truncated = true;
    return r.value;
  });

  const parts: MessagePart[] = [];
  let rest = 0;
  let usedSpecifiers = false;
  let style: Record<string, string> | undefined;

  const push = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.style === style) last.text += text;
    else parts.push(style ? { text, style } : { text });
  };

  if (typeof args[0] === 'string' && SPECIFIER_RE.test(args[0])) {
    SPECIFIER_RE.lastIndex = 0;
    const template = args[0];
    rest = 1;
    usedSpecifiers = true;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = SPECIFIER_RE.exec(template))) {
      push(template.slice(cursor, m.index));
      cursor = m.index + 2;
      const kind = m[1];
      if (kind === '%') {
        push('%');
        continue;
      }
      if (rest >= args.length) {
        push(m[0]); // no argument left — browsers print the specifier literally
        continue;
      }
      const arg = args[rest++];
      switch (kind) {
        case 's':
          push(typeof arg === 'string' ? arg : toDisplayText(snapshot[rest - 1]));
          break;
        case 'd':
        case 'i': {
          const n = Number(arg);
          push(Number.isNaN(n) ? 'NaN' : String(Math.trunc(n)));
          break;
        }
        case 'f': {
          const n = Number(arg);
          push(Number.isNaN(n) ? 'NaN' : String(n));
          break;
        }
        case 'o':
        case 'O':
        case 'j':
          push(toDisplayText(snapshot[rest - 1]));
          break;
        case 'c':
          style = typeof arg === 'string' && arg.trim() ? parseStyle(arg) : undefined;
          break;
      }
    }
    push(template.slice(cursor));
  }

  for (let i = rest; i < args.length; i++) {
    if (parts.length || i > rest) push(' ');
    push(typeof args[i] === 'string' ? (args[i] as string) : toDisplayText(snapshot[i]));
  }

  return { message: parts.map((p) => p.text).join(''), parts, snapshot, truncated, usedSpecifiers };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

/** Escape for HTML *text* content. Never sufficient for a JS string inside an attribute. */
export function escapeHtml(text: unknown): string {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'plain';

/**
 * Tokenize raw JSON for highlighting. The v2.0 implementation escaped first and then
 * matched on `"`, which could never hit — so keys and strings were never highlighted.
 * Tokenizing the raw text keeps the quotes intact; the caller escapes each token.
 */
export function tokenizeJson(json: string): { type: JsonTokenType; text: string }[] {
  const re = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const out: { type: JsonTokenType; text: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push({ type: 'plain', text: json.slice(last, m.index) });
    let type: JsonTokenType = 'plain';
    if (m[1]) type = /:\s*$/.test(m[1]) ? 'key' : 'string';
    else if (m[2]) type = 'boolean';
    else if (m[3]) type = 'null';
    else if (m[4]) type = 'number';
    out.push({ type, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < json.length) out.push({ type: 'plain', text: json.slice(last) });
  return out;
}

/** One-line summary shown before an object is expanded. */
export function previewOf(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value === null || typeof value !== 'object') return String(value);
  const tagged = (value as any).__type;
  if (typeof tagged === 'string') return tagged;
  const keys = Object.keys(value as object);
  if (keys.length === 0) return '{}';
  const shown = keys.slice(0, 3).join(', ');
  return keys.length <= 3 ? `{ ${shown} }` : `{ ${shown}, +${keys.length - 3} }`;
}
