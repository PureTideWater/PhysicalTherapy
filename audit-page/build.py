import json, sys, html
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
data = json.dumps(d, ensure_ascii=False).replace("</", "<\\/")
page = r'''<title>PaidWhole Upgrade Audit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column; decisions first, then a filterable ledger of upgrades that open in place. */
:root {
  --bg: #f6f7f5; --surface: #ffffff; --fg: #1d2523; --muted: #5d6965; --line: #d9dfdc;
  --accent: #1f5f8b; --accent-soft: #e3eef6;
  --crit: #a3262a; --crit-soft: #f8e3e2; --high: #8a5a00; --high-soft: #f7ecd6;
  --med: #2d5f7a; --med-soft: #e1edf3; --low: #56615d; --low-soft: #eceeed;
  --sans: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121715; --surface: #1a201e; --fg: #e4e9e6; --muted: #9aa6a1; --line: #2e3734;
  --accent: #7db6dd; --accent-soft: #1d2f3b;
  --crit: #f08a85; --crit-soft: #3a1f1f; --high: #e5b75c; --high-soft: #352a15;
  --med: #8fc3de; --med-soft: #1c2c35; --low: #a9b3af; --low-soft: #262c2a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121715; --surface: #1a201e; --fg: #e4e9e6; --muted: #9aa6a1; --line: #2e3734;
  --accent: #7db6dd; --accent-soft: #1d2f3b;
  --crit: #f08a85; --crit-soft: #3a1f1f; --high: #e5b75c; --high-soft: #352a15;
  --med: #8fc3de; --med-soft: #1c2c35; --low: #a9b3af; --low-soft: #262c2a; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--fg); font: 400 15px/1.55 var(--sans); }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 28px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1, h2, h3 { text-wrap: balance; line-height: 1.25; margin: 0 }
h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em }
h2 { font-size: 1.2rem; font-weight: 700; margin-top: 40px; padding-bottom: 8px; border-bottom: 1px solid var(--line) }
.meta { color: var(--muted); font-size: .85rem; margin-top: 6px }
p { margin: 12px 0; max-width: 68ch }
code { font-family: var(--mono); font-size: .86em; background: var(--accent-soft); padding: 0 4px; border-radius: 3px; overflow-wrap: anywhere }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 20px }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; min-width: 0 }
.tile b { display: block; font: 500 1.35rem/1.2 var(--mono); font-variant-numeric: tabular-nums }
.tile span { font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em }
.tile.crit b { color: var(--crit) } .tile.high b { color: var(--high) }
ul.plain { padding-left: 20px; margin: 12px 0 } ul.plain li { margin: 8px 0; max-width: 72ch }
.decision { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 4px; padding: 12px 14px; margin: 10px 0 }
.decision strong { display: block; margin-bottom: 4px }
.when { display: grid; grid-template-columns: 1fr auto auto; gap: 4px 16px; margin-top: 14px; font-size: .92rem }
.when div { min-width: 0 } .when .n { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap }
.when .h { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em }
.filters { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding: 12px 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-bottom: 1px solid var(--line) }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
.chip { font: 600 .8rem var(--sans); border: 1px solid var(--line); background: var(--surface); color: var(--fg); border-radius: 999px; padding: 6px 12px; cursor: pointer }
.chip[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg) }
.chip:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
select, input[type=search] { font: 400 .85rem var(--sans); background: var(--surface); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; min-width: 0; max-width: 100% }
input[type=search] { flex: 1 1 160px }
.count { color: var(--muted); font-size: .82rem; width: 100% }
.item { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; margin: 8px 0 }
.item summary { list-style: none; cursor: pointer; padding: 12px 14px; display: grid; grid-template-columns: 2.6em 1fr; gap: 4px 10px }
.item summary::-webkit-details-marker { display: none }
.rank { font: 500 .9rem var(--mono); color: var(--muted); padding-top: 1px }
.t { font-weight: 600; min-width: 0 }
.tags { grid-column: 2; display: flex; flex-wrap: wrap; gap: 6px; font-size: .75rem }
.pill { border-radius: 3px; padding: 1px 7px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em }
.pill.critical { color: var(--crit); background: var(--crit-soft) } .pill.high { color: var(--high); background: var(--high-soft) }
.pill.medium { color: var(--med); background: var(--med-soft) } .pill.low { color: var(--low); background: var(--low-soft) }
.tag { color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 6px }
.tag.fx { color: var(--accent); border-color: var(--accent) }
.tag.hrs { font-family: var(--mono) }
.body { padding: 0 14px 14px calc(14px + 2.6em + 10px); }
.body dt { font-size: .74rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-top: 12px }
.body dd { margin: 3px 0 0; max-width: 70ch; overflow-wrap: anywhere }
@media (max-width: 520px) { .body { padding-left: 14px } .item summary { grid-template-columns: 2.2em 1fr } .when { grid-template-columns: 1fr auto } .when .n.hours { display: none } }
.foot { color: var(--muted); font-size: .82rem; margin-top: 32px }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto } }
</style>
<div class="wrap">
  <header>
    <h1>PaidWhole upgrade audit</h1>
    <div class="meta" id="meta"></div>
  </header>
  <div class="tiles" id="tiles"></div>
  <p id="summary"></p>

  <h2 id="decide">Decisions only you can make</h2>
  <div id="decisions"></div>

  <h2>When the work is needed</h2>
  <div class="when" id="when"></div>

  <h2>Where the work lands</h2>
  <ul class="plain" id="legend"></ul>

  <h2>Already being built</h2>
  <ul class="plain" id="progress"></ul>

  <h2 id="upgrades">All upgrades</h2>
  <div class="filters" role="group" aria-label="Filter upgrades">
    <button class="chip" id="f-all" aria-pressed="true">All</button>
    <button class="chip" id="f-critical" aria-pressed="false">Critical</button>
    <button class="chip" id="f-high" aria-pressed="false">High</button>
    <button class="chip" id="f-medium" aria-pressed="false">Medium</button>
    <button class="chip" id="f-low" aria-pressed="false">Low</button>
    <button class="chip" id="f-fx" aria-pressed="false">Needs freeze exception</button>
    <select id="f-when" aria-label="Needed by"><option value="">Needed any time</option></select>
    <input type="search" id="f-q" placeholder="Search upgrades" aria-label="Search upgrades">
    <div class="count" id="count" aria-live="polite"></div>
  </div>
  <div id="list"></div>

  <h2>Only people can do these</h2>
  <div id="people"></div>

  <h2>Reviewed and already the best option</h2>
  <ul class="plain" id="best"></ul>

  <p class="foot">Synthetic data only. Read-only review of the build branch and the open PR 5 and PR 6 branches. No figure on this page came from a model guess: hours are build estimates, and every upgrade cites its audit source.</p>
</div>
<script type="application/json" id="data">__DATA__</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmt(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  function el(id) { return document.getElementById(id); }
  el('meta').textContent = D.date + ' · both audits combined · ' + D.counts.total + ' upgrades';
  var c = D.counts, h = D.added_hours;
  el('tiles').innerHTML = [
    ['crit', c.critical, 'Critical'], ['high', c.high, 'High'], ['', c.medium, 'Medium'], ['', c.low, 'Low'],
    ['', c.needs_freeze_exception, 'Freeze exceptions'], ['', h.total, 'Added plan hours']
  ].map(function (t) { return '<div class="tile ' + t[0] + '"><b>' + esc(t[1]) + '</b><span>' + esc(t[2]) + '</span></div>'; }).join('');
  el('summary').innerHTML = fmt(D.summary);
  var heads = ['Freeze exceptions', 'Rulings these change', 'Running costs to accept', 'Success fee', 'GitHub and the repository', 'Figures only you set', 'The schedule'];
  el('decisions').innerHTML = D.owner_decisions.map(function (t, i) {
    var body = t.replace(/^[^:]{0,80}:\s*/, function (m) { return i < heads.length ? '' : m; });
    if (i === 3) body = t;
    return '<div class="decision"><strong>' + esc(heads[i] || 'Decision') + '</strong>' + fmt(body).replace(/#(\d+) /g, '<a href="#u$1">#$1</a> ') + '</div>';
  }).join('');
  var w = '<div class="h">Needed</div><div class="h n">Upgrades</div><div class="h n hours">Hours</div>';
  Object.keys(D.hours_by_when).forEach(function (k) { var v = D.hours_by_when[k];
    w += '<div>' + esc(k) + '</div><div class="n">' + v.items + '</div><div class="n hours">' + esc(v.hours) + '</div>';
    var o = document.createElement('option'); o.value = k; o.textContent = k.replace(/ \(.*\)$/, ''); el('f-when').appendChild(o); });
  el('when').innerHTML = w;
  el('legend').innerHTML = D.pr_legend.map(function (t) { return '<li>' + fmt(t) + '</li>'; }).join('');
  el('progress').innerHTML = D.in_progress_since_first_audit.map(function (t) { return '<li>' + fmt(t) + '</li>'; }).join('');
  el('best').innerHTML = D.already_best.map(function (t) { return '<li>' + fmt(t) + '</li>'; }).join('');
  el('people').innerHTML = Object.keys(D.people_only).map(function (k) {
    return '<h3 style="font-size:1rem;margin-top:18px">' + esc(k) + '</h3><ul class="plain">' + D.people_only[k].map(function (t) { return '<li>' + fmt(t) + '</li>'; }).join('') + '</ul>'; }).join('');

  var list = el('list');
  var rows = D.items.map(function (it) {
    var d = document.createElement('details'); d.className = 'item'; d.id = 'u' + it.rank;
    d.dataset.sev = it.severity; d.dataset.fx = it.needs_freeze_exception ? '1' : ''; d.dataset.when = it.when;
    d.dataset.q = (it.title + ' ' + it.current + ' ' + it.best + ' ' + it.why + ' ' + it.lands_in + ' ' + it.angle).toLowerCase();
    d.innerHTML = '<summary><span class="rank">' + it.rank + '</span><span class="t">' + fmt(it.title) + '</span><span class="tags">' +
      '<span class="pill ' + esc(it.severity) + '">' + esc(it.severity) + '</span>' +
      '<span class="tag">' + esc(it.angle) + '</span><span class="tag hrs">' + esc(it.hours) + ' h</span>' +
      (it.needs_freeze_exception ? '<span class="tag fx">freeze exception</span>' : '') + '</span></summary>' +
      '<dl class="body"><dt>Today</dt><dd>' + fmt(it.current) + '</dd><dt>Best option</dt><dd>' + fmt(it.best) + '</dd>' +
      '<dt>Why it matters</dt><dd>' + fmt(it.why) + '</dd><dt>What it changes</dt><dd>' + fmt(it.changes) + '</dd>' +
      '<dt>Lands in</dt><dd>' + fmt(it.lands_in) + '</dd><dt>Needed</dt><dd>' + fmt(it.when) + '</dd>' +
      '<dt>Source</dt><dd>' + fmt((it.sources || []).join('; ')) + '</dd></dl>';
    list.appendChild(d); return d; });

  var sev = '', fx = false;
  function chips() { ['all','critical','high','medium','low'].forEach(function (k) { el('f-' + k).setAttribute('aria-pressed', String((k === 'all' && !sev) || k === sev)); }); el('f-fx').setAttribute('aria-pressed', String(fx)); }
  function apply() {
    var q = el('f-q').value.trim().toLowerCase(), wh = el('f-when').value, n = 0;
    rows.forEach(function (r) { var ok = (!sev || r.dataset.sev === sev) && (!fx || r.dataset.fx) && (!wh || r.dataset.when === wh) && (!q || r.dataset.q.indexOf(q) >= 0);
      r.hidden = !ok; if (ok) n++; });
    el('count').textContent = 'Showing ' + n + ' of ' + rows.length + ' upgrades';
    try { localStorage.setItem('pw-audit-filter', JSON.stringify({ sev: sev, fx: fx, wh: wh })); } catch (e) {}
  }
  ['all','critical','high','medium','low'].forEach(function (k) { el('f-' + k).addEventListener('click', function () { sev = k === 'all' ? '' : k; chips(); apply(); }); });
  el('f-fx').addEventListener('click', function () { fx = !fx; chips(); apply(); });
  el('f-when').addEventListener('change', apply); el('f-q').addEventListener('input', apply);
  try { var s = JSON.parse(localStorage.getItem('pw-audit-filter') || 'null'); if (s) { sev = s.sev || ''; fx = !!s.fx; el('f-when').value = s.wh || ''; } } catch (e) {}
  chips(); apply();
  function openHash() { var m = /^#u(\d+)$/.exec(location.hash); if (!m) return; var r = el('u' + m[1]); if (r) { sev = ''; fx = false; el('f-when').value = ''; el('f-q').value = ''; chips(); apply(); r.open = true; r.scrollIntoView(); } }
  window.addEventListener('hashchange', openHash); openHash();
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#u"]'); if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); openHash(); } });
})();
</script>
'''
open(out, 'w').write(page.replace('__DATA__', data))
print(len(page) + len(data))
