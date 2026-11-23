// Faster-than-real-time prediction: fork the live plant state, run it forward
// (optionally with the autonomous controller inside the fork) and aggregate
// several stochastic replications. Work is time-sliced so rendering never stalls.
import { FactorySim } from './sim.js';
import { STATION_LIST } from './config.js';

const SAMPLE = 300; // seconds between samples of the output curve

export class Forecaster {
  constructor() { this.queue = []; this.cur = null; }
  get busy() { return !!this.cur || this.queue.length > 0; }
  get progress() { const j = this.cur; return j ? (j.run + j.steps / j.totalSteps) / j.runs : 0; }

  // job: { label, sim, brain, ai, horizon, runs, mutate?, onDone, tag }
  submit(job) {
    const base = structuredClone(job.sim.s);
    // The twin does not get to peek at hidden truth: equipment health in the fork
    // is what the perception layer currently believes; failure thresholds are redrawn.
    if (job.brain) for (const d of STATION_LIST) { const e = job.brain.est[d.id]; if (e && e.ew) base.st[d.id].h = Math.max(0.02, Math.min(1, e.health)); }
    this.queue.push({ ...job, base, est: job.brain ? structuredClone(job.brain.est) : null, dt: 2, run: -1, results: [], steps: 0, totalSteps: Math.ceil(job.horizon / 2) });
  }
  cancel(tag) { this.queue = this.queue.filter(j => j.tag !== tag); if (this.cur && this.cur.tag === tag) this.cur = null; }

  _startRun(j) {
    j.run++; j.steps = 0;
    const sim = new FactorySim(structuredClone(j.base));
    sim.s.seed = (j.base.seed ^ Math.imul(j.run + 1, 0x9E3779B1)) | 0;
    for (const d of STATION_LIST) { const st = sim.s.st[d.id]; st.failAt = 0.1 + 0.12 * sim.r(); if (st.h <= st.failAt && !st.down) st.h = st.failAt + 0.005; }
    if (j.mutate) j.mutate(sim);
    j.fsim = sim;
    j.fbrain = j.ai && j.brain ? j.brain.cloneFor(sim) : null;
    j.k0 = { ...sim.s.kpi }; j.t0 = sim.s.t;
    j.series = [0]; j.next = SAMPLE;
  }
  pump(ms) {
    const tEnd = performance.now() + ms;
    while (performance.now() < tEnd) {
      if (!this.cur) { if (!this.queue.length) return; this.cur = this.queue.shift(); this._startRun(this.cur); }
      const j = this.cur;
      for (let i = 0; i < 40 && j.steps < j.totalSteps; i++) {
        j.fsim.step(j.dt); j.steps++;
        if (j.fbrain) j.fbrain.update();
        if (j.steps * j.dt >= j.next) { j.series.push(j.fsim.s.kpi.made - j.k0.made); j.next += SAMPLE; }
      }
      if (j.steps >= j.totalSteps) {
        const k = j.fsim.s.kpi, k0 = j.k0;
        j.results.push({
          series: j.series, made: k.made - k0.made, failures: k.failures - k0.failures, downMin: (k.downSec - k0.downSec) / 60,
          shortMin: (k.shortSec - k0.shortSec) / 60, yardBlockMin: (k.yardBlockSec - k0.yardBlockSec) / 60,
          delivered: k.delivered - k0.delivered, onTime: k.onTime - k0.onTime, rework: k.rework - k0.rework,
          cost: (k.cExp - k0.cExp) + (k.cMaint - k0.cMaint) + (k.cEnergy - k0.cEnergy), energy: k.energy - k0.energy,
        });
        if (j.run + 1 < j.runs) this._startRun(j);
        else { this.cur = null; j.fsim = j.fbrain = null; j.onDone(aggregate(j)); }
      }
    }
  }
}

function aggregate(j) {
  const R = j.results, n = R.length, len = Math.min(...R.map(r => r.series.length));
  const mean = [], lo = [], hi = [], times = [];
  for (let i = 0; i < len; i++) {
    let s = 0, a = Infinity, b = -Infinity;
    for (const r of R) { const v = r.series[i]; s += v; if (v < a) a = v; if (v > b) b = v; }
    mean.push(s / n); lo.push(a); hi.push(b); times.push(j.t0 + i * SAMPLE);
  }
  const avg = key => R.reduce((s, r) => s + r[key], 0) / n;
  const made = R.map(r => r.made);
  return {
    label: j.label, tag: j.tag, t0: j.t0, horizon: j.horizon, runs: n, ai: !!j.ai, times, mean, lo, hi,
    made: avg('made'), madeLo: Math.min(...made), madeHi: Math.max(...made),
    failures: avg('failures'), downMin: avg('downMin'), shortMin: avg('shortMin'), yardBlockMin: avg('yardBlockMin'),
    delivered: avg('delivered'), onTime: avg('onTime'), rework: avg('rework'), cost: avg('cost'), energy: avg('energy'),
  };
}
