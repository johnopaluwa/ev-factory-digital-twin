// Autonomous plant controller: a perceive → decide → execute loop.
//  perceive : fuses sensor streams into equipment health / fault diagnosis / RUL,
//             line flow states, material coverage, quality SPC, schedule position
//  decide   : rule- and model-based policies, each with an explicit rationale
//  execute  : calls the same actuation API a human operator would use
// The identical controller runs inside forked simulations for "with AI" forecasts.
import { STATIONS, STATION_LIST, MATERIALS, MAT, EQUIP, LINES, YARD_SLOTS, TAKT, fmtClock, fmtDur } from './config.js';

const TICK = 20;
const FAIL_LEVEL = 0.2;      // conservative health level treated as "failure imminent"
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;

export class Brain {
  constructor(sim, opts = {}) {
    this.sim = sim;
    this.fork = !!opts.fork;
    this.mode = opts.mode || 'auto';          // 'auto' | 'advisory' | 'off'
    this.log = []; this.pending = []; this.cool = {}; this.seq = 1;
    this.lastTick = -1e9; this.ticks = 0;
    this.flow = {}; this.snaps = []; this.mats = {}; this.bottleneck = null;
    this.value = { downAvoided: 0, units: 0, decisions: 0 };
    this.est = opts.est || {};
    if (!opts.est) for (const d of STATION_LIST) this.est[d.id] = { ew: null, dev: [0, 0, 0, 0], sev: 0, health: 1, mode: -1, conf: 0, rul: Infinity, hist: [], q: [], qrate: 0 };
  }
  cloneFor(sim) { return new Brain(sim, { fork: true, mode: 'auto', est: structuredClone(this.est) }); }

  update() {
    const t = this.sim.s.t;
    if (t - this.lastTick < TICK) return false;
    this.lastTick = t; this.ticks++;
    this.perceive();
    if (this.mode !== 'off') this.decide();
    return true;
  }

  // ================================================================ PERCEIVE
  perceive() {
    const sim = this.sim, s = sim.s;
    // --- equipment condition from sensor signatures
    for (const d of STATION_LIST) {
      const e = this.est[d.id], eq = EQUIP[d.eq], v = sim.readSensors(d.id);
      if (!e.ew) e.ew = v; else for (let i = 0; i < 4; i++) e.ew[i] += 0.25 * (v[i] - e.ew[i]);
      let n2 = 0;
      for (let i = 0; i < 4; i++) { e.dev[i] = e.ew[i] / eq.sensors[i].base - 1; n2 += e.dev[i] * e.dev[i]; }
      let best = -1, bc = 0, bp = 0;
      eq.faults.forEach((f, k) => {
        let dot = 0, s2 = 0;
        for (let i = 0; i < 4; i++) { dot += e.dev[i] * f.sig[i]; s2 += f.sig[i] * f.sig[i]; }
        const cos = dot / (Math.sqrt(n2 * s2) + 1e-9);
        if (cos > bc) { bc = cos; best = k; bp = dot / s2; }
      });
      e.mode = best; e.conf = Math.max(0, bc); e.sev = Math.max(0, Math.min(1, bp));
      e.health = 1 - Math.pow(e.sev, 1 / 1.3);
      e.hist.push(s.t, e.health); if (e.hist.length > 180) e.hist.splice(0, 2);
      e.rul = this._rul(e);
      // quality SPC: defects traced back to this station per unit output
      const st = s.st[d.id];
      e.q.push(st.out, st.defFound); if (e.q.length > 440) e.q.splice(0, 2);
      let j = 0; while (j + 2 < e.q.length && st.out - e.q[j + 2] >= 40) j += 2;
      const dout = st.out - e.q[j];
      e.qn = dout; e.qrate = dout >= 20 ? (st.defFound - e.q[j + 1]) / dout : 0;
    }
    // --- flow: state shares over a ~5 min sliding window
    const snap = {};
    for (const d of STATION_LIST) snap[d.id] = { ...s.st[d.id].acc };
    this.snaps.push(snap); if (this.snaps.length > 16) this.snaps.shift();
    const old = this.snaps[0];
    let bn = null, bb = -1;
    for (const d of STATION_LIST) {
      const a = snap[d.id], o = old[d.id], f = {}; let tot = 0;
      for (const k in a) { f[k] = a[k] - o[k]; tot += f[k]; }
      if (tot > 0) for (const k in f) f[k] /= tot;
      f.busy = tot > 0 ? 1 - f.idle - f.blocked : 0;
      this.flow[d.id] = f;
      if (d.line === 'main' && f.busy > bb) { bb = f.busy; bn = d.id; }
    }
    this.bottleneck = bn ? { id: bn, busy: bb } : null;
    // --- material coverage projection
    const jph = Math.max(30, sim.jph(1800));
    for (const m of MATERIALS) {
      const use = jph * (m.id === 'magnets' || m.id === 'sic' ? 1.6 : 1);
      const onHand = s.inv[m.id] + sim.lineSide(m.id);
      let eta = Infinity, onOrder = 0;
      for (const po of s.pos) if (po.mat === m.id && po.st < 2) { onOrder += po.qty; if (po.st === 1) eta = s.t; else if (po.eta < eta) eta = po.eta; }
      const cover = onHand / use;                       // hours
      const outAt = s.t + cover * 3600;
      // with nothing on order, the next delivery is whatever MRP will release at the re-order point
      const etaEff = eta !== Infinity ? eta : s.t + (Math.max(0, (s.inv[m.id] - s.rop[m.id]) / use) + m.lead * s.leadMul[m.id]) * 3600;
      this.mats[m.id] = { use, onHand, onOrder, cover, eta, etaEff, outAt, gap: outAt - etaEff, risk: eta !== Infinity ? outAt < eta + 300 : (s.rop[m.id] / use < m.lead * s.leadMul[m.id] * 0.92 && outAt < etaEff) };
    }
  }
  _rul(e) {
    const h = e.hist, n = h.length / 2;
    if (n < 24) return Infinity;
    let sx = 0, sy = 0, sxx = 0, sxy = 0; const t0 = h[0];
    for (let i = 0; i < h.length; i += 2) { const x = h[i] - t0, y = h[i + 1]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = n * sxx - sx * sx; if (den <= 0) return Infinity;
    const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
    const now = icpt + slope * (h[h.length - 2] - t0);
    if (now <= FAIL_LEVEL) return 0;
    if (slope > -2e-6 || -slope * (h[h.length - 2] - t0) < 0.02) return Infinity;   // ignore trends inside the noise
    return (now - FAIL_LEVEL) / -slope;
  }
  diagnosis(id) {
    const d = STATIONS[id], e = this.est[id], eq = EQUIP[d.eq];
    if (e.mode < 0 || e.sev < 0.12 || e.conf < 0.55) return null;
    const f = eq.faults[e.mode];
    const parts = eq.sensors.map((sn, i) => ({ sn, dev: e.dev[i] })).filter(x => Math.abs(x.dev) > 0.02).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev)).slice(0, 2);
    return { fault: f.name, fix: f.fix, conf: e.conf, sev: e.sev, health: e.health, rul: e.rul, evidence: parts.map(x => `${x.sn.name} ${pct(x.dev)}`).join(', ') };
  }

  // ================================================================== DECIDE
  decide() {
    const sim = this.sim, s = sim.s, k = s.kpi;
    const jph = Math.max(30, sim.jph(1800));
    // expire stale recommendations
    this.pending = this.pending.filter(p => { if (s.t - p.t > 900 || (p.valid && !p.valid())) { p.entry.status = 'expired'; return false; } return true; });

    // ---- standing policies (enabled once)
    if (!s.pol.colorBatch) this.act({
      key: 'pol:seq', cat: 'flow', title: 'Enable colour-batch sequencing',
      perceive: 'Paint base-coat booth purges on every colour change (+22 s per change).',
      decide: 'Re-sequence the next 8 orders to batch colours whenever the oldest order keeps >90 min of due-date slack.',
      exec: () => { s.pol.colorBatch = true; return 'Sequencer policy updated; body-shop launch order now colour-aware.'; },
    });
    if (!s.pol.smartDispatch) this.act({
      key: 'pol:disp', cat: 'logistics', title: 'Due-date aware carrier dispatch',
      perceive: 'Carriers wait for full 8-car loads, which can strand orders close to their promise date.',
      decide: 'Dispatch partial loads when an order would otherwise miss its due time, and load by due date.',
      exec: () => { s.pol.smartDispatch = true; return 'Yard management policy updated.'; },
    });

    // ---- maintenance
    const lineStopped = {}; const pmActive = {};
    for (const d of STATION_LIST) {
      const st = s.st[d.id];
      if (st.down && st.down.kind !== 'micro') { lineStopped[d.line] = d.id; if (st.down.kind !== 'fail') pmActive[d.line] = (pmActive[d.line] || 0) + 1; }
      if (st.down && st.down.kind === 'fail') {
        const f = EQUIP[d.eq].faults[st.mode];
        this.act({
          key: `fail:${st.down.wo}`, cat: 'maintenance', title: `Breakdown response · ${d.id}`, ref: d.id, cooldown: 1e9, info: true,
          perceive: `${d.id} ${d.name} stopped (${f.name}). Upstream is filling buffers, downstream starving.`,
          decide: `Highest-priority work order; hold a crew on it and look for stations that can be serviced in the shadow of this stop.`,
          exec: () => `WO-${st.down.wo} escalated — est. repair ${fmtDur(st.down.rem)}. Fix: ${f.fix}.`,
        });
      }
    }
    for (const d of STATION_LIST) {
      const st = s.st[d.id], e = this.est[d.id];
      if (st.down && st.down.kind !== 'micro') continue;
      if (e.conf < 0.7 || e.sev < 0.3 || e.mode < 0) continue;
      const rulMin = e.rul / 60, f = this.flow[d.id] || {};
      const shadow = lineStopped[d.line] && lineStopped[d.line] !== d.id;
      const urgent = e.health < 0.27 || (rulMin < 22 && e.health < 0.45);
      const opportunistic = rulMin < 110 && e.health < 0.55 && (shadow || (f.idle + f.blocked) > 0.65);
      const soon = rulMin < 45 && e.health < 0.5 && s.crewFree >= 2;
      if (!(urgent || opportunistic || soon)) continue;
      if (s.crewFree < (urgent ? 1 : 2)) continue;
      if (!shadow && !urgent && pmActive[d.line]) continue;
      const diag = this.diagnosis(d.id); if (!diag) continue;
      const saveMin = 20 - 5.3, units = d.line === 'main' ? saveMin * jph / 60 : saveMin * jph / 60 * 0.4;
      const why = urgent ? (rulMin < 22 ? 'failure is imminent' : 'estimated health is already inside the failure band') : shadow ? `${lineStopped[d.line]} is already stopped, so this stop costs almost no extra output` : opportunistic ? 'the station is mostly waiting on its neighbours right now' : 'a crew is free and the window is short';
      pmActive[d.line] = (pmActive[d.line] || 0) + 1;
      this.act({
        key: `pm:${d.id}`, cat: 'maintenance', title: `Predictive maintenance · ${d.id}`, ref: d.id, cooldown: 900,
        perceive: `${diag.evidence} → matches "${diag.fault}" (${(diag.conf * 100).toFixed(0)}% match). Est. health ${(diag.health * 100).toFixed(0)}%, remaining useful life ≈ ${isFinite(e.rul) ? fmtDur(e.rul) : 'short'}.`,
        decide: `Service now because ${why}. Planned stop ≈ 5 min vs ≈ 20 min unplanned breakdown.`,
        impact: `≈ ${units.toFixed(0)} units protected`,
        valid: () => !s.st[d.id].down || s.st[d.id].down.kind === 'micro',
        exec: () => {
          const wo = sim.requestMaint(d.id, 'pm');
          if (!wo) return null;
          this.value.downAvoided += saveMin; this.value.units += units;
          return `WO-${wo} dispatched: ${diag.fix}. Station locked out; crew en route.`;
        },
      });
    }

    // ---- quality (closed-loop SPC)
    for (const d of STATION_LIST) {
      const st = s.st[d.id], e = this.est[d.id];
      if (st.down && st.down.kind !== 'micro') continue;
      if (e.qn < 25 || e.qrate < 0.085 || s.crewFree < 1) continue;
      this.act({
        key: `cal:${d.id}`, cat: 'quality', title: `Process recalibration · ${d.id}`, ref: d.id, cooldown: 1500,
        perceive: `Inspection traced ${(e.qrate * e.qn).toFixed(0)} defects in the last ${e.qn} units back to ${d.id} ${d.name} (${(e.qrate * 100).toFixed(1)}% vs <1% baseline).`,
        decide: 'Process has drifted out of control limits. A 2-minute recalibration costs less than the rework it is generating downstream.',
        impact: `rework −${(e.qrate * jph).toFixed(1)} units/h`,
        valid: () => !s.st[d.id].down,
        exec: () => { const wo = sim.requestMaint(d.id, 'calib'); return wo ? `WO-${wo}: master-part calibration started, parameters restored to golden recipe.` : null; },
      });
    }

    // ---- supply chain
    let matCritical = null;
    for (const m of MATERIALS) {
      const x = this.mats[m.id];
      if (s.leadMul[m.id] > 1.2 && s.rop[m.id] < m.rop * 1.3) this.act({
        key: `rop:${m.id}`, cat: 'supply', title: `Raise safety stock · ${m.name}`, ref: m.id, cooldown: 7200,
        perceive: `${m.supplier} lead time running ${s.leadMul[m.id].toFixed(1)}× nominal.`,
        decide: `Lift re-order point from ${m.rop} to ${Math.round(m.rop * 1.45)} sets until the supplier recovers.`,
        exec: () => { s.rop[m.id] = Math.round(m.rop * 1.45); return 'Planning parameters updated in MRP.'; },
      });
      else if (s.leadMul[m.id] <= 1 && s.rop[m.id] > m.rop) s.rop[m.id] = m.rop;
      if (!x.risk) continue;
      const expedited = s.pos.some(po => po.mat === m.id && po.exp && po.st === 0);
      if (x.cover < 0.8 && (expedited || x.gap < -1200)) matCritical = m;
      if (expedited) continue;
      if (x.cover > m.lead * 0.28 * 1.3 + 0.45) continue;      // act at the last responsible moment, not hours early
      const qty = Math.round(Math.max(m.lot * 0.5, Math.min(m.lot * 1.2, ((x.etaEff - x.outAt) / 3600 + 1) * x.use)));
      this.act({
        key: `exp:${m.id}`, cat: 'supply', title: `Expedite ${m.name}`, ref: m.id, cooldown: 2400,
        perceive: `${Math.round(x.onHand)} sets on hand = ${x.cover.toFixed(1)} h cover → stock-out at ${fmtClock(x.outAt)}; next delivery ${x.eta === Infinity ? 'not scheduled' : 'ETA ' + fmtClock(x.eta)}.`,
        decide: `Bridge the gap with ${qty} sets by express freight (+16% cost) — cheaper than a line stop at ≈ ${jph.toFixed(0)} units/h.`,
        impact: `avoids ≈ ${fmtDur(Math.max(600, -x.gap))} starvation`,
        exec: () => { const po = sim.order(m.id, qty, true); return `PO-${po.id} placed with ${m.supplier} (express), ETA ${fmtClock(po.eta)}.`; },
      });
    }

    // ---- intralogistics
    const agvDown = s.agvs.filter(a => a.down).length, waiting = s.tasks.filter(t => !t.agv).length;
    if (!s.pol.agvPriority && (agvDown >= 3 || waiting >= 4)) this.act({
      key: 'agv:on', cat: 'logistics', title: 'AGV fleet: criticality-based dispatch', cooldown: 300,
      perceive: `${agvDown} of ${s.agvs.length} AGVs offline, ${waiting} replenishment tasks waiting.`,
      decide: 'Switch from FIFO to lowest-line-side-stock-first and raise tote size from 10 to 16 sets to halve the number of trips.',
      exec: () => { s.pol.agvPriority = true; s.tote = 16; return 'Fleet manager re-planned all open missions.'; },
    });
    else if (s.pol.agvPriority && agvDown === 0 && waiting <= 1) this.act({
      key: 'agv:off', cat: 'logistics', title: 'AGV fleet: back to standard dispatch', cooldown: 300,
      perceive: 'Fleet back at full strength, no replenishment backlog.',
      decide: 'Return to standard tote size to keep line-side inventory lean.',
      exec: () => { s.pol.agvPriority = false; s.tote = 10; return 'Fleet manager policy restored.'; },
    });

    // ---- line rate (schedule, material, yard, energy)
    const gap = sim.planNow() - k.shiftMade, yardFill = sim.yardCount() / YARD_SLOTS;
    let target = 1, pr = '', dc = '';
    if (yardFill > 0.85) { target = 0.9; pr = `Yard ${(yardFill * 100).toFixed(0)}% full — outbound is not keeping up.`; dc = 'Slow the line 10% so the exit does not block; protects quality and energy while carriers catch up.'; }
    else if (matCritical) { target = 0.88; pr = `${matCritical.name} cover is ${this.mats[matCritical.id].cover.toFixed(1)} h and the next delivery lands after stock-out.`; dc = 'Stretch remaining stock by running 12% slower — a slow line recovers faster than a starved one.'; }
    else if (s.priceMul > 1.5 && gap < 4) { target = 0.9; pr = `Energy price ${s.priceMul.toFixed(1)}× and schedule is ${gap <= 0 ? 'ahead' : 'on plan'}.`; dc = 'Trim rate 10% during the price spike; output can be recovered afterwards.'; }
    else if (gap > 6 || (s.rate > 1.02 && gap > 1)) { target = Math.min(1.1, Math.max(1.04, Math.round((1 + gap / 110) * 100) / 100)); pr = `${gap.toFixed(0)} units behind plan with no material or yard constraint.`; dc = `Raise line rate to ${(target * 100).toFixed(0)}% to recover the gap (accepting slightly faster wear).`; }
    else if ((gap < -14 || (s.rate < 0.97 && s.rate > 0.93 && gap < -7)) && s.queue.length < 40) { target = 0.95; pr = `${(-gap).toFixed(0)} units ahead of plan and the order backlog is covered.`; dc = 'Ease rate to 95% to cut wear and energy per unit.'; }
    else { pr = 'Schedule, material coverage and yard are back within limits.'; dc = 'Return to nominal line rate.'; }
    if (Math.abs(target - s.rate) >= 0.03) this.act({
      key: 'rate', cat: 'flow', title: `Line rate → ${(target * 100).toFixed(0)}%`, cooldown: 480,
      perceive: pr, decide: dc,
      exec: () => { s.rate = target; return `Takt set to ${(TAKT / target).toFixed(0)} s across all lines.`; },
    });
  }

  // ================================================================= EXECUTE
  act(a) {
    const s = this.sim.s;
    if (this.cool[a.key] && s.t < this.cool[a.key]) return;
    if (this.mode === 'advisory' && !this.fork && !a.info) {
      if (this.pending.some(p => p.key === a.key)) return;
      const entry = this._entry(a, 'pending');
      this.pending.push({ ...a, id: entry.id, t: s.t, entry });
      this.cool[a.key] = s.t + 60;
      return;
    }
    const res = a.exec();
    if (res === null) return;
    this.cool[a.key] = s.t + (a.cooldown || 600);
    this.value.decisions++;
    if (!this.fork) { const e = this._entry(a, 'executed'); e.execute = res; }
  }
  _entry(a, status) {
    const e = { id: this.seq++, t: this.sim.s.t, cat: a.cat, title: a.title, perceive: a.perceive, decide: a.decide, execute: '', impact: a.impact || '', status, ref: a.ref || null };
    this.log.unshift(e); if (this.log.length > 80) this.log.pop();
    if (this.onDecision) this.onDecision(e);
    return e;
  }
  approve(id) {
    const i = this.pending.findIndex(p => p.id === id); if (i < 0) return;
    const p = this.pending.splice(i, 1)[0];
    const res = p.exec();
    p.entry.status = res === null ? 'expired' : 'executed'; p.entry.execute = res || '';
    this.cool[p.key] = this.sim.s.t + (p.cooldown || 600); this.value.decisions++;
  }
  dismiss(id) {
    const i = this.pending.findIndex(p => p.id === id); if (i < 0) return;
    const p = this.pending.splice(i, 1)[0];
    p.entry.status = 'dismissed'; this.cool[p.key] = this.sim.s.t + 900;
  }
  setMode(m) {
    this.mode = m;
    if (m === 'auto') for (const p of [...this.pending]) this.approve(p.id);
    if (m === 'off') { for (const p of this.pending) p.entry.status = 'expired'; this.pending = []; }
  }

  // ranked list of equipment at risk (for UI)
  risks() {
    const out = [];
    for (const d of STATION_LIST) {
      const e = this.est[d.id], st = this.sim.s.st[d.id];
      out.push({ id: d.id, name: d.name, zone: d.zone, health: e.health, rul: e.rul, conf: e.conf, sev: e.sev, state: st.state, diag: this.diagnosis(d.id) });
    }
    return out.sort((a, b) => a.health - b.health);
  }
}
