/* COOL Code — Scans view (tracked links + analytics). Uses globals from app.js. */
'use strict';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const fmt = new Intl.NumberFormat();
let links = [];
let selectedId = null;
let rangeDays = 30;
let currentView = 'design';
let lastStats = null;
let refreshTimer = null;
let ownerFilter = 'all';
let searchText = '';
let me = null;           // signed-in user from the server
let teamMode = false;

const initials = (name) => (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
function avatarHtml(name, picture, cls = 'avatar') {
  return picture
    ? `<span class="${cls}"><img src="${esc(picture)}" alt="" referrerpolicy="no-referrer"/>${esc(initials(name))}</span>`
    : `<span class="${cls}">${esc(initials(name))}</span>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

function relTime(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ------------------------------------------------------------------
// Views
// ------------------------------------------------------------------
function showView(name, focusId) {
  currentView = name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  $('view-design').hidden = name !== 'design';
  $('view-scans').hidden = name !== 'scans';
  if (name === 'scans') {
    if (focusId) { selectedId = focusId; teamMode = false; }
    if (typeof currentUser !== 'undefined' && !currentUser) {
      $('linkList').innerHTML = '';
      $('overall').innerHTML = '';
      $('linkDetail').innerHTML = `<div class="empty-state"><h2>Sign in to see scans</h2>
        <p>Scan counts are shared with everyone at your church. Sign in with your Google account to see them.</p>
        <button class="btn-primary" id="scansSignIn">Sign in with Google</button></div>`;
      $('scansSignIn').onclick = () => requireSignIn();
      return;
    }
    refreshLinks();
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (currentView === 'scans' && document.visibilityState === 'visible') refreshLinks({ quiet: true });
  }, 30000);
}

// ------------------------------------------------------------------
// Links list
// ------------------------------------------------------------------
async function refreshLinks({ quiet = false } = {}) {
  if (!window.qrApi?.api) {
    $('linkList').innerHTML = '<p class="hint pad">Scan tracking works in the installed COOL Code app.</p>';
    return;
  }
  const btn = $('btnRefresh');
  btn.classList.add('spin');
  const res = await window.qrApi.api({ action: 'list' });
  btn.classList.remove('spin');
  if (res.error) {
    if (res.auth && typeof requireSignIn === 'function') { requireSignIn(res.error); return; }
    if (!quiet) $('linkList').innerHTML = `<div class="notice">${esc(res.error)}</div>`;
    $('overall').innerHTML = '';
    return;
  }
  links = res.links || [];
  me = res.me || me;
  // Keep the designer's copy of the tracked link fresh
  if (state.track) {
    const l = links.find((x) => x.id === state.track.id);
    if (l) { state.track = pickTrack(l); syncTracking(); }
  }
  renderOverall();
  renderList();
  if (teamMode) { loadTeam({ quiet }); return; }
  if (selectedId && links.some((l) => l.id === selectedId)) loadDetail(selectedId, { quiet });
  else if (!selectedId && links.length) loadDetail(links[0].id);
  else if (!links.length) renderEmptyDetail();
}

function renderOverall() {
  const active = links.filter((l) => !l.archived);
  const sum = (k) => links.reduce((a, l) => a + Number(l[k] || 0), 0);
  $('overall').innerHTML = `
    <div class="mini-stat"><b>${fmt.format(sum('total'))}</b><span>total scans</span></div>
    <div class="mini-stat"><b>${fmt.format(sum('today'))}</b><span>today</span></div>
    <div class="mini-stat"><b>${fmt.format(active.length)}</b><span>active codes</span></div>`;
}

function renderList() {
  const root = $('linkList');
  if (!links.length) {
    root.innerHTML = '<p class="hint pad">No tracked codes yet. In the Design tab, switch on <b>Track scans</b> and create a tracking link.</p>';
    return;
  }
  root.innerHTML = '';
  const q = searchText.toLowerCase();
  const shown = links.filter((l) =>
    (ownerFilter === 'all' || (me && l.created_by_email === me.email)) &&
    (!q || [l.name, l.target_url, l.created_by_name, l.created_by_email, l.slug].some((v) => (v || '').toLowerCase().includes(q))));
  if (!shown.length) {
    root.innerHTML = `<p class="hint pad">${ownerFilter === 'mine' ? 'You haven’t made any tracked codes yet.' : 'No codes match your search.'}</p>`;
    return;
  }
  for (const l of shown) {
    const row = document.createElement('button');
    row.className = 'link-row' + (l.id === selectedId ? ' on' : '') + (l.archived ? ' paused' : '');
    row.innerHTML = `
      <div class="lr-main">
        <div class="lr-name">${esc(l.name || host(l.target_url))}${l.archived ? ' <em>paused</em>' : ''}</div>
        <div class="lr-sub">${esc(host(l.target_url))} · ${esc(relTime(l.last_scan))}</div>
        <div class="lr-by">${avatarHtml(l.created_by_name || '?', null, 'avatar xs')}${esc(l.created_by_name || 'Unassigned')}${me && l.created_by_email === me.email ? ' <span class="you">you</span>' : ''}</div>
      </div>
      <div class="lr-count"><b>${fmt.format(l.total)}</b><span>scans</span></div>`;
    row.onclick = () => { teamMode = false; $('btnTeam').classList.remove('on'); loadDetail(l.id); };
    root.append(row);
  }
}

function renderEmptyDetail() {
  selectedId = null;
  $('linkDetail').innerHTML = `
    <div class="empty-state">
      <h2>No tracked codes yet</h2>
      <p>Go to <b>Design</b>, switch on <b>Track scans</b>, and create a tracking link. Every scan of that code is counted here.</p>
      <button class="btn-primary" id="goDesign">Go to Design</button>
    </div>`;
  $('goDesign').onclick = () => showView('design');
}

// ------------------------------------------------------------------
// Detail
// ------------------------------------------------------------------
async function loadDetail(id, { quiet = false } = {}) {
  selectedId = id;
  renderList();
  const link = links.find((l) => l.id === id);
  if (!link) return;
  if (!quiet) $('linkDetail').innerHTML = '<div class="loading">Loading scans…</div>';
  const res = await window.qrApi.api({ action: 'stats', id, days: rangeDays, tz: TZ });
  if (selectedId !== id) return; // user clicked elsewhere meanwhile
  if (res.error) { $('linkDetail').innerHTML = `<div class="notice">${esc(res.error)}</div>`; return; }
  lastStats = res;
  renderDetail(link, res);
}

function renderDetail(l, st) {
  const periodTotal = st.daily.reduce((a, d) => a + Number(d.scans), 0);
  const d = $('linkDetail');
  d.innerHTML = `
    <header class="detail-head">
      <div>
        <h1 ${l.can_edit ? 'contenteditable="true" title="Click to rename"' : ''} spellcheck="false" id="dName">${esc(l.name || host(l.target_url))}</h1>
        <div class="made-by">${avatarHtml(l.created_by_name || '?', null, 'avatar sm')}
          <span>Made by <b>${esc(l.created_by_name || 'Unassigned')}</b>${l.created_by_email ? ` <span class="muted">${esc(l.created_by_email)}</span>` : ''} · ${esc(new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
          ${!l.created_by_email && me?.isAdmin ? '<button class="mini" id="dClaim">Assign to me</button>' : ''}
        </div>
        <div class="dest-line">
          <span class="muted">Goes to</span>
          <input id="dDest" type="text" value="${esc(l.target_url)}" spellcheck="false" ${l.can_edit ? '' : 'readonly'} />
          <button id="dSaveDest" class="btn-primary sm" hidden>Save</button>
        </div>
        <div class="short-line">
          <span class="muted">Code link</span>
          <code title="${esc(l.short_url)}">${esc(l.short_url.replace(/^https:\/\//, ''))}</code>
          <button class="mini" id="dCopy">Copy</button>
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn-primary" id="dDesign">Open in Design</button>
        ${l.can_edit ? `<button class="btn-ghost" id="dPause">${l.archived ? 'Resume' : 'Pause'}</button>
        <button class="btn-ghost danger" id="dDelete">Delete</button>` : ''}
      </div>
    </header>
    ${l.can_edit ? '' : `<div class="notice info">You can see this code’s scans. Only ${esc(l.created_by_name || 'its creator')} or an admin can change it.</div>`}
    ${l.archived ? '<div class="notice warn">This code is paused. Scanning it shows “no longer active” and isn’t counted.</div>' : ''}

    <section class="tiles">
      ${tile('Total scans', l.total, 'all time')}
      ${tile('Unique visitors', l.uniques, 'counted once per day')}
      ${tile('Today', l.today, '')}
      ${tile('Last 7 days', l.last7, '')}
    </section>

    <section class="card chart-card">
      <div class="chart-head">
        <div>
          <h3>Scans per day</h3>
          <p class="muted">${fmt.format(periodTotal)} scans in the last ${rangeDays} days · last scan ${esc(relTime(l.last_scan))}</p>
        </div>
        <div class="seg mini range" id="dRange">
          ${[7, 30, 90].map((n) => `<button data-days="${n}" class="${n === rangeDays ? 'on' : ''}">${n}d</button>`).join('')}
        </div>
      </div>
      <div id="dChart" class="chart" role="img" aria-label="Daily scans for the last ${rangeDays} days"></div>
      <details class="table-view"><summary>Show as table</summary>${dailyTable(st.daily)}</details>
    </section>

    <section class="split">
      <div class="card"><h3>Devices</h3>${barList(st.devices)}</div>
      <div class="card"><h3>Operating system</h3>${barList(st.os)}</div>
    </section>

    <section class="card">
      <h3>Recent scans</h3>
      ${st.recent.length ? `<ul class="recent">${st.recent.map((r) => `
        <li><span>${esc(new Date(r.scanned_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span>
        <span class="muted">${esc(r.device || '—')} · ${esc(r.os || '—')}${r.country ? ' · ' + esc(r.country) : ''}</span></li>`).join('')}</ul>`
        : '<p class="muted">No scans yet. Scan the code with your phone to test it — it shows up here within seconds.</p>'}
    </section>
    <p class="muted foot">Counts skip link-preview bots (iMessage, Slack, etc.). Unique visitors are anonymous and reset daily — no personal data is stored.</p>`;

  drawChart($('dChart'), st.daily);

  // Wire actions
  $('dCopy').onclick = async () => { try { await navigator.clipboard.writeText(l.short_url); toast('Tracking link copied'); } catch { toast(l.short_url); } };
  $('dDesign').onclick = () => { useTrackedLink(l); showView('design'); };
  $('dRange').querySelectorAll('button').forEach((b) => b.onclick = () => { rangeDays = +b.dataset.days; loadDetail(l.id); });
  const dest = $('dDest');
  dest.oninput = () => { $('dSaveDest').hidden = normalizeUrl(dest.value) === l.target_url; };
  dest.onkeydown = (e) => { if (e.key === 'Enter') $('dSaveDest').click(); };
  $('dSaveDest').onclick = async () => {
    const url = normalizeUrl(dest.value);
    if (!url) { toast('Enter a full web link (https://…)'); return; }
    const res = await window.qrApi.api({ action: 'update', id: l.id, target_url: url });
    if (res.error) { toast(res.error); return; }
    toast('Destination updated — printed codes now go there');
    refreshLinks({ quiet: true });
  };
  const name = $('dName');
  if (l.can_edit) name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } };
  if (l.can_edit) name.onblur = async () => {
    const v = name.textContent.trim().slice(0, 120);
    if (!v || v === (l.name || '')) return;
    const res = await window.qrApi.api({ action: 'update', id: l.id, name: v });
    if (res.error) toast(res.error); else refreshLinks({ quiet: true });
  };
  if ($('dPause')) $('dPause').onclick = async () => {
    const res = await window.qrApi.api({ action: 'update', id: l.id, archived: !l.archived });
    if (res.error) toast(res.error); else { toast(l.archived ? 'Code resumed' : 'Code paused'); refreshLinks(); }
  };
  if ($('dDelete')) $('dDelete').onclick = () => confirmDelete(l);
  if ($('dClaim')) $('dClaim').onclick = async () => {
    const res = await window.qrApi.api({ action: 'update', id: l.id, claim: true });
    if (res.error) toast(res.error); else { toast('Assigned to you'); refreshLinks({ quiet: true }); }
  };
}

function confirmDelete(l) {
  const btn = $('dDelete');
  if (btn.dataset.armed) {
    (async () => {
      const res = await window.qrApi.api({ action: 'delete', id: l.id });
      if (res.error) { toast(res.error); return; }
      if (state.track?.id === l.id) { state.track = null; sync(); render(); }
      selectedId = null;
      toast('Code deleted');
      refreshLinks();
    })();
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = 'Click again to delete — printed codes will stop working';
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Delete'; } }, 4000);
}

function tile(label, value, sub) {
  return `<div class="tile"><span class="tile-label">${esc(label)}</span><b>${fmt.format(Number(value || 0))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

function barList(items) {
  if (!items.length) return '<p class="muted">No data yet.</p>';
  const total = items.reduce((a, i) => a + i.count, 0);
  const max = Math.max(...items.map((i) => i.count));
  return `<ul class="bars">${items.slice(0, 6).map((i) => `
    <li><span class="b-label">${esc(i.label)}</span>
      <span class="b-track"><span class="b-fill" style="width:${Math.max(2, (i.count / max) * 100)}%"></span></span>
      <span class="b-val">${fmt.format(i.count)} <small>${Math.round((i.count / total) * 100)}%</small></span></li>`).join('')}</ul>`;
}

function dailyTable(daily) {
  return `<table><thead><tr><th>Day</th><th>Scans</th><th>Unique</th></tr></thead><tbody>${
    [...daily].reverse().map((d) => `<tr><td>${esc(fmtDay(d.day, true))}</td><td>${fmt.format(d.scans)}</td><td>${fmt.format(d.uniques)}</td></tr>`).join('')
  }</tbody></table>`;
}

function fmtDay(day, long) {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
}

// ------------------------------------------------------------------
// Column chart (SVG) — single series, hover tooltip
// ------------------------------------------------------------------
// Max that splits into 4 clean ticks (whole-number steps)
function niceMax(v) {
  const raw = Math.max(1, v / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((x) => x >= raw && Number.isInteger(x));
  return Math.max(1, Math.ceil(step)) * 4;
}

function drawChart(el, daily) {
  if (!el) return;
  const W = Math.max(320, el.clientWidth), H = 220;
  const pad = { l: 40, r: 8, t: 12, b: 26 };
  const n = daily.length;
  const max = niceMax(Math.max(0, ...daily.map((d) => Number(d.scans))));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const band = iw / n;
  const bw = Math.min(24, Math.max(2, band - 2)); // ≤24px, 2px air between columns
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const r = Math.min(4, bw / 2);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" aria-hidden="true">`;
  for (const t of ticks) {
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
    svg += `<text x="${pad.l - 8}" y="${y(t) + 4}" class="axis" text-anchor="end">${fmt.format(Math.round(t))}</text>`;
  }
  const labelEvery = Math.ceil(n / 8);
  daily.forEach((d, i) => {
    const v = Number(d.scans);
    const cx = pad.l + band * i + band / 2;
    const x = cx - bw / 2;
    if (v > 0) {
      const top = y(v), base = pad.t + ih, h = Math.max(base - top, 2);
      const rr = Math.min(r, h);
      // rounded data-end, square baseline
      svg += `<path class="col" d="M${x},${base} V${base - h + rr} Q${x},${base - h} ${x + rr},${base - h} H${x + bw - rr} Q${x + bw},${base - h} ${x + bw},${base - h + rr} V${base} Z"/>`;
    }
    if (i % labelEvery === (n - 1) % labelEvery) {
      svg += `<text x="${cx}" y="${H - 8}" class="axis" text-anchor="middle">${esc(fmtDay(d.day))}</text>`;
    }
    svg += `<rect class="hit" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih}" data-i="${i}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;

  const tip = $('chartTip');
  el.querySelectorAll('.hit').forEach((h) => {
    h.onmouseenter = () => h.classList.add('hover');
    h.onmousemove = (e) => {
      const d = daily[+h.dataset.i];
      tip.innerHTML = `<b>${esc(fmtDay(d.day, true))}</b><div>${fmt.format(d.scans)} scan${d.scans == 1 ? '' : 's'}</div><div class="muted">${fmt.format(d.uniques)} unique</div>`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(window.innerWidth - tw - 12, e.clientX + 14) + 'px';
      tip.style.top = (e.clientY - 12 - tip.offsetHeight) + 'px';
    };
    h.onmouseleave = () => { h.classList.remove('hover'); tip.hidden = true; };
  });
}

window.addEventListener('resize', debounce(() => {
  if (currentView === 'scans' && lastStats) drawChart($('dChart'), lastStats.daily);
}, 120));

// ------------------------------------------------------------------
// Team overview — who made which codes, and how many scans each has
// ------------------------------------------------------------------
async function loadTeam({ quiet = false } = {}) {
  teamMode = true;
  selectedId = null;
  $('btnTeam').classList.add('on');
  renderList();
  if (!quiet) $('linkDetail').innerHTML = '<div class="loading">Loading team…</div>';
  const res = await window.qrApi.api({ action: 'team' });
  if (!teamMode) return;
  if (res.error) { if (res.auth) requireSignIn(res.error); else $('linkDetail').innerHTML = `<div class="notice">${esc(res.error)}</div>`; return; }
  const people = res.people || [];
  const maxScans = Math.max(1, ...people.map((p) => p.scans));
  const totalScans = people.reduce((a, p) => a + p.scans, 0);
  const totalCodes = people.reduce((a, p) => a + p.codes, 0);
  $('linkDetail').innerHTML = `
    <header class="detail-head"><div><h1>Team</h1>
      <p class="muted" style="margin:0">Everyone who has signed in to COOL Code, the codes they’ve made, and how many times those codes were scanned.</p></div></header>
    <section class="tiles three">
      ${tile('People', people.filter((p) => p.email !== '—').length, 'signed in at least once')}
      ${tile('Tracked codes', totalCodes, '')}
      ${tile('Total scans', totalScans, 'all codes, all time')}
    </section>
    <section class="card">
      <table class="team">
        <thead><tr><th>Person</th><th class="num">Codes</th><th>Scans</th><th class="num">Last 7 days</th><th class="num">Last active</th></tr></thead>
        <tbody>${people.map((p) => `
          <tr data-email="${esc(p.email)}">
            <td><div class="person">${avatarHtml(p.name, p.picture, 'avatar sm')}<div><b>${esc(p.name || p.email)}</b>${me && p.email === me.email ? ' <span class="you">you</span>' : ''}<div class="muted">${esc(p.email === '—' ? 'Codes made before sign-in' : p.email)}</div></div></div></td>
            <td class="num">${fmt.format(p.codes)}</td>
            <td><div class="bar-cell"><span class="b-track"><span class="b-fill" style="width:${p.scans ? Math.max(3, (p.scans / maxScans) * 100) : 0}%"></span></span><span class="num">${fmt.format(p.scans)}</span></div></td>
            <td class="num">${fmt.format(p.last7)}</td>
            <td class="num muted">${esc(p.last_seen ? relTime(p.last_seen) : '—')}</td>
          </tr>`).join('')}</tbody>
      </table>
    </section>
    <p class="muted foot">Click a person to see only their codes.</p>`;
  $('linkDetail').querySelectorAll('tr[data-email]').forEach((tr) => tr.onclick = () => {
    const p = people.find((x) => x.email === tr.dataset.email);
    searchText = p.email === '—' ? '' : p.email;
    $('linkSearch').value = searchText;
    ownerFilter = 'all';
    $('ownerFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.owner === 'all'));
    renderList();
  });
}

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------
async function openSettings() {
  if (!window.qrApi?.getSettings) { toast('Settings are available in the installed app'); return; }
  const s = await window.qrApi.getSettings();
  $('setUrl').value = s.serverUrl || '';
  $('setStatus').textContent = '';
  $('settingsModal').hidden = false;
}

async function testSettings() {
  $('setStatus').textContent = 'Testing…';
  const override = { serverUrl: $('setUrl').value.trim() };
  const res = await window.qrApi.api({ action: 'ping' }, override);
  $('setStatus').textContent = res.ok ? `✓ Connected as ${res.user?.email || 'you'} — scan tracking is ready.` : '✗ ' + (res.error || 'Could not connect');
}

function wireTracking() {
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => showView(b.dataset.view));
  $('btnRefresh').onclick = () => refreshLinks();
  $('btnTeam').onclick = () => (teamMode ? (teamMode = false, $('btnTeam').classList.remove('on'), refreshLinks()) : loadTeam());
  $('ownerFilter').querySelectorAll('button').forEach((b) => b.onclick = () => {
    ownerFilter = b.dataset.owner;
    $('ownerFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  });
  $('linkSearch').addEventListener('input', (e) => { searchText = e.target.value.trim(); renderList(); });
  $('btnSettings').onclick = openSettings;
  $('setCancel').onclick = () => { $('settingsModal').hidden = true; };
  $('setTest').onclick = testSettings;
  $('setSave').onclick = async () => {
    await window.qrApi.setSettings({ serverUrl: $('setUrl').value });
    $('settingsModal').hidden = true;
    toast('Settings saved');
    if (currentView === 'scans') refreshLinks();
  };
  $('settingsModal').onclick = (e) => { if (e.target.id === 'settingsModal') $('settingsModal').hidden = true; };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('settingsModal').hidden = true; });
  startAutoRefresh();
}

wireTracking();
