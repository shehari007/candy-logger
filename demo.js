(function () {
  'use strict';
  var logger = null, streamTimer = null, sinkOff = null;

  var toastEl = document.getElementById('toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  function options() {
    var opts = {
      enabled: true,
      theme: document.getElementById('opt-theme').value,
      position: document.getElementById('opt-position').value,
      maxLogs: Number(document.getElementById('opt-maxlogs').value) || 500,
      badgeText: document.getElementById('opt-badge').value || undefined,
      showTimestamp: document.getElementById('opt-timestamp').checked,
      tags: document.getElementById('opt-tags').checked,
      collapsed: document.getElementById('opt-collapsed').checked,
      dimWhenIdle: document.getElementById('opt-dim').checked
    };
    if (document.getElementById('opt-actions').checked) {
      opts.actions = [{
        // An apostrophe here used to produce a dead button (or worse). Now the
        // panel dispatches by index, so the label is inert text.
        label: "Inspect in devtools (it's safe now)",
        icon: '🔎',
        onClick: function (entry) {
          console.info('[custom action] entry:', entry);
          toast('Custom action fired — check devtools');
        }
      }];
    }
    return opts;
  }

  function ensure() {
    if (!logger) {
      logger = window.createLogger(options());
      toast('Panel launched — drag it, resize it, pin a row');
    }
    return logger;
  }

  function rebuild() {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    if (logger) logger.destroy();
    logger = window.createLogger(options());
    toast('Panel rebuilt with your options');
  }

  document.getElementById('demo-start').addEventListener('click', function () {
    ensure();
    seed();
  });
  document.getElementById('rebuild').addEventListener('click', rebuild);
  document.getElementById('destroy').addEventListener('click', function () {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    if (!logger) return toast('No panel to destroy');
    logger.destroy();
    logger = null;
    toast('destroy() called — panel, listeners and stylesheet removed');
  });
  document.getElementById('seed').addEventListener('click', function () { ensure(); seed(); });

  function seed() {
    var l = ensure();
    l.info('Application booted', { version: '2.1.0', mode: 'demo' });
    l.log('Router ready', { routes: 12 });
    l.success('Service worker registered');
    l.debug('Hydration finished in 42ms');
    l.warn('Slow API call', { endpoint: '/api/orders', ms: 3120 });
  }

  /* --- level buttons --- */
  var samples = {
    log:     ['User navigated', { from: '/home', to: '/checkout' }],
    info:    ['Session refreshed', { expiresIn: '1h', scope: ['read', 'write'] }],
    debug:   ['Cache lookup', { key: 'user:42', hit: true, ms: 0.8 }],
    success: ['Payment captured', { amount: 4999, currency: 'USD' }],
    warn:    ['Rate limit approaching', { remaining: 7, resetIn: '58s' }],
    error:   ['Checkout failed', { code: 'CARD_DECLINED', retryable: false }]
  };
  Array.prototype.forEach.call(document.querySelectorAll('[data-fire]'), function (btn) {
    btn.addEventListener('click', function () {
      var lvl = btn.dataset.fire, l = ensure();
      l[lvl].apply(l, samples[lvl]);
    });
  });

  /* --- feature demos --- */
  var demos = {
    'tag-auth': function (l) {
      l.tagged({ label: 'AUTH', bg: 'rgba(139,92,246,.22)', color: '#c4b5fd' }, 'info',
        'Token refreshed', { expiresIn: '1h' });
    },
    'tag-multi': function (l) {
      l.tagged([
        { label: 'DB',   bg: 'rgba(234,179,8,.2)',  color: '#fde047' },
        { label: 'SLOW', bg: 'rgba(239,68,68,.2)',  color: '#fca5a5' }
      ], 'warn', 'Query took 3.1s', { sql: 'SELECT * FROM orders WHERE status = $1', rows: 84213 });
    },
    'tag-perf': function (l) {
      l.tagged({ label: 'PERF', bg: 'rgba(74,222,128,.18)', color: '#86efac' }, 'debug',
        'LCP measured', { lcp: 1240, cls: 0.02, inp: 96 });
    },

    circular: function (l) {
      var node = { id: 'root', children: [] };
      var child = { id: 'child', parent: node };
      node.children.push(child);
      l.error('Circular graph — v2.0 threw a TypeError here', node);
      toast('No crash. Rendered as [Circular].');
    },
    error: function (l) {
      function level3() { throw new TypeError("Cannot read properties of undefined (reading 'total')"); }
      function level2() { level3(); }
      function level1() { level2(); }
      try { level1(); } catch (err) {
        err.code = 'E_CHECKOUT';
        err.context = { cartId: 'c_8812', items: 3 };
        l.error('Checkout crashed', err);
      }
      toast('Expand the ▼ to see the full stack');
    },
    bigint: function (l) {
      l.warn('BigInt payload', { id: 90071992547409911n, ratio: 0.5 });
    },
    exotic: function (l) {
      l.info('Exotic values',
        new Map([['role', 'admin'], ['tier', 3]]),
        new Set(['read', 'write', 'delete']),
        new Date('2026-01-15T09:30:00Z'),
        /^candy-(.*)$/gi);
    },
    dom: function (l) {
      l.debug('DOM node (summarised, not enumerated)', document.querySelector('#playground'));
      toast('Summarised as a selector — no layout getters were read');
    },
    getter: function (l) {
      l.warn('Object with a hostile getter', {
        safe: 'ok',
        get boom() { throw new Error('getter exploded'); }
      });
    },

    'xss-key': function (l) {
      var payload = {};
      payload['<img src=x onerror="alert(\'XSS via object key\')">'] = 'attacker-controlled key';
      payload.user = 'bob';
      payload.role = 'admin';
      payload.tenant = 'acme';
      l.error('Simulated hostile API response', payload);
      toast('Rendered as text — no alert, no <img> element');
    },
    'xss-tag': function (l) {
      l.tagged({ label: '<svg onload="alert(1)">', bg: 'red" onmouseover="alert(1)', color: '#fff' },
        'warn', 'Tag label and colors are both attacker-controlled here');
      toast('Label is text; colors go through a CSS allowlist');
    },
    'xss-msg': function (l) {
      l.error('<script>alert("XSS")<\/script><img src=x onerror=alert(1)>');
      toast('Escaped — the panel builds nodes, never innerHTML');
    },

    'json-small': function (l) { l.log('Small object', { ok: true, count: 3 }); },
    'json-api': function (l) {
      l.info('GET /api/orders 200', {
        meta: { page: 1, perPage: 20, total: 137, tookMs: 84 },
        data: [
          { id: 'o_1', customer: { id: 'c_1', name: "O'Brien & Sons", email: 'a@example.com' },
            total: 4999, currency: 'USD', status: 'paid', items: [{ sku: 'CANDY-1', qty: 2 }] },
          { id: 'o_2', customer: { id: 'c_2', name: 'Zhang Wei', email: 'b@example.com' },
            total: 12050, currency: 'EUR', status: 'pending', items: [{ sku: 'CANDY-9', qty: 1 }] }
        ]
      });
    },
    'json-deep': function (l) {
      var deep = { value: 'bottom' };
      for (var i = 0; i < 25; i++) deep = { depth: 25 - i, nested: deep };
      l.debug('Deeply nested (depth-capped, flagged as truncated)', deep);
    },
    'json-huge': function (l) {
      var huge = {};
      for (var i = 0; i < 10000; i++) huge['key_' + i] = { i: i, label: 'row ' + i };
      var t0 = performance.now();
      l.warn('10,000-key object', huge);
      toast('Captured in ' + (performance.now() - t0).toFixed(1) + 'ms (capped, not walked forever)');
    },

    'fmt-basic': function (l) { l.log('%s scored %d points (%f accuracy)', 'Alice', 42, 0.97); },
    'fmt-css': function (l) {
      l.log('%c CANDY %c ready in 42ms',
        'background:#ff6ba8;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold',
        'color:#4ade80;font-weight:bold');
      toast('%c applied through a CSS property allowlist');
    },
    'fmt-obj': function (l) { l.info('Config loaded: %o and %s', { debug: true, retries: 3 }, 'done'); },

    burst: function (l) {
      var t0 = performance.now();
      for (var i = 0; i < 500; i++) {
        var lv = ['log', 'info', 'debug', 'success', 'warn', 'error'][i % 6];
        l[lv]('Burst entry #' + i, { i: i, batch: Math.floor(i / 50) });
      }
      toast('500 logs in ' + (performance.now() - t0).toFixed(0) + 'ms');
    },
    stream: function (l) {
      if (streamTimer) return toast('Already streaming');
      var n = 0;
      streamTimer = setInterval(function () {
        var lv = n % 11 === 0 ? 'error' : n % 5 === 0 ? 'warn' : 'log';
        l[lv]('Streamed tick ' + (++n), { t: Date.now() % 100000, heap: (n * 37) % 512 });
      }, 100);
      toast('Streaming — scroll up and the panel stops chasing you');
    },
    stop: function () {
      if (!streamTimer) return toast('Not streaming');
      clearInterval(streamTimer); streamTimer = null;
      toast('Stream stopped');
    },

    stats: function (l) {
      var s = l.getStats();
      l.success('getStats() — read straight from the store, no panel required', s);
      toast('all:' + s.all + ' · err:' + s.error + ' · warn:' + s.warn);
    },
    sink: function (l) {
      if (sinkOff) { sinkOff(); sinkOff = null; return toast('Sink detached'); }
      var seen = 0;
      sinkOff = l.addSink({
        write: function (entry) { if (entry.level === 'error') toast('Sink saw error #' + (++seen)); }
      });
      l.info('Sink attached — it will report every error entry');
      toast('Sink attached. Now press the "error" button.');
    },
    override: function (l) {
      // Called twice on purpose. v2.0 stacked a second panel and doubled every
      // log line; capture is idempotent now, so this is a no-op the second time.
      l.captureConsole();
      l.captureConsole();
      console.log('console.log is captured now', { viaConsole: true });
      console.warn('…and so is console.warn');
      console.error(new Error('even uncaught-style errors keep their stack'));
      toast('captureConsole() called twice — still exactly one panel');
    },
    restore: function () {
      window.restoreConsole();
      console.log('This line goes only to devtools now');
      toast('Console restored to native');
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('[data-demo]'), function (btn) {
    btn.addEventListener('click', function () {
      var fn = demos[btn.dataset.demo];
      if (fn) fn(ensure());
    });
  });

  /* --- copy buttons --- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var el = document.querySelector(btn.dataset.copy);
      if (!el || !navigator.clipboard) return;
      navigator.clipboard.writeText(el.textContent.trim()).then(function () {
        var prev = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(function () { btn.textContent = prev; }, 1400);
      });
    });
  });
})();
