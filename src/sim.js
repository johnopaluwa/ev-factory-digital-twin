// Discrete-time factory simulation. All dynamic state is one plain JSON-able
// object (this.s) so the whole plant can be forked with structuredClone() and
// run ahead of real time for prediction and what-if analysis.
import {
  LINES, LINE_ORDER, STATIONS, STATION_LIST, MATERIALS, MAT, EQUIP, VARIANTS, COLORS, REGIONS,
  AGV_COUNT, AGV_PARK, TRUNK_X, YARD_SLOTS, DOCKS, CREWS, CARRIERS, SHIFT_SEC, PLAN_JPH,
} from './config.js';

export const WARMUP = 3600;
const AGV_SPEED = 2.3;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function route(from, to) {
  const p = [];
  if (from.a != null) p.push([from.x, from.a]);
  if (from.a != null && to.a != null && from.a === to.a) {
    p.push([to.x, to.a]);
  } else {
    p.push([TRUNK_X, from.a != null ? from.a : from.z]);
    p.push([TRUNK_X, to.a != null ? to.a : to.z]);
    if (to.a != null) p.push([to.x, to.a]);
  }
  p.push([to.x, to.z]);
  return p;
}

export class FactorySim {
  constructor(state) { this.s = state; this.onEvent = null; this._dt = 0; this.ext = {}; }

  // ---------------------------------------------------------------- creation
  static create(seed = 20261121) {
    const s = {
      t: -WARMUP, slowT: -WARMUP, seed, rate: 1, demandMul: 1, demandUntil: 0, nextId: 1, noFail: true,
      st: {}, occ: {}, ents: {}, cnt: { panels: 8, packs: 2, dus: 3 },
      inv: {}, leadMul: {}, leadUntil: {}, rop: {}, pos: [], poSeq: 4500,
      agvs: [], tasks: [], taskSeq: 1, tote: 10,
      orders: {}, queue: [], orderSeq: 70000, nextOrderT: -WARMUP, lastColor: -1,
      yard: new Array(YARD_SLOTS).fill(0), ycars: {}, carriers: [], carrierBlockUntil: 0,
      crewFree: CREWS, woSeq: 3100,
      priceMul: 1, priceUntil: 0,
      pol: { colorBatch: false, agvPriority: false, smartDispatch: false },
      shiftStart: 0, shiftNo: 1,
      exits: [], recent: [],
      kpi: {
        made: 0, shiftMade: 0, scrap: 0, rework: 0, fttN: 0, fttOk: 0, energy: 0, power: 0,
        failures: 0, pm: 0, calib: 0, downSec: 0, shortSec: 0, yardBlockSec: 0, leadSum: 0, leadN: 0,
        delivered: 0, onTime: 0, expedites: 0, purges: 0, agvBusy: 0, agvTime: 0,
        cMat: 0, cExp: 0, cMaint: 0, cEnergy: 0,
      },
    };
    const sim = new FactorySim(s);
    for (const def of STATION_LIST) {
      const st = {
        state: 'idle', h: 0.5 + 0.5 * sim.r(), failAt: 0.1 + 0.12 * sim.r(), mode: Math.floor(sim.r() * 3),
        wear: sim._wear(), drift: 0, down: null, cyc: 0, out: 0, defMade: 0, defFound: 0,
        acc: { proc: 0, idle: 0, blocked: 0, nomat: 0, down: 0, maint: 0, micro: 0 },
        ls: {}, inc: {}, miss: null, lastColor: -1,
      };
      if (def.consumes) for (const k in def.consumes) { st.ls[k] = 9; st.inc[k] = 0; }
      s.st[def.id] = st;
    }
    for (const L of LINE_ORDER) s.occ[L] = new Array(LINES[L].nodes.length).fill(0);
    for (const m of MATERIALS) { s.inv[m.id] = m.init; s.leadMul[m.id] = 1; s.leadUntil[m.id] = 0; s.rop[m.id] = m.rop; }
    for (let i = 0; i < AGV_COUNT; i++) {
      const p = AGV_PARK[i];
      s.agvs.push({ id: i + 1, m: 0, x: p.x, z: p.z, at: p, path: [], pi: 0, task: 0, load: 0, mat: null, w: 0, idle: 0, parked: true, down: 0, hdg: Math.PI / 2 });
    }
    for (let i = 0; i < CARRIERS; i++) s.carriers.push({ id: i + 1, m: 0, t: 0, r: -1, cars: [], tDep: 0 });
    for (let i = 0; i < 46; i++) sim._newOrder();
    // warm-up: fill the line with WIP before the twin goes "live" at 06:00
    while (s.t < 0) sim.step(1);
    s.noFail = false;
    const k = s.kpi;
    for (const key in k) k[key] = 0;
    for (const def of STATION_LIST) {
      const st = s.st[def.id];
      st.acc = { proc: 0, idle: 0, blocked: 0, nomat: 0, down: 0, maint: 0, micro: 0 };
      st.out = 0; st.defMade = 0; st.defFound = 0; st.cyc = 0;
    }
    // seed a few developing faults so the predictive layer has something to find
    const seedFault = (id, margin, wearMul, mode) => {
      const st = s.st[id]; st.failAt = 0.16; st.h = 0.16 + margin; st.wear = (1 / 900) * wearMul; st.mode = mode;
    };
    seedFault('BIW-30', 0.2, 3.2, 0);
    seedFault('PNT-50', 0.3, 1.8, 0);
    seedFault('GA-40', 0.38, 1.6, 0);
    seedFault('STP-30', 0.42, 1.5, 1);
    seedFault('BAT-20', 0.46, 1.5, 0);
    return sim;
  }

  clone() { return new FactorySim(structuredClone(this.s)); }

  // deterministic RNG (state lives in s.seed so forks diverge only when reseeded)
  r() {
    const s = this.s;
    let t = (s.seed = (s.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  u(a, b) { return a + (b - a) * this.r(); }
  _wear() { return 1 / this.u(750, 2600); }
  emit(type, sev, msg, ref) { if (this.onEvent) this.onEvent({ t: this.s.t, type, sev, msg, ref }); }

  // ------------------------------------------------------------------ step
  step(dt) {
    const s = this.s;
    s.t += dt; this._dt = dt;
    let sdt = 0;
    if (s.t - s.slowT >= 1) { sdt = s.t - s.slowT; s.slowT = s.t; }
    if (sdt) { this._orders(); this._supply(); }
    this._maint(dt);
    for (const L of LINE_ORDER) this._line(L, dt);
    this._agvs(dt, sdt);
    if (sdt) this._logistics(sdt);
    this._account(dt);
  }

  // ---------------------------------------------------------------- orders
  _newOrder(opts = {}) {
    const s = this.s;
    const pick = arr => { let x = this.r(), i = 0; for (; i < arr.length - 1; i++) { x -= arr[i].share; if (x < 0) break; } return i; };
    const id = s.orderSeq++;
    const o = {
      id, v: pick(VARIANTS), c: pick(COLORS), r: Math.floor(this.r() * REGIONS.length),
      t0: s.t, due: s.t + (opts.tight ? 3.1 : 4.4) * 3600 + Math.min(s.queue.length, 160) * 62, st: 'queued', stock: !!opts.stock,
    };
    s.orders[id] = o;
    s.queue.push(id);
    return o;
  }
  _orders() {
    const s = this.s;
    if (s.demandUntil && s.t > s.demandUntil) { s.demandMul = 1; s.demandUntil = 0; }
    let guard = 0;
    while (s.t >= s.nextOrderT && guard++ < 20) {
      if (s.queue.length < 420) this._newOrder();
      s.nextOrderT += -Math.log(1 - this.r()) * 3600 / (PLAN_JPH * 0.98 * s.demandMul);
    }
    if (s.t - s.shiftStart >= SHIFT_SEC) {
      s.shiftStart += SHIFT_SEC; s.shiftNo++; s.kpi.shiftMade = 0;
      this.emit('shift', 0, `Shift ${((s.shiftNo - 1) % 3) + 1} handover — counters reset`);
    }
  }
  _pickOrder() {
    const s = this.s;
    if (!s.queue.length) this._newOrder({ stock: true });
    let k = 0;
    if (s.pol.colorBatch && s.lastColor >= 0 && s.orders[s.queue[0]].c !== s.lastColor && s.orders[s.queue[0]].due - s.t > 5400) {
      const n = Math.min(8, s.queue.length);
      for (let j = 1; j < n; j++) if (s.orders[s.queue[j]].c === s.lastColor) { k = j; break; }
    }
    const o = s.orders[s.queue.splice(k, 1)[0]];
    s.lastColor = o.c;
    return o;
  }

  // ---------------------------------------------------------------- supply
  order(mat, qty, expedite) {
    const s = this.s, m = MAT[mat];
    let lead = m.lead * 3600 * s.leadMul[mat];
    lead *= this.r() < m.rel ? this.u(0.92, 1.08) : this.u(1.3, 1.85);
    if (expedite) { lead = m.lead * 3600 * 0.28 * this.u(0.9, 1.1); s.kpi.expedites++; s.kpi.cExp += qty * m.cost * 0.16; }
    s.kpi.cMat += qty * m.cost;
    const po = { id: s.poSeq++, mat, qty, t0: s.t, eta: s.t + lead, plan: s.t + m.lead * 3600, st: 0, exp: !!expedite, dock: -1, tDock: 0 };
    s.pos.push(po);
    return po;
  }
  onOrder(mat) { let q = 0; for (const po of this.s.pos) if (po.mat === mat && po.st !== 2) q += po.qty; return q; }
  _supply() {
    const s = this.s;
    for (const m of MATERIALS) {
      if (s.leadUntil[m.id] && s.t > s.leadUntil[m.id]) { s.leadMul[m.id] = 1; s.leadUntil[m.id] = 0; }
      if (s.inv[m.id] + this.onOrder(m.id) <= s.rop[m.id]) {
        const po = this.order(m.id, m.lot, false);
        this.emit('po', 0, `PO-${po.id} released: ${m.lot} sets ${m.name} → ${m.supplier}`, m.id);
      }
    }
    for (let i = s.pos.length - 1; i >= 0; i--) {
      const po = s.pos[i];
      if (po.st === 0 && po.dock < 0 && s.t >= po.eta - 80) { // reserve a dock while the truck is on approach
        const used = new Set(); for (const q of s.pos) if (q.dock >= 0 && q.st < 2) used.add(q.dock);
        for (let k = 0; k < DOCKS.length; k++) if (!used.has(k)) { po.dock = k; po.tApp = Math.max(s.t, po.eta - 80); break; }
      }
      if (po.st === 0 && s.t >= po.eta && po.dock >= 0 && s.t >= po.tApp + 78) { po.st = 1; po.tDock = s.t; } else if (po.st === 1 && s.t >= po.tDock + 210) {
        s.inv[po.mat] += po.qty; po.st = 2; po.tDone = s.t;
        this.emit('recv', 0, `Goods receipt: ${po.qty} sets ${MAT[po.mat].name} at dock ${po.dock + 1}`, po.mat);
      } else if (po.st === 2 && s.t > po.tDone + 90) s.pos.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ maintenance
  requestMaint(id, kind) {
    const s = this.s, st = s.st[id];
    if (st.down && st.down.kind !== 'micro') return 0;
    const rem = kind === 'pm' ? this.u(250, 380) : kind === 'calib' ? this.u(110, 170) : this.u(900, 1500);
    st.down = { kind, rem, total: rem, crew: false, reqT: s.t, wo: s.woSeq++ };
    s.kpi.cMaint += kind === 'pm' ? 1800 : kind === 'calib' ? 350 : 9500;
    return st.down.wo;
  }
  _fail(def, st) {
    this.requestMaint(def.id, 'fail');
    this.s.kpi.failures++;
    const f = EQUIP[def.eq].faults[st.mode];
    this.emit('fail', 3, `BREAKDOWN ${def.id} ${def.name} — ${f.name}`, def.id);
  }
  _maint(dt) {
    const s = this.s;
    for (let pass = 0; pass < 2; pass++) {
      for (const def of STATION_LIST) {
        const st = s.st[def.id], d = st.down;
        if (!d) continue;
        if (pass === 0) {
          if (d.kind === 'micro') { d.rem -= dt; if (d.rem <= 0) st.down = null; continue; }
          if (d.crew) { d.rem -= dt; if (d.rem <= 0) this._maintDone(def, st); continue; }
          if (d.kind === 'fail' && s.crewFree > 0) { d.crew = true; s.crewFree--; }
        } else if (!d.crew && d.kind !== 'micro' && s.crewFree > 0) { d.crew = true; s.crewFree--; }
      }
    }
  }
  _maintDone(def, st) {
    const s = this.s, kind = st.down.kind;
    if (kind === 'calib') { st.drift = 0; s.kpi.calib++; }
    else {
      st.h = this.u(0.93, 1); st.failAt = this.u(0.1, 0.22); st.mode = Math.floor(this.r() * 3); st.wear = this._wear(); st.drift = 0;
      if (kind === 'pm') s.kpi.pm++;
    }
    st.down = null; s.crewFree++;
    this.emit('fixed', 1, `${def.id} back in service (${kind === 'fail' ? 'breakdown repair' : kind === 'pm' ? 'planned maintenance' : 'recalibration'} complete)`, def.id);
  }

  // ------------------------------------------------------------------ lines
  _line(L, dt) {
    const s = this.s, def = LINES[L], nodes = def.nodes, occ = s.occ[L], ents = s.ents;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const nd = nodes[i], id = occ[i];
      if (nd.buf) {
        if (id) {
          const e = ents[id];
          if (e.m === 0) { e.t -= dt; if (e.t <= 0) e.m = 3; }
          if (e.m === 3) this._advance(L, i, e);
        }
        continue;
      }
      const st = s.st[nd.id];
      let state = 'idle';
      if (id) {
        const e = ents[id];
        if (e.m === 0) { e.t -= dt; if (e.t <= 0) e.m = 1; }
        if (e.m === 1 && !st.down) {
          const miss = this._canStart(nd, st, e);
          st.miss = miss;
          if (!miss) this._start(nd, st, e); else state = 'nomat';
        }
        if (e.m === 2) {
          state = 'proc';
          if (!st.down) {
            e.t -= dt;
            if (!s.noFail && this.r() < 0.4 * dt / 3600) st.down = { kind: 'micro', rem: this.u(20, 60) };
            if (e.t <= 0) this._finish(nd, st, e);
          }
        }
        if (e.m === 3 && !this._advance(L, i, e)) state = 'blocked';
      }
      if (st.down) state = st.down.kind === 'fail' ? 'down' : st.down.kind === 'micro' ? 'micro' : 'maint';
      else if (!s.noFail && st.h <= st.failAt) { this._fail(nd, st); state = 'down'; }
      st.state = state;
      st.acc[state] += dt;
    }
    if (!occ[0]) this._spawn(L);
  }
  _spawn(L) {
    const s = this.s, def = LINES[L];
    const d = def.dist[0] / def.speed;
    const e = { id: s.nextId++, L, i: 0, m: 0, t: d, d, sd: 0, def: [], t0: s.t, ftt: true };
    if (L === 'main') { const o = this._pickOrder(); e.o = o.id; e.c = o.c; e.v = o.v; e.r = o.r; o.st = 'wip'; o.car = e.id; }
    s.ents[e.id] = e; s.occ[L][0] = e.id;
  }
  _canStart(nd, st, e) {
    if (nd.consumes) for (const k in nd.consumes) if (st.ls[k] < nd.consumes[k]) return k;
    if (nd.needs) for (const k in nd.needs) {
      const q = nd.needs[k] === 'motors' ? VARIANTS[e.v].motors : nd.needs[k];
      if (this.s.cnt[k] < q) return k;
    }
    return null;
  }
  _start(nd, st, e) {
    const s = this.s;
    if (nd.consumes) for (const k in nd.consumes) st.ls[k] -= nd.consumes[k];
    if (nd.needs) for (const k in nd.needs) s.cnt[k] -= nd.needs[k] === 'motors' ? VARIANTS[e.v].motors : nd.needs[k];
    let t = nd.cycle / s.rate * this.u(0.95, 1.05);
    if (nd.zone === 'ga') t *= VARIANTS[e.v].gaMul;
    if (nd.id === 'PNT-50') {
      if (st.lastColor >= 0 && st.lastColor !== e.c) { t += 22; s.kpi.purges++; }
      st.lastColor = e.c;
    }
    if (nd.id === 'BIW-10') { // carry over any stamping defect with the panel set
      let worst = null, pw = 0;
      for (const sd of LINES.stamp.nodes) if (!sd.buf) { const x = s.st[sd.id]; const p = 0.12 * x.drift + 0.04 * (1 - x.h) ** 2; if (p > pw) { pw = p; worst = sd.id; } }
      if (worst && this.r() < pw + 0.002) { e.def.push(worst); s.st[worst].defMade++; }
    }
    if (nd.inspect) {
      let n = 0;
      for (let k = e.def.length - 1; k >= 0; k--) {
        const src = e.def[k];
        if (nd.inspect.includes(STATIONS[src].zone)) { n++; s.st[src].defFound++; e.def.splice(k, 1); }
      }
      if (n) {
        t += 80 * n; e.rw = (e.rw || 0) + n;
        if (e.L === 'main') { if (e.ftt) s.kpi.rework++; e.ftt = false; if ((nd.zone === 'body' || nd.zone === 'paint') && this.r() < 0.05) e.scrap = true; }
      }
    }
    e.m = 2; e.t = t; e.d = t;
  }
  _finish(nd, st, e) {
    const s = this.s;
    st.h -= st.wear * s.rate * s.rate; st.cyc++; st.out++;
    const p = 0.002 + 0.13 * st.drift + 0.035 * (1 - st.h) ** 3;
    if (!nd.inspect && this.r() < p) { e.def.push(nd.id); st.defMade++; }
    e.sd = nd.sidx + 1; e.m = 3;
    (e.ts || (e.ts = [])).push(Math.round(s.t));       // genealogy: when each station was completed
    if (e.scrap) {
      s.kpi.scrap++;
      const o = s.orders[e.o]; if (o) { o.st = 'queued'; s.queue.unshift(o.id); }
      this.emit('scrap', 2, `Unit scrapped at ${nd.id} — order ${e.o} re-queued`, nd.id);
      s.occ[e.L][e.i] = 0; delete s.ents[e.id];
    }
  }
  _advance(L, i, e) {
    const s = this.s, def = LINES[L], occ = s.occ[L];
    if (!s.ents[e.id]) return true;
    if (i === def.nodes.length - 1) {
      if (def.sink.counter) {
        const c = def.sink.counter;
        if (s.cnt[c] >= def.sink.cap) return false;
        s.cnt[c]++; occ[i] = 0; delete s.ents[e.id];
        return true;
      }
      const slot = s.yard.indexOf(0);
      if (slot < 0) { s.kpi.yardBlockSec += this._dt; return false; }
      s.yard[slot] = e.id;
      s.ycars[e.id] = { id: e.id, c: e.c, v: e.v, r: e.r, o: e.o, slot, tIn: s.t };
      const o = s.orders[e.o]; if (o) o.st = 'yard';
      const k = s.kpi; k.made++; k.shiftMade++; k.fttN++; if (e.ftt) k.fttOk++; k.leadSum += s.t - e.t0; k.leadN++;
      s.exits.push(s.t); if (s.exits.length > 160) s.exits.shift();
      s.recent.unshift({ id: e.id, o: e.o, c: e.c, v: e.v, t: s.t, ftt: e.ftt, lead: s.t - e.t0 }); if (s.recent.length > 10) s.recent.pop();
      occ[i] = 0; delete s.ents[e.id];
      return true;
    }
    if (occ[i + 1]) return false;
    occ[i + 1] = e.id; occ[i] = 0; e.i = i + 1; e.m = 0;
    e.t = e.d = def.dist[i + 1] / def.speed;
    return true;
  }

  // ------------------------------------------------------------------- AGVs
  _agvs(dt, sdt) {
    const s = this.s, k = s.kpi;
    if (sdt) {
      for (const def of STATION_LIST) {
        if (!def.consumes) continue;
        const st = s.st[def.id];
        for (const mat in def.consumes) {
          if (st.ls[mat] + st.inc[mat] <= 4) {
            s.tasks.push({ id: s.taskSeq++, st: def.id, mat, qty: s.tote, t0: s.t, agv: 0 });
            st.inc[mat] = s.tote;
          }
        }
      }
      // dispatch
      let open = null;
      for (const tk of s.tasks) if (!tk.agv && s.inv[tk.mat] > 0) (open || (open = [])).push(tk);
      if (open) {
        if (s.pol.agvPriority) open.sort((a, b) => s.st[a.st].ls[a.mat] - s.st[b.st].ls[b.mat] || a.t0 - b.t0);
        for (const tk of open) {
          let best = null, bd = 1e9;
          const pick = MAT[tk.mat].pick;
          for (const a of s.agvs) if (a.m === 0 && !a.down) { const d = Math.abs(a.x - pick.x) + Math.abs(a.z - pick.z); if (d < bd) { bd = d; best = a; } }
          if (!best) break;
          tk.agv = best.id; best.task = tk.id; best.m = 1; best.parked = false; best.idle = 0;
          best.path = route(best.at, pick); best.pi = 0; best.at = pick;
        }
      }
    }
    for (const a of s.agvs) {
      if (a.down) { if (s.t >= a.down) a.down = 0; else continue; }
      k.agvTime += dt;
      if (a.m === 0) {
        a.idle += dt;
        if (!a.parked && a.idle > 40) { const p = AGV_PARK[a.id - 1]; a.path = route(a.at, p); a.pi = 0; a.at = p; a.m = 5; }
        continue;
      }
      if (a.m !== 5) k.agvBusy += dt;
      const tk = a.task ? s.tasks.find(x => x.id === a.task) : null;
      if (a.m === 1) {
        if (this._moveAgv(a, dt)) { a.m = 2; a.w = 9; }
      } else if (a.m === 2) {
        a.w -= dt;
        if (a.w <= 0) {
          const q = tk ? Math.min(tk.qty, s.inv[tk.mat]) : 0;
          if (q <= 0) { this._dropTask(a, tk); continue; }
          s.inv[tk.mat] -= q; a.load = q; a.mat = tk.mat;
          const d = STATIONS[tk.st].drop, to = { x: d[0], z: d[1], a: d[2] };
          a.path = route(a.at, to); a.pi = 0; a.at = to; a.m = 3;
        }
      } else if (a.m === 3) {
        if (this._moveAgv(a, dt)) { a.m = 4; a.w = 9; }
      } else if (a.m === 4) {
        a.w -= dt;
        if (a.w <= 0) {
          if (tk) { const st = s.st[tk.st]; st.ls[tk.mat] += a.load; st.inc[tk.mat] = 0; s.tasks.splice(s.tasks.indexOf(tk), 1); }
          a.load = 0; a.mat = null; a.task = 0; a.m = 0; a.idle = 0;
        }
      } else if (a.m === 5) {
        if (this._moveAgv(a, dt)) { a.m = 0; a.parked = true; a.idle = 0; }
      }
    }
  }
  _dropTask(a, tk) {
    const s = this.s;
    if (tk) { s.st[tk.st].inc[tk.mat] = 0; s.tasks.splice(s.tasks.indexOf(tk), 1); }
    if (a.load && a.mat) s.inv[a.mat] += a.load;
    a.load = 0; a.mat = null; a.task = 0; a.m = 0; a.idle = 0;
  }
  _moveAgv(a, dt) {
    let rem = AGV_SPEED * dt;
    while (rem > 0 && a.pi < a.path.length) {
      const p = a.path[a.pi], dx = p[0] - a.x, dz = p[1] - a.z, d = Math.hypot(dx, dz);
      if (d > 0.01) a.hdg = Math.atan2(dx, dz);
      if (d <= rem) { a.x = p[0]; a.z = p[1]; rem -= d; a.pi++; }
      else { a.x += dx / d * rem; a.z += dz / d * rem; rem = 0; }
    }
    return a.pi >= a.path.length;
  }
  agvOutage(n, sec) {
    const s = this.s; let k = 0;
    for (const a of s.agvs) {
      if (k >= n) break;
      if (a.down) continue;
      const tk = a.task ? s.tasks.find(x => x.id === a.task) : null;
      this._dropTask(a, tk);
      a.at = { x: a.x, z: a.z, a: Math.abs(a.x - TRUNK_X) < 0.5 ? null : nearestAisle(a.z) };
      if (a.at.a === null) a.at.x = TRUNK_X;
      a.parked = false; a.down = s.t + sec; k++;
    }
  }

  // -------------------------------------------------------------- outbound
  _logistics(sdt) {
    const s = this.s, k = s.kpi;
    for (const c of s.carriers) {
      if (c.m === 0) {
        if (s.t < s.carrierBlockUntil) continue;
        const n = new Array(REGIONS.length).fill(0), oldest = new Array(REGIONS.length).fill(1e12), slack = new Array(REGIONS.length).fill(1e12);
        for (const id in s.ycars) {
          const y = s.ycars[id]; if (s.t < y.tIn + 30) continue;
          n[y.r]++; if (y.tIn < oldest[y.r]) oldest[y.r] = y.tIn;
          const o = s.orders[y.o]; if (o) { const sl = o.due - s.t - REGIONS[y.r].transit * 3600; if (sl < slack[y.r]) slack[y.r] = sl; }
        }
        let best = -1, bs = 0;
        for (let r = 0; r < REGIONS.length; r++) {
          if (!n[r] || s.carriers.some(x => x !== c && (x.m === 1 || x.m === 2) && x.r === r)) continue;
          let score = 0;
          if (n[r] >= 8) score = 100 + n[r];
          else if (n[r] >= 3 && s.t - oldest[r] > 2400) score = 50 + n[r];
          else if (s.pol.smartDispatch && n[r] >= 2 && slack[r] < 900) score = 70 + n[r];
          if (score > bs) { bs = score; best = r; }
        }
        if (best >= 0) { c.m = 1; c.t = 50; c.r = best; c.cars = []; }
      } else if (c.m === 1) {
        c.t -= sdt; if (c.t <= 0) { c.m = 2; c.t = 8; }
      } else if (c.m === 2) {
        c.t -= sdt;
        if (c.t <= 0) {
          let pick = null, key = 1e15;
          for (const id in s.ycars) {
            const y = s.ycars[id]; if (y.r !== c.r || s.t < y.tIn + 30) continue;
            const o = s.orders[y.o]; const kx = s.pol.smartDispatch && o ? o.due : y.tIn;
            if (kx < key) { key = kx; pick = y; }
          }
          if (pick && c.cars.length < 8) {
            s.yard[pick.slot] = 0; delete s.ycars[pick.id];
            c.cars.push({ c: pick.c, o: pick.o });
            const o = s.orders[pick.o]; if (o) o.st = 'transit';
            c.t = 9;
          }
          if (!pick || c.cars.length >= 8) {
            if (c.cars.length) { c.m = 3; c.t = REGIONS[c.r].transit * 3600; c.tDep = s.t; this.emit('ship', 0, `Carrier C${c.id} departed for ${REGIONS[c.r].name} with ${c.cars.length} vehicles`); }
            else c.m = 0;
          }
        }
      } else if (c.m === 3) {
        c.t -= sdt;
        if (c.t <= 0) {
          for (const x of c.cars) { const o = s.orders[x.o]; k.delivered++; if (!o || s.t <= o.due) k.onTime++; delete s.orders[x.o]; }
          c.n = c.cars.length; c.cars = []; c.m = 4; c.t = REGIONS[c.r].transit * 3600 * 0.45;
        }
      } else if (c.m === 4) { c.t -= sdt; if (c.t <= 0) c.m = 0; }
    }
  }

  // ------------------------------------------------------------- accounting
  price() {
    const s = this.s;
    if (s.priceUntil && s.t > s.priceUntil) { s.priceMul = 1; s.priceUntil = 0; }
    const h = (((s.t + 6 * 3600) % 86400) + 86400) % 86400 / 3600;
    return (h >= 17 && h < 20 ? 0.21 : 0.11) * s.priceMul;
  }
  _account(dt) {
    const s = this.s, k = s.kpi;
    let P = 2400;
    for (const def of STATION_LIST) {
      const st = s.st[def.id], pw = EQUIP[def.eq].power;
      if (st.state === 'proc') P += pw[1] * s.rate;
      else if (st.state === 'down' || st.state === 'maint') { P += pw[0] * 0.5; k.downSec += dt; }
      else { P += def.eq === 'oven' ? pw[1] * 0.85 : pw[0]; if (st.state === 'nomat') k.shortSec += dt; }
    }
    k.power = P;
    const kwh = P * dt / 3600;
    k.energy += kwh; k.cEnergy += kwh * this.price();
  }

  // ---------------------------------------------------------------- queries
  readSensors(id) {
    const live = this.ext[id];                       // readings pushed in from a real data feed win over the model
    if (live && Date.now() - live.at < 120000) return live.v.slice();
    const def = STATIONS[id], st = this.s.st[id], eq = EQUIP[def.eq];
    const sev = Math.pow(Math.max(0, 1 - st.h), 1.3), f = eq.faults[st.mode];
    return eq.sensors.map((sn, i) => sn.base * (1 + f.sig[i] * sev) * (1 + sn.noise * gauss()));
  }
  jph(win = 1800) {
    const s = this.s; let n = 0;
    for (let i = s.exits.length - 1; i >= 0 && s.exits[i] > s.t - win; i--) n++;
    return n * 3600 / Math.min(win, Math.max(300, s.t + WARMUP));
  }
  wip() { let n = 0; for (const id in this.s.ents) if (this.s.ents[id].L === 'main') n++; return n; }
  shiftElapsed() { return this.s.t - this.s.shiftStart; }
  planNow() { return PLAN_JPH * this.shiftElapsed() / 3600; }
  lineSide(mat) { const st = this.s.st[MAT[mat].at]; return st.ls[mat] || 0; }
  yardCount() { let n = 0; for (const v of this.s.yard) if (v) n++; return n; }
}

function nearestAisle(z) {
  let best = -30, bd = 1e9;
  for (const a of [-30, 10, 37.5, 67.5]) { const d = Math.abs(a - z); if (d < bd) { bd = d; best = a; } }
  return best;
}
