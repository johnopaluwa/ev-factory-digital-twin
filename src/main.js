// Application bootstrap: owns the live simulation, the autonomous controller,
// the forecaster, the 3D view and the HUD, and runs the main loop.
import { FactorySim } from './sim.js';
import { Brain } from './brain.js';
import { Forecaster } from './twin.js';
import { FactoryView } from './view.js';
import { UI } from './ui.js';
import { SCENARIO } from './scenarios.js';
import { STATION_LIST, LINES, SHIFT_SEC, TAKT } from './config.js';

function boot() {
  const tB = performance.now();
  const sim = FactorySim.create();
  const tS = performance.now();
  const brain = new Brain(sim, { mode: 'auto' });
  const view = new FactoryView(document.getElementById('gl'), sim, brain);
  console.info(`twin ready: simulation warm-up ${(tS - tB).toFixed(0)} ms, scene build ${(performance.now() - tS).toFixed(0)} ms`);
  const fc = new Forecaster();

  const app = {
    sim, brain, view, fc, speed: 30, hd: true,
    hist: [], sensors: {}, events: [], forecast: null, whatif: null, wiSeq: 0,
    oee() {
      const s = sim.s, k = s.kpi;
      const perf = Math.min(1, sim.jph(1800) * TAKT / 3600), q = k.fttN ? k.fttOk / k.fttN : 1;
      let dn = 0, tot = 0;
      for (const d of LINES.main.nodes) if (!d.buf) { const a = s.st[d.id].acc; dn += a.down + a.maint + a.micro; tot += a.proc + a.idle + a.blocked + a.nomat + a.down + a.maint + a.micro; }
      const a = tot ? 1 - dn / tot * LINES.main.nStations * 0.35 : 1;       // a line stop idles roughly a third of the line
      const av = Math.max(perf, Math.min(1, a));
      return { oee: perf * q, a: av, p: perf / av, q };
    },
    setMode(m) { brain.setMode(m); ui.toast(m === 'auto' ? 'Autonomous mode: controller executes its own decisions' : m === 'advisory' ? 'Advisory mode: controller proposes, you approve' : 'Manual mode: controller only observes', 'ai'); app.lastFc = 0; },
    inject(id) {
      const sc = SCENARIO[id]; sc.apply(sim);
      app.events.unshift({ t: sim.s.t, sev: 3, msg: `Scenario injected: ${sc.name} — ${sc.where}` });
      ui.toast(`${sc.icon} ${sc.name}`, 's3', sc.where);
      if (sc.focus) view.select({ type: 'station', id: sc.focus }, true);
      app.lastFc = 0;
    },
    runWhatIf(id, hours) {
      fc.cancel('whatif');
      const sc = SCENARIO[id], w = app.whatif = { id: ++app.wiSeq, sc: id, h: hours, t0: sim.s.t, res: {} };
      const job = (label, ai, mutate) => fc.submit({ label, tag: 'whatif', sim, brain, ai, horizon: hours * 3600, runs: hours > 4 ? 3 : 4, mutate, onDone: r => { if (app.whatif === w) w.res[label] = r; } });
      job('base', brain.mode !== 'off', null); job('noai', false, s => sc.apply(s)); job('ai', true, s => sc.apply(s));
    },
    toast: (...a) => ui.toast(...a),
    // Live-data ingress. Feed the twin from a real source (OPC UA / MQTT bridge, MES, WMS):
    //   { type: 'sensor', station: 'BIW-30', values: [a, b, c, d] }   four channels in the order shown in the inspector
    //   { type: 'inventory', material: 'cells', sets: 180 }
    //   { type: 'breakdown', station: 'PNT-50' }
    ingest(msg) {
      if (!msg) return false;
      if (msg.type === 'sensor' && sim.s.st[msg.station] && Array.isArray(msg.values) && msg.values.length === 4) { sim.ext[msg.station] = { v: msg.values.map(Number), at: Date.now() }; return true; }
      if (msg.type === 'inventory' && msg.material in sim.s.inv && isFinite(msg.sets)) { sim.s.inv[msg.material] = Math.max(0, +msg.sets); return true; }
      if (msg.type === 'breakdown' && sim.s.st[msg.station]) { const st = sim.s.st[msg.station]; if (!st.down || st.down.kind === 'micro') { st.down = null; st.h = st.failAt - 0.01; } return true; }
      return false;
    },
  };
  const ui = new UI(app);
  for (const d of STATION_LIST) app.sensors[d.id] = [[], [], [], []];

  sim.onEvent = e => {
    app.events.unshift(e); if (app.events.length > 120) app.events.pop();
    if (e.sev >= 3) ui.toast(e.msg, 's3');
  };
  brain.onDecision = e => {
    app.events.unshift({ t: e.t, sev: 1, ai: true, msg: `AI ${e.status === 'pending' ? 'recommends' : 'decision'}: ${e.title}` });
    ui.toast(`${e.status === 'pending' ? 'AI recommends' : 'AI'}: ${e.title}`, 'ai', e.decide);
  };
  view.onSelect = () => { ui.cache = {}; ui.tSlow = 0; };
  view.onHover = (sel, x, y) => ui.tooltip(sel, x, y);

  let last = performance.now(), nextHist = 0, frames = 0, slowMs = 0, checked = false;
  app.lastFc = performance.now() - 18000;   // first forecast a few seconds after start
  // optional live feed: open the page with ?feed=ws://host:port and send the JSON messages documented on app.ingest
  const feed = new URLSearchParams(location.search).get('feed');
  if (feed && (feed.startsWith('ws://') || feed.startsWith('wss://'))) {
    try {
      const ws = new WebSocket(feed);
      ws.onopen = () => ui.toast('Live data feed connected', 'ai', feed);
      ws.onmessage = ev => { try { app.ingest(JSON.parse(ev.data)); } catch { /* ignore malformed frames */ } };
      ws.onclose = () => ui.toast('Live data feed disconnected, running on the plant model', 's2');
    } catch (err) { console.warn('feed', err); }
  }
  function sample() {
    const s = sim.s;
    app.hist.push({ t: s.t, jph: sim.jph(1800), made: s.kpi.shiftMade, shift: s.shiftNo, power: s.kpi.power });
    if (app.hist.length > 900) app.hist.shift();
  }
  sample();

  function frame(now) {
    const dt = Math.min(0.06, (now - last) / 1000); last = now;
    // ---- advance the plant
    const simDt = app.speed * dt;
    if (simDt > 0) {
      const n = Math.max(1, Math.ceil(simDt / (app.speed <= 30 ? 0.5 : 1)));
      for (let i = 0; i < n; i++) {
        sim.step(simDt / n);
        if (brain.update()) for (const d of STATION_LIST) { const h = app.sensors[d.id], e = brain.est[d.id]; for (let k = 0; k < 4; k++) { h[k].push(e.ew[k]); if (h[k].length > 90) h[k].shift(); } }
      }
      if (sim.s.t >= nextHist) { sample(); nextHist = sim.s.t + 60; }
    }
    // ---- look ahead: keep an end-of-shift forecast fresh
    if (!fc.busy && now - app.lastFc > 22000 && app.speed > 0) {
      app.lastFc = now;
      const s = sim.s, horizon = Math.max(1800, SHIFT_SEC - sim.shiftElapsed());
      const made0 = s.kpi.shiftMade, shiftNo = s.shiftNo;
      fc.submit({ label: 'eos', tag: 'eos', sim, brain, ai: brain.mode !== 'off', horizon, runs: horizon > 4 * 3600 ? 3 : 5, onDone: r => { app.forecast = { r, made0, shiftNo, eos: made0 + r.made, at: performance.now() }; } });
    }
    fc.pump(fc.cur && fc.cur.tag === 'whatif' ? 12 : 8);
    view.render(dt, app.speed);
    ui.update(now);
    // ---- drop to performance mode automatically on slow GPUs
    if (!checked && now > 6000) { frames++; slowMs += dt; if (frames === 90) { checked = true; if (slowMs / frames > 0.045 && app.hd) { app.hd = false; view.setQuality(false); document.getElementById('qualBtn').classList.remove('on'); ui.toast('Switched to performance mode (shadows off)', 's2'); } } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.getElementById('loading').classList.add('done');
  window.twin = app;
}

// Let the loading screen paint before the heavy scene build. A timer (not an
// animation frame) so the twin also starts when the tab opens in the background.
setTimeout(() => {
  try { boot(); } catch (err) {
    console.error(err);
    document.getElementById('loading').innerHTML = `<div><b>Could not start the twin</b><small>${String(err && err.message || err)}</small></div>`;
  }
}, 60);
