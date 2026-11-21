/* Atomic Garage staff portal: shared scheduling module.
   ONE module drives both the Calendar page and the week scheduler inside Operations > Bookings, so they
   read the same loaded bookings (ST.list) and the same server data (calendar_availability), and every
   change goes through the same confirmation dialog and the same server rules (staff_check_slot +
   staff_booking_action). Nothing here decides whether a time is valid: the database does.
   All times are shown in the workshop time zone (ST.tz, UTC by default) and labelled with it. */
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
  function evList(from, to) {
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
      h += '<button type="button" class="sc-dh' + (k === td ? " today" : "") + '" data-sc="goday" data-k="' + k + '" aria-label="Open ' + esc(fDay(k, { weekday: "long", day: "numeric", month: "long" })) + '">' + esc(fDay(k, { weekday: "short" })) + '<b>' + Number(k.slice(8)) + '</b><small>' + (di.known && !di.open ? esc(di.why) : n ? n + (n === 1 ? " item" : " items") : (tall && di.known ? hhmm(di.from) + "–" + hhmm(di.to) : "&nbsp;")) + '</small></button>';
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
      h += '<button type="button" class="sc-md' + (k === td ? " today" : "") + (k === S.sel ? " sel" : "") + (k.slice(0, 7) !== a.slice(0, 7) ? " out" : "") + (di.known && !di.open ? " off" : "") + '" data-sc="mday" data-k="' + k + '" aria-label="' + esc(fDay(k, { weekday: "long", day: "numeric", month: "long" })) + ', ' + l.length + ' items"><b>' + Number(k.slice(8)) + '</b>' +
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
    h += '<div class="sc-bar">';
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
  function sideHtml() {
    var mgr = X.isMgr(), rec = X.isRec(), t = today(), h = '<aside class="sc-side">';
    if (mgr) {
      var l = ST.list || [], c1 = l.filter(function (b) { return b.status === "pending"; }), c2 = l.filter(function (b) { return b.status === "alternative_accepted"; }),
        c3 = l.filter(function (b) { return b.status === "alternative_proposed" || pending(b); }), c4 = l.filter(function (b) { return b.status === "approved" && !b.assigned_to; });
      h += '<div class="card"><h3 class="hd bk-h3">Needs attention</h3>' + ((c1.length + c2.length + c3.length + c4.length) ? '<div class="sc-need">' +
        (c1.length ? '<span class="n">' + c1.length + ' pending</span>' : "") + (c2.length ? '<span class="n">' + c2.length + ' to confirm</span>' : "") + (c4.length ? '<span class="n">' + c4.length + ' unassigned</span>' : "") + (c3.length ? '<span class="n w">' + c3.length + ' awaiting customer</span>' : "") + '</div>' +
        c1.concat(c2).concat(c4).slice(0, 4).map(function (b) { return '<div class="sc-card s-' + b.status + '" role="button" tabindex="0" data-sc="open" data-k="b" data-id="' + esc(b.id) + '"><b>' + esc(b.character_name) + '</b> <small>' + esc(b.reference) + ' · ' + esc(X.STAT[b.status] || b.status) + (b.status === "approved" ? " · no mechanic" : "") + '</small></div>'; }).join("") : '<p class="note">Nothing needs a decision right now.</p>') + '</div>';
    }
    var up = evList(t, addDays(t, 90)).filter(function (e) { return +new Date(e.start) + e.mins * 6e4 >= Date.now() && !(e.k === "b" && CLOSED.indexOf(e.b.status) >= 0) && !(e.k === "b" && e.b.status === "completed") && !(e.k === "i" && e.i.status !== "invited" && e.i.status !== "confirmed" && e.i.status !== "reschedule_requested"); }).slice(0, 8);
    h += '<div class="card sp"><h3 class="hd bk-h3">Upcoming appointments</h3>';
    if (up.length) { var last = ""; up.forEach(function (e) { if (e.key !== last) { last = e.key; h += '<div class="sc-ah">' + esc(relDay(e.key)) + (relDay(e.key) === fDay(e.key) ? "" : " · " + esc(fDay(e.key))) + '</div>'; } h += card(e); }); }
    else h += '<p class="note">Nothing coming up' + (S.mech !== "all" ? " for this mechanic" : "") + '. New bookings appear here once approved or proposed.</p>';
    h += '</div>';
    if (rec) {
      var ask = (X.CI.ivs || []).filter(function (i) { return i.status === "reschedule_requested" && new Date(i.scheduled_at) > Date.now(); });
      if (ask.length) h += '<div class="card sp"><h3 class="hd bk-h3">Waiting for your reply (' + ask.length + ')</h3><p class="note">These applicants asked for another time. Use their time, or reschedule.</p>' + ask.map(function (i) { return X.ivCard(i); }).join("") + '</div>';
      h += X.ivNewForm();
    }
    return h + '</aside>';
  }
  function html() {
    var rg = viewRange(), body, keys, i;
    if (S.mode === "month") body = monthView();
    else if (S.mode === "day") body = gridView([S.anchor]);
    else {
      var w = wkStart(S.anchor); keys = []; for (i = 0; i < 7; i++) keys.push(addDays(w, i));
      body = '<div class="sc-wkgrid">' + gridView(keys) + '</div>' + agendaView(keys);
    }
    var h = '<div class="sc-wrap"><div class="sc-main card">' + X.sec("▦", "Calendar", (X.isRec() ? "Bookings and interviews" : "Your assigned bookings") + " – times in " + esc(tz())) + toolbar();
    if (S.avErr) h += '<div class="sc-banner bad" role="alert">' + esc(S.avErr) + '</div>';
    if (S.err) h += '<div class="sc-banner bad" role="alert">' + esc(S.err) + '</div>';
    if (X.isRec() && S.mode === "day") h += '<div class="sc-acts"><button class="alt sm" data-ci="sched-day" data-k="' + esc(S.anchor) + '">Schedule an interview on this day</button></div>';
    h += legend() + emptyState(rg) + body + '<p class="note">Select an appointment for its full details' + (X.isMgr() ? '. Drag a booking or interview in the Day or Week view to propose a new time: you will always be asked to confirm first, and customers confirm changes to approved appointments themselves.' : '.') + '</p></div>' + sideHtml() + '</div>';
    return h + drawerHtml();
  }
  function renderCalendar(el) {
    if (!el) el = document.getElementById("cl");
    if (!el) return;
    if (!S.anchor) S.anchor = today();
    var old = el.querySelector(".sc-scroll"), top = old ? old.scrollTop : null;
    var ae = document.activeElement, fid = ae && ae.id && /^(ci-|sc-)/.test(ae.id) ? ae.id : null, sel = fid && ae.selectionStart;
    el.innerHTML = html();
    var sc = el.querySelector(".sc-scroll");
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
    var d = S.drawer; if (!d) return "";
    var body, title;
    if (d.k === "i") {
      var i = iById(d.id); if (!i) return "";
      title = "Interview";
      body = '<div class="sc-sec">' + X.ivCard(i) + '</div><div class="sc-sec"><button class="alt sm" data-ci="app" data-aid="' + esc(i.application_id) + '">Open application</button></div>';
    } else {
      var b = bById(d.id); if (!b) return "";
      title = b.reference; body = bookingDetails(b, d);
    }
    return '<div class="sc-back" data-sc="close"></div><aside class="sc-drawer" role="dialog" aria-modal="true" aria-label="' + esc(title) + ' details"><div class="sc-dh2"><div><b class="bk-ref">' + esc(title) + '</b>' + (d.k === "b" ? ' ' + X.pill(bById(d.id).status) : "") + '</div><button class="alt sm" data-sc="close" aria-label="Close details">Close</button></div>' + body + '</aside>';
  }
  function row(l, v) { return v ? '<div><dt>' + esc(l) + '</dt><dd>' + esc(v) + '</dd></div>' : ""; }
  function bookingDetails(b, d) {
    var mgr = X.isMgr(), closed = ["declined", "cancelled", "completed"].indexOf(b.status) >= 0, s = b.status, h = "";
    var appt = b.scheduled_at && (s === "approved" || s === "in_progress" || s === "completed") ? fFull(b.scheduled_at) : "";
    if (pending(b)) h += '<div class="sc-banner"><b>Change awaiting customer confirmation.</b> The appointment stays at ' + esc(fFull(b.scheduled_at)) + ' until the customer confirms ' + esc(fFull(b.reschedule_proposed_at)) + ' on Track Booking. Both times are held.</div>';
    if (s === "alternative_proposed") h += '<div class="sc-banner">A different time (<b>' + esc(fFull(b.proposed_at)) + '</b>) is waiting for the customer to accept.</div>';
    if (s === "alternative_accepted") h += '<div class="sc-banner bad">The customer accepted <b>' + esc(fFull(b.proposed_at)) + '</b>. Confirm it to approve the booking.</div>';
    h += '<dl class="sc-dl">' + row("Customer", b.character_name) + row("Contact (in-character)", b.contact) + row("Vehicle", b.vehicle + (b.vehicle_reg ? " (" + b.vehicle_reg + ")" : "")) + row("Service", svc(b)) +
      row("Requested time", fFull(b.preferred_at)) + row("Proposed time", b.proposed_at && (s === "alternative_proposed" || s === "alternative_accepted") ? fFull(b.proposed_at) : "") + row("Appointment", appt) +
      row("New time (awaiting customer)", pending(b) ? fFull(b.reschedule_proposed_at) : "") + row("Length", (b.duration_minutes || 20) + " minutes") + row("Mechanic", mechName(b.assigned_to)) + '</dl>';
    if (b.description) h += '<div class="sc-sec"><h3 class="hd bk-h3">Work requested</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0">' + esc(b.description) + '</p></div>';
    if (b.customer_message) h += '<div class="sc-sec"><h3 class="hd bk-h3">Message shown to customer</h3><p style="margin:0;overflow-wrap:anywhere">' + esc(b.customer_message) + '</p></div>';
    if (mgr && !closed) {
      h += '<div class="sc-sec"><h3 class="hd bk-h3">Mechanic</h3><div class="sc-inline"><select id="sc-asg" aria-label="Mechanic"><option value="">Unassigned</option>' + mechs().map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (m.user_id === b.assigned_to ? " selected" : "") + '>' + esc(m.display_name) + ' (' + esc(m.role) + ')</option>'; }).join("") + '</select><button class="alt" data-sc="assign" data-id="' + esc(b.id) + '">Save assignment</button></div>' + (d.err ? '<div class="sc-banner bad" role="alert">' + esc(d.err) + '</div>' : "") + '<p class="note">A mechanic cannot be given two overlapping appointments.</p></div>';
      h += '<div class="sc-sec"><h3 class="hd bk-h3">Schedule</h3><div class="sc-acts">';
      if (s === "pending") h += '<button data-sc="sch-act" data-sa="approve-req" data-id="' + esc(b.id) + '">Approve requested time</button>';
      if (s === "alternative_accepted") h += '<button data-sc="sch-act" data-sa="approve-acc" data-id="' + esc(b.id) + '">Approve the time they accepted</button>';
      if (pending(b)) h += '<button class="alt" data-sc="sch-act" data-sa="withdraw" data-id="' + esc(b.id) + '">Withdraw the change</button>';
      h += '<button class="alt" data-sc="dsch" data-id="' + esc(b.id) + '">' + (d.sch ? "Hide scheduler" : (s === "approved" ? "Reschedule…" : "Choose another time…")) + '</button></div>' + (d.sch ? schedHtml(b) : "") + '</div>';
    } else if (!mgr && !closed) {
      h += '<div class="sc-sec"><p class="note">Only managers can approve or change appointment times.</p></div>';
    }
    h += '<div class="sc-sec"><div class="sc-acts">' + ((s === "approved" || s === "in_progress") ? '<a class="btn" href="#jobs/' + esc(b.id) + '">Open job</a>' : "") + '<button class="alt" data-bk="cal-open" data-id="' + esc(b.id) + '">Open in Bookings</button></div></div>';
    return h;
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
    } else if (a === "cancel_reschedule") {
      title = "Withdraw the change"; ok = "Withdraw change"; done = "Change withdrawn";
      rows.push(["Stays at", fFull(b.scheduled_at)], ["Withdrawn time", fFull(b.reschedule_proposed_at)]);
      note = "The customer keeps their current appointment.";
    }
    var pre = a === "cancel_reschedule" ? Promise.resolve(null) : checkSlot(b, o.startIso, mins);
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
      s = S.sch[b.id] = { wk: wkStart(wall(base || new Date().toISOString()).d), pick: null, chk: null, mech: "", dur: b.duration_minutes || 20, fetch: "" };
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
    var st = b.status, rangeOk = S.av && !S.av.stale && S.av.from <= s.wk && S.av.to >= addDays(s.wk, 6), h = "";
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
    if (S.avErr) return h + '<div class="sc-banner bad" role="alert">' + esc(S.avErr) + '</div>';
    if (S.av && !S.av.enabled) return h + '<div class="sc-banner">Workshop opening hours are not set up, so free slots cannot be shown. Set them in Operations › Staff &amp; settings. Until then you can still enter a time below.</div>' + fallback(b, s);
    var mech = s.mech === "" ? (b.assigned_to || "") : (s.mech === "none" ? "" : s.mech);
    h += '<div class="sc-sch-bar"><button class="alt sm" data-sc="sch-nav" data-id="' + esc(b.id) + '" data-d="-1" aria-label="Previous week">‹</button><span class="t">' + esc(fDay(s.wk, { day: "numeric", month: "short" })) + ' – ' + esc(fDay(addDays(s.wk, 6), { day: "numeric", month: "short", year: "numeric" })) + '</span><button class="alt sm" data-sc="sch-nav" data-id="' + esc(b.id) + '" data-d="1" aria-label="Next week">›</button>' +
      '<button class="alt sm" data-sc="sch-go" data-id="' + esc(b.id) + '" data-w="now">This week</button><button class="alt sm" data-sc="sch-go" data-id="' + esc(b.id) + '" data-w="req">Requested time</button><label class="bk-sr" for="sc-jump-' + esc(b.id) + '">Jump to date</label><input type="date" id="sc-jump-' + esc(b.id) + '" data-scf="sch-jump" data-id="' + esc(b.id) + '"></div>';
    h += '<div class="sc-sch-opts"><div><label for="sc-dur-' + esc(b.id) + '">Length</label><select id="sc-dur-' + esc(b.id) + '" data-scf="sch-dur" data-id="' + esc(b.id) + '">' + durOpts(s.dur) + '</select></div>' +
      '<div><label for="sc-mv-' + esc(b.id) + '">Show availability for</label><select id="sc-mv-' + esc(b.id) + '" data-scf="sch-mech" data-id="' + esc(b.id) + '"><option value=""' + (s.mech === "" ? " selected" : "") + '>' + (b.assigned_to ? esc(mechName(b.assigned_to)) + " (assigned)" : "No mechanic assigned") + '</option><option value="none"' + (s.mech === "none" ? " selected" : "") + '>Workshop only</option>' +
      mechs().filter(function (m) { return m.user_id !== b.assigned_to; }).map(function (m) { return '<option value="' + esc(m.user_id) + '"' + (s.mech === m.user_id ? " selected" : "") + '>' + esc(m.display_name) + '</option>'; }).join("") + '</select></div></div>';
    if (!rangeOk) return h + '<div class="sc-empty" role="status">Loading availability…</div>';
    var lo = 1440, hi = 0, days = [], i, k;
    for (i = 0; i < 7; i++) { k = addDays(s.wk, i); days.push(k); var di = dayInfo(k); if (di.open) { lo = Math.min(lo, di.from); hi = Math.max(hi, di.to); } }
    if (lo >= hi) return h + '<div class="sc-empty"><b>The workshop is closed all week</b>Choose another week.</div>';
    var td = today(), sl = slotMin(), pk = s.pick, req = +new Date(b.preferred_at), curT = b.scheduled_at && st === "approved" ? +new Date(b.scheduled_at) : 0,
      prop = (st === "alternative_proposed" || st === "alternative_accepted") && b.proposed_at ? +new Date(b.proposed_at) : (pending(b) ? +new Date(b.reschedule_proposed_at) : 0);
    h += '<div class="sc-sl" role="grid" aria-label="Weekly availability in ' + tzl + '"><div class="sc-slg"><div class="sc-slh"></div>' + days.map(function (d) { return '<div class="sc-slh' + (d === td ? " today" : "") + '">' + esc(fDay(d, { weekday: "short" })) + '<b>' + Number(d.slice(8)) + '</b></div>'; }).join("");
    for (var m = lo; m < hi; m += sl) {
      h += '<div class="sc-slt">' + (m % 60 === 0 || m === lo ? hhmm(m) : "") + '</div>';
      days.forEach(function (d) {
        var c = cell(b, s, d, m, mech), ms = +new Date(atIso(d, m)), cl = "sc-c " + c.cls, tx = "";
        if (pk && pk.key === d && m >= pk.min && m < pk.min + s.dur) { cl += " pick"; if (m === pk.min) tx = "✓"; }
        if (ms === req && st !== "approved") { cl += " req"; tx = tx || "★"; }
        if (ms === curT) { cl += " cur"; tx = tx || "●"; }
        if (ms === prop) { cl += " prop"; tx = tx || "◆"; }
        if (!tx && c.used) tx = c.used;
        h += '<button type="button" class="' + cl + '"' + (c.sel ? ' data-sc="sch-cell" data-id="' + esc(b.id) + '" data-k="' + d + '" data-m="' + m + '"' : " disabled") + ' title="' + esc(fDay(d) + " " + hhmm(m) + " " + tz() + ": " + c.t) + '" aria-label="' + esc(fDay(d) + " " + hhmm(m) + ", " + c.t) + '">' + tx + '</button>';
      });
    }
    h += '</div></div><div class="sc-sk"><span><i style="background:rgba(91,224,122,.3)"></i>Free</span><span><i style="background:rgba(255,176,32,.5)"></i>Full (override)</span><span><i style="background:rgba(255,80,80,.5)"></i>Mechanic busy</span><span><i style="background:rgba(128,128,128,.3)"></i>Closed / past</span><span>★ requested · ● current · ◆ proposed · times in ' + tzl + '</span></div>';
    h += '<p class="note">Availability reflects opening hours, blocked days and assigned appointments. Leave of absence is not connected yet.</p>' + pickHtml(b, s);
    return h;
  }
  function fallback(b, s) {
    return '<div class="sc-sch-opts"><div><label for="sc-fd-' + esc(b.id) + '">Date (' + esc(tz()) + ')</label><input type="date" id="sc-fd-' + esc(b.id) + '"></div><div><label for="sc-ft-' + esc(b.id) + '">Time</label><input type="time" id="sc-ft-' + esc(b.id) + '"></div></div><div class="sc-acts"><button class="alt" data-sc="sch-fb" data-id="' + esc(b.id) + '">Use this time</button></div>' + pickHtml(b, s);
  }
  function pickHtml(b, s) {
    var pk = s.pick, st = b.status, h = '<div class="sc-pick" aria-live="polite">';
    if (!pk) {
      h += 'Choose a time in the grid.' + (st === "pending" ? ' Or approve the customer’s requested time from the buttons above.' : "");
      return h + '</div>';
    }
    var iso = pk.iso || atIso(pk.key, pk.min), same = +new Date(iso) === +new Date(b.preferred_at), c = s.chk, hard = c && c.hard, i;
    h += '<b>' + esc(fFull(iso)) + '</b> · ' + s.dur + ' minutes';
    if (!c) h += '<p class="note" role="status">Checking the schedule…</p>';
    else if (!c.conflicts.length) h += '<p class="note">No conflicts. This time is free.</p>';
    else { h += '<ul>'; for (i = 0; i < c.conflicts.length; i++) h += '<li class="' + (c.conflicts[i].overridable ? "soft" : "hard") + '">' + esc(c.conflicts[i].message) + '</li>'; h += '</ul>' + (hard ? '<p class="note">This time cannot be used.</p>' : '<p class="note">You can still continue: you will be asked for an override reason.</p>'); }
    h += '<div class="sc-acts">';
    var dis = !c || hard ? " disabled" : "";
    if (st === "pending" && same) h += '<button data-sc="sch-act" data-sa="approve-pick" data-id="' + esc(b.id) + '"' + dis + '>Approve this time</button>';
    if (st === "pending" && !same) h += '<button data-sc="sch-act" data-sa="propose" data-id="' + esc(b.id) + '"' + dis + '>Propose this time</button>';
    if (st === "alternative_proposed") h += '<button data-sc="sch-act" data-sa="propose" data-id="' + esc(b.id) + '"' + dis + '>Replace the proposed time</button>';
    if (st === "alternative_accepted") h += '<button data-sc="sch-act" data-sa="propose" data-id="' + esc(b.id) + '"' + dis + '>Propose this time instead</button>';
    if (st === "approved") h += '<button data-sc="sch-act" data-sa="reschedule" data-id="' + esc(b.id) + '"' + dis + '>Send change to customer</button>';
    return h + '<button class="alt" data-sc="sch-clear" data-id="' + esc(b.id) + '">Clear</button></div></div>';
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
    else if (a === "open") { S.drawer = { k: b.dataset.k, id: b.dataset.id, sch: false, err: "" }; renderCalendar(); var dr = document.querySelector(".sc-drawer"); if (dr) dr.focus && dr.setAttribute("tabindex", "-1"); }
    else if (a === "close") { S.drawer = null; renderCalendar(); }
    else if (a === "dsch" && S.drawer) { S.drawer.sch = !S.drawer.sch; renderCalendar(); }
    else if (a === "assign" && bk) {
      var mid = (document.getElementById("sc-asg") || {}).value || null;
      X.rpc("staff_booking_action", { p_id: bk.id, p_action: "assign", p: { mechanic_id: mid } }).then(function (r) {
        if (r && r.ok === false) { if (S.drawer) S.drawer.err = r.message || "Not saved."; renderCalendar(); return; }
        if (S.drawer) S.drawer.err = ""; X.say("Assignment saved"); return afterSave(bk.id, "b");
      }).catch(function (er) { X.authErr(er); X.render(); renderCalendar(); });
    }
    else if (a === "sch-nav" && bk) { s = schState(bk); s.wk = addDays(s.wk, 7 * +b.dataset.d); s.pick = null; s.chk = null; refreshSch(bk.id); }
    else if (a === "sch-go" && bk) { s = schState(bk); s.wk = wkStart(b.dataset.w === "req" ? wall(bk.preferred_at).d : today()); s.pick = null; s.chk = null; refreshSch(bk.id); }
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
    else if (f === "sch-jump" && s && t.value) { s.wk = wkStart(t.value); s.pick = null; s.chk = null; refreshSch(bk.id); }
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
