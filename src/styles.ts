/**
 * Panel stylesheet. Every color is a custom property, and both themes define the
 * full set, so neither theme can fall back to the other's values by accident.
 *
 * Everything is scoped under `.candy-logger`, and the reset block at the top keeps
 * host-page rules for `button`, `table`, `pre` and friends from leaking in.
 */
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;

export const CANDY_CSS = `
.candy-logger{
  --c-bg:#141416; --c-elev:#1b1b1f; --c-hover:#202025; --c-active:#2a2a31;
  --c-fg:#e7e7ea; --c-muted:#a0a0aa; --c-subtle:#6f6f7a; --c-border:#2a2a30; --c-border-soft:#1f1f24;
  --c-accent:#f06595; --c-accent-soft:rgba(240,101,149,.14); --c-focus:#8ab4f8;
  --c-pill-bg:#e7e7ea; --c-pill-fg:#141416;
  --c-shadow:0 16px 48px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.3);
  --l-log:#b4b4bd; --l-info:#6cb6ff; --l-debug:#b392f0; --l-success:#56d364; --l-warn:#e3b341; --l-error:#ff7b72;
  --r-warn-bg:rgba(227,179,65,.07); --r-warn-fg:#f2d58c;
  --r-error-bg:rgba(255,123,114,.08); --r-error-fg:#ffb3ad;
  --j-key:#79c0ff; --j-string:#7ee787; --j-number:#ffa657; --j-boolean:#d2a8ff; --j-null:#8b949e;

  position:fixed; z-index:2147483000;
  width:720px; min-width:340px; max-width:calc(100vw - 16px);
  height:420px; min-height:160px; max-height:calc(100vh - 16px);
  display:flex; flex-direction:column; overflow:hidden; resize:both;
  background:var(--c-bg); color:var(--c-fg);
  border:1px solid var(--c-border); border-radius:10px; box-shadow:var(--c-shadow);
  font:12px/1.45 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  text-align:left; letter-spacing:normal; text-transform:none; color-scheme:dark;
  opacity:1; transition:opacity .2s ease;
}
.candy-logger--light{
  --c-bg:#ffffff; --c-elev:#f7f7f8; --c-hover:#f2f2f4; --c-active:#e7e7eb;
  --c-fg:#1b1b1f; --c-muted:#575762; --c-subtle:#85858f; --c-border:#e2e2e7; --c-border-soft:#efeff2;
  --c-accent:#d6336c; --c-accent-soft:rgba(214,51,108,.1); --c-focus:#2563eb;
  --c-pill-bg:#1b1b1f; --c-pill-fg:#ffffff;
  --c-shadow:0 16px 48px rgba(20,20,30,.14),0 2px 8px rgba(20,20,30,.08);
  --l-log:#575762; --l-info:#0969da; --l-debug:#8250df; --l-success:#1a7f37; --l-warn:#9a6700; --l-error:#cf222e;
  --r-warn-bg:#fff8e5; --r-warn-fg:#6b4800;
  --r-error-bg:#fff0ef; --r-error-fg:#a40e26;
  --j-key:#0550ae; --j-string:#116329; --j-number:#953800; --j-boolean:#8250df; --j-null:#6e7781;
  color-scheme:light;
}

/* Reset: host styles must not reach inside the panel */
.candy-logger *,.candy-logger *::before,.candy-logger *::after{box-sizing:border-box}
/* (0,1,0) specificity: beats a host's \`button\` or \`table td\`, and loses to the
   panel's own class rules below because they come later. */
.candy-logger :where(button,input){font:inherit;color:inherit;margin:0;text-transform:none;letter-spacing:inherit;
  line-height:inherit;min-width:0;min-height:0;box-shadow:none;-webkit-appearance:none;appearance:none}
.candy-logger :where(table){border-spacing:0;margin:0;background:none;min-width:0;max-width:none}
.candy-logger :where(th,td){border:0;background:none;min-width:0;max-width:none;height:auto;text-transform:none;letter-spacing:normal}
.candy-logger :where(pre){margin:0;font-family:${MONO};background:none;border:0;border-radius:0;padding:0;color:inherit}
.candy-logger :where(svg){display:block;flex:none;overflow:visible}
.candy-logger :focus-visible{outline:2px solid var(--c-focus);outline-offset:1px;border-radius:5px}
.candy-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.candy-icon{width:15px;height:15px}

.candy-logger--dim{opacity:.15}
.candy-logger--dim:hover,.candy-logger--dim:focus-within,.candy-logger--dim.candy-logger--pinned{opacity:1}

/* Header */
.candy-header{display:flex;align-items:center;justify-content:space-between;gap:8px;height:38px;flex-shrink:0;
  padding:0 5px 0 12px;background:var(--c-elev);border-bottom:1px solid var(--c-border);
  cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}
.candy-logger--dragging .candy-header{cursor:grabbing}
.candy-logger--docked .candy-header{cursor:default}
.candy-header-left{display:flex;align-items:center;gap:8px;min-width:0}
.candy-mark{color:var(--c-accent)}
.candy-title{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.candy-badge{font:600 10px/1 ${MONO};padding:3px 5px;border-radius:4px;letter-spacing:.02em;white-space:nowrap;
  color:var(--c-accent);background:var(--c-accent-soft)}
.candy-log-counter{font:500 11px/1 ${MONO};color:var(--c-subtle);font-variant-numeric:tabular-nums}
.candy-errcount{display:inline-flex;align-items:center;gap:5px;font:500 11px/1 ${MONO};color:var(--l-error)}
.candy-errcount::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.candy-errcount[hidden]{display:none}
.candy-header-right{display:flex;align-items:center;gap:1px}
.candy-hbtn{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--c-muted);
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .12s,color .12s}
.candy-hbtn:hover{background:var(--c-active);color:var(--c-fg)}
.candy-hbtn.active{color:var(--c-accent)}

/* Toolbar */
.candy-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;padding:6px 8px;
  background:var(--c-bg);border-bottom:1px solid var(--c-border)}
.candy-filters{display:flex;flex-wrap:wrap;gap:2px;flex:1;min-width:0}
.candy-fbtn{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border:0;border-radius:5px;
  background:transparent;color:var(--c-muted);font-size:11.5px;font-weight:500;white-space:nowrap;cursor:pointer;
  transition:background-color .12s,color .12s}
.candy-fbtn:hover{background:var(--c-hover);color:var(--c-fg)}
.candy-fbtn--active,.candy-fbtn--active:hover{background:var(--c-active);color:var(--c-fg)}
.candy-fdot{width:6px;height:6px;border-radius:50%;background:currentColor}
.candy-fbtn[data-level="log"] .candy-fdot{color:var(--l-log)}
.candy-fbtn[data-level="info"] .candy-fdot{color:var(--l-info)}
.candy-fbtn[data-level="debug"] .candy-fdot{color:var(--l-debug)}
.candy-fbtn[data-level="success"] .candy-fdot{color:var(--l-success)}
.candy-fbtn[data-level="warn"] .candy-fdot{color:var(--l-warn)}
.candy-fbtn[data-level="error"] .candy-fdot{color:var(--l-error)}
.candy-fcount{font:10.5px/1 ${MONO};color:var(--c-subtle);font-variant-numeric:tabular-nums}
.candy-fbtn--active .candy-fcount{color:var(--c-muted)}
.candy-search-wrap{position:relative;flex:0 1 190px;min-width:120px}
.candy-search-wrap .candy-icon{position:absolute;left:8px;top:50%;width:13px;height:13px;margin-top:-6.5px;
  color:var(--c-subtle);pointer-events:none}
.candy-search{width:100%;height:26px;padding:0 8px 0 27px;border-radius:6px;outline:none;font-size:12px;
  background:var(--c-elev);color:var(--c-fg);border:1px solid var(--c-border);transition:border-color .12s}
.candy-search:focus{border-color:var(--c-focus)}
.candy-search::placeholder{color:var(--c-subtle);opacity:1}
.candy-search::-webkit-search-cancel-button{cursor:pointer}

/* Body + table */
.candy-body{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;background:var(--c-bg)}
.candy-table-wrap{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:thin;scrollbar-color:var(--c-active) transparent}
.candy-table-wrap::-webkit-scrollbar{width:8px}
.candy-table-wrap::-webkit-scrollbar-thumb{background:var(--c-active);border-radius:4px;border:2px solid var(--c-bg)}
.candy-table{width:100%;border-collapse:collapse;table-layout:fixed}
.candy-th{position:sticky;top:0;z-index:2;height:26px;padding:0 10px;text-align:left;white-space:nowrap;
  font-size:10.5px;font-weight:500;color:var(--c-subtle);background:var(--c-bg);box-shadow:inset 0 -1px 0 var(--c-border)}
.candy-th--time{width:94px}.candy-th--level{width:76px}.candy-th--tags{width:100px}
.candy-th--message{width:auto}.candy-th--actions{width:var(--candy-actions-w,108px)}

.candy-tr{border-bottom:1px solid var(--c-border-soft)}
.candy-tr:hover{background:var(--c-hover)}
.candy-tr--hidden{display:none}
.candy-tr[data-level="warn"],.candy-detail-row[data-level="warn"]{background:var(--r-warn-bg)}
.candy-tr[data-level="error"],.candy-detail-row[data-level="error"]{background:var(--r-error-bg)}
.candy-tr[data-level="warn"] .candy-td--message{color:var(--r-warn-fg)}
.candy-tr[data-level="error"] .candy-td--message{color:var(--r-error-fg)}
.candy-tr--pinned > td:first-child{box-shadow:inset 2px 0 0 var(--c-accent)}
.candy-pinned-body .candy-tr:last-child,.candy-pinned-body .candy-detail-row:last-child{border-bottom:1px solid var(--c-border)}
.candy-td{padding:5px 10px;vertical-align:top;line-height:1.5;color:var(--c-fg)}
.candy-td--time{font:11px/18px ${MONO};color:var(--c-subtle);white-space:nowrap;font-variant-numeric:tabular-nums}
.candy-ms{opacity:.65}
.candy-td--level{white-space:nowrap}
.candy-td--message{font:12px/18px ${MONO};white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.candy-td--actions{padding:2px 6px;white-space:nowrap;text-align:right}

.candy-level{display:inline-flex;align-items:center;gap:6px;font:500 11px/18px ${MONO};color:var(--l-log)}
.candy-level::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.candy-level--log{color:var(--l-log)}.candy-level--info{color:var(--l-info)}.candy-level--debug{color:var(--l-debug)}
.candy-level--success{color:var(--l-success)}.candy-level--warn{color:var(--l-warn)}.candy-level--error{color:var(--l-error)}

.candy-tag{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top;
  margin:1px 3px 1px 0;padding:0 5px;border-radius:4px;font:600 10px/16px ${MONO};letter-spacing:.02em;
  background:var(--c-active);color:var(--c-fg)}
.candy-tag-input{display:block;width:100%;height:20px;margin-top:1px;padding:0 6px;border-radius:4px;outline:none;
  font:11px/1 ${MONO};background:var(--c-bg);color:var(--c-fg);border:1px solid var(--c-focus)}

/* Row actions: quiet until the row is hovered or focused */
.candy-abtn{width:24px;height:24px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--c-subtle);
  display:inline-flex;align-items:center;justify-content:center;vertical-align:top;cursor:pointer;opacity:0;
  transition:opacity .12s,background-color .12s,color .12s}
.candy-abtn .candy-icon{width:14px;height:14px}
.candy-abtn-text{font-size:12px;line-height:1}
.candy-tr:hover .candy-abtn,.candy-tr:focus-within .candy-abtn,.candy-abtn.active{opacity:1}
.candy-abtn:hover{background:var(--c-active);color:var(--c-fg)}
.candy-abtn--del:hover{color:var(--l-error)}
.candy-abtn.active{color:var(--c-accent)}
.candy-flash-ok{color:var(--l-success)!important;opacity:1}
.candy-flash-fail{color:var(--l-error)!important;opacity:1}
@media (hover:none){.candy-abtn{opacity:1}}

/* Values */
.candy-json-inline{white-space:pre-wrap}
.candy-json-type{color:var(--c-muted)}
.candy-json-toggle{width:16px;height:18px;padding:0;margin:0 2px 0 -3px;border:0;background:none;color:var(--c-subtle);
  display:inline-flex;align-items:center;justify-content:center;vertical-align:top;cursor:pointer}
.candy-json-toggle .candy-icon{width:12px;height:12px;transform:rotate(90deg);transition:transform .12s}
.candy-json-toggle.collapsed .candy-icon{transform:none}
.candy-json-toggle:hover{color:var(--c-fg)}
.candy-json-preview{padding:0;border:0;background:none;font:inherit;color:var(--c-muted);cursor:pointer;text-align:left}
.candy-json-preview:hover{color:var(--c-fg)}
.candy-json-key{color:var(--j-key)}.candy-json-string{color:var(--j-string)}
.candy-json-number{color:var(--j-number)}.candy-json-boolean{color:var(--j-boolean)}.candy-json-null{color:var(--j-null)}
.candy-err{color:var(--l-error);font-weight:600}

/* Expanded detail */
.candy-detail-row{border-bottom:1px solid var(--c-border-soft)}
.candy-td--detail{padding:0 10px 10px}
.candy-json-pre{display:block;padding:8px 10px;border-radius:6px;max-height:360px;overflow:auto;
  font:11.5px/1.55 ${MONO};white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;
  background:var(--c-elev);border:1px solid var(--c-border);color:var(--c-fg)}
.candy-json-pre + .candy-json-pre{margin-top:6px}
.candy-stack{color:var(--c-muted)}
.candy-truncated{display:block;margin:0 0 6px;font-size:11px;color:var(--l-warn)}
.candy-copy-row{display:flex;gap:6px;margin-top:6px}
.candy-copy-btn{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:5px;cursor:pointer;
  font-size:11px;font-weight:500;background:var(--c-bg);color:var(--c-muted);border:1px solid var(--c-border)}
.candy-copy-btn:hover{color:var(--c-fg);border-color:var(--c-subtle)}
.candy-copy-btn .candy-icon{width:12px;height:12px}

/* Empty state + new-logs pill */
.candy-empty{position:absolute;inset:26px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:4px;padding:16px;text-align:center;pointer-events:none}
.candy-empty.hidden{display:none}
.candy-empty-title{font-size:12.5px;font-weight:500;color:var(--c-fg)}
.candy-empty-sub{font-size:11.5px;color:var(--c-subtle)}
.candy-newpill{position:absolute;left:50%;bottom:10px;z-index:3;transform:translateX(-50%);height:24px;padding:0 10px;
  border:0;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;
  background:var(--c-pill-bg);color:var(--c-pill-fg);box-shadow:0 4px 14px rgba(0,0,0,.25)}
.candy-newpill--hidden{display:none}

/* Minimized: shrink to a compact bar */
.candy-logger--minimized{width:auto!important;min-width:0!important;height:auto!important;min-height:0!important;
  max-height:none!important;resize:none}
.candy-logger--minimized .candy-toolbar,.candy-logger--minimized .candy-body{display:none!important}
.candy-logger--minimized .candy-header{border-bottom:0;gap:14px}
.candy-logger--minimized .candy-hbtn:not([data-act="minimize"]){display:none}

/* Phone: a full-screen sheet instead of a 720px box hanging off the viewport */
@media (max-width:640px){
  .candy-logger{inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;
    max-height:100%!important;border:0;border-radius:0!important;resize:none;opacity:1!important}
  .candy-logger--minimized{inset:auto 12px 12px auto!important;width:auto!important;height:auto!important;
    border:1px solid var(--c-border);border-radius:10px!important}
  /* Zero width rather than display:none: the detail row's colspan counts this
     column, and a missing one makes the browser invent a phantom column. */
  .candy-th--tags{width:0}
  .candy-th--tags,.candy-td--tags{padding:0!important;overflow:hidden;visibility:hidden}
  .candy-th--time{width:72px}
  .candy-ms{display:none}
  .candy-th--level{width:30px;font-size:0}
  .candy-level{font-size:0;gap:0}
  .candy-td{padding-left:8px;padding-right:8px}
  .candy-search-wrap{flex-basis:100%}
  .candy-abtn{opacity:1}
}

@media (prefers-reduced-motion:reduce){
  .candy-logger,.candy-logger *,.candy-logger *::before,.candy-logger *::after{animation:none!important;transition:none!important}
}
`;
