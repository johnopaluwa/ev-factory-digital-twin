// Control-room HUD: KPI strip, value stream, supply chain, orders, AI controller
// log, equipment health, forecasts / what-if lab, scenario injection, inspector.
import {
  LINES, STATIONS, STATION_LIST, ZONES, MATERIALS, MAT, EQUIP, VARIANTS, COLORS, REGIONS, COUNTERS, YARD_SLOTS,
  PLAN_JPH, SHIFT_SEC, TAKT, fmtClock, fmtDur,
} from './config.js';
import { STATE_LABEL, VIEWS } from './view.js';
import { SCENARIOS, SCENARIO } from './scenarios.js';
import { lineChart, spark, SERIES } from './charts.js';
import { PROCESS, currentOp } from './process.js';

const $ = id => document.getElementById(id);
const hex = n => '#' + n.toString(16).padStart(6, '0');
const MATC = { steel: 0xb9bec6, alu: 0x8f98a3, paint: 0x9085e9, cockpit: 0x596270, glass: 0x7ec8ff, wheels: 0x2a2e34, seats: 0x8a5a44, cells: 0x1fa37a, bms: 0x199e70, magnets: 0xc87533, sic: 0x2ec4d6 };
const CAT = { maintenance: ['🔧', 'Maintenance'], supply: ['📦', 'Supply'], flow: ['⏱', 'Flow'], quality: ['🎯', 'Quality'], logistics: ['🚚', 'Logistics'] };
const STATE_KEYS = ['proc', 'idle', 'blocked', 'nomat', 'micro', 'maint', 'down'];
const STATE_CSS = { proc: 'var(--good)', idle: 'var(--idle)', blocked: 'var(--warning)', nomat: 'var(--series-1)', micro: 'var(--serious)', maint: 'var(--maint)', down: 'var(--critical)' };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const vin = e => `AUR${VARIANTS[e.v].code}${String(e.id).padStart(6, '0')}`;

export class UI {
  constructor(app) {
    this.app = app; this.tab = { left: 'flow', right: 'brain' }; this.cache = {}; this.hold = false; this.tFast = 0; this.tSlow = 0; this.insKey = ''; this.insTab = 'process';
    this._kpis(); this._top(); this._events();
    this._tab('left', 'flow'); this._tab('right', 'brain'); this._legend();
    if (window.innerWidth < 1180) document.body.classList.add('left-off');
    if (window.innerWidth < 900) document.body.classList.add('right-off');
    const fitTop = () => document.documentElement.style.setProperty('--top', $('top').offsetHeight + 'px');
    fitTop(); window.addEventListener('resize', fitTop);
  }
  set(id, html) { const el = typeof id === 'string' ? $(id) : id; if (!el) return; const k = el.id; if (this.cache[k] === html) return; this.cache[k] = html; el.innerHTML = html; }

  // ---------------------------------------------------------------- chrome
  _top() {
    const app = this.app, vs = $('viewSel');
    vs.innerHTML = Object.entries(VIEWS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    vs.onchange = () => app.view.flyTo(vs.value);
    $('overlaySel').onchange = e => { app.view.overlay = e.target.value; this._legend(); };
    $('speed').onclick = e => { const b = e.target.closest('button'); if (!b) return; app.speed = +b.dataset.v; this._seg('speed', b.dataset.v); };
    $('mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; app.setMode(b.dataset.v); this._seg('mode', b.dataset.v); };
    $('tourBtn').onclick = e => { const v = app.view; v.tour = !v.tour; v.tourT = 0; e.currentTarget.classList.toggle('on', v.tour); };
    $('labelBtn').onclick = e => { const v = app.view; v.showLabels = v.showLabels === false; v.slow = 0; e.currentTarget.classList.toggle('on', v.showLabels !== false); };
    $('labelBtn').classList.add('on'); $('qualBtn').classList.add('on');
    $('qualBtn').onclick = e => { app.hd = !app.hd; app.view.setQuality(app.hd); e.currentTarget.classList.toggle('on', app.hd); };
    for (const b of document.querySelectorAll('.collapse')) b.onclick = () => { const cls = b.dataset.side + '-off'; document.body.classList.toggle(cls); const off = document.body.classList.contains(cls); b.textContent = b.dataset.side === 'left' ? (off ? '›' : '‹') : (off ? '‹' : '›'); };
    for (const nav of document.querySelectorAll('.tabs')) nav.onclick = e => { const b = e.target.closest('button'); if (b) this._tab(nav.dataset.for, b.dataset.tab); };
  }
  _seg(id, v) { for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(v)); }
  _kpis() {
    const tiles = [['out', 'Shift output'], ['jph', 'Throughput'], ['oee', 'OEE'], ['ftt', 'First time through'], ['wip', 'WIP · lead time'], ['otd', 'On-time delivery'], ['nrg', 'Energy'], ['cov', 'Tightest material']];
    $('kpis').innerHTML = tiles.map(([k, l]) => `<div class="kpi"><label>${l}</label><b id="k_${k}">–</b><div class="sub" id="ks_${k}"></div></div>`).join('');
  }
  _legend() {
    const ov = this.app.view.overlay;
    const scale = (title, grad, a, b) => `<b>${title}</b><div class="scale" style="background:${grad}"></div><div class="ends"><span>${a}</span><span>${b}</span></div>`;
    $('legend').innerHTML = ov === 'state'
      ? `<b>Station state (floor &amp; beacon)</b><div class="legendrow" style="margin:0">${STATE_KEYS.map(k => `<span><i style="background:${STATE_CSS[k]}"></i>${STATE_LABEL[k]}</span>`).join('')}</div>`
      : ov === 'health' ? scale('Estimated equipment health', 'linear-gradient(90deg,#d03b3b,#fab219,#0ca30c)', 'failing', 'healthy')
      : ov === 'util' ? scale('Utilisation · last 5 min', 'linear-gradient(90deg,#cde2fb,#184f95)', 'idle', 'fully loaded')
      : ov === 'quality' ? scale('Defects traced to station', 'linear-gradient(90deg,#0ca30c,#d03b3b)', '0%', '12%+')
      : scale('Electrical power draw', 'linear-gradient(90deg,#f6d9c2,#d95926)', '10 kW', '430 kW');
  }
  _events() {
    const app = this.app;
    document.addEventListener('pointerdown', e => { if (e.target.closest('.panel')) this.hold = true; });
    document.addEventListener('pointerup', () => { setTimeout(() => { this.hold = false; }, 60); });
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      const [act, a, b] = el.dataset.act.split(':');
      if (act === 'st') app.view.select({ type: 'station', id: a }, true);
      else if (act === 'view') { app.view.flyTo(a); $('viewSel').value = a; }
      else if (act === 'approve') app.brain.approve(+a);
      else if (act === 'dismiss') app.brain.dismiss(+a);
      else if (act === 'inject') app.inject(a);
      else if (act === 'maint') { const wo = app.sim.requestMaint(a, b); app.toast(wo ? `Work order WO-${wo} raised for ${a}` : `${a} is already being worked on`, wo ? '' : 's2'); }
      else if (act === 'fail') { const st = app.sim.s.st[a]; st.h = st.failAt - 0.01; }
      else if (act === 'close') app.view.select(null);
      else if (act === 'focus') { const p = app.view.selectedPos(); if (p) app.view.focus(p.x, p.z, a ? +a : 30); }
      else if (act === 'follow') { app.view.follow = !app.view.follow; }
      else if (act === 'instab') this.insTab = a;
      else if (act === 'watch') { app.speed = 3; this._seg('speed', 3); const p = app.view.selectedPos(); if (p) app.view.focus(p.x, p.z, 15); }
      else if (act === 'whatif') app.runWhatIf($('wiScen').value, +$('wiHor').value);
      this.cache = {}; this.tSlow = 0;
      e.stopPropagation();
    });
  }
  toast(msg, cls = '', sub = '') {
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.innerHTML = esc(msg) + (sub ? `<small>${esc(sub)}</small>` : '');
    const box = $('toasts'); box.prepend(d); while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => d.remove(), 6500);
  }
  tooltip(sel, x, y) {
    const t = $('tooltip'); if (!sel) { t.style.display = 'none'; return; }
    const s = this.app.sim.s; let h = '';
    if (sel.type === 'station') { const d = STATIONS[sel.id]; h = `<b>${d.id}</b> ${esc(d.name)}<small>${STATE_LABEL[s.st[d.id].state]}</small>`; }
    else if (sel.type === 'car') { const e = s.ents[sel.id]; if (e) h = `<b>${vin(e)}</b><small>${VARIANTS[e.v].name} · ${COLORS[e.c].name}</small>`; }
    else if (sel.type === 'agv') { const a = s.agvs[sel.id - 1]; h = `<b>AGV ${a.id}</b><small>${a.down ? 'offline' : a.load ? 'carrying ' + MAT[a.mat].name : a.m === 0 ? 'idle' : 'en route'}</small>`; }
    if (!h) { t.style.display = 'none'; return; }
    t.innerHTML = h; t.style.display = 'block'; t.style.left = x + 14 + 'px'; t.style.top = y + 14 + 'px';
  }

  // ------------------------------------------------------------------ tabs
  _tab(side, tab) {
    this.tab[side] = tab;
    for (const b of document.querySelector(`.tabs[data-for="${side}"]`).children) b.classList.toggle('on', b.dataset.tab === tab);
    const body = $(side + 'Body'); this.cache = {};
    const S = SERIES();
    const sk = {
      flow: () => `<div id="vs"></div><div class="legendrow">${STATE_KEYS.map(k => `<span><i style="background:${STATE_CSS[k]}"></i>${STATE_LABEL[k]}</span>`).join('')}</div>
        <h3>Throughput <span>vehicles / hour, 30-min rolling</span></h3>
        <div class="clegend"><span><i style="background:${S[0]}"></i>Actual</span><span><i class="dash"></i>Plan ${PLAN_JPH}/h</span></div>
        <div class="chart"><canvas id="chJph"></canvas><div class="tip"></div></div>
        <h3>Event log</h3><div class="events" id="evlog"></div>`,
      supply: () => `<h3>Material coverage <span>vehicle sets</span></h3><div id="matTable"></div><h3>Purchase orders</h3><div id="poTable"></div><h3>AGV fleet</h3><div id="agvBox"></div>`,
      orders: () => `<div id="ordStats"></div><h3>Outbound carriers</h3><div id="carTable"></div><h3>Next in build sequence</h3><div id="seqBox"></div><h3>Latest vehicles off the line</h3><div id="recent"></div>`,
      brain: () => `<p class="modehint" id="modeHint"></p><div class="loop" id="loop"></div><div id="pendingBox"></div><h3>Decision log <span id="decCount"></span></h3><div id="decLog"></div>`,
      assets: () => `<div id="assetSum"></div><div id="assetList"></div>`,
      predict: () => `<h3>End-of-shift forecast <span id="fcMeta"></span></h3><div class="hero" id="fcHero">…</div>
        <div class="clegend"><span><i style="background:${S[0]}"></i>Actual</span><span><i style="background:${S[2]}"></i>Forecast (mean, band = range of runs)</span><span><i class="dash"></i>Plan</span></div>
        <div class="chart"><canvas id="chFc"></canvas><div class="tip"></div></div>
        <h3>Predicted risks <span>from live perception</span></h3><div id="riskList"></div>
        <h3>What-if lab <span>forks the live plant state</span></h3>
        <div class="card"><div class="row" style="flex-wrap:wrap"><select id="wiScen" style="flex:1;min-width:150px">${SCENARIOS.map(s => `<option value="${s.id}">${s.name} — ${s.where}</option>`).join('')}</select>
          <select id="wiHor"><option value="2">2 h ahead</option><option value="4" selected>4 h ahead</option><option value="8">8 h ahead</option></select><button class="btn" data-act="whatif">Simulate</button></div><div id="wiOut"></div></div>`,
      scen: () => `<p class="modehint">Inject a disruption into the live plant and watch how it propagates — and how the controller responds in the selected authority mode.</p>
        ${SCENARIOS.map(s => `<div class="card scen"><div class="ico">${s.icon}</div><div><b>${s.name} <span>· ${s.where}</span></b><small>${s.desc}</small></div><button class="btn small warn" data-act="inject:${s.id}">Inject</button></div>`).join('')}
        <h3>Active disruptions</h3><div id="activeBox"></div>`,
    };
    body.innerHTML = sk[tab](); body.scrollTop = 0;
    this.tSlow = 0;
  }

  // ---------------------------------------------------------------- update
  update(now) {
    const app = this.app, sim = app.sim, s = sim.s, k = s.kpi;
    if (now - this.tFast > 120) {
      this.tFast = now;
      $('clock').textContent = fmtClock(s.t);
      const el = sim.shiftElapsed();
      $('shift').textContent = `Shift ${((s.shiftNo - 1) % 3) + 1} · ${Math.floor(el / 3600)}:${String(Math.floor(el % 3600 / 60)).padStart(2, '0')} of 8:00`;
      const plan = sim.planNow(), gap = k.shiftMade - plan, jph = sim.jph(1800), o = app.oee();
      $('k_out').innerHTML = `${k.shiftMade}<small>/ ${Math.round(plan)} plan</small>`;
      $('ks_out').innerHTML = `<span class="delta ${gap >= 0 ? 'up' : 'down'}">${gap >= 0 ? '▲' : '▼'} ${Math.abs(gap).toFixed(0)}</span> ${app.forecast ? `· forecast ${Math.round(app.forecast.eos)}` : ''}`;
      $('k_jph').innerHTML = `${jph.toFixed(0)}<small>/h</small>`; $('ks_jph').textContent = `plan ${PLAN_JPH}/h · rate ${(s.rate * 100).toFixed(0)}%`;
      $('k_oee').innerHTML = `${(o.oee * 100).toFixed(0)}<small>%</small>`; $('ks_oee').textContent = `A ${(o.a * 100).toFixed(0)} · P ${(o.p * 100).toFixed(0)} · Q ${(o.q * 100).toFixed(0)}`;
      $('k_ftt').innerHTML = `${(o.q * 100).toFixed(1)}<small>%</small>`; $('ks_ftt').textContent = `${k.rework} reworked · ${k.scrap} scrapped`;
      $('k_wip').innerHTML = `${sim.wip()}<small>units</small>`; $('ks_wip').textContent = k.leadN ? `lead time ${(k.leadSum / k.leadN / 60).toFixed(0)} min` : 'lead time –';
      $('k_otd').innerHTML = k.delivered ? `${(k.onTime / k.delivered * 100).toFixed(0)}<small>%</small>` : '–'; $('ks_otd').textContent = `${k.delivered} delivered · ${sim.yardCount()} in yard`;
      $('k_nrg').innerHTML = `${(k.power / 1000).toFixed(1)}<small>MW</small>`; $('ks_nrg').textContent = k.made ? `${(k.energy / k.made).toFixed(0)} kWh / vehicle` : '';
      let worst = null; for (const m of MATERIALS) { const x = app.brain.mats[m.id]; if (x && (!worst || x.cover < worst.x.cover)) worst = { m, x }; }
      if (worst) { $('k_cov').innerHTML = `${worst.x.cover.toFixed(1)}<small>h cover</small>`; $('ks_cov').innerHTML = `${esc(worst.m.name)}${worst.x.risk ? ' <span class="delta down">▲ at risk</span>' : ''}`; }
    }
    if (now - this.tSlow < 450 || this.hold) return;
    this.tSlow = now;
    this['_' + this.tab.left](); this['_' + this.tab.right](); this._inspector();
  }

  // ------------------------------------------------------------ left: flow
  _flow() {
    const app = this.app, sim = app.sim, s = sim.s;
    const wip = {};
    for (const id in s.ents) { const e = s.ents[id], n = LINES[e.L].nodes; let i = e.i; while (i > 0 && n[i].buf) i--; const z = n[i].zone || n[0].zone; wip[z] = (wip[z] || 0) + 1; }
    const dots = zone => STATION_LIST.filter(d => d.zone === zone).map(d => `<i class="dot ${s.st[d.id].state}" data-act="st:${d.id}" title="${d.id} ${esc(d.name)} — ${STATE_LABEL[s.st[d.id].state]}"></i>`).join('');
    const stage = (key, view, meta, extra = '') => `<div class="stage" data-act="view:${view}"><i class="bar" style="background:${ZONES[key].color}"></i><b>${ZONES[key].name}</b><span class="meta num">${meta}</span>${extra ? `<div class="dots">${extra}</div>` : ''}</div>`;
    const arrow = '<div class="arrow">▼</div>';
    const inTr = s.pos.filter(p => p.st === 0).length, atDock = s.pos.filter(p => p.st === 1).length;
    let transit = 0; for (const c of s.carriers) if (c.m === 3) transit += c.cars.length;
    const buf = (c) => `<span class="buf">${COUNTERS[c].name} ${s.cnt[c]}/${COUNTERS[c].cap}</span>`;
    this.set('vs',
      stage('inbound', 'inbound', `${inTr} POs in transit · ${atDock} at dock`) + arrow +
      stage('stamping', 'stamping', `${wip.stamping || 0} in process`, dots('stamping') + buf('panels')) + arrow +
      stage('body', 'body', `${wip.body || 0} bodies`, dots('body')) + arrow +
      stage('paint', 'paint', `${wip.paint || 0} bodies`, dots('paint')) + arrow +
      stage('battery', 'battery', `${wip.battery || 0} packs`, dots('battery') + buf('packs')) +
      stage('drive', 'battery', `${wip.drive || 0} units`, dots('drive') + buf('dus')) + arrow +
      stage('ga', 'ga', `${wip.ga || 0} vehicles`, dots('ga')) + arrow +
      stage('eol', 'eol', `${wip.eol || 0} vehicles`, dots('eol')) + arrow +
      stage('yard', 'yard', `${sim.yardCount()}/${YARD_SLOTS} parked · ${transit} in transit · ${s.kpi.delivered} delivered`));
    const cv = $('chJph');
    if (cv) {
      const h = app.hist, S = SERIES();
      const pts = h.map(p => [p.t, p.jph]);
      const x0 = h.length ? h[0].t : 0, x1 = Math.max(x0 + 1800, h.length ? h[h.length - 1].t : 1);
      lineChart(cv, { h: 110, xMin: x0, xMax: x1, yMin: 0, yMax: 70, xFmt: fmtClock, yFmt: v => v.toFixed(0), hover: cv._cfg ? cv._cfg.hover : null,
        series: [{ name: 'Plan', color: getComputedStyle(document.documentElement).getPropertyValue('--muted'), pts: [[x0, PLAN_JPH], [x1, PLAN_JPH]], dash: [4, 3], muted: true }, { name: 'Actual', color: S[0], pts }] });
    }
    this.set('evlog', app.events.slice(0, 14).map(e => `<div><time>${fmtClock(e.t)}</time><span class="${e.ai ? 'ai' : 's' + e.sev}">${esc(e.msg)}</span></div>`).join('') || '<div class="muted">No events yet</div>');
  }

  // ---------------------------------------------------------- left: supply
  _supply() {
    const app = this.app, sim = app.sim, s = sim.s;
    const rows = MATERIALS.map(m => {
      const x = app.brain.mats[m.id] || { cover: 0, eta: Infinity, onHand: s.inv[m.id] };
      const exp = s.pos.some(p => p.mat === m.id && p.exp && p.st < 2);
      const cls = x.risk ? (exp ? 'warning' : 'critical') : x.cover < m.lead * 0.5 ? 'warning' : 'good';
      const lab = x.risk ? (exp ? 'Expedited' : 'At risk') : cls === 'warning' ? 'Low' : 'OK';
      return `<tr><td><i class="sw" style="background:${hex(MATC[m.id])}"></i>${esc(m.name)}<br><small class="muted">${esc(m.supplier)}${s.leadMul[m.id] > 1 ? ' · lead ×' + s.leadMul[m.id].toFixed(1) : ''}</small></td>
        <td class="r num">${Math.round(x.onHand)}</td><td><div class="meter"><i style="width:${Math.min(100, x.cover / 6 * 100)}%;background:var(--${cls === 'good' ? 'series-1' : cls})"></i></div><small class="num">${x.cover.toFixed(1)} h</small></td>
        <td class="num">${x.eta === Infinity ? '—' : fmtClock(x.eta)}</td><td><span class="chip ${cls}"><i></i>${lab}</span></td></tr>`;
    }).join('');
    this.set('matTable', `<table><tr><th>Material</th><th class="r">On hand</th><th>Cover</th><th>Next ETA</th><th>Status</th></tr>${rows}</table>`);
    const pos = [...s.pos].sort((a, b) => a.eta - b.eta).slice(0, 12).map(p => {
      const late = p.eta > p.plan + 1200 && !p.exp;
      const st = p.st === 2 ? ['good', 'Received'] : p.st === 1 ? ['info', 'Unloading · dock ' + (p.dock + 1)] : p.exp ? ['warning', 'Express'] : late ? ['serious', 'Late'] : ['info', 'In transit'];
      return `<tr><td class="num">PO-${p.id}</td><td>${esc(MAT[p.mat].name)}</td><td class="r num">${p.qty}</td><td class="num">${fmtClock(p.eta)}</td><td><span class="chip ${st[0]}"><i></i>${st[1]}</span></td></tr>`;
    }).join('');
    this.set('poTable', pos ? `<table><tr><th>PO</th><th>Material</th><th class="r">Sets</th><th>ETA</th><th>Status</th></tr>${pos}</table>` : '<div class="muted">No open purchase orders</div>');
    const AM = ['Idle', 'To pick-up', 'Loading', 'Delivering', 'Unloading', 'Returning'];
    const k = s.kpi, util = k.agvTime ? k.agvBusy / k.agvTime : 0;
    this.set('agvBox', `<div class="row" style="margin-bottom:6px"><span>Utilisation <b>${(util * 100).toFixed(0)}%</b></span><span class="muted">· ${s.tasks.filter(t => !t.agv).length} tasks waiting · ${s.pol.agvPriority ? 'criticality dispatch, tote ' + s.tote : 'FIFO dispatch, tote ' + s.tote}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${s.agvs.map(a => { const tk = a.task ? s.tasks.find(t => t.id === a.task) : null; return `<span class="chip ${a.down ? 'critical' : a.m === 0 ? '' : 'good'}"><i></i>A${a.id} ${a.down ? 'Offline' : a.m === 0 && a.parked ? 'Charging' : AM[a.m]}${tk && a.m > 0 && a.m < 5 ? ' → ' + tk.st : ''}</span>`; }).join('')}</div>`);
  }

  // ---------------------------------------------------------- left: orders
  _orders() {
    const sim = this.app.sim, s = sim.s, k = s.kpi;
    let transit = 0; for (const c of s.carriers) if (c.m === 3) transit += c.cars.length;
    const stat = (l, v, sub = '') => `<div class="stat"><label>${l}</label><b class="num">${v}</b> <small>${sub}</small></div>`;
    this.set('ordStats', `<div class="igrid" style="grid-template-columns:repeat(3,1fr)">${stat('Order backlog', s.queue.length, 'queued')}${stat('In production', sim.wip())}${stat('Yard', sim.yardCount(), '/ ' + YARD_SLOTS)}${stat('In transit', transit)}${stat('Delivered', k.delivered)}${stat('On time', k.delivered ? (k.onTime / k.delivered * 100).toFixed(0) + '%' : '–')}</div>
      <p class="muted" style="margin:8px 0 0">Demand ${(PLAN_JPH * s.demandMul).toFixed(0)} orders/h · sequencing ${s.pol.colorBatch ? 'colour-batched' : 'first-in-first-out'} · ${k.purges} paint colour changes · dispatch ${s.pol.smartDispatch ? 'due-date aware' : 'full loads only'}</p>`);
    const CM = ['Standing by', 'Arriving', 'Loading', 'In transit', 'Returning'];
    this.set('carTable', `<table><tr><th>Carrier</th><th>Status</th><th>Destination</th><th class="r">Load</th></tr>${s.carriers.map(c => `<tr><td>C${c.id}</td><td><span class="chip ${c.m === 2 ? 'warning' : c.m === 3 ? 'good' : ''}"><i></i>${CM[c.m]}${c.m >= 3 ? ' · ' + fmtDur(c.t) : ''}</span></td><td>${c.m === 0 ? '—' : REGIONS[c.r].name}</td><td class="r num">${c.m === 1 || c.m === 2 || c.m === 3 ? c.cars.length + '/8' : '—'}</td></tr>`).join('')}</table>${s.t < s.carrierBlockUntil ? `<p><span class="chip critical"><i></i>Carrier strike until ${fmtClock(s.carrierBlockUntil)}</span></p>` : ''}`);
    this.set('seqBox', `<div style="display:flex;flex-wrap:wrap;gap:4px">${s.queue.slice(0, 14).map(id => { const o = s.orders[id]; return `<span class="chip" title="Order ${id} · ${COLORS[o.c].name} · due ${fmtClock(o.due)}"><i class="sw" style="background:${hex(COLORS[o.c].hex)};margin:0;border-radius:50%"></i>${VARIANTS[o.v].code}</span>`; }).join('')}</div>`);
    this.set('recent', `<table><tr><th>VIN</th><th>Model</th><th>Lead</th><th>Quality</th></tr>${s.recent.map(r => `<tr><td class="num"><i class="sw" style="background:${hex(COLORS[r.c].hex)}"></i>${vin(r)}</td><td>${VARIANTS[r.v].code}</td><td class="num">${(r.lead / 60).toFixed(0)} min</td><td><span class="chip ${r.ftt ? 'good' : 'warning'}"><i></i>${r.ftt ? 'First time' : 'Reworked'}</span></td></tr>`).join('')}</table>`);
  }

  // ------------------------------------------------------- right: AI brain
  _decHtml(e, pend) {
    const c = CAT[e.cat] || ['•', e.cat];
    return `<div class="dec ${e.status}"><header><b>${c[0]} ${esc(e.title)}</b><time>${fmtClock(e.t)}</time></header>
      <p><em>Perceive</em><span>${esc(e.perceive)}</span></p><p><em>Decide</em><span>${esc(e.decide)}</span></p>${e.execute ? `<p><em>Execute</em><span>${esc(e.execute)}</span></p>` : ''}
      <div class="foot"><span>${e.impact ? `<span class="chip good"><i></i>${esc(e.impact)}</span>` : ''} ${e.status !== 'executed' && !pend ? `<span class="chip"><i></i>${e.status}</span>` : ''}</span>
      <span>${e.ref && STATIONS[e.ref] ? `<button class="btn small ghost" data-act="st:${e.ref}">Show</button> ` : ''}${pend ? `<button class="btn small ghost" data-act="dismiss:${e.id}">Dismiss</button> <button class="btn small" data-act="approve:${e.id}">Approve</button>` : ''}</span></div></div>`;
  }
  _brain() {
    const app = this.app, b = app.brain, s = app.sim.s;
    const hint = { off: 'Manual: the twin still perceives and predicts, but takes no action. Only baseline MRP re-ordering and breakdown repair run.', advisory: 'Advisory: the controller recommends actions with its reasoning; nothing is executed until you approve it.', auto: 'Autonomous: the controller perceives, decides and executes on its own, and logs why.' };
    this.set('modeHint', hint[b.mode]);
    const watch = b.risks().filter(r => r.diag).length;
    this.set('loop', `<div class="step"><b>Perceive</b><span class="num">${STATION_LIST.length * 4 + s.agvs.length * 3 + MATERIALS.length * 2}</span><small>live signals · ${watch} assets flagged</small></div><div class="gt">›</div>
      <div class="step"><b>Decide</b><span class="num">${b.mode === 'off' ? '–' : b.value.decisions + b.pending.length}</span><small>${b.mode === 'advisory' ? b.pending.length + ' awaiting approval' : 'decisions this run'}</small></div><div class="gt">›</div>
      <div class="step"><b>Execute</b><span class="num">${b.value.units.toFixed(0)}</span><small>units protected · ${b.value.downAvoided.toFixed(0)} min downtime avoided</small></div>`);
    this.set('pendingBox', b.pending.length ? `<h3>Awaiting your approval</h3>` + b.pending.map(p => this._decHtml(p.entry, true)).join('') : '');
    const log = b.log.filter(e => e.status !== 'pending').slice(0, 30);
    this.set('decCount', `${b.log.length} entries`);
    this.set('decLog', log.map(e => this._decHtml(e, false)).join('') || `<div class="muted">${b.mode === 'off' ? 'Controller is in manual mode — no decisions are being made.' : 'Nothing needs attention yet. Inject a scenario to see the loop respond.'}</div>`);
  }

  // ------------------------------------------------------ right: equipment
  _assets() {
    const app = this.app, s = app.sim.s, risks = app.brain.risks();
    const crit = risks.filter(r => r.health < 0.35).length, wat = risks.filter(r => r.health >= 0.35 && r.health < 0.6).length;
    const jobs = STATION_LIST.filter(d => s.st[d.id].down && s.st[d.id].down.kind !== 'micro');
    this.set('assetSum', `<div class="igrid" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px"><div class="stat"><label>Healthy</label><b>${risks.length - crit - wat}</b></div><div class="stat"><label>Watch</label><b>${wat}</b></div><div class="stat"><label>Critical</label><b>${crit}</b></div><div class="stat"><label>Crews free</label><b>${s.crewFree}/3</b></div></div>
      ${jobs.map(d => { const dn = s.st[d.id].down; return `<div class="card click" data-act="st:${d.id}"><span class="chip ${dn.kind === 'fail' ? 'critical' : 'maint'}"><i></i>${dn.kind === 'fail' ? 'Breakdown repair' : dn.kind === 'pm' ? 'Planned maintenance' : 'Recalibration'}</span> <b>${d.id}</b> · WO-${dn.wo} · ${dn.crew ? fmtDur(dn.rem) + ' remaining' : 'waiting for a crew'}</div>`; }).join('')}
      <h3>Assets by estimated health <span>from sensor signatures</span></h3>`);
    this.set('assetList', risks.map(r => {
      const cls = r.health < 0.35 ? 'h-crit' : r.health < 0.6 ? 'h-warn' : 'h-good';
      return `<div class="asset" data-act="st:${r.id}"><b>${r.id}</b><div>${esc(r.name)}<small>${r.diag ? esc(r.diag.fault) + ' · ' + (r.diag.conf * 100).toFixed(0) + '% match' : 'No anomaly detected'}</small><div class="meter"><i class="${cls}" style="width:${Math.max(3, r.health * 100)}%"></i></div></div><div class="num" style="text-align:right">${(r.health * 100).toFixed(0)}%<small>${isFinite(r.rul) && r.diag ? 'RUL ' + fmtDur(r.rul) : ' '}</small></div></div>`;
    }).join(''));
  }

  // -------------------------------------------------------- right: predict
  _predict() {
    const app = this.app, sim = app.sim, s = sim.s, fc = app.forecast, S = SERIES();
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted');
    const t0 = s.shiftStart, t1 = s.shiftStart + SHIFT_SEC, planEnd = PLAN_JPH * SHIFT_SEC / 3600;
    if (fc && fc.shiftNo === s.shiftNo) {
      const d = fc.eos - planEnd;
      this.set('fcHero', `${Math.round(fc.eos)}<small>vehicles by ${fmtClock(t1)} · range ${Math.round(fc.made0 + fc.r.madeLo)}–${Math.round(fc.made0 + fc.r.madeHi)} · <span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)} vs plan</span></small>`);
      this.set('fcMeta', `${fc.r.runs} runs · ${fc.r.ai ? 'with' : 'without'} AI · ${Math.round((performance.now() - fc.at) / 1000)} s ago`);
    } else this.set('fcMeta', app.fc.busy ? 'simulating…' : '');
    const cv = $('chFc');
    if (cv) {
      const act = app.hist.filter(p => p.shift === s.shiftNo).map(p => [p.t, p.made]); act.push([s.t, s.kpi.shiftMade]);
      const series = [{ name: 'Plan', color: muted, pts: [[t0, 0], [t1, planEnd]], dash: [4, 3], muted: true }];
      if (fc && fc.shiftNo === s.shiftNo) series.push({ name: 'Forecast', color: S[2], pts: fc.r.times.map((t, i) => [t, fc.made0 + fc.r.mean[i]]), band: { lo: fc.r.lo.map(v => fc.made0 + v), hi: fc.r.hi.map(v => fc.made0 + v) }, dash: [5, 3], noDot: true });
      series.push({ name: 'Actual', color: S[0], pts: act });
      lineChart(cv, { h: 130, xMin: t0, xMax: t1, yMin: 0, xFmt: fmtClock, hover: cv._cfg ? cv._cfg.hover : null, series });
    }
    // risk radar
    const items = [];
    for (const r of app.brain.risks()) if (r.diag && r.health < 0.6 && r.state !== 'down' && r.state !== 'maint') items.push({ sev: r.health < 0.35 ? 'critical' : 'warning', key: isFinite(r.rul) ? r.rul : 9e9, html: `<div class="card click" data-act="st:${r.id}"><span class="chip ${r.health < 0.35 ? 'critical' : 'warning'}"><i></i>${isFinite(r.rul) ? 'Failure in ≈ ' + fmtDur(r.rul) : 'Degrading'}</span> <b>${r.id}</b> ${esc(r.diag.fault)} <span class="muted">· health ${(r.health * 100).toFixed(0)}%</span></div>` });
    for (const m of MATERIALS) { const x = app.brain.mats[m.id]; if (x && x.risk) items.push({ key: x.outAt - s.t, html: `<div class="card"><span class="chip critical"><i></i>Stock-out ${fmtClock(x.outAt)}</span> <b>${esc(m.name)}</b> <span class="muted">· next delivery ${x.eta === Infinity ? 'not scheduled' : fmtClock(x.eta)}</span></div>` }); }
    const yf = sim.yardCount() / YARD_SLOTS; if (yf > 0.7) items.push({ key: 0, html: `<div class="card click" data-act="view:yard"><span class="chip warning"><i></i>Yard ${(yf * 100).toFixed(0)}% full</span> exit of the line may block</div>` });
    if (fc && fc.r.failures >= 0.5) items.push({ key: 5e8, html: `<div class="card"><span class="chip warning"><i></i>${fc.r.failures.toFixed(1)} breakdowns expected</span> <span class="muted">by end of shift (${fc.r.downMin.toFixed(0)} station-min down)</span></div>` });
    items.sort((a, b) => a.key - b.key);
    this.set('riskList', items.map(i => i.html).join('') || '<div class="muted">No failures, stock-outs or blockages predicted in the current horizon.</div>');
    this._whatif();
  }
  _whatif() {
    const app = this.app, w = app.whatif, out = $('wiOut'); if (!out) return;
    if (!w) { this.set(out, '<p class="muted" style="margin:8px 0 0">Pick a disruption and the twin runs three futures from this exact moment: no disruption, disruption without AI response, and disruption with the autonomous controller.</p>'); return; }
    const S = SERIES(), sc = SCENARIO[w.sc], done = Object.keys(w.res).length;
    if (done < 3) {
      const key = 'wi-prog';
      if (this.cache[out.id] !== key) { this.cache[out.id] = key; out.innerHTML = `<p style="margin:8px 0 2px">Simulating “${sc.name}” ${w.h} h ahead… <span id="wiPct" class="num"></span></p><div class="progress"><i id="wiBar"></i></div>`; }
      const pct = (done + (app.fc.cur && app.fc.cur.tag === 'whatif' ? app.fc.progress : 0)) / 3;
      const bar = $('wiBar'); if (bar) { bar.style.width = (pct * 100).toFixed(0) + '%'; $('wiPct').textContent = (pct * 100).toFixed(0) + '%'; }
      return;
    }
    const key = 'wi-res-' + w.id;
    if (this.cache[out.id] !== key) {
      this.cache[out.id] = key;
      const { base, noai, ai } = w.res, loss = base.made - noai.made, rec = loss > 0.5 ? Math.max(0, Math.min(1.5, (ai.made - noai.made) / loss)) : null;
      const row = (l, f, cls = '') => `<tr><td>${l}</td><td class="r num">${f(base)}</td><td class="r num">${f(noai)}</td><td class="r num ${cls}">${f(ai)}</td></tr>`;
      const verdict = loss <= 0.5 ? `This disruption costs no measurable output over ${w.h} h — the plant's buffers absorb it. The controller still acts on cost and risk.`
        : `Without intervention the plant loses <b>${loss.toFixed(0)} vehicles</b> over ${w.h} h. The autonomous response ${ai.made >= base.made - 0.5 ? 'recovers the whole loss' : `recovers <b>${(rec * 100).toFixed(0)}%</b> of it`}${ai.made > base.made + 1 ? ` and ends ${(ai.made - base.made).toFixed(0)} ahead of the undisturbed baseline` : ''}${ai.cost > noai.cost + 5000 ? `, for about $${((ai.cost - noai.cost) / 1000).toFixed(0)}k of extra response cost` : ''}.`;
      out.innerHTML = `<p style="margin:8px 0 4px"><b>${sc.icon} ${sc.name}</b> <span class="muted">· ${sc.where} · from ${fmtClock(w.t0)} · ${base.runs} runs each</span></p>
        <div class="clegend"><span><i style="background:${S[0]}"></i>No disruption</span><span><i style="background:${S[1]}"></i>Disruption, no AI</span><span><i style="background:${S[2]}"></i>Disruption, AI response</span></div>
        <div class="chart"><canvas id="chWi"></canvas><div class="tip"></div></div>
        <table><tr><th></th><th class="r">Baseline</th><th class="r">No AI</th><th class="r">With AI</th></tr>
        ${row('Vehicles built', r => r.made.toFixed(0))}${row('Breakdowns', r => r.failures.toFixed(1))}${row('Station downtime', r => r.downMin.toFixed(0) + ' min')}${row('Material starvation', r => r.shortMin.toFixed(0) + ' min')}${row('Exit blocked', r => r.yardBlockMin.toFixed(0) + ' min')}${row('Reworked units', r => r.rework.toFixed(0))}${row('Delivered on time', r => r.delivered ? (r.onTime / r.delivered * 100).toFixed(0) + '%' : '–')}${row('Response cost (maint., express freight, energy)', r => '$' + (r.cost / 1000).toFixed(0) + 'k')}</table>
        <p style="margin:8px 0 0">${verdict}</p><div class="actions"><button class="btn small warn" data-act="inject:${sc.id}">Inject into the live plant</button></div>`;
      const mk = (r, name, color) => ({ name, color, pts: r.times.map((t, i) => [t, r.mean[i]]), band: { lo: r.lo, hi: r.hi }, noDot: true });
      lineChart($('chWi'), { h: 130, yMin: 0, xFmt: fmtClock, series: [mk(base, 'No disruption', S[0]), mk(noai, 'No AI', S[1]), mk(ai, 'AI response', S[2])] });
    }
  }

  // ------------------------------------------------------ right: scenarios
  _scen() {
    const s = this.app.sim.s, a = [];
    for (const m of MATERIALS) if (s.leadMul[m.id] > 1) a.push(`Supplier disruption · ${m.name} lead time ×${s.leadMul[m.id].toFixed(1)} until ${fmtClock(s.leadUntil[m.id])}`);
    if (s.priceMul > 1) a.push(`Energy price ×${s.priceMul} until ${fmtClock(s.priceUntil)}`);
    if (s.t < s.carrierBlockUntil) a.push(`Carrier strike until ${fmtClock(s.carrierBlockUntil)}`);
    const dn = s.agvs.filter(x => x.down).length; if (dn) a.push(`${dn} AGVs offline`);
    if (s.demandMul > 1) a.push(`Demand +${((s.demandMul - 1) * 100).toFixed(0)}% until ${fmtClock(s.demandUntil)}`);
    for (const d of STATION_LIST) { const st = s.st[d.id]; if (st.down && st.down.kind === 'fail') a.push(`${d.id} breakdown — ${st.down.crew ? fmtDur(st.down.rem) + ' to repair' : 'waiting for crew'}`); if (st.drift > 0.5) a.push(`${d.id} process drift (quality)`); }
    this.set('activeBox', a.map(x => `<div class="card"><span class="chip critical"><i></i>Active</span> ${esc(x)}</div>`).join('') || '<div class="muted">Plant is running undisturbed.</div>');
  }

  // -------------------------------------------------------------- inspector
  _inspector() {
    const app = this.app, sel = app.view.selected, box = $('inspector'), s = app.sim.s;
    if (!sel) { box.classList.add('hidden'); $('help').classList.remove('hidden'); this.insKey = ''; return; }
    box.classList.remove('hidden'); $('help').classList.add('hidden');
    let html = '';
    if (sel.type === 'station') {
      const d = STATIONS[sel.id], st = s.st[d.id], eq = EQUIP[d.eq], e = app.brain.est[d.id], diag = app.brain.diagnosis(d.id), f = app.brain.flow[d.id] || {};
      const share = STATE_KEYS.map(k => `<i style="flex:${Math.max(0, f[k] || 0).toFixed(3)};background:${STATE_CSS[k]}" title="${STATE_LABEL[k]} ${((f[k] || 0) * 100).toFixed(0)}%"></i>`).join('');
      const hcls = e.health < 0.35 ? 'critical' : e.health < 0.6 ? 'warning' : 'good';
      const dn = st.down && st.down.kind !== 'micro' ? st.down : null;
      const ops = PROCESS[d.id] || [], eS = s.occ[d.line][d.idx] ? s.ents[s.occ[d.line][d.idx]] : null, inProc = !!eS && eS.m === 2;
      const pS = inProc ? Math.max(0, Math.min(1, 1 - eS.t / eS.d)) : 0, cur = inProc ? currentOp(d.id, pS) : -1;
      const procHtml = ops.length ? `<h3 style="margin-top:10px">Process steps <span>${inProc ? 'cycle ' + (Math.round(pS * 20) * 5) + '% · step ' + (cur + 1) + ' of ' + ops.length : 'waiting for the next unit'}</span></h3>
        <div class="progress"><i style="width:${inProc ? Math.round(pS * 20) * 5 : 0}%"></i></div>
        <table class="ops"><tr><th>#</th><th>Operation</th><th>Components</th><th>How it is joined / specification</th><th>Equipment</th></tr>${ops.map((o, i) => `<tr class="${i === cur ? 'cur' : inProc && pS >= o.t[1] ? 'done' : ''}"><td class="num">${i + 1}</td><td><b>${esc(o.n)}</b></td><td>${(o.parts || []).map(p => `${esc(p[1])} <span class="muted">${p[0]} × ${p[2]}</span>`).join('<br>') || '<span class="muted">—</span>'}</td><td>${esc(o.how)}</td><td class="muted">${esc(o.tool)}</td></tr>`).join('')}</table>` : '';
      html = `<header><b>${d.id} · ${esc(d.name)}</b><span class="chip" style="border-color:${ZONES[d.zone].color}">${ZONES[d.zone].short}</span><span class="chip ${st.state === 'down' ? 'critical' : st.state === 'proc' ? 'good' : 'warning'}"><i style="background:${STATE_CSS[st.state]}"></i>${STATE_LABEL[st.state]}${st.state === 'nomat' && st.miss ? ' · ' + (MAT[st.miss] ? MAT[st.miss].name : COUNTERS[st.miss].name) : ''}</span><span class="seg mini"><button data-act="instab:process" class="${this.insTab === 'process' ? 'on' : ''}">Process</button><button data-act="instab:cond" class="${this.insTab === 'cond' ? 'on' : ''}">Condition</button></span><button class="x" data-act="close">×</button></header>
        ${this.insTab === 'process' ? procHtml || '<p class="muted">No process defined.</p>' : `<div class="igrid"><div class="stat"><label>Equipment</label><b>${eq.label}</b></div><div class="stat"><label>Cycle time</label><b class="num">${(d.cycle / s.rate).toFixed(0)} s</b> <small>${st.cyc} cycles</small></div>
        <div class="stat"><label>Estimated health</label><b class="num">${(e.health * 100).toFixed(0)}%</b> <span class="chip ${hcls}"><i></i>${hcls === 'good' ? 'Healthy' : hcls === 'warning' ? 'Watch' : 'Critical'}</span></div>
        <div class="stat"><label>Remaining useful life</label><b class="num">${diag && isFinite(e.rul) ? fmtDur(e.rul) : '—'}</b></div>
        <div class="stat"><label>Defects traced here</label><b class="num">${e.qn ? (e.qrate * 100).toFixed(1) + '%' : '–'}</b> <small>last ${e.qn || 0} units</small></div></div>
        <div style="margin:8px 0 2px" class="muted">State share · last 5 min</div><div class="stack">${share}</div>
        ${dn ? `<div class="diag crit"><b>${dn.kind === 'fail' ? 'Breakdown' : dn.kind === 'pm' ? 'Planned maintenance' : 'Recalibration'} · WO-${dn.wo}</b> — ${dn.crew ? 'crew on site, ' + fmtDur(dn.rem) + ' remaining' : 'waiting for a free crew'}${dn.kind !== 'calib' ? ' · ' + esc(eq.faults[st.mode].fix) : ''}</div>`
          : diag ? `<div class="diag ${e.health < 0.35 ? 'crit' : ''}"><b>Diagnosis: ${esc(diag.fault)}</b> (${(diag.conf * 100).toFixed(0)}% signature match) — ${esc(diag.evidence)}.<br><span class="muted">Recommended fix: ${esc(diag.fix)}</span></div>` : `<div class="diag ok">No anomaly: all sensor channels are inside their normal band.</div>`}
        <div class="igrid">${eq.sensors.map((sn, i) => { const v = e.ew ? e.ew[i] : sn.base, dev = v / sn.base - 1; return `<div class="sensor"><label>${esc(sn.name)}</label><b class="num">${v >= 100 ? v.toFixed(0) : v.toFixed(1)}<small> ${sn.unit} · ${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(0)}%</small></b><canvas data-sp="${i}"></canvas></div>`; }).join('')}</div>`}
        <div class="actions"><button class="btn small" data-act="watch">Watch this process (3× speed, close-up)</button><button class="btn small ghost" data-act="focus:34">Fly to station</button><button class="btn small ghost" data-act="maint:${d.id}:pm" ${dn ? 'disabled' : ''}>Schedule maintenance</button><button class="btn small ghost" data-act="maint:${d.id}:calib" ${dn ? 'disabled' : ''}>Recalibrate</button><button class="btn small warn" data-act="fail:${d.id}" ${dn ? 'disabled' : ''}>Force breakdown</button></div>`;
    } else if (sel.type === 'car') {
      const e = s.ents[sel.id]; if (!e) { app.view.select(null); return; }
      const o = s.orders[e.o] || {}, nodes = LINES.main.nodes, nd = nodes[e.i], n = LINES.main.nStations;
      const where = nd.buf ? 'In buffer / transfer' : `${nd.id} ${nd.name}`;
      const tl = Array.from({ length: n }, (_, i) => `<i class="${i < e.sd ? 'done' : i === e.sd && !nd.buf ? 'cur' : ''}"></i>`).join('');
      const rows = [], ts = e.ts || [], pNow = e.m === 2 ? 1 - e.t / e.d : 0, motors = VARIANTS[e.v].motors;
      let step = '';
      for (const nn of nodes) {
        if (nn.buf) continue;
        const done = nn.sidx < e.sd, here = nn.sidx === e.sd && e.m === 2 && nd.id === nn.id;
        if (here) { const k = currentOp(nn.id, pNow), o = (PROCESS[nn.id] || [])[k]; if (o) step = ` — step ${k + 1}: ${o.n}`; }
        if (!done && !here) continue;
        for (const o of PROCESS[nn.id] || []) {
          if (!o.parts || (here && pNow < o.t[1])) continue;
          for (const pt of o.parts) if (!(pt[0] === '7320' && motors < 2)) rows.push(`<tr><td class="num">${nn.id}</td><td>${esc(pt[1])}</td><td class="num muted">${pt[0]}</td><td class="r num">${pt[2]}</td><td class="num muted">${done && ts[nn.sidx] != null ? fmtClock(ts[nn.sidx]) : done ? '' : 'now'}</td></tr>`);
        }
      }
      const asBuilt = `<h3 style="margin-top:10px">As-built record <span>${rows.length} component and material lines so far</span></h3><div class="scroll"><table class="ops"><tr><th>Station</th><th>Component / material</th><th>Part no.</th><th class="r">Qty</th><th>Done</th></tr>${rows.reverse().join('')}</table></div>`;
      html = `<header><i class="sw" style="background:${hex(COLORS[e.c].hex)};width:16px;height:16px"></i><b>${vin(e)}</b><span class="chip">${VARIANTS[e.v].name}</span><button class="x" data-act="close">×</button></header>
        <div class="igrid"><div class="stat"><label>Order</label><b class="num">#${e.o}</b> <small>${o.stock ? 'build to stock' : 'customer order'}</small></div><div class="stat"><label>Colour</label><b>${COLORS[e.c].name}</b></div><div class="stat"><label>Battery</label><b>${VARIANTS[e.v].kwh} kWh</b> <small>${VARIANTS[e.v].motors} motor${VARIANTS[e.v].motors > 1 ? 's' : ''}</small></div>
        <div class="stat"><label>Destination</label><b>${REGIONS[e.r].name}</b></div><div class="stat"><label>Promise date</label><b class="num">${o.due ? fmtClock(o.due) : '—'}</b> <small>${o.due ? (o.due > s.t ? fmtDur(o.due - s.t) + ' left' : 'overdue') : ''}</small></div><div class="stat"><label>Time in plant</label><b class="num">${fmtDur(s.t - e.t0)}</b></div></div>
        <div style="margin:8px 0 2px" class="muted">Now at: <b style="color:var(--ink)">${esc(where)}${esc(step)}</b> · ${e.sd}/${n} operations complete ${e.ftt ? '' : '· <span class="chip warning"><i></i>Reworked</span>'}${e.def.length ? ` · <span class="chip serious"><i></i>${e.def.length} latent defect${e.def.length > 1 ? 's' : ''} (not yet detected)</span>` : ''}</div>
        <div class="timeline">${tl}</div>${asBuilt}
        <div class="actions"><button class="btn small ${app.view.follow ? '' : 'ghost'}" data-act="follow">${app.view.follow ? 'Following' : 'Follow this vehicle'}</button><button class="btn small ghost" data-act="focus:20">Fly to vehicle</button></div>`;
    } else if (sel.type === 'agv') {
      const a = s.agvs[sel.id - 1], tk = a.task ? s.tasks.find(t => t.id === a.task) : null;
      const AM = ['Idle', 'Driving to warehouse pick-up', 'Loading', 'Delivering to line', 'Unloading at line side', 'Returning to charging bay'];
      html = `<header><b>AGV ${a.id}</b><span class="chip ${a.down ? 'critical' : 'good'}"><i></i>${a.down ? 'Offline until ' + fmtClock(a.down) : AM[a.m]}</span><button class="x" data-act="close">×</button></header>
        <div class="igrid"><div class="stat"><label>Mission</label><b>${tk ? MAT[tk.mat].name : '—'}</b> <small>${tk ? '→ ' + tk.st : ''}</small></div><div class="stat"><label>Payload</label><b class="num">${a.load || 0} sets</b></div><div class="stat"><label>Dispatch policy</label><b>${s.pol.agvPriority ? 'Criticality' : 'FIFO'}</b></div></div>
        <div class="actions"><button class="btn small ${app.view.follow ? '' : 'ghost'}" data-act="follow">${app.view.follow ? 'Following' : 'Follow'}</button></div>`;
    }
    if (this.cache.inspector !== html) { this.cache.inspector = html; box.innerHTML = html; }
    if (sel.type === 'station') {
      const d = STATIONS[sel.id], eq = EQUIP[d.eq], hist = app.sensors[d.id], S = SERIES();
      box.querySelectorAll('canvas[data-sp]').forEach(cv => { const i = +cv.dataset.sp; if (hist) spark(cv, hist[i], eq.sensors[i].base, S[0]); });
    }
  }
}
