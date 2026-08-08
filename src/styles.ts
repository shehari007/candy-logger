/**
 * One token layer, redefined per theme. v2.0 defined `.candy-level--*` exactly once
 * against dark-theme values, so in light mode the badges dropped to ~1.6:1 contrast.
 * Every color now lives on a custom property that both themes must supply.
 */
export const CANDY_CSS = `
.candy-logger{
  --c-bg:#1a1b26; --c-elev:#16161e; --c-row:#1e2030;
  --c-fg:#c0caf5; --c-muted:#8b93b8; --c-border:#292e42;
  --c-accent:#7aa2f7; --c-accent-fg:#1a1b26; --c-focus:#7aa2f7;
  --c-rail:#e0af68; --c-rail-bg:rgba(224,175,104,.06);
  --l-log:#7aa2f7;    --l-log-bg:rgba(122,162,247,.16);
  --l-info:#7dcfff;   --l-info-bg:rgba(125,211,252,.16);
  --l-debug:#bb9af7;  --l-debug-bg:rgba(187,154,247,.16);
  --l-success:#9ece6a;--l-success-bg:rgba(158,206,106,.16);
  --l-warn:#e0af68;   --l-warn-bg:rgba(224,175,104,.16);
  --l-error:#f7768e;  --l-error-bg:rgba(247,118,142,.16);
  --j-key:#7aa2f7; --j-string:#9ece6a; --j-number:#ff9e64; --j-boolean:#bb9af7; --j-null:#8b93b8;
  --a-copy:#7aa2f7; --a-pin:#e0af68; --a-tag:#bb9af7; --a-del:#f7768e; --a-custom:#7dcfff;

  position:fixed; width:700px; min-width:340px; max-width:95vw;
  height:500px; min-height:180px; max-height:85vh;
  display:flex; flex-direction:column; border-radius:12px;
  background:var(--c-bg); color:var(--c-fg); border:1px solid var(--c-border);
  box-shadow:0 8px 32px rgba(0,0,0,.32);
  font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;
  z-index:2147483000; resize:both; overflow:hidden;
  opacity:1; transition:opacity .2s ease;
}
/* Opt-in only. v2.0 shipped this on by default, which made the panel invisible
   on touch devices, in screenshots, and to keyboard focus. */
.candy-logger--dim{opacity:.12}
.candy-logger--dim:hover,.candy-logger--dim:focus-within,.candy-logger--dim.candy-logger--pinned{opacity:1}

.candy-logger--light{
  --c-bg:#ffffff; --c-elev:#f8fafc; --c-row:#f1f5f9;
  --c-fg:#0f172a; --c-muted:#64748b; --c-border:#e2e8f0;
  --c-accent:#4f46e5; --c-accent-fg:#ffffff; --c-focus:#4f46e5;
  --c-rail:#b45309; --c-rail-bg:rgba(180,83,9,.06);
  --l-log:#1d4ed8;    --l-log-bg:#eff6ff;
  --l-info:#0369a1;   --l-info-bg:#f0f9ff;
  --l-debug:#6d28d9;  --l-debug-bg:#f5f3ff;
  --l-success:#15803d;--l-success-bg:#f0fdf4;
  --l-warn:#b45309;   --l-warn-bg:#fffbeb;
  --l-error:#b91c1c;  --l-error-bg:#fef2f2;
  --j-key:#4f46e5; --j-string:#047857; --j-number:#b45309; --j-boolean:#6d28d9; --j-null:#64748b;
  --a-copy:#1d4ed8; --a-pin:#b45309; --a-tag:#6d28d9; --a-del:#b91c1c; --a-custom:#0369a1;
  box-shadow:0 8px 32px rgba(15,23,42,.14);
}

.candy-logger--minimized{height:auto!important;min-height:0!important;max-height:none!important;resize:none}
.candy-logger--minimized .candy-toolbar,.candy-logger--minimized .candy-body{display:none!important}
.candy-logger :focus-visible{outline:2px solid var(--c-focus);outline-offset:2px;border-radius:4px}

/* Header */
.candy-header{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;
  cursor:move;user-select:none;touch-action:none;background:var(--c-elev);
  border-bottom:1px solid var(--c-border);border-radius:12px 12px 0 0;flex-shrink:0}
.candy-header-left{display:flex;align-items:center;gap:8px;min-width:0}
.candy-title{font-weight:700;font-size:13px;letter-spacing:-.3px;white-space:nowrap}
.candy-badge{font-size:10px;padding:2px 7px;border-radius:10px;background:var(--c-accent);color:var(--c-accent-fg);font-weight:600}
.candy-log-counter{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600;min-width:18px;text-align:center;
  background:var(--c-row);color:var(--c-fg)}
.candy-header-right{display:flex;gap:2px}
.candy-hbtn{background:none;border:none;color:var(--c-fg);width:28px;height:28px;border-radius:6px;cursor:pointer;
  font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s;padding:0}
.candy-hbtn:hover{background:var(--c-row)}
.candy-hbtn.active{background:var(--l-log-bg);color:var(--c-accent)}

/* Toolbar */
.candy-toolbar{padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0;
  background:var(--c-bg);border-bottom:1px solid var(--c-border)}
.candy-filters{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.candy-fbtn{padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;white-space:nowrap;
  background:var(--c-elev);color:var(--c-muted);border:1px solid var(--c-border);transition:all .15s}
.candy-fbtn:hover{background:var(--c-row);color:var(--c-fg)}
.candy-fbtn--active{background:var(--c-accent);color:var(--c-accent-fg);border-color:var(--c-accent)}
.candy-fcount{font-size:10px;margin-left:3px;font-variant-numeric:tabular-nums}
.candy-search-wrap{flex:0 1 180px}
.candy-search{width:100%;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;
  background:var(--c-elev);color:var(--c-fg);border:1px solid var(--c-border);transition:border-color .15s,box-shadow .15s}
.candy-search:focus{border-color:var(--c-focus);box-shadow:0 0 0 2px color-mix(in srgb,var(--c-focus) 25%,transparent)}
.candy-search::placeholder{color:var(--c-muted)}

/* Body + table */
.candy-body{flex:1;display:flex;flex-direction:column;min-height:0;position:relative;background:var(--c-bg);border-radius:0 0 12px 12px}
.candy-table-wrap{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0}
.candy-table-wrap::-webkit-scrollbar{width:6px}
.candy-table-wrap::-webkit-scrollbar-thumb{background:var(--c-border);border-radius:3px}
.candy-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.candy-th{padding:6px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px;
  position:sticky;top:0;z-index:2;background:var(--c-elev);color:var(--c-muted);border-bottom:2px solid var(--c-border)}
.candy-th--time{width:72px}.candy-th--level{width:68px}.candy-th--tags{width:104px}
.candy-th--message{width:auto}.candy-th--actions{width:150px}

.candy-tr{border-bottom:1px solid var(--c-border);animation:candy-fadeIn .18s ease}
.candy-tr:hover{background:var(--c-row)}
.candy-tr--hidden{display:none}
.candy-tr--pinned{border-left:3px solid var(--c-rail);background:var(--c-rail-bg)}
.candy-pinned-body .candy-tr:last-child{border-bottom:2px solid var(--c-rail)}
.candy-td{padding:6px 10px;vertical-align:top;font-size:12px;line-height:1.5;color:var(--c-fg)}
.candy-td--time{font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:11px;color:var(--c-muted);white-space:nowrap}
.candy-td--level,.candy-td--actions{white-space:nowrap}
.candy-td--message{font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;max-width:0}
.candy-td--message:hover,.candy-tr:focus-within .candy-td--message{white-space:normal;overflow:visible;word-break:break-word}
.candy-dash{color:var(--c-muted)}
@keyframes candy-fadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}

/* Level badges — both themes supply the tokens */
.candy-level{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.3px}
.candy-level--log{background:var(--l-log-bg);color:var(--l-log)}
.candy-level--info{background:var(--l-info-bg);color:var(--l-info)}
.candy-level--debug{background:var(--l-debug-bg);color:var(--l-debug)}
.candy-level--success{background:var(--l-success-bg);color:var(--l-success)}
.candy-level--warn{background:var(--l-warn-bg);color:var(--l-warn)}
.candy-level--error{background:var(--l-error-bg);color:var(--l-error)}

.candy-tag{display:inline-block;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;
  margin:0 3px 2px 0;white-space:nowrap;background:var(--l-log-bg);color:var(--l-log)}

/* Row actions */
.candy-abtn{border:none;cursor:pointer;font-size:12px;padding:3px 7px;border-radius:5px;font-weight:500;
  display:inline-flex;align-items:center;margin-right:3px;line-height:1;background:var(--c-row);color:var(--c-fg);transition:filter .15s}
.candy-abtn:hover{filter:brightness(1.25)}
.candy-abtn--copy{background:var(--l-log-bg);color:var(--a-copy)}
.candy-abtn--pin{background:var(--l-warn-bg);color:var(--a-pin)}
.candy-abtn--pin.active{box-shadow:inset 0 0 0 1px var(--a-pin)}
.candy-abtn--tag{background:var(--l-debug-bg);color:var(--a-tag)}
.candy-abtn--del{background:var(--l-error-bg);color:var(--a-del)}
.candy-abtn--custom{background:var(--l-info-bg);color:var(--a-custom)}

.candy-tag-input{display:inline-flex;margin-left:2px}
.candy-tag-input input{width:84px;padding:3px 7px;border-radius:5px;font-size:11px;outline:none;font-family:inherit;
  background:var(--c-elev);color:var(--c-fg);border:1px solid var(--c-border)}
.candy-tag-input input:focus{border-color:var(--c-focus)}

/* JSON */
.candy-json-toggle{cursor:pointer;user-select:none;margin-right:4px;font-size:10px;background:none;border:none;
  color:var(--c-muted);padding:0 2px;transition:transform .15s}
.candy-json-toggle.collapsed{transform:rotate(-90deg)}
.candy-json-toggle:hover{color:var(--c-fg)}
.candy-json-preview{background:none;border:none;padding:0;font:inherit;color:var(--c-muted);font-style:italic;cursor:pointer}
.candy-json-preview:hover{color:var(--c-fg)}
.candy-json-pre{padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.5;margin:4px 0;overflow-x:auto;
  white-space:pre-wrap;word-break:break-word;background:var(--c-elev);border:1px solid var(--c-border);color:var(--c-fg);
  font-family:ui-monospace,'SF Mono','Cascadia Code',monospace}
.candy-json-pre--inline{margin:2px 0;padding:4px 8px;display:inline-block;max-width:100%}
.candy-json-key{color:var(--j-key)}.candy-json-string{color:var(--j-string)}
.candy-json-number{color:var(--j-number)}.candy-json-boolean{color:var(--j-boolean)}.candy-json-null{color:var(--j-null)}
.candy-err{color:var(--l-error);font-weight:600}
.candy-truncated{color:var(--l-warn);font-size:10px;font-style:italic}
.candy-detail-row td{padding:2px 14px 12px!important}
.candy-detail-row .candy-json-pre{margin:0;max-height:420px;overflow:auto}
.candy-copy-row{display:flex;gap:4px;margin-top:6px}
.candy-copy-btn{padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;border:none;font-weight:600;
  background:var(--l-log-bg);color:var(--a-copy)}

/* Empty state + new-logs pill */
.candy-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;color:var(--c-muted)}
.candy-empty.hidden{display:none}
.candy-empty-icon{font-size:40px;margin-bottom:8px;animation:candy-bounce 2s ease-in-out 3}
@keyframes candy-bounce{0%,100%{transform:none}50%{transform:translateY(-8px)}}
.candy-empty-title{font-size:15px;font-weight:600;margin-bottom:4px;color:var(--c-fg)}
.candy-empty-sub{font-size:12px}
.candy-newpill{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:3;cursor:pointer;
  padding:5px 12px;border-radius:999px;border:1px solid var(--c-border);font-size:11px;font-weight:600;
  background:var(--c-accent);color:var(--c-accent-fg);box-shadow:0 4px 14px rgba(0,0,0,.28)}
.candy-newpill--hidden{display:none}

/* Resize affordance */
.candy-logger::after{content:"⋰";position:absolute;bottom:2px;right:5px;font-size:11px;opacity:.35;pointer-events:none;color:var(--c-muted)}

/* Phone: full-screen sheet instead of a 700px box off the side of the viewport */
@media (max-width:640px){
  .candy-logger{inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;
    max-height:100%!important;border-radius:0!important;resize:none;opacity:1!important}
  .candy-logger--minimized{inset:auto 8px 8px auto!important;width:auto!important;height:auto!important;border-radius:12px!important}
  .candy-th--tags,.candy-td--tags{display:none}
  .candy-th--actions,.candy-td--actions{width:96px}
  .candy-abtn{padding:6px 8px}
}

@media (prefers-reduced-motion:reduce){
  .candy-logger,.candy-logger *,.candy-logger *::before,.candy-logger *::after{
    animation:none!important;transition:none!important}
}
`;
