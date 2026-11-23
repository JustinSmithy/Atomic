/* Atomic Garage staff portal: shared scheduling module.
   ONE module drives both the Calendar page and the week scheduler inside Operations > Bookings, so they
   read the same loaded bookings (ST.list) and the same server data (calendar_availability), and every
   change goes through the same confirmation dialog and the same server rules (staff_check_slot +
   staff_booking_action). Nothing here decides whether a time is valid: the database does.
   All times are shown in the workshop time zone (ST.tz, UTC by default) and labelled with it. */
/* AGSCHED-INLINE-CSS */
(function(){try{if(document.getElementById("sc-inline-css"))return;var s=document.createElement("style");s.id="sc-inline-css";s.textContent="/* Atomic Garage staff portal: shared scheduling UI (Calendar page + Operations > Bookings).\n   Uses the portal's theme variables so the black-and-yellow look is inherited. */\n:root{--sc-blue:#4da3ff;--sc-iv:#1565c0;--sc-slot:30px}\n\n/* ---------- calendar page layout ---------- */\n.sc-wrap{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}\n@media(min-width:1500px){.sc-wrap{grid-template-columns:minmax(0,1fr) 340px;align-items:start}.sc-side{position:sticky;top:84px;max-height:calc(100vh - 100px);overflow:auto}}\n.sc-main{padding:18px}\n.sc-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}\n.sc-bar .sc-title{flex:1 1 180px;text-align:center;font:700 18px Archivo,sans-serif;min-width:150px}\n.sc-bar select{width:auto;min-width:150px;max-width:100%}\n.sc-seg{display:inline-flex;gap:0;max-width:100%}.sc-seg button{flex:1 1 auto;padding-left:12px;padding-right:12px}.sc-seg button{border-radius:0}.sc-seg button+button{margin-left:-1px}\n.sc-tz{font-size:12px;color:var(--mute)}\n.sc-check{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--mute)}.sc-check input{width:auto}\n.sc-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:var(--mute);margin:6px 0 10px}\n.sc-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px;border:2px solid var(--line)}\n.sc-legend .l-pending{border-color:var(--acc);background:rgba(255,196,0,.25)}\n.sc-legend .l-proposed{border:2px dashed var(--sc-blue);background:rgba(77,163,255,.2)}\n.sc-legend .l-approved{border-color:var(--ok);background:rgba(91,224,122,.25)}\n.sc-legend .l-progress{border-color:var(--ok);background:var(--ok)}\n.sc-legend .l-done{border-color:var(--mute);background:var(--panel2);opacity:.7}\n.sc-legend .l-cancel{border-color:var(--bad);background:transparent}\n.sc-legend .l-iv{border-color:var(--sc-iv);background:rgba(21,101,192,.5)}\n.sc-banner{margin:8px 0;padding:10px 12px;border:1px solid var(--warn,#ffb020);border-left-width:4px;border-radius:6px;background:var(--glow);font-size:14px}\n.sc-banner.bad{border-color:var(--bad)}\n.sc-empty{padding:26px 16px;text-align:center;color:var(--mute);border:1px dashed var(--line);border-radius:8px;margin:10px 0}\n.sc-empty b{display:block;color:var(--ink);margin-bottom:4px}\n\n/* ---------- time grid (day + week) ---------- */\n.sc-grid{border:1px solid var(--line);border-radius:8px;background:var(--panel)}\n.sc-scroll{max-height:min(72vh,780px);overflow:auto;overscroll-behavior:contain;position:relative}\n.sc-head,.sc-body{display:grid;grid-template-columns:52px repeat(var(--cols),minmax(0,1fr))}\n.sc-head{position:sticky;top:0;z-index:5;background:var(--panel2);border-bottom:1px solid var(--line)}\n.sc-corner{border-right:1px solid var(--line)}\n.sc-dh{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:8px 4px;border-right:1px solid var(--line);font-size:13px;line-height:1.25}\n.sc-dh:last-child{border-right:0}.sc-dh b{display:block;font-size:16px}.sc-dh:hover{background:var(--glow)}\n.sc-dh.today b{color:var(--acc)}.sc-dh small{display:block;color:var(--mute);font-size:11px}\n.sc-dh:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}\n.sc-gut{position:relative;border-right:1px solid var(--line);font-size:11px;color:var(--mute)}\n.sc-gut span{position:absolute;right:6px;transform:translateY(-50%)}\n.sc-col{position:relative;border-right:1px solid var(--line);\n  background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px var(--hour-px));}\n.sc-col:last-child{border-right:0}\n.sc-col.drop{background-color:var(--glow)}\n.sc-off{position:absolute;left:0;right:0;background:repeating-linear-gradient(135deg,rgba(128,128,128,.14) 0 6px,transparent 6px 12px);pointer-events:none;z-index:0}\n.sc-offlbl{position:absolute;left:0;right:0;top:8px;text-align:center;font-size:11px;color:var(--mute);z-index:1;pointer-events:none}\n.sc-now{position:absolute;left:0;right:0;height:0;border-top:2px solid var(--bad);z-index:3;pointer-events:none}\n.sc-drop{position:absolute;left:2px;right:2px;height:2px;background:var(--acc);z-index:4;pointer-events:none}\n.sc-drop b{position:absolute;right:0;top:-18px;background:var(--acc);color:var(--accink,#111);font:700 11px Archivo,sans-serif;padding:1px 6px;border-radius:3px}\n\n/* ---------- events ---------- */\n.sc-ev,.sc-card{box-sizing:border-box;border:1px solid var(--line);border-left-width:4px;background:var(--panel2);color:var(--ink);text-align:left;font:inherit;text-transform:none;letter-spacing:0}\n.sc-ev{position:absolute;z-index:2;overflow:hidden;border-radius:6px;padding:2px 6px;font-size:12px;line-height:1.25;cursor:pointer}\n.sc-ev:hover,.sc-card:hover{filter:none;transform:none;box-shadow:0 0 0 2px var(--acc)}\n.sc-ev:focus-visible,.sc-card:focus-visible{outline:2px solid var(--acc);outline-offset:1px}\n.sc-ev[draggable=true]{cursor:grab}.sc-ev.dragging{opacity:.4}\n.sc-ev b{font-weight:700}.sc-ev small{display:block;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.sc-ev .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}\n.sc-ev .bd,.sc-card .bd{display:inline-block;margin-left:4px;padding:0 5px;border-radius:3px;font:700 9px Archivo,sans-serif;letter-spacing:.06em;text-transform:uppercase;background:var(--acc);color:var(--accink,#111);vertical-align:1px}\n.s-pending{border-color:var(--acc);background:rgba(255,196,0,.14)}\n.s-alternative_proposed{border-style:dashed;border-color:var(--sc-blue);background:rgba(77,163,255,.14)}\n.s-alternative_accepted{border-color:var(--sc-blue);border-left-color:var(--acc);background:rgba(77,163,255,.24)}\n.s-approved{border-color:var(--ok);background:rgba(91,224,122,.14)}\n.s-in_progress{background:var(--ok);color:#06120a;border-color:var(--ok)}.s-in_progress small{color:#143a1e}\n.s-completed{opacity:.62;border-color:var(--mute);background:var(--panel)}\n.s-cancelled,.s-declined{opacity:.55;border-color:var(--bad);text-decoration:line-through;background:var(--panel)}\n.s-reschedule{border-style:dashed;border-color:var(--acc);background:repeating-linear-gradient(135deg,rgba(255,196,0,.2) 0 6px,transparent 6px 12px)}\n.s-iv{border-color:var(--sc-iv);background:rgba(21,101,192,.3)}\n.s-iv.i-confirmed{border-color:#2e7d32}.s-iv.i-reschedule_requested{border-color:var(--warn,#ffb020)}.s-iv.i-completed,.s-iv.i-no_show,.s-iv.i-cancelled{opacity:.6}\n\n/* ---------- month ---------- */\n.sc-mg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}\n.sc-mw{text-align:center;font-size:12px;color:var(--mute);padding:2px}\n.sc-md{all:unset;box-sizing:border-box;cursor:pointer;min-height:96px;padding:5px;border:1px solid var(--line);border-radius:8px;display:flex;flex-direction:column;gap:3px;overflow:hidden;background:var(--panel)}\n.sc-md b{font-size:13px}.sc-md.out{opacity:.45}.sc-md.today b{color:var(--acc)}.sc-md.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}\n.sc-md.off{background:repeating-linear-gradient(135deg,rgba(128,128,128,.14) 0 6px,transparent 6px 12px)}\n.sc-md:focus-visible{outline:2px solid var(--acc)}.sc-md i{font-style:normal;font-size:11px;color:var(--mute)}\n.sc-chip{font-size:11px;line-height:1.2;padding:2px 4px;border-radius:4px;border:1px solid var(--line);border-left-width:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.sc-cnt{display:none}\n\n/* ---------- cards / agenda / sidebar ---------- */\n.sc-card{display:block;width:100%;padding:9px 11px;border-radius:8px;margin:6px 0;cursor:pointer}\n.sc-card .ct{font-weight:700;font-variant-numeric:tabular-nums}.sc-card small{display:block;color:var(--mute);overflow-wrap:anywhere}\n.sc-card.s-in_progress small{color:#143a1e}\n.sc-agenda{display:none}.sc-ah{font:700 14px Archivo,sans-serif;margin:14px 0 2px;color:var(--acc)}\n.sc-side .card{padding:16px}.sc-side h3{margin:0 0 6px}\n.sc-need{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}\n.sc-need .n{padding:3px 9px;border:1px solid var(--bad);color:var(--bad);border-radius:99px;font-size:12px;font-weight:700}\n.sc-need .n.w{border-color:var(--warn,#ffb020);color:var(--warn,#ffb020)}\n.sc-dayh{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}\n\n/* ---------- details drawer ---------- */\n.sc-back{position:fixed;inset:0;z-index:58;background:rgba(0,0,0,.5)}\n.sc-drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);z-index:59;background:var(--bg,#0b0b0b);border-left:4px solid var(--acc);overflow:auto;overscroll-behavior:contain;padding:0 18px calc(24px + env(safe-area-inset-bottom,0px))}\n.sc-dh2{display:flex;justify-content:space-between;align-items:center;gap:10px;position:sticky;top:0;z-index:2;background:var(--bg,#0b0b0b);padding:14px 0;border-bottom:1px solid var(--line)}\n.sc-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 16px;margin:12px 0}\n.sc-dl dt{color:var(--acc);font:700 11px Archivo,sans-serif;letter-spacing:.12em;text-transform:uppercase}.sc-dl dd{margin:3px 0 0;overflow-wrap:anywhere}\n.sc-sec{padding:12px 0;border-bottom:1px solid var(--line)}.sc-sec:last-child{border-bottom:0}\n.sc-sec h3{margin:0 0 8px}\n.sc-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\n.sc-inline{display:flex;gap:8px;flex-wrap:wrap}.sc-inline select{flex:1 1 200px;width:auto}\n\n/* ---------- confirmation modal ---------- */\n.sc-mback{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:14px}\n.sc-modal{width:min(520px,100%);max-height:calc(100vh - 28px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--acc);border-radius:10px;padding:18px}\n.sc-modal h2{margin:0 0 10px;font-size:22px}\n.sc-rows{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:8px 0;font-size:14px}.sc-rows dt{color:var(--mute)}.sc-rows dd{margin:0;overflow-wrap:anywhere}\n.sc-rows .from{text-decoration:line-through;color:var(--mute)}\n.sc-cf{margin:8px 0;padding:8px 10px;border-radius:6px;border:1px solid var(--warn,#ffb020);background:var(--glow);font-size:14px}\n.sc-cf.hard{border-color:var(--bad)}.sc-cf b{display:block}\n.sc-modal textarea{min-height:60px}.sc-modal .sc-acts{margin-top:12px;justify-content:flex-end}\n\n/* ---------- compact week scheduler (booking details + calendar drawer) ---------- */\n.sc-sch{margin-top:8px}\n.sc-sch-info{display:grid;gap:4px;font-size:14px;margin-bottom:8px}.sc-sch-info b{color:var(--ink)}\n.sc-sch-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}\n.sc-sch-bar .t{flex:1 1 120px;text-align:center;font-weight:700;font-size:14px}\n.sc-sch-bar input[type=date],.sc-sch-bar select{width:auto;min-width:0;flex:0 1 auto}\n.sc-sch-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:6px 0}\n.sc-sch-opts label{margin:0 0 3px}\n.sc-sl{border:1px solid var(--line);border-radius:6px;overflow:auto;max-height:290px;background:var(--panel);overscroll-behavior:contain}\n.sc-slg{display:grid;grid-template-columns:42px repeat(7,minmax(40px,1fr));min-width:340px}\n.sc-slh{position:sticky;top:0;z-index:2;background:var(--panel2);font-size:11px;text-align:center;padding:4px 0;border-bottom:1px solid var(--line);line-height:1.2}\n.sc-slh.today{color:var(--acc)}.sc-slh b{display:block;font-size:13px}\n.sc-slt{font-size:10px;color:var(--mute);text-align:right;padding:0 4px 0 0;display:flex;align-items:center;justify-content:flex-end;height:20px}\n.sc-c{all:unset;box-sizing:border-box;height:20px;border:1px solid var(--panel);border-radius:3px;cursor:pointer;font-size:10px;text-align:center;line-height:18px;color:var(--ink);background:rgba(91,224,122,.16)}\n.sc-c:hover:not(:disabled){box-shadow:0 0 0 2px var(--acc) inset}.sc-c:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}\n.sc-c.used{background:rgba(91,224,122,.34)}\n.sc-c.full{background:rgba(255,176,32,.38)}\n.sc-c.mech{background:repeating-linear-gradient(135deg,rgba(255,80,80,.45) 0 4px,rgba(255,80,80,.15) 4px 8px);cursor:not-allowed}\n.sc-c.na{background:repeating-linear-gradient(135deg,rgba(128,128,128,.22) 0 4px,transparent 4px 8px);cursor:not-allowed;color:var(--mute)}\n.sc-c.past{background:rgba(128,128,128,.12);cursor:not-allowed}\n.sc-c.req{box-shadow:0 0 0 2px var(--acc) inset}.sc-c.cur{box-shadow:0 0 0 2px var(--ok) inset}.sc-c.prop{box-shadow:0 0 0 2px var(--sc-blue) inset}\n.sc-c.pick{background:var(--acc);color:var(--accink,#111);font-weight:800}\n.sc-sk{display:flex;gap:6px 12px;flex-wrap:wrap;font-size:11px;color:var(--mute);margin:6px 0}\n.sc-sk i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:4px;vertical-align:-2px;border:1px solid var(--line)}\n.sc-pick{margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:6px;background:var(--panel2);font-size:14px}\n.sc-pick ul{margin:6px 0;padding-left:18px}.sc-pick li.hard{color:var(--bad)}.sc-pick li.soft{color:var(--warn,#ffb020)}\n\n/* Operations > Bookings: give the details panel more room */\n.bk2{grid-template-columns:minmax(280px,380px) minmax(0,1fr)!important}\n\n/* ---------- mobile ---------- */\n@media(max-width:760px){\n  .sc-seg{width:100%}.sc-seg button{min-width:0;padding-left:6px;padding-right:6px;font-size:12px;letter-spacing:.02em}.sc-bar>.alt.sm{flex:1 1 auto}.sc-main{padding:12px}.sc-bar .sc-title{order:-1;flex:1 1 100%}\n  .sc-bar select{flex:1 1 100%}\n  .sc-wkgrid{display:none}.sc-agenda{display:block}\n  .sc-md{min-height:56px;padding:3px}.sc-md .sc-chip{display:none}.sc-md .sc-cnt{display:inline-block;align-self:flex-start;background:var(--acc);color:var(--accink,#111);font:700 11px Archivo,sans-serif;padding:0 6px;border-radius:99px}\n  .sc-head,.sc-body{grid-template-columns:44px repeat(var(--cols),minmax(0,1fr))}\n  .sc-drawer{width:100vw;border-left:0;border-top:4px solid var(--acc)}\n  .sc-modal{padding:14px}.sc-modal .sc-acts button{flex:1 1 100%}\n  .sc-acts button{flex:1 1 auto}\n}\n@media(prefers-reduced-motion:reduce){.sc-ev,.sc-card{transition:none}}\n\n/* ================= v2: three-column Calendar, booking panel, top bar ================= */\n.sc-page{display:block}\n.sc-left{display:none}\n.sc-center{min-width:0;display:block}\n.sc-center>.card{margin-bottom:16px}\n.sc-legend.v{display:grid;gap:6px;margin:0}\n.sc-lc{padding:14px}\n.sc-lt{margin:16px 0 6px;font:700 11px Archivo,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)}\n.sc-lc select{width:100%}\n.sc-rad{display:grid;gap:6px}.sc-rad label{display:flex;gap:8px;align-items:center;margin:0;font-size:14px;cursor:pointer}.sc-rad input{width:auto;accent-color:var(--acc)}\n.sc-cc{margin-top:8px}\n.sc-hrs{display:grid;gap:4px;font-size:13px}.sc-hrs div{display:flex;justify-content:space-between;gap:8px}.sc-hrs span{color:var(--mute)}\n.sc-mini .sc-mh{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;font-size:14px}\n.sc-mg2{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}\n.sc-mg2 span{font-size:10px;color:var(--mute);padding:2px 0}\n.sc-mg2 button{all:unset;box-sizing:border-box;cursor:pointer;font-size:12px;line-height:26px;height:26px;border-radius:6px;text-align:center;color:var(--ink)}\n.sc-mg2 button.out{color:var(--mute);opacity:.5}.sc-mg2 button.wk{background:var(--glow)}\n.sc-mg2 button.today{box-shadow:0 0 0 1px var(--acc) inset}.sc-mg2 button.sel{background:var(--acc);color:var(--accink,#111);font-weight:800;opacity:1}\n.sc-mg2 button:hover{background:var(--glow)}.sc-mg2 button:focus-visible{outline:2px solid var(--acc)}\n\n/* upcoming table */\n.sc-uh{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}.sc-uh h3{margin:0}\n.sc-ut table{width:100%;border-collapse:collapse;font-size:14px}\n.sc-ut th{text-align:left;font:700 11px Archivo,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:6px 10px}\n.sc-ut td{padding:9px 10px;border-top:1px solid var(--line)}\n.sc-ut tbody tr{cursor:pointer}.sc-ut tbody tr:hover{background:var(--glow)}.sc-ut tbody tr:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}\n.sc-ucards{display:none}\n\n/* booking panel + drawer */\n.sc-tabs{display:flex;gap:0;margin:12px 0;border:1px solid var(--line);border-radius:8px;overflow:hidden}\n.sc-tabs button{all:unset;box-sizing:border-box;flex:1;text-align:center;padding:9px 6px;cursor:pointer;font:700 13px Archivo,sans-serif;color:var(--mute)}\n.sc-tabs button.on{background:var(--acc);color:var(--accink,#111)}.sc-tabs button:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}\n.sc-sum{margin:6px 0}\n.sc-tl{list-style:none;margin:0;padding:0;display:grid;gap:10px}.sc-tl li{border-left:3px solid var(--acc);padding-left:10px}.sc-tl li.int{border-left-color:var(--mute)}\n.sc-tl small{display:block;color:var(--mute)}.sc-tl span{display:block;overflow-wrap:anywhere}\n\n/* scheduler: day chips + time buttons */\n.sc-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:8px 0}\n.sc-dc{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:6px 0;border:1px solid var(--line);border-radius:8px;font-size:11px;color:var(--mute);position:relative;background:var(--panel)}\n.sc-dc b{display:block;font-size:16px;color:var(--ink)}.sc-dc.off{opacity:.45}.sc-dc.today{border-color:var(--acc)}\n.sc-dc.on{background:var(--acc);border-color:var(--acc);color:var(--accink,#111);opacity:1}.sc-dc.on b{color:var(--accink,#111)}\n.sc-dc i{position:absolute;right:4px;top:4px;width:6px;height:6px;border-radius:50%;background:var(--acc)}.sc-dc.on i{background:var(--accink,#111)}\n.sc-dc:focus-visible{outline:2px solid var(--acc);outline-offset:1px}\n.sc-th{margin:12px 0 6px;font:700 13px Archivo,sans-serif}\n.sc-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:6px;max-height:300px;overflow:auto;overscroll-behavior:contain;padding:2px}\n.sc-tb{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:8px 2px;border:1px solid var(--line);border-radius:8px;font-size:13px;color:var(--ink);background:rgba(91,224,122,.1);position:relative}\n.sc-tb sup{position:absolute;right:3px;top:1px;font-size:9px}\n.sc-tb.used{background:rgba(91,224,122,.28)}.sc-tb.full{background:rgba(255,176,32,.3);border-color:var(--warn,#ffb020)}\n.sc-tb.mech{background:repeating-linear-gradient(135deg,rgba(255,80,80,.4) 0 4px,rgba(255,80,80,.12) 4px 8px);cursor:not-allowed}\n.sc-tb.na,.sc-tb.past{background:rgba(128,128,128,.1);color:var(--mute);cursor:not-allowed}.sc-tb.na{background:repeating-linear-gradient(135deg,rgba(128,128,128,.2) 0 4px,transparent 4px 8px)}\n.sc-tb.req{box-shadow:0 0 0 2px var(--acc) inset}.sc-tb.cur{box-shadow:0 0 0 2px var(--ok) inset}.sc-tb.prop{box-shadow:0 0 0 2px var(--sc-blue) inset}\n.sc-tb:hover:not(:disabled){box-shadow:0 0 0 2px var(--acc) inset}.sc-tb.pick{background:var(--acc);color:var(--accink,#111);font-weight:800;border-color:var(--acc)}\n.sc-tb:focus-visible{outline:2px solid var(--acc);outline-offset:1px}\n.sc-final{margin-top:12px}\n.sc-final button{background:transparent;font-weight:700}\n.sc-final .sc-ok{color:var(--ok);border:1px solid var(--ok)}.sc-final .sc-alt{color:var(--acc);border:1px solid var(--acc)}.sc-final .sc-no{color:var(--bad);border:1px solid var(--bad)}\n.sc-final button:disabled{opacity:.4;cursor:not-allowed}\n.sc-pick .alt.sm{float:right}\n\n/* docked panel + three columns on wide screens */\n@media(min-width:1300px){\n  .sc-page{display:grid;grid-template-columns:230px minmax(0,1fr) 380px;gap:16px;align-items:start}\n  .sc-left{display:block;position:sticky;top:84px;max-height:calc(100vh - 100px);overflow:auto}\n  .sc-filters,.sc-legend-wrap{display:none}\n  .sc-docked{position:sticky;top:84px;right:auto;bottom:auto;width:auto;max-height:calc(100vh - 100px);z-index:auto;border:1px solid var(--line);border-top:4px solid var(--acc);border-radius:10px;background:var(--panel);padding:0 16px 16px}\n  .sc-docked .sc-dh2{background:var(--panel)}\n  .sc-docked .sc-empty{border:0;margin-top:40px}\n  .sc-scroll{max-height:min(68vh,720px)}\n}\n@media(max-width:760px){\n  .sc-ut{display:none}.sc-ucards{display:block}\n  .sc-times{grid-template-columns:repeat(auto-fill,minmax(60px,1fr))}\n}\n\n.sc-docked .bk-ref{font-size:20px}\n.sc-dh2 .pill{vertical-align:middle}\n@media(min-width:1560px){.sc-page{grid-template-columns:240px minmax(0,1fr) 430px}}\n.sc-drawer .sc-times,.sc-docked .sc-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px}\n\n/* ===== Phase 0 refinements ===== */\n.sc-center>p.note{background:var(--pa,var(--panel));border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:0 0 16px}\n.sc-ut{overflow-x:auto}.sc-ut td:last-child,.sc-ut th:last-child{white-space:nowrap}\n.sc-ut .pill{font-size:11px;padding:4px 9px;white-space:nowrap}\n@media(min-width:1420px){.sc-page{grid-template-columns:230px minmax(0,1fr) 420px}}\n@media(min-width:1700px){.sc-page{grid-template-columns:240px minmax(0,1fr) 480px}}\n@media(min-width:1920px){.sc-page{grid-template-columns:250px minmax(0,1fr) 520px}}\n.sc-drawer{width:min(620px,100vw)}\n.sc-docked .sc-nav-row,.sc-docked .sc-wk{flex-wrap:wrap;gap:8px}\n.sc-docked input[type=date]{min-width:0;width:100%}\n.sc-sch-bar input[type=date]{flex:1 1 100%;width:100%}\n.sc-sch-bar .t{flex:1 1 100px}\n@media(min-width:1300px){.sc-drawer.sc-docked{width:auto}}\n@media(min-width:761px) and (max-width:1699px){.sc-ut table{font-size:13px}.sc-ut td,.sc-ut th{padding:8px 6px}.sc-ut .pill{font-size:10px;padding:3px 7px;letter-spacing:.04em}}\n\n/* Approved leave of absence layer */\n.sc-leave{position:absolute;left:0;right:0;background:repeating-linear-gradient(135deg,rgba(138,143,152,.22) 0 8px,rgba(138,143,152,.08) 8px 16px);pointer-events:none;z-index:1}\n.sc-leavelbl{position:absolute;left:4px;right:4px;top:4px;z-index:2;font-size:11px;font-weight:700;padding:3px 6px;border-radius:6px;background:rgba(40,44,52,.92);color:#fff;pointer-events:none;overflow:hidden;white-space:normal;line-height:1.25;max-height:52px}\n.sc-lvh{display:block;font-size:10px;color:#a8b0bd}\n.sc-lv{margin:2px 0 6px;font-size:13px;opacity:.9}\n.sc-chip.sc-lvc{background:rgba(138,143,152,.25);color:inherit;border:1px dashed rgba(138,143,152,.8)}\n";document.head.appendChild(s)}catch(e){}})();
(function () {
  "use strict";
  var X = window.AGX;
  if (!X) return;
  var ST = X.ST, esc = X.esc;
  var PX = 1.8;                         // pixels per minute in the time grids (a 20 minute slot = 36px)
  var DEF_LO = 8 * 60, DEF_HI = 20 * 60; // grid range when opening hours are unknown
  var CLOSED = ["declined", "cancelled"];
  var MOVABLE = ["pending", "alternative_proposed", "alternative_accepted", "approved"];

  var S = {
    mode: "week", anchor: null, layer: "all", mech: "all", closed: false, sel: null,
    drawer: null, sch: {}, modal: null, av: null, avErr: "", err: "", scrolled: false, drag: null, avBusy: false
  };

  /* ---------------------------------------------------------------- time helpers (workshop zone) */
  function tz() { return ST.tz || "UTC"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function wall(iso) { var w = X.wallParts(iso, tz()); return { d: w.d, t: w.t, m: (+w.t.slice(0, 2)) * 60 + (+w.t.slice(3, 5)) }; }
  function addDays(k, n) { var p = k.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function dow(k) { var p = k.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function wkStart(k) { return addDays(k, -((dow(k) + 6) % 7)); }
  function today() { return wall(new Date().toISOString()).d; }
  function atIso(k, m) { return X.wallToIso(k, pad(Math.floor(m / 60)) + ":" + pad(m % 60), tz()); }
  function mm(t) { return (+t.slice(0, 2)) * 60 + (+t.slice(3, 5)); }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function fDay(k, o) { return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", Object.assign({ timeZone: "UTC" }, o || { weekday: "short", day: "numeric", month: "short" })); }
  function fFull(iso) { return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz() }) + " " + tz(); }
  function daysIn(k) { var p = k.split("-"); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function relDay(k) { var t = today(); return k === t ? "Today" : k === addDays(t, 1) ? "Tomorrow" : fDay(k); }
  function diffDays(a, b) { var x = a.split("-"), y = b.split("-"); return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 864e5); }

  /* ---------------------------------------------------------------- names + labels */
  function mechName(id) { return id ? (X.nameOf(id) || "Assigned") : "Unassigned"; }
  function svc(b) { return X.SVC[b.service_type] || b.service_type; }
  function mechs() { return (ST.staff || []).filter(function (s) { return s.active && s.role !== "hr"; }); }
  function ivWho(id) { return X.ivWho(id) || ""; }
  function bById(id) { return (ST.list || []).filter(function (b) { return b.id === id; })[0]; }
  function iById(id) { return (X.CI.ivs || []).filter(function (i) { return i.id === id; })[0]; }
  function pending(b) { return b.status === "approved" && !!b.reschedule_proposed_at; }
  function bWhen(b) {
    if (b.status === "pending") return b.preferred_at;
    if (b.status === "alternative_proposed" || b.status === "alternative_accepted") return b.proposed_at || b.preferred_at;
    return b.scheduled_at || b.preferred_at;
  }
  function badge(e) {
    if (e.k === "i") return "Interview";
    if (e.ghost) return "New time";
    var b = e.b;
    if (pending(b)) return "Change pending";
    if (b.status === "pending") return "Pending";
    if (b.status === "alternative_proposed") return "Proposed";
    if (b.status === "alternative_accepted") return "Confirm";
    return "";
  }

  /* ---------------------------------------------------------------- availability (managers) */
  function prep(r) {
    r.hm = {}; (r.hours || []).forEach(function (h) { r.hm[h.weekday] = h; });
    r.blk = {}; (r.blocks || []).forEach(function (b) { r.blk[b.day] = b.reason || ""; });
    r.occ = (r.occupied || []).map(function (o) { return { id: o.booking_id, ref: o.reference, name: o.name, kind: o.kind, status: o.status, mech: o.mechanic_id, s: +new Date(o.starts), e: +new Date(o.ends) }; });
  }
  /* Resolves true when something was fetched. Managers only: mechanics have no availability data. */
  function ensureAv(from, to) {
    if (!X.isMgr()) return Promise.resolve(false);
    var c = S.av;
    if (c && !c.stale && c.from <= from && c.to >= to) return Promise.resolve(false);
    var f = addDays(from, -3), t = addDays(to, 10);
    if (diffDays(f, t) > 61) t = addDays(f, 61);
    return X.rpc("calendar_availability", { p_from: f, p_to: t }).then(function (r) {
      if (!r || r.ok === false) throw new Error((r && r.message) || "Availability could not be loaded.");
      r.from = f; r.to = t; prep(r); S.av = r; S.avErr = "";
      if (r.tz && r.tz !== ST.tz) ST.tz = r.tz;
      return true;
    }).catch(function (e) {
      if (e && e.message === "auth") { X.authErr(e); return false; }
      S.avErr = /calendar_availability|schema cache|function/i.test(e.message || "")
        ? "The scheduling update has not been applied to the database yet, so free slots cannot be shown."
        : (e.message || "Availability could not be loaded.");
      return false;
    });
  }
  function invalidate() { if (S.av) S.av.stale = true; }
  function dayInfo(k) {
    var a = S.av;
    if (!a || !a.enabled) return { known: false };
    var h = a.hm[dow(k)];
    if (!h || !h.is_open) return { known: true, open: false, why: "Closed" };
    if (a.blk[k] !== undefined) return { known: true, open: false, why: a.blk[k] ? "Blocked: " + a.blk[k] : "Blocked" };
    return { known: true, open: true, from: mm(h.open), to: mm(h.close) };
  }
  function slotMin() { return (S.av && S.av.slot_minutes) || 20; }

  /* ---------------------------------------------------------------- events for the calendar views */
  /* approved leave of absence, shown as a day-level layer (the server also blocks assigning work during it) */
  function leaveOn(k) {
    if (!window.AGLEAVE || S.layer === "interviews" || S.mech === "none") return [];
    var o = window.AGLEAVE.on(k);
    if (S.mech !== "all") o = o.filter(function (r) { return r.user_id === S.mech; });
    return o;
  }
  function leaveNames(k) { return leaveOn(k).map(function (r) { return r.name; }).join(", "); }
  function evList(from, to) {
    if (window.AGLEAVE) window.AGLEAVE.need(from, to);
    var out = [], rec = X.isRec();
    function add(iso, e) {
      if (!iso) return;
      var w = wall(iso);
      if (!w.d || w.d < from || w.d > to) return;
      e.start = iso; e.key = w.d; e.sm = w.m; e.em = w.m + e.mins; out.push(e);
    }
    if (S.layer !== "interviews") (ST.list || []).forEach(function (b) {
      if (CLOSED.indexOf(b.status) >= 0 && !S.closed) return;
      if (S.mech === "none" && b.assigned_to) return;
      if (S.mech !== "all" && S.mech !== "none" && b.assigned_to !== S.mech) return;
      var mins = b.duration_minutes || 20;
      add(bWhen(b), { k: "b", id: b.id, b: b, mins: mins, st: b.status });
      if (pending(b)) add(b.reschedule_proposed_at, { k: "b", id: b.id, b: b, mins: mins, st: "reschedule", ghost: true });
    });
    if (rec && S.layer !== "bookings") (X.CI.ivs || []).forEach(function (i) {
      if (i.status === "cancelled" && !S.closed) return;
      if (S.mech === "none") return;
      if (S.mech !== "all" && i.interviewer_id !== S.mech) return;
      add(i.scheduled_at, { k: "i", id: i.id, i: i, mins: i.duration_minutes || 30, st: "iv" });
    });
    out.sort(function (a, b) { return a.sm - b.sm || b.em - a.em; });
    return out;
  }
  function layout(list) {
    var cur = null, cl = [];
    list.forEach(function (e) {
      if (!cur || e.sm >= cur.end) { cur = { end: e.em, cols: [], items: [] }; cl.push(cur); }
      var c = 0; while (cur.cols[c] !== undefined && cur.cols[c] > e.sm) c++;
      cur.cols[c] = e.em; e.col = c; cur.items.push(e); cur.end = Math.max(cur.end, e.em);
    });
    cl.forEach(function (c) { c.items.forEach(function (e) { e.ncols = c.cols.length; }); });
  }
  function canDrag(e) {
    if (e.k === "b") return X.isMgr() && !e.ghost && MOVABLE.indexOf(e.b.status) >= 0;
    return X.isRec() && X.IV_ACTIVE.indexOf(e.i.status) >= 0;
  }
  function evClass(e) { return e.k === "i" ? "s-iv i-" + e.i.status : "s-" + e.st; }
  function evTitle(e) {
    if (e.k === "i") { var a = X.CI.apps[e.i.application_id] || {}; return "Interview with " + (a.character_name || "applicant") + " " + hhmm(e.sm) + "-" + hhmm(e.em); }
    return e.b.reference + " " + e.b.character_name + " " + hhmm(e.sm) + "-" + hhmm(e.em) + (e.ghost ? " (proposed new time)" : "");
  }
  function evText(e, tall) {
    var t = hhmm(e.sm) + "–" + hhmm(e.em), bd = badge(e);
    if (e.k === "i") {
      var a = X.CI.apps[e.i.application_id] || {};
      return '<span class="t"><b>' + t + '</b> ★ ' + esc(a.character_name || "Interview") + '</span>' + (tall ? '<small>Interview · ' + esc(X.IS[e.i.status] || e.i.status) + (ivWho(e.i.interviewer_id) ? ' · ' + esc(ivWho(e.i.interviewer_id)) : "") + '</small>' : "");
    }
    var b = e.b;
    return '<span class="t"><b>' + t + '</b> ' + esc(b.character_name) + (bd ? '<span class="bd">' + bd + '</span>' : "") + '</span>' +
      (tall ? '<small>' + esc(svc(b)) + ' · ' + esc(b.vehicle) + ' · ' + esc(mechName(b.assigned_to)) + '</small>' : "");
  }
  function card(e) {
    var rng = hhmm(e.sm) + "–" + hhmm(e.em), b = e.k === "b" ? e.b : null, bd = badge(e);
    var line2 = b ? esc(svc(b)) + ' · ' + esc(b.vehicle) + ' · ' + esc(X.STAT[b.status] || b.status) + (e.ghost ? " (proposed new time)" : "") + ' · ' + esc(mechName(b.assigned_to))
      : 'Interview · ' + esc(X.IS[e.i.status] || e.i.status) + (ivWho(e.i.interviewer_id) ? ' · ' + esc(ivWho(e.i.interviewer_id)) : "");
    var nm = b ? b.character_name : ((X.CI.apps[e.i.application_id] || {}).character_name || "Applicant");
    return '<div class="sc-card ' + evClass(e) + '" role="button" tabindex="0" data-sc="open" data-k="' + e.k + '" data-id="' + esc(e.id) + '" aria-label="' + esc(evTitle(e)) + '">' +
      '<span class="ct">' + rng + '</span> · <b>' + esc(nm) + '</b>' + (bd ? ' <span class="bd">' + bd + '</span>' : "") + '<small>' + line2 + '</small></div>';
  }

  /* ---------------------------------------------------------------- calendar views */
  function viewRange() {
    var a = S.anchor;
    if (S.mode === "day") return [a, a];
    if (S.mode === "week") { var w = wkStart(a); return [w, addDays(w, 6)]; }
    var f = a.slice(0, 8) + "01", last = a.slice(0, 8) + pad(daysIn(a));
    return [wkStart(f), addDays(wkStart(last), 6)];
  }
  function gridRange(keys, evs) {
    var lo = 1440, hi = 0;
    keys.forEach(function (k) { var d = dayInfo(k); if (d.known && d.open) { lo = Math.min(lo, d.from); hi = Math.max(hi, d.to); } });
    evs.forEach(function (e) { lo = Math.min(lo, Math.floor(e.sm / 60) * 60); hi = Math.max(hi, Math.ceil(e.em / 60) * 60); });
    if (lo >= hi) { lo = DEF_LO; hi = DEF_HI; }
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }
  function gridView(keys) {
    var evs = evList(keys[0], keys[keys.length - 1]), r = gridRange(keys, evs), lo = r[0], hi = r[1], by = {}, td = today(), H = (hi - lo) * PX;
    evs.forEach(function (e) { (by[e.key] = by[e.key] || []).push(e); });
    var tall = keys.length === 1, h = '<div class="sc-grid"><div class="sc-scroll" tabindex="-1"><div class="sc-head" style="--cols:' + keys.length + '"><div class="sc-corner"></div>';
    keys.forEach(function (k) {
      var di = dayInfo(k), n = (by[k] || []).length;
      h += '<button type="button" class="sc-dh' + (k === td ? " today" : "") + '" data-sc="goday" data-k="' + k + '" aria-label="Open ' + esc(fDay(k, { weekday: "long", day: "numeric", month: "long" })) + '">' + esc(fDay(k, { weekday: "short" })) + '<b>' + Number(k.slice(8)) + '</b><small>' + (di.known && !di.open ? esc(di.why) : n ? n + (n === 1 ? " item" : " items") : (tall && di.known ? hhmm(di.from) + "–" + hhmm(di.to) : "&nbsp;")) + '</small>' + (leaveOn(k).length ? '<small class="sc-lvh">' + leaveOn(k).length + ' on leave</small>' : "") + '</button>';
    });
    h += '</div><div class="sc-body" style="--cols:' + keys.length + '"><div class="sc-gut" style="height:' + H + 'px">';
    for (var m = lo; m <= hi; m += 60) h += '<span style="top:' + ((m - lo) * PX) + 'px">' + hhmm(m % 1440) + '</span>';
    h += '</div>';
    keys.forEach(function (k) {
      var di = dayInfo(k), list = by[k] || [];
      h += '<div class="sc-col" data-k="' + k + '" data-lo="' + lo + '" style="height:' + H + 'px;--hour-px:' + (60 * PX) + 'px">';
      if (di.known && !di.open) h += '<div class="sc-off" style="top:0;height:' + H + 'px"></div><div class="sc-offlbl">' + esc(di.why) + '</div>';
      else if (di.known) {
        if (di.from > lo) h += '<div class="sc-off" style="top:0;height:' + ((di.from - lo) * PX) + 'px"></div>';
        if (di.to < hi) h += '<div class="sc-off" style="top:' + ((di.to - lo) * PX) + 'px;height:' + ((hi - di.to) * PX) + 'px"></div>';
      }
      if (leaveOn(k).length) h += '<div class="sc-leave" style="top:0;height:' + H + 'px"></div><div class="sc-leavelbl">On leave: ' + esc(leaveNames(k)) + '</div>';
      if (k === td) { var nm = wall(new Date().toISOString()).m; if (nm >= lo && nm <= hi) h += '<div class="sc-now" style="top:' + ((nm - lo) * PX) + 'px" title="Now"></div>'; }
      layout(list);
      list.forEach(function (e) {
        var w = 100 / e.ncols, dr = canDrag(e);
        h += '<div class="sc-ev ' + evClass(e) + '" role="button" tabindex="0" data-sc="open" data-k="' + e.k + '" data-id="' + esc(e.id) + '"' + (e.ghost ? ' data-ghost="1"' : "") + (dr ? ' draggable="true" data-drag="1"' : "") +
          ' title="' + esc(evTitle(e)) + '" aria-label="' + esc(evTitle(e)) + '" style="top:' + ((e.sm - lo) * PX) + 'px;height:' + Math.max(e.mins * PX - 2, 22) + 'px;left:calc(' + (e.col * w) + '% + 2px);width:calc(' + w + '% - 4px)">' + evText(e, true) + '</div>';
      });
      h += '</div>';
    });
    return h + '</div></div></div>';
  }
  function agendaView(keys) {
    var evs = evList(keys[0], keys[keys.length - 1]), by = {};
    evs.forEach(function (e) { (by[e.key] = by[e.key] || []).push(e); });
    var h = '<div class="sc-agenda">';
    keys.forEach(function (k) {
      var di = dayInfo(k), l = by[k] || [];
      h += '<div class="sc-ah">' + esc(relDay(k)) + (relDay(k) === fDay(k) ? "" : " · " + esc(fDay(k))) + (di.known && !di.open ? ' <small class="sc-tz">(' + esc(di.why) + ')</small>' : "") + '</div>' +
        (leaveOn(k).length ? '<p class="sc-lv">On leave: ' + esc(leaveNames(k)) + '</p>' : "") +
        (l.length ? l.map(card).join("") : '<p class="sc-tz">Nothing booked.</p>');
    });
    return h + '</div>';
  }
  function monthView() {
    var a = S.anchor, f = a.slice(0, 8) + "01", st = wkStart(f), n = Math.ceil((((dow(f) + 6) % 7) + daysIn(a)) / 7) * 7, evs = evList(st, addDays(st, n - 1)), by = {}, td = today();
    evs.forEach(function (e) { (by[e.key] = by[e.key] || []).push(e); });
    var h = '<div class="sc-mg">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (w) { return '<span class="sc-mw">' + w + '</span>'; }).join("");
    for (var i = 0; i < n; i++) {
      var k = addDays(st, i), l = by[k] || [], di = dayInfo(k);
      h += '<button type="button" class="sc-md' + (k === td ? " today" : "") + (k === S.sel ? " sel" : "") + (k.slice(0, 7) !== a.slice(0, 7) ? " out" : "") + (di.known && !di.open ? " off" : "") + '" data-sc="mday" data-k="' + k + '" aria-label="' + esc(fDay(k, { weekday: "long", day: "numeric", month: "long" })) + ', ' + l.length + ' items"><b>' + Number(k.slice(8)) + '</b>' + (leaveOn(k).length ? '<span class="sc-chip sc-lvc" title="' + esc(leaveNames(k)) + '">' + leaveOn(k).length + ' on leave</span>' : "") +
        l.slice(0, 3).map(function (e) { return '<span class="sc-chip ' + evClass(e) + '">' + hhmm(e.sm) + ' ' + esc(e.k === "i" ? "★ " + ((X.CI.apps[e.i.application_id] || {}).character_name || "Interview") : e.b.character_name) + '</span>'; }).join("") +
        (l.length > 3 ? '<i>+' + (l.length - 3) + ' more</i>' : "") + (l.length ? '<span class="sc-cnt">' + l.length + '</span>' : "") + '</button>';
    }
    h += '</div>';
    if (S.sel) {
      var dl = by[S.sel] || [];
      h += '<div class="sc-dayh"><h3 class="hd bk-h3" style="margin:0">' + esc(fDay(S.sel, { weekday: "long", day: "numeric", month: "long" })) + '</h3><button class="alt sm" data-sc="goday" data-k="' + S.sel + '">Open day view</button></div>' +
        (dl.length ? dl.map(card).join("") : '<div class="sc-empty"><b>Nothing booked on this day</b>Bookings and interviews appear here once they are scheduled.</div>');
    }
    return h;
  }
  function label() {
    var a = S.anchor;
    if (S.mode === "day") return fDay(a, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (S.mode === "week") { var w = wkStart(a), e = addDays(w, 6); return fDay(w, { day: "numeric", month: "short" }) + " – " + fDay(e, { day: "numeric", month: "short", year: "numeric" }); }
    return fDay(a, { month: "long", year: "numeric" });
  }
  function toolbar() {
    var rec = X.isRec(), mgr = X.isMgr();
    function mb(m, l) { return '<button class="' + (S.mode === m ? "" : "alt ") + 'sm" data-sc="mode" data-m="' + m + '" aria-pressed="' + (S.mode === m) + '">' + l + '</button>'; }
    var h = '<div class="sc-bar"><button class="alt sm" data-sc="nav" data-d="-1" aria-label="Previous">‹</button><button class="alt sm" data-sc="today">Today</button><button class="alt sm" data-sc="nav" data-d="1" aria-label="Next">›</button>' +
      '<strong class="sc-title" aria-live="polite">' + esc(label()) + '</strong><span class="sc-seg" role="group" aria-label="View">' + mb("day", "Day") + mb("week", "Week") + mb("month", "Month") + '</span></div>';
    h += '<div class="sc-bar sc-filters">';
    if (rec) h += '<span class="sc-seg" role="group" aria-label="Show">' + [["all", "Everything"], ["bookings", "Bookings"], ["interviews", "Interviews"]].map(function (x) { return '<button type="button" class="' + (S.layer === x[0] ? "" : "alt ") + 'sm" data-sc="layer" data-l="' + x[0] + '" aria-pressed="' + (S.layer === x[0]) + '">' + x[1] + '</button>'; }).join("") + '</span>';
    if (mgr) h += '<label class="bk-sr" for="sc-mech">Mechanic</label><select id="sc-mech" data-scf="mech"><option value="all">All mechanics</option><option value="none"' + (S.mech === "none" ? " selected" : "") + '>Unassigned</option>' +
      mechs().map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (S.mech === m.user_id ? " selected" : "") + '>' + esc(m.display_name) + '</option>'; }).join("") + '</select>';
    h += '<label class="sc-check"><input type="checkbox" id="sc-closed" data-scf="closed"' + (S.closed ? " checked" : "") + '> Show cancelled</label><span class="sc-tz">All times in <b>' + esc(tz()) + '</b></span></div>';
    return h;
  }
  function legend() {
    return '<div class="sc-legend" aria-label="Key"><span><i class="l-pending"></i>Pending</span><span><i class="l-proposed"></i>Proposed (awaiting customer)</span><span><i class="l-approved"></i>Approved (confirmed)</span><span><i class="l-progress"></i>In progress</span><span><i class="l-done"></i>Completed</span><span><i class="l-cancel"></i>Cancelled</span>' + (X.isRec() ? '<span><i class="l-iv"></i>Interview</span>' : "") + '</div>';
  }
  function emptyState(rg) {
    var any = evList(rg[0], rg[1]).length;
    if (any) return "";
    var mgr = X.isMgr(), msg;
    if (!(ST.list || []).length && !(X.CI.ivs || []).length) msg = mgr ? "No bookings yet. Requests from the public website appear here as Pending." : "No bookings are assigned to you yet. A manager will assign work to you.";
    else if (S.mech !== "all") msg = "Nothing is scheduled for this mechanic in this period.";
    else msg = "Nothing is scheduled in this period.";
    return '<div class="sc-empty"><b>' + esc(msg) + '</b>' + (mgr && S.av && !S.av.enabled ? 'Opening hours are not set up yet, so customers cannot pick times. Set them in Operations › Staff &amp; settings.' : 'Use the arrows or the Month view to look at other dates.') + '</div>';
  }
  function wide() { try { return window.matchMedia("(min-width:1300px)").matches; } catch (e) { return false; } }
  function miniHtml() {
    if (!S.mini) S.mini = S.anchor.slice(0, 8) + "01";
    var f = S.mini, st = wkStart(f), n = Math.ceil((((dow(f) + 6) % 7) + daysIn(f)) / 7) * 7, td = today(), w0 = wkStart(S.anchor), i, k, inWk;
    var h = '<div class="sc-mini"><div class="sc-mh"><button type="button" class="alt sm" data-sc="mini-nav" data-d="-1" aria-label="Previous month">‹</button><b>' + esc(fDay(f, { month: "long", year: "numeric" })) + '</b><button type="button" class="alt sm" data-sc="mini-nav" data-d="1" aria-label="Next month">›</button></div><div class="sc-mg2">';
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (w) { h += '<span>' + w + '</span>'; });
    for (i = 0; i < n; i++) {
      k = addDays(st, i); inWk = S.mode === "week" ? (k >= w0 && k <= addDays(w0, 6)) : false;
      h += '<button type="button" class="' + (k === td ? "today " : "") + (k === S.anchor ? "sel " : "") + (inWk ? "wk " : "") + (k.slice(0, 7) !== f.slice(0, 7) ? "out" : "") + '" data-sc="mini-go" data-k="' + k + '" aria-label="' + esc(fDay(k, { weekday: "long", day: "numeric", month: "long" })) + '">' + Number(k.slice(8)) + '</button>';
    }
    return h + '</div></div>';
  }
  function hoursHtml() {
    var a = S.av; if (!a || !a.enabled) return "";
    var nm = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], h = '<h4 class="sc-lt">Workshop hours</h4><div class="sc-hrs">';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (d) { var x = a.hm[d]; h += '<div><span>' + nm[d] + '</span><b>' + (x && x.is_open ? esc(String(x.open).slice(0, 5)) + " – " + esc(String(x.close).slice(0, 5)) : "Closed") + '</b></div>'; });
    return h + '</div><p class="sc-tz">Time zone: <b>' + esc(tz()) + '</b></p>';
  }
  function leftHtml() {
    var rec = X.isRec(), mgr = X.isMgr(), h = '<div class="card sc-lc">' + miniHtml();
    if (rec) h += '<h4 class="sc-lt">Filters</h4><div class="sc-rad" role="radiogroup" aria-label="Show">' + [["all", "Everything"], ["bookings", "Bookings"], ["interviews", "Interviews"]].map(function (x) { return '<label><input type="radio" name="sc-layer" data-sc="layer" data-l="' + x[0] + '"' + (S.layer === x[0] ? " checked" : "") + '> ' + x[1] + '</label>'; }).join("") + '</div>';
    if (mgr) h += '<h4 class="sc-lt">Mechanic</h4><label class="bk-sr" for="sc-mech2">Mechanic</label><select id="sc-mech2" data-scf="mech"><option value="all">All mechanics</option><option value="none"' + (S.mech === "none" ? " selected" : "") + '>Unassigned</option>' + mechs().map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (S.mech === m.user_id ? " selected" : "") + '>' + esc(m.display_name) + '</option>'; }).join("") + '</select>';
    h += '<label class="sc-check sc-cc"><input type="checkbox" id="sc-closed2" data-scf="closed"' + (S.closed ? " checked" : "") + '> Show cancelled</label>';
    h += '<h4 class="sc-lt">Status</h4>' + legend().replace('class="sc-legend"', 'class="sc-legend v"') + hoursHtml();
    return h + '</div>';
  }
  function upFilter(e) {
    if (+new Date(e.start) + e.mins * 6e4 < Date.now()) return false;
    if (e.k === "b") return CLOSED.indexOf(e.b.status) < 0 && e.b.status !== "completed";
    return e.i.status === "invited" || e.i.status === "confirmed" || e.i.status === "reschedule_requested";
  }
  function upcomingHtml() {
    var t = today(), all = evList(t, addDays(t, 90)).filter(upFilter), up = all.slice(0, S.upAll ? 40 : 8), h = '<div class="card sp sc-up"><div class="sc-uh"><h3 class="hd bk-h3">Upcoming appointments</h3>' + (all.length > 8 ? '<button type="button" class="alt sm" data-sc="upall">' + (S.upAll ? "Show fewer" : "View all (" + all.length + ")") + '</button>' : "") + '</div>';
    if (!up.length) return h + '<p class="note">Nothing coming up' + (S.mech !== "all" ? " for this mechanic" : "") + '. New bookings appear here once approved or proposed.</p></div>';
    h += '<div class="tw sc-ut"><table><thead><tr><th>Time (' + esc(tz()) + ')</th><th>Type</th><th>Customer</th><th>Service</th><th>Mechanic</th><th>Status</th></tr></thead><tbody>';
    up.forEach(function (e) {
      var b = e.b, iv = e.i, a = iv ? (X.CI.apps[iv.application_id] || {}) : null;
      h += '<tr role="button" tabindex="0" data-sc="open" data-k="' + e.k + '" data-id="' + esc(e.id) + '"><td>' + esc(relDay(e.key)) + ', ' + hhmm(e.sm) + '</td><td>' + (b ? esc(b.reference) : "Interview") + '</td><td>' + esc(b ? b.character_name : (a.character_name || "Applicant")) + '</td><td>' + (b ? esc(svc(b)) : "Job interview") + '</td><td>' + esc(b ? (b.assigned_to ? mechName(b.assigned_to) : "Unassigned") : (ivWho(iv.interviewer_id) || "—")) + '</td><td>' + (b ? X.pill(b.status) + (pending(b) ? ' <span class="pill">Change pending</span>' : "") : '<span class="pill">' + esc(X.IS[iv.status] || iv.status) + '</span>') + '</td></tr>';
    });
    h += '</tbody></table></div><div class="sc-ucards">';
    var last = ""; up.forEach(function (e) { if (e.key !== last) { last = e.key; h += '<div class="sc-ah">' + esc(relDay(e.key)) + (relDay(e.key) === fDay(e.key) ? "" : " · " + esc(fDay(e.key))) + '</div>'; } h += card(e); });
    return h + '</div></div>';
  }
  function extraHtml() {
    var mgr = X.isMgr(), rec = X.isRec(), h = "";
    if (mgr) {
      var l = ST.list || [], c1 = l.filter(function (b) { return b.status === "pending"; }), c2 = l.filter(function (b) { return b.status === "alternative_accepted"; }),
        c3 = l.filter(function (b) { return b.status === "alternative_proposed" || pending(b); }), c4 = l.filter(function (b) { return b.status === "approved" && !b.assigned_to; });
      h += '<div class="card sp"><h3 class="hd bk-h3">Needs attention</h3>' + ((c1.length + c2.length + c3.length + c4.length) ? '<div class="sc-need">' +
        (c1.length ? '<span class="n">' + c1.length + ' pending</span>' : "") + (c2.length ? '<span class="n">' + c2.length + ' to confirm</span>' : "") + (c4.length ? '<span class="n">' + c4.length + ' unassigned</span>' : "") + (c3.length ? '<span class="n w">' + c3.length + ' awaiting customer</span>' : "") + '</div>' +
        c1.concat(c2).concat(c4).slice(0, 4).map(function (b) { return '<div class="sc-card s-' + b.status + '" role="button" tabindex="0" data-sc="open" data-k="b" data-id="' + esc(b.id) + '"><b>' + esc(b.character_name) + '</b> <small>' + esc(b.reference) + ' · ' + esc(X.STAT[b.status] || b.status) + (b.status === "approved" ? " · no mechanic" : "") + '</small></div>'; }).join("") : '<p class="note">Nothing needs a decision right now.</p>') + '</div>';
    }
    if (rec) {
      var ask = (X.CI.ivs || []).filter(function (i) { return i.status === "reschedule_requested" && new Date(i.scheduled_at) > Date.now(); });
      if (ask.length) h += '<div class="card sp"><h3 class="hd bk-h3">Waiting for your reply (' + ask.length + ')</h3><p class="note">These applicants asked for another time. Use their time, or reschedule.</p>' + ask.map(function (i) { return X.ivCard(i); }).join("") + '</div>';
      h += X.ivNewForm();
    }
    return h;
  }
  function html() {
    var rg = viewRange(), body, keys, i;
    if (S.mode === "month") body = monthView();
    else if (S.mode === "day") body = gridView([S.anchor]);
    else {
      var w = wkStart(S.anchor); keys = []; for (i = 0; i < 7; i++) keys.push(addDays(w, i));
      body = '<div class="sc-wkgrid">' + gridView(keys) + '</div>' + agendaView(keys);
    }
    var h = '<div class="sc-page"><aside class="sc-left">' + leftHtml() + '</aside><div class="sc-center"><div class="sc-main card">' + X.sec("▦", "Calendar", (X.isRec() ? "Bookings and interviews" : "Your assigned bookings") + " – times in " + esc(tz())) + toolbar();
    if (S.avErr) h += '<div class="sc-banner bad" role="alert">' + esc(S.avErr) + '</div>';
    if (S.err) h += '<div class="sc-banner bad" role="alert">' + esc(S.err) + '</div>';
    if (X.isRec() && S.mode === "day") h += '<div class="sc-acts"><button class="alt sm" data-ci="sched-day" data-k="' + esc(S.anchor) + '">Schedule an interview on this day</button></div>';
    h += '<div class="sc-legend-wrap">' + legend() + '</div>' + emptyState(rg) + body + '<p class="note">Select an appointment for its full details' + (X.isMgr() ? '. Drag a booking or interview in the Day or Week view to propose a new time: you will always be asked to confirm first, and customers confirm changes to approved appointments themselves.' : '.') + '</p></div>' + upcomingHtml() + extraHtml() + '</div>';
    return h + drawerHtml() + '</div>';
  }
  function renderCalendar(el) {
    if (!el) el = document.getElementById("cl");
    if (!el) return;
    if (!S.anchor) S.anchor = today();
    var old = el.querySelector(".sc-scroll"), top = old ? old.scrollTop : null, pnl = el.querySelector(".sc-drawer"), ptop = pnl ? pnl.scrollTop : 0, pkey = S.drawer ? S.drawer.id + (S.drawer.tab || "") : "";
    var ae = document.activeElement, fid = ae && ae.id && /^(ci-|sc-)/.test(ae.id) ? ae.id : null, sel = fid && ae.selectionStart;
    el.innerHTML = html();
    var sc = el.querySelector(".sc-scroll"), np = el.querySelector(".sc-drawer"); if (np && pkey && pkey === S.pkey) np.scrollTop = ptop; S.pkey = pkey;
    if (sc) { if (top != null && S.scrolled) sc.scrollTop = top; else autoScroll(sc); S.scrolled = true; }
    if (fid) { var f2 = document.getElementById(fid); if (f2) { f2.focus(); try { if (sel != null) f2.setSelectionRange(sel, sel); } catch (x) { } } }
    var rg = viewRange(), key = rg.join("|");
    if (X.isMgr() && !S.avBusy && (!S.av || S.av.stale || S.av.from > rg[0] || S.av.to < rg[1]) && S.avKey !== key + ":" + (S.av ? S.av.stale : "")) {
      S.avBusy = true; S.avKey = key + ":" + (S.av ? S.av.stale : "");
      ensureAv(rg[0], rg[1]).then(function (f) { S.avBusy = false; if (f || S.avErr) renderCalendar(); });
    }
  }
  function autoScroll(sc) {
    var col = sc.querySelector(".sc-col"); if (!col) return;
    var lo = +col.dataset.lo, evs = evList(viewRange()[0], viewRange()[1]), t = today(), target;
    if (S.anchor <= t && addDays(wkStart(S.anchor), 6) >= t && S.mode !== "month") target = wall(new Date().toISOString()).m - 60;
    else if (evs.length) target = Math.min.apply(null, evs.map(function (e) { return e.sm; })) - 30;
    else target = lo;
    sc.scrollTop = Math.max(0, (target - lo) * PX);
  }

  /* ---------------------------------------------------------------- details drawer */
  function drawerHtml() {
    var d = S.drawer, dock = wide();
    if (!d) return dock ? '<aside class="sc-drawer sc-docked" aria-label="Appointment details"><div class="sc-empty"><b>No appointment selected</b>Select an appointment in the calendar to see its details and to schedule or reschedule it.</div></aside>' : "";
    var body, title, pill = "";
    if (d.k === "i") {
      var i = iById(d.id); if (!i) return "";
      title = "Interview";
      body = '<div class="sc-sec">' + X.ivCard(i) + '</div><div class="sc-sec"><button class="alt sm" data-ci="app" data-aid="' + esc(i.application_id) + '">Open application</button></div>';
    } else {
      var b = bById(d.id); if (!b) return "";
      title = "Booking " + b.reference; pill = X.pill(b.status); body = bookingPanel(b, d);
    }
    return (dock ? "" : '<div class="sc-back" data-sc="close"></div>') + '<aside class="sc-drawer' + (dock ? " sc-docked" : "") + '" role="' + (dock ? "complementary" : "dialog") + '"' + (dock ? "" : ' aria-modal="true"') + ' aria-label="' + esc(title) + ' details"><div class="sc-dh2"><div><b class="bk-ref">' + esc(title) + '</b> ' + pill + '</div><button class="alt sm" data-sc="close" aria-label="Close details">Close</button></div>' + body + '</aside>';
  }
  function row(l, v) { return v ? '<div><dt>' + esc(l) + '</dt><dd>' + esc(v) + '</dd></div>' : ""; }
  function bookingPanel(b, d) {
    var mgr = X.isMgr(), closed = ["declined", "cancelled", "completed"].indexOf(b.status) >= 0, canSch = mgr && !closed, tab = d.tab || (canSch ? "schedule" : "details");
    if (tab === "schedule" && !canSch) tab = "details";
    var tabs = [["schedule", "Schedule"], ["details", "Details"], ["history", "History"]].filter(function (t) { return t[0] !== "schedule" || canSch; });
    var h = '<div class="sc-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="' + (t[0] === tab ? "on" : "") + '" aria-selected="' + (t[0] === tab) + '" data-sc="tab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>';
    if (tab === "schedule") return h + scheduleTab(b, d);
    if (tab === "history") return h + historyTab(b);
    return h + detailsTab(b, closed);
  }
  function scheduleTab(b, d) {
    var s = b.status, h = "";
    if (pending(b)) h += '<div class="sc-banner"><b>Change awaiting customer confirmation.</b> The appointment stays at ' + esc(fFull(b.scheduled_at)) + ' until the customer confirms ' + esc(fFull(b.reschedule_proposed_at)) + ' on Track Booking. Both times are held.</div>';
    if (s === "alternative_proposed") h += '<div class="sc-banner">A different time (<b>' + esc(fFull(b.proposed_at)) + '</b>) is waiting for the customer to accept.</div>';
    if (s === "alternative_accepted") h += '<div class="sc-banner bad">The customer accepted <b>' + esc(fFull(b.proposed_at)) + '</b>. Confirm it to approve the booking.</div>';
    h += '<dl class="sc-dl sc-sum">' + row("Customer", b.character_name) + row("Service", svc(b) + " · " + b.vehicle) + row("Duration", (b.duration_minutes || 20) + " minutes") + '</dl>';
    h += '<div class="sc-sec"><label for="sc-asg">Assigned mechanic</label><div class="sc-inline"><select id="sc-asg" aria-label="Mechanic"><option value="">Unassigned</option>' + mechs().map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (m.user_id === b.assigned_to ? " selected" : "") + '>' + esc(m.display_name) + ' (' + esc(m.role) + ')</option>'; }).join("") + '</select><button class="alt" data-sc="assign" data-id="' + esc(b.id) + '">Save</button></div>' + (d.err ? '<div class="sc-banner bad" role="alert">' + esc(d.err) + '</div>' : "") + '<p class="note">A mechanic cannot be given two overlapping appointments.</p></div>';
    return h + '<div class="sc-sec"><h3 class="hd bk-h3">' + (s === "approved" ? "Reschedule" : "Schedule appointment") + '</h3>' + schedHtml(b) + '</div>';
  }
  function detailsTab(b, closed) {
    var s = b.status, appt = b.scheduled_at && (s === "approved" || s === "in_progress" || s === "completed") ? fFull(b.scheduled_at) : "", h = "";
    h += '<dl class="sc-dl">' + row("Customer", b.character_name) + row("Contact (in-character)", b.contact) + row("Vehicle", b.vehicle + (b.vehicle_reg ? " (" + b.vehicle_reg + ")" : "")) + row("Service", svc(b)) +
      row("Requested time", fFull(b.preferred_at)) + row("Proposed time", b.proposed_at && (s === "alternative_proposed" || s === "alternative_accepted") ? fFull(b.proposed_at) : "") + row("Appointment", appt) +
      row("New time (awaiting customer)", pending(b) ? fFull(b.reschedule_proposed_at) : "") + row("Duration", (b.duration_minutes || 20) + " minutes") + row("Time zone", tz()) + row("Mechanic", mechName(b.assigned_to)) + '</dl>';
    if (b.description) h += '<div class="sc-sec"><h3 class="hd bk-h3">Work requested</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0">' + esc(b.description) + '</p></div>';
    if (b.customer_message) h += '<div class="sc-sec"><h3 class="hd bk-h3">Message shown to customer</h3><p style="margin:0;overflow-wrap:anywhere">' + esc(b.customer_message) + '</p></div>';
    if (!X.isMgr() && !closed) h += '<div class="sc-sec"><p class="note">Only managers can approve or change appointment times.</p></div>';
    return h + '<div class="sc-sec"><div class="sc-acts">' + ((s === "approved" || s === "in_progress") ? '<a class="btn" href="#jobs/' + esc(b.id) + '">Open job</a>' : "") + '<button class="alt" data-bk="cal-open" data-id="' + esc(b.id) + '">Open in Bookings</button></div></div>';
  }
  function historyTab(b) {
    var ev = ST.events && ST.events[b.id];
    if (!ev) { if (!S.histBusy) { S.histBusy = true; X.loadEvents(b.id).then(function () { S.histBusy = false; renderCalendar(); }).catch(function (e) { S.histBusy = false; X.authErr(e); }); } return '<div class="sc-sec"><p class="note" role="status">Loading history…</p></div>'; }
    if (!ev.length) return '<div class="sc-sec"><p class="note">No activity recorded yet.</p></div>';
    return '<div class="sc-sec"><ol class="sc-tl">' + ev.map(function (e) { return '<li' + (e.internal ? ' class="int"' : "") + '><b>' + esc(X.EVT[e.action] || e.action) + '</b>' + (e.internal ? ' <span class="pill">Staff only</span>' : "") + '<small>' + esc(fFull(e.at)) + (e.actor_name ? " · " + esc(e.actor_name) : "") + '</small>' + (e.message ? '<span>' + esc(e.message) + '</span>' : "") + '</li>'; }).join("") + '</ol></div>';
  }

  /* ---------------------------------------------------------------- confirmation modal (shared) */
  function modalRoot() { var r = document.getElementById("sc-modal-root"); if (!r) { r = document.createElement("div"); r.id = "sc-modal-root"; document.body.appendChild(r); } return r; }
  function okOn(m) { return !m.busy && !m.hard && (!m.conf.length || (m.can && m.override && m.reason.trim().length >= 3)); }
  function renderModal() {
    var m = S.modal, r = modalRoot();
    if (!m) { r.innerHTML = ""; return; }
    var o = m.o, h = '<div class="sc-mback" data-sc="mback"><div class="sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-mt"><h2 id="sc-mt">' + esc(o.title) + '</h2><dl class="sc-rows">' +
      o.rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + (x[2] ? '<span class="from">' + esc(x[2]) + '</span> → ' : "") + esc(x[1]) + '</dd>'; }).join("") + '</dl>';
    if (o.note) h += '<p class="note">' + esc(o.note) + '</p>';
    if (m.busy && !m.conf.length && !m.err) h += '<p class="note" role="status">Checking the schedule…</p>';
    m.conf.forEach(function (c) { var hard = !c.overridable; h += '<div class="sc-cf' + (hard ? " hard" : "") + '" role="alert"><b>' + (hard ? "This cannot be saved" : "Warning") + '</b>' + esc(c.message) + '</div>'; });
    if (m.conf.length && !m.hard && m.can) h += '<label class="rc-chk"><input type="checkbox" id="sc-m-ov" data-scf="m-ov"' + (m.override ? " checked" : "") + '> Override workshop capacity</label>' +
      (m.override ? '<label for="sc-m-why">Reason for the override (required, recorded in the booking history)</label><textarea id="sc-m-why" data-scf="m-why" maxlength="300" rows="2">' + esc(m.reason) + '</textarea>' : "");
    if (o.message !== false) h += '<label for="sc-m-msg">Message to customer (optional, shown on Track Booking)</label><textarea id="sc-m-msg" data-scf="m-msg" maxlength="500" rows="2">' + esc(m.msg) + '</textarea>';
    if (m.err) h += '<div class="sc-banner bad" role="alert">' + esc(m.err) + '</div>';
    h += '<div class="sc-acts"><button class="alt" data-sc="mod-cancel">Cancel</button><button id="sc-m-ok" data-sc="mod-ok"' + (okOn(m) ? "" : " disabled") + '>' + esc(o.ok || "Confirm and save") + '</button></div></div></div>';
    r.innerHTML = h;
    var f = r.querySelector("#sc-m-why") || r.querySelector("#sc-m-ok"); if (f && f.focus && m.focus) { f.focus(); m.focus = false; }
  }
  function closeModal() { S.modal = null; renderModal(); }
  function openModal(o, pre) {
    S.modal = { o: o, busy: true, conf: [], hard: false, can: false, override: false, reason: "", msg: "", err: "", focus: true };
    renderModal();
    pre.then(function (r) {
      if (!S.modal || S.modal.o !== o) return;
      if (r) { S.modal.conf = r.conflicts || []; S.modal.hard = !!r.hard; S.modal.can = !!r.can_override; }
      S.modal.busy = false; renderModal();
    }).catch(function (e) {
      if (!S.modal) return; S.modal.busy = false;
      if (e && e.message === "auth") { closeModal(); X.authErr(e); X.render(); return; }
      S.modal.err = (e && e.message) || "The schedule could not be checked."; S.modal.hard = true; renderModal();
    });
  }
  function checkSlot(b, startIso, mins) {
    return X.rpc("staff_check_slot", { p: { booking_id: b.id, start: startIso, duration_minutes: mins, mechanic_id: b.assigned_to || null } }).then(function (r) {
      if (!r || r.ok === false) throw new Error((r && r.message) || "The schedule could not be checked.");
      return r;
    });
  }
  /* o: {b, action, startIso, mins} -> opens the confirmation for a booking time change */
  function confirmBooking(o) {
    var b = o.b, mins = o.mins || b.duration_minutes || 20, a = o.action, cur = b.status === "approved" ? b.scheduled_at : bWhen(b);
    var rows = [["Booking", b.reference + " · " + b.character_name], ["Service", svc(b) + " · " + b.vehicle], ["Mechanic", mechName(b.assigned_to)]], note = "", title, ok, done, payload = {};
    if (a === "approve") {
      title = "Approve appointment"; ok = "Approve and notify customer"; done = "Appointment approved";
      rows.push(["Appointment", fFull(o.startIso)], ["Length", mins + " minutes"]);
      if (o.sendTime) payload.scheduled_at = o.startIso; if (mins !== b.duration_minutes) payload.duration_minutes = mins;
      note = "The customer will see this appointment as approved on Track Booking.";
    } else if (a === "propose") {
      title = "Propose a different time"; ok = "Send proposal to customer"; done = "New time proposed";
      rows.push(["Customer requested", fFull(b.preferred_at)], ["Proposed time", fFull(o.startIso), b.status === "alternative_proposed" || b.status === "alternative_accepted" ? fFull(b.proposed_at) : ""], ["Length", mins + " minutes"]);
      payload.proposed_at = o.startIso; if (mins !== b.duration_minutes) payload.duration_minutes = mins;
      note = "Nothing is approved yet. The customer accepts or declines on Track Booking, then you confirm.";
    } else if (a === "reschedule") {
      title = "Reschedule an approved appointment"; ok = "Send change to customer"; done = "Change sent to the customer";
      rows.push(["Appointment", fFull(o.startIso), fFull(cur)], ["Length", mins + " minutes"]); payload.scheduled_at = o.startIso;
      note = "The appointment stays at the current time until the customer confirms the new one on Track Booking. Both times are held so nobody else can take them.";
    } else if (a === "decline") {
      title = "Decline this request"; ok = "Decline request"; done = "Request declined";
      rows.push(["Requested", fFull(b.preferred_at)]);
      note = "The booking is closed and the customer sees it as declined. Add a message below to explain why.";
    } else if (a === "cancel_reschedule") {
      title = "Withdraw the change"; ok = "Withdraw change"; done = "Change withdrawn";
      rows.push(["Stays at", fFull(b.scheduled_at)], ["Withdrawn time", fFull(b.reschedule_proposed_at)]);
      note = "The customer keeps their current appointment.";
    }
    var pre = (a === "cancel_reschedule" || a === "decline") ? Promise.resolve(null) : checkSlot(b, o.startIso, mins);
    openModal({ kind: "b", id: b.id, action: a, startIso: o.startIso, title: title, rows: rows, note: note, ok: ok, done: done, payload: payload }, pre);
  }
  function confirmInterview(i, startIso) {
    var a = X.CI.apps[i.application_id] || {};
    openModal({ kind: "i", id: i.id, startIso: startIso, title: "Move interview", ok: "Move and ask applicant to confirm", done: "Interview moved; the applicant will be asked to confirm", message: false,
      rows: [["Applicant", (a.character_name || "Applicant") + (a.reference ? " · " + a.reference : "")], ["Interviewer", ivWho(i.interviewer_id) || "—"], ["Interview", fFull(startIso), fFull(i.scheduled_at)]],
      note: "Changing the time asks the applicant to confirm again on their tracking page." },
      Promise.resolve(+new Date(startIso) <= Date.now() ? { conflicts: [{ code: "past", overridable: false, message: "That time has already passed." }], hard: true } : null));
  }
  function modalGo() {
    var m = S.modal; if (!m || !okOn(m)) return;
    var o = m.o; m.busy = true; m.err = ""; renderModal();
    var p = Object.assign({}, o.payload || {});
    if (m.msg.trim()) p.message = m.msg.trim();
    if (m.override) { p.override = true; p.override_reason = m.reason.trim(); }
    var call = o.kind === "i" ? X.rpc("staff_update_interview", { p_id: o.id, p: { scheduled_at: o.startIso } }) : X.rpc("staff_booking_action", { p_id: o.id, p_action: o.action, p: p });
    call.then(function (r) {
      if (r && r.ok === false) {
        m.busy = false; m.err = r.message || "That change was not allowed.";
        if (r.conflicts) { m.conf = r.conflicts; m.hard = !r.can_override; m.can = !!r.can_override; }
        renderModal(); return;
      }
      closeModal(); X.say(o.done || "Saved"); return afterSave(o.id, o.kind);
    }).catch(function (e) { m.busy = false; if (e && e.message === "auth") { closeModal(); X.authErr(e); X.render(); return; } m.err = (e && e.message) || "Something went wrong."; renderModal(); });
  }
  /* any successful change: refresh the shared data once, then redraw BOTH screens from it */
  function afterSave(id, kind) {
    invalidate();
    if (S.sch[id]) { S.sch[id].pick = null; S.sch[id].chk = null; }
    var jobs = [X.loadList()]; if (kind === "i") jobs.push(X.ivLoad()); else { jobs.push(X.loadEvents(id)); if (X.isRec()) jobs.push(X.ivLoad()); }
    return Promise.all(jobs).catch(function (e) { X.authErr(e); }).then(function () {
      S.err = ""; X.render(); X.calRender();
      var ks = Object.keys(S.sch); ks.forEach(function (k) { refreshSch(k); });
    });
  }

  /* ---------------------------------------------------------------- compact week scheduler */
  function schState(b) {
    var s = S.sch[b.id];
    if (!s) {
      var base = b.status === "approved" ? b.scheduled_at : (b.status === "alternative_proposed" || b.status === "alternative_accepted") ? b.proposed_at : b.preferred_at;
      s = S.sch[b.id] = { wk: wkStart(wall(base || new Date().toISOString()).d), day: null, pick: null, chk: null, mech: "", dur: b.duration_minutes || 20, fetch: "" };
    }
    return s;
  }
  function durOpts(sel) {
    var sl = slotMin(), l = [], n; for (n = sl; n <= 240; n += sl) l.push(n); if (l.indexOf(+sel) < 0) { l.push(+sel); l.sort(function (a, b) { return a - b; }); }
    return l.map(function (n) { return '<option value="' + n + '"' + (n === +sel ? " selected" : "") + '>' + n + ' minutes</option>'; }).join("");
  }
  function usedAt(ms, slot, id) { var n = 0; S.av.occ.forEach(function (o) { if (o.id !== id && o.s < ms + slot * 6e4 && o.e > ms) n++; }); return n; }
  function mechBusy(ms, end, mech, id) { return S.av.occ.some(function (o) { return o.id !== id && o.mech === mech && o.kind !== "requested" && o.s < end && o.e > ms; }); }
  function cell(b, s, k, m, mech) {
    var di = dayInfo(k), slot = slotMin(), dur = s.dur, iso = atIso(k, m), ms = +new Date(iso), end = ms + dur * 6e4, cls = "", t = "", used = 0, mx = 0, x;
    if (!di.open) return { cls: "na", t: di.why || "Closed" };
    if (m < di.from || m >= di.to) return { cls: "na", t: "Outside opening hours" };
    if (ms <= Date.now()) return { cls: "past", t: "In the past" };
    if (m + dur > di.to) return { cls: "na", t: "Not enough time before closing" };
    if (mech && mechBusy(ms, end, mech, b.id)) return { cls: "mech", t: "Mechanic is busy" };
    for (x = ms; x < end; x += slot * 6e4) { var u = usedAt(x, slot, b.id); if (x === ms) used = u; mx = Math.max(mx, u); }
    if (mx >= S.av.capacity) return { cls: "full", t: "Workshop full (" + mx + "/" + S.av.capacity + "): manager override", sel: true };
    return { cls: used ? "used" : "", t: used ? used + "/" + S.av.capacity + " booked" : "Free", sel: true, used: used };
  }
  function schedHtml(b) {
    if (!X.isMgr()) return "";
    var s = schState(b);
    return '<div class="sc-sch" data-sch="' + esc(b.id) + '">' + schInner(b, s) + '</div>';
  }
  function schInner(b, s) {
    var st = b.status, rangeOk = S.av && !S.av.stale && S.av.from <= s.wk && S.av.to >= addDays(s.wk, 6), h = "", id = esc(b.id), i, k;
    if (["pending", "alternative_proposed", "alternative_accepted", "approved"].indexOf(st) < 0) return '<p class="note">This booking can no longer be rescheduled.</p>';
    if (!rangeOk && !S.avErr && s.fetch !== s.wk) {
      s.fetch = s.wk;
      ensureAv(s.wk, addDays(s.wk, 6)).then(function () { refreshSch(b.id); });
    }
    var tzl = esc(tz());
    h += '<div class="sc-sch-info"><span>Customer requested: <b>' + esc(fFull(b.preferred_at)) + '</b></span>' +
      (st === "approved" ? '<span>Current appointment: <b>' + esc(fFull(b.scheduled_at)) + '</b></span>' : "") +
      ((st === "alternative_proposed" || st === "alternative_accepted") && b.proposed_at ? '<span>Proposed to customer: <b>' + esc(fFull(b.proposed_at)) + '</b>' + (st === "alternative_accepted" ? " (accepted)" : " (awaiting reply)") + '</span>' : "") +
      (pending(b) ? '<span>Change awaiting customer: <b>' + esc(fFull(b.reschedule_proposed_at)) + '</b></span>' : "") + '</div>';
    if (S.avErr) return h + '<div class="sc-banner bad" role="alert">' + esc(S.avErr) + '</div>' + actionsRow(b, s);
    if (S.av && !S.av.enabled) return h + '<div class="sc-banner">Workshop opening hours are not set up, so free slots cannot be shown. Set them in Operations › Staff &amp; settings. Until then you can still enter a time below.</div>' + fallback(b, s);
    var mech = s.mech === "" ? (b.assigned_to || "") : (s.mech === "none" ? "" : s.mech);
    h += '<div class="sc-sch-bar"><button type="button" class="alt sm" data-sc="sch-nav" data-id="' + id + '" data-d="-1" aria-label="Previous week">‹</button><span class="t">' + esc(fDay(s.wk, { day: "numeric", month: "short" })) + ' – ' + esc(fDay(addDays(s.wk, 6), { day: "numeric", month: "short", year: "numeric" })) + '</span><button type="button" class="alt sm" data-sc="sch-nav" data-id="' + id + '" data-d="1" aria-label="Next week">›</button>' +
      '<button type="button" class="alt sm" data-sc="sch-go" data-id="' + id + '" data-w="now">This week</button><button type="button" class="alt sm" data-sc="sch-go" data-id="' + id + '" data-w="req">Requested</button><label class="bk-sr" for="sc-jump-' + id + '">Jump to date</label><input type="date" id="sc-jump-' + id + '" data-scf="sch-jump" data-id="' + id + '"></div>';
    h += '<div class="sc-sch-opts"><div><label for="sc-dur-' + id + '">Length</label><select id="sc-dur-' + id + '" data-scf="sch-dur" data-id="' + id + '">' + durOpts(s.dur) + '</select></div>' +
      '<div><label for="sc-mv-' + id + '">Availability for</label><select id="sc-mv-' + id + '" data-scf="sch-mech" data-id="' + id + '"><option value=""' + (s.mech === "" ? " selected" : "") + '>' + (b.assigned_to ? esc(mechName(b.assigned_to)) + " (assigned)" : "No mechanic assigned") + '</option><option value="none"' + (s.mech === "none" ? " selected" : "") + '>Workshop only</option>' +
      mechs().filter(function (m) { return m.user_id !== b.assigned_to; }).map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (s.mech === m.user_id ? " selected" : "") + '>' + esc(m.display_name) + '</option>'; }).join("") + '</select></div></div>';
    if (!rangeOk) return h + '<div class="sc-empty" role="status">Loading availability…</div>' + actionsRow(b, s);
    var days = [], td = today(), sl = slotMin(), req = +new Date(b.preferred_at), curT = b.scheduled_at && st === "approved" ? +new Date(b.scheduled_at) : 0,
      prop = (st === "alternative_proposed" || st === "alternative_accepted") && b.proposed_at ? +new Date(b.proposed_at) : (pending(b) ? +new Date(b.reschedule_proposed_at) : 0);
    for (i = 0; i < 7; i++) days.push(addDays(s.wk, i));
    if (!s.day || s.day < s.wk || s.day > days[6]) {
      var base = wall(st === "approved" ? b.scheduled_at : (prop ? new Date(prop).toISOString() : b.preferred_at)).d;
      s.day = (base >= s.wk && base <= days[6]) ? base : (days.filter(function (d) { return d >= td && dayInfo(d).open; })[0] || s.wk);
    }
    var marks = {}; [req, curT, prop].forEach(function (t) { if (t) marks[wall(new Date(t).toISOString()).d] = 1; });
    h += '<div class="sc-days" role="group" aria-label="Day">' + days.map(function (d) {
      var di = dayInfo(d), off = !di.open || d < td;
      return '<button type="button" class="sc-dc' + (d === s.day ? " on" : "") + (d === td ? " today" : "") + (off ? " off" : "") + '" data-sc="sch-day" data-id="' + id + '" data-k="' + d + '" aria-pressed="' + (d === s.day) + '" aria-label="' + esc(fDay(d, { weekday: "long", day: "numeric", month: "long" }) + (di.open ? "" : ", " + di.why)) + '">' + esc(fDay(d, { weekday: "short" })) + '<b>' + Number(d.slice(8)) + '</b>' + (marks[d] ? '<i></i>' : "") + '</button>';
    }).join("") + '</div>';
    var di2 = dayInfo(s.day);
    if (!di2.open) h += '<div class="sc-empty"><b>' + esc(di2.why) + '</b>Choose another day.</div>';
    else {
      h += '<h4 class="sc-th">Available times (' + tzl + ')</h4><div class="sc-times" role="group" aria-label="Times on ' + esc(fDay(s.day)) + '">';
      var pk = s.pick, any = false;
      for (var m = di2.from; m + sl <= di2.to; m += sl) {
        var c = cell(b, s, s.day, m, mech), ms = +new Date(atIso(s.day, m)), cl = "sc-tb " + c.cls, mk = "";
        if (pk && pk.key === s.day && m === pk.min) cl += " pick";
        if (ms === req && st !== "approved") { cl += " req"; mk = "★"; }
        if (ms === curT) { cl += " cur"; mk = "●"; }
        if (ms === prop) { cl += " prop"; mk = "◆"; }
        if (c.sel) any = true;
        h += '<button type="button" class="' + cl + '"' + (c.sel ? ' data-sc="sch-cell" data-id="' + id + '" data-k="' + s.day + '" data-m="' + m + '"' : " disabled") + ' title="' + esc(hhmm(m) + " " + tz() + ": " + c.t) + '" aria-label="' + esc(hhmm(m) + ", " + c.t) + '">' + hhmm(m) + (mk ? '<sup>' + mk + '</sup>' : "") + '</button>';
      }
      h += '</div>' + (any ? "" : '<p class="note">No times are open on this day for the chosen length.</p>');
      h += '<div class="sc-sk"><span><i style="background:rgba(91,224,122,.3)"></i>Free</span><span><i style="background:rgba(255,176,32,.5)"></i>Full (override)</span><span><i style="background:rgba(255,80,80,.5)"></i>Mechanic busy</span><span><i style="background:rgba(128,128,128,.3)"></i>Closed / past</span></div>';
    }
    h += '<p class="note">Duration: ' + s.dur + ' minutes' + (di2.open ? ' · Workshop hours: ' + hhmm(di2.from) + '–' + hhmm(di2.to) + ' (' + tzl + ')' : "") + '. ★ requested · ● current · ◆ proposed. Availability reflects opening hours, blocked days and assigned appointments; approved leave of absence (shown as a shaded day).</p>';
    return h + pickHtml(b, s) + actionsRow(b, s);
  }
  function fallback(b, s) {
    return '<div class="sc-sch-opts"><div><label for="sc-fd-' + esc(b.id) + '">Date (' + esc(tz()) + ')</label><input type="date" id="sc-fd-' + esc(b.id) + '"></div><div><label for="sc-ft-' + esc(b.id) + '">Time</label><input type="time" id="sc-ft-' + esc(b.id) + '"></div></div><div class="sc-acts"><button class="alt" data-sc="sch-fb" data-id="' + esc(b.id) + '">Use this time</button></div>' + pickHtml(b, s) + actionsRow(b, s);
  }
  function pickHtml(b, s) {
    var pk = s.pick, h = '<div class="sc-pick" aria-live="polite">', i;
    if (!pk) return h + 'Choose a time above.</div>';
    var iso = pk.iso || atIso(pk.key, pk.min), c = s.chk, hard = c && c.hard;
    h += '<b>' + esc(fFull(iso)) + '</b> · ' + s.dur + ' minutes <button type="button" class="alt sm" data-sc="sch-clear" data-id="' + esc(b.id) + '">Clear</button>';
    if (!c) h += '<p class="note" role="status">Checking the schedule…</p>';
    else if (!c.conflicts.length) h += '<p class="note">No conflicts. This time is free.</p>';
    else { h += '<ul>'; for (i = 0; i < c.conflicts.length; i++) h += '<li class="' + (c.conflicts[i].overridable ? "soft" : "hard") + '">' + esc(c.conflicts[i].message) + '</li>'; h += '</ul>' + (hard ? '<p class="note">This time cannot be used.</p>' : '<p class="note">You can still continue: you will be asked for an override reason.</p>'); }
    return h + '</div>';
  }
  function actionsRow(b, s) {
    var st = b.status, pk = s.pick, c = s.chk, iso = pk ? (pk.iso || atIso(pk.key, pk.min)) : null, id = ' data-id="' + esc(b.id) + '"',
      ok = pk && c && !c.hard, dis = ok ? "" : " disabled", diff = iso && +new Date(iso) !== +new Date(b.preferred_at), h = '<div class="sc-acts sc-final">';
    function btn(cls, sa, label, d) { return '<button type="button" class="' + cls + '" data-sc="sch-act" data-sa="' + sa + '"' + id + (d || "") + '>' + label + '</button>'; }
    if (st === "pending") h += btn("sc-ok", "approve-req", "Approve requested time") + btn("sc-alt", "propose", "Propose alternative", diff && ok ? "" : " disabled");
    else if (st === "alternative_accepted") h += btn("sc-ok", "approve-acc", "Approve accepted time") + btn("sc-alt", "propose", "Propose another", dis);
    else if (st === "alternative_proposed") h += btn("sc-alt", "propose", "Replace proposed time", dis);
    else if (st === "approved") h += btn("sc-alt", "reschedule", "Send change to customer", dis) + (pending(b) ? btn("alt", "withdraw", "Withdraw change") : "");
    if (st !== "approved") h += btn("sc-no", "decline", "Decline");
    return h + '</div>' + (st === "pending" && !pk ? '<p class="note">Approve the time the customer asked for, or pick another time above to propose it instead.</p>' : "");
  }
  function refreshSch(id) {
    var b = bById(id); if (!b) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-sch="' + id + '"]'), function (el) {
      var sc = el.querySelector(".sc-sl"), top = sc ? sc.scrollTop : 0, ae = document.activeElement, fid = ae && ae.id && el.contains(ae) ? ae.id : null;
      el.innerHTML = schInner(b, schState(b));
      var n = el.querySelector(".sc-sl"); if (n) n.scrollTop = top;
      if (fid) { var f = document.getElementById(fid); if (f) f.focus(); }
    });
  }
  function doCheck(b, s) {
    var pk = s.pick; if (!pk) return;
    var iso = pk.iso || atIso(pk.key, pk.min); s.chk = null; refreshSch(b.id);
    checkSlot(b, iso, s.dur).then(function (r) { if (s.pick === pk) { s.chk = r; refreshSch(b.id); } }).catch(function (e) {
      if (e && e.message === "auth") { X.authErr(e); X.render(); return; }
      if (s.pick === pk) { s.chk = { conflicts: [{ code: "error", overridable: false, message: (e && e.message) || "The schedule could not be checked." }], hard: true }; refreshSch(b.id); }
    });
  }
  function schAct(b, a) {
    var s = schState(b), pk = s.pick, iso = pk ? (pk.iso || atIso(pk.key, pk.min)) : null, mins = s.dur;
    if (a === "approve-req") return confirmBooking({ b: b, action: "approve", startIso: b.preferred_at, mins: mins, sendTime: true });
    if (a === "approve-acc") return confirmBooking({ b: b, action: "approve", startIso: b.proposed_at, mins: b.duration_minutes || 20, sendTime: false });
    if (a === "decline") return confirmBooking({ b: b, action: "decline", startIso: b.preferred_at });
    if (a === "withdraw") return confirmBooking({ b: b, action: "cancel_reschedule", startIso: b.reschedule_proposed_at });
    if (!iso) return;
    if (a === "approve-pick") return confirmBooking({ b: b, action: "approve", startIso: iso, mins: mins, sendTime: true });
    if (a === "propose") return confirmBooking({ b: b, action: "propose", startIso: iso, mins: mins });
    if (a === "reschedule") return confirmBooking({ b: b, action: "reschedule", startIso: iso, mins: b.duration_minutes || 20 });
  }

  /* ---------------------------------------------------------------- drag and drop (Day + Week, desktop) */
  function dropMinute(col, y) {
    var r = col.getBoundingClientRect(), lo = +col.dataset.lo, sl = slotMin(), raw = lo + (y - r.top) / PX;
    return Math.max(lo, Math.round(raw / sl) * sl);
  }
  function moveBooking(b, key, min) {
    var iso = atIso(key, min); if (!iso || +new Date(iso) === +new Date(bWhen(b))) return;
    var a = b.status === "approved" ? "reschedule" : "propose";
    confirmBooking({ b: b, action: a, startIso: iso, mins: b.duration_minutes || 20 });
  }
  document.addEventListener("dragstart", function (e) {
    var t = e.target.closest && e.target.closest("[data-drag]"); if (!t) return;
    S.drag = { k: t.dataset.k, id: t.dataset.id }; t.classList.add("dragging");
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.dataset.id); } catch (x) { }
  });
  document.addEventListener("dragend", function (e) {
    S.drag = null; Array.prototype.forEach.call(document.querySelectorAll(".dragging,.sc-col.drop,.sc-drop"), function (n) { n.classList.remove("dragging", "drop"); if (n.classList.contains("sc-drop")) n.parentNode.removeChild(n); });
  });
  document.addEventListener("dragover", function (e) {
    var col = S.drag && e.target.closest && e.target.closest(".sc-col"); if (!col) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (x) { }
    var m = dropMinute(col, e.clientY), mk = col.querySelector(".sc-drop");
    Array.prototype.forEach.call(document.querySelectorAll(".sc-col.drop"), function (n) { if (n !== col) n.classList.remove("drop"); });
    col.classList.add("drop");
    if (!mk) { mk = document.createElement("div"); mk.className = "sc-drop"; mk.innerHTML = "<b></b>"; col.appendChild(mk); }
    mk.style.top = ((m - (+col.dataset.lo)) * PX) + "px"; mk.firstChild.textContent = hhmm(m) + " " + tz();
  });
  document.addEventListener("drop", function (e) {
    var col = S.drag && e.target.closest && e.target.closest(".sc-col"); if (!col) return;
    e.preventDefault(); var d = S.drag, m = dropMinute(col, e.clientY), key = col.dataset.k; S.drag = null;
    Array.prototype.forEach.call(document.querySelectorAll(".sc-drop"), function (n) { n.parentNode.removeChild(n); });
    if (d.k === "b") { var b = bById(d.id); if (b) moveBooking(b, key, m); }
    else { var i = iById(d.id); if (i) { var iso = atIso(key, m); if (iso && +new Date(iso) !== +new Date(i.scheduled_at)) confirmInterview(i, iso); } }
    renderCalendar();
  });

  /* ---------------------------------------------------------------- events */
  function shift(dir) {
    var a = S.anchor;
    if (S.mode === "day") S.anchor = addDays(a, dir);
    else if (S.mode === "week") S.anchor = addDays(a, 7 * dir);
    else { var y = +a.slice(0, 4), m = +a.slice(5, 7) - 1 + dir; var d = new Date(Date.UTC(y, m, 1)); S.anchor = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-01"; }
    S.sel = null; S.scrolled = false;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-sc]"); if (!b) return;
    var a = b.dataset.sc, id = b.dataset.id, bk = id && bById(id), s;
    if (a === "mback") { if (e.target === b) closeModal(); return; }
    if (a === "mod-cancel") { closeModal(); return; }
    if (a === "mod-ok") { modalGo(); return; }
    if (a === "nav") { shift(+b.dataset.d); renderCalendar(); }
    else if (a === "today") { S.anchor = today(); S.sel = null; S.scrolled = false; renderCalendar(); }
    else if (a === "mode") { if (S.mode === "month" && b.dataset.m !== "month" && S.sel) S.anchor = S.sel; S.mode = b.dataset.m; S.sel = null; S.scrolled = false; renderCalendar(); }
    else if (a === "layer") { S.layer = b.dataset.l; renderCalendar(); }
    else if (a === "goday") { S.mode = "day"; S.anchor = b.dataset.k; S.sel = null; S.scrolled = false; renderCalendar(); }
    else if (a === "mday") { S.sel = S.sel === b.dataset.k ? null : b.dataset.k; renderCalendar(); }
    else if (a === "open") { S.drawer = { k: b.dataset.k, id: b.dataset.id, tab: null, err: "" }; if (S.mini === undefined) S.mini = null; renderCalendar(); var dr = document.querySelector(".sc-drawer"); if (dr) dr.focus && dr.setAttribute("tabindex", "-1"); }
    else if (a === "close") { S.drawer = null; renderCalendar(); }
    else if (a === "tab" && S.drawer) { S.drawer.tab = b.dataset.t; renderCalendar(); }
    else if (a === "mini-nav") { var mp = S.mini.split("-"), md = new Date(Date.UTC(+mp[0], +mp[1] - 1 + (+b.dataset.d), 1)); S.mini = md.getUTCFullYear() + "-" + pad(md.getUTCMonth() + 1) + "-01"; renderCalendar(); }
    else if (a === "mini-go") { S.anchor = b.dataset.k; S.mini = b.dataset.k.slice(0, 8) + "01"; S.sel = null; S.scrolled = false; renderCalendar(); }
    else if (a === "upall") { S.upAll = !S.upAll; renderCalendar(); }
    else if (a === "sch-day" && bk) { s = schState(bk); s.day = b.dataset.k; s.pick = null; s.chk = null; refreshSch(bk.id); }
    else if (a === "dsch" && S.drawer) { S.drawer.sch = !S.drawer.sch; renderCalendar(); }
    else if (a === "assign" && bk) {
      var mid = (document.getElementById("sc-asg") || {}).value || null;
      X.rpc("staff_booking_action", { p_id: bk.id, p_action: "assign", p: { mechanic_id: mid } }).then(function (r) {
        if (r && r.ok === false) { if (S.drawer) S.drawer.err = r.message || "Not saved."; renderCalendar(); return; }
        if (S.drawer) S.drawer.err = ""; X.say("Assignment saved"); return afterSave(bk.id, "b");
      }).catch(function (er) { X.authErr(er); X.render(); renderCalendar(); });
    }
    else if (a === "sch-nav" && bk) { s = schState(bk); s.wk = addDays(s.wk, 7 * +b.dataset.d); s.day = null; s.pick = null; s.chk = null; refreshSch(bk.id); }
    else if (a === "sch-go" && bk) { s = schState(bk); s.wk = wkStart(b.dataset.w === "req" ? wall(bk.preferred_at).d : today()); s.day = null; s.pick = null; s.chk = null; refreshSch(bk.id); }
    else if (a === "sch-cell" && bk) { s = schState(bk); s.pick = { key: b.dataset.k, min: +b.dataset.m }; doCheck(bk, s); }
    else if (a === "sch-fb" && bk) {
      var d = (document.getElementById("sc-fd-" + bk.id) || {}).value, t = (document.getElementById("sc-ft-" + bk.id) || {}).value, iso = X.wallToIso(d, t, tz());
      s = schState(bk); if (!iso) { S.err = "Enter a date and a time."; return; } s.pick = { iso: iso }; doCheck(bk, s);
    }
    else if (a === "sch-clear" && bk) { s = schState(bk); s.pick = null; s.chk = null; refreshSch(bk.id); }
    else if (a === "sch-act" && bk) schAct(bk, b.dataset.sa);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (S.modal) { closeModal(); return; } if (S.drawer && document.getElementById("cl")) { S.drawer = null; renderCalendar(); } return; }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-sc]')) { e.preventDefault(); e.target.click(); }
  });
  function onField(e) {
    var t = e.target, f = t.dataset && t.dataset.scf; if (!f) return false;
    var bk = t.dataset.id && bById(t.dataset.id), s = bk && schState(bk);
    if (f === "m-msg" && S.modal) S.modal.msg = t.value;
    else if (f === "m-why" && S.modal) { S.modal.reason = t.value; var ok = document.getElementById("sc-m-ok"); if (ok) ok.disabled = !okOn(S.modal); }
    else if (f === "m-ov" && S.modal) { S.modal.override = t.checked; S.modal.focus = true; renderModal(); }
    else if (f === "mech") { S.mech = t.value; renderCalendar(); }
    else if (f === "closed") { S.closed = t.checked; renderCalendar(); }
    else if (f === "sch-dur" && s) { s.dur = +t.value; if (s.pick) doCheck(bk, s); else refreshSch(bk.id); }
    else if (f === "sch-mech" && s) { s.mech = t.value; refreshSch(bk.id); }
    else if (f === "sch-jump" && s && t.value) { s.wk = wkStart(t.value); s.day = t.value; s.pick = null; s.chk = null; refreshSch(bk.id); }
    return true;
  }
  document.addEventListener("input", function (e) { var f = e.target.dataset && e.target.dataset.scf; if (f === "m-msg" || f === "m-why") onField(e); });
  document.addEventListener("change", function (e) { onField(e); });

  /* ---------------------------------------------------------------- loading + refresh */
  function kick() {
    var el = document.getElementById("cl"); if (!el) return;
    renderCalendar(el);
    if (!(X.hasSession() && ST.me && ST.me.active)) return;
    var jobs = [X.loadList(), X.loadTz()]; if (X.isRec()) jobs.push(X.ivLoad());
    Promise.all(jobs).then(function () { renderCalendar(); }).catch(function (er) { X.authErr(er); renderCalendar(); });
  }
  setInterval(function () {
    if (!document.getElementById("cl") || document.hidden || S.modal || S.drag || !X.hasSession() || !(ST.me && ST.me.active)) return;
    var ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    invalidate(); var jobs = [X.loadList()]; if (X.isRec()) jobs.push(X.ivLoad());
    Promise.all(jobs).then(function () { renderCalendar(); }).catch(function () { });
  }, 60000);


  window.AGSCHED = { renderCalendar: renderCalendar, kick: kick, schedulerHtml: schedHtml, refresh: refreshSch, invalidate: invalidate, afterSave: afterSave, state: S, fFull: fFull };
  if (document.getElementById("cl")) kick();
})();
