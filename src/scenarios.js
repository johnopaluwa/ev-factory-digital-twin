// Disruption scenarios. Each one mutates a simulation through its public state,
// so the same scenario can be injected into the live twin or into a forked
// what-if run.

export const SCENARIOS = [
  {
    id: 'robotFail', icon: '⚡', name: 'Critical robot failure', where: 'BIW-30 Framing & Roof', focus: 'BIW-30',
    desc: 'A framing robot gearbox seizes without warning. Tests breakdown response and buffer strategy.',
    apply(sim) {
      const s = sim.s, st = s.st['BIW-30'];
      if (st.down && st.down.kind === 'fail') return;
      if (st.down && st.down.crew) s.crewFree++;   // a planned job in progress is overtaken by the failure
      st.down = null; st.h = st.failAt - 0.01;
    },
  },
  {
    id: 'wear', icon: '📈', name: 'Accelerated wear', where: 'PNT-50 Base Coat atomizer', focus: 'PNT-50',
    desc: 'A bell atomizer bearing starts degrading 10× faster. Tests early diagnosis and remaining-life prediction.',
    apply(sim) { const st = sim.s.st['PNT-50']; st.mode = 0; st.failAt = 0.16; st.h = Math.min(st.h, 0.5); st.wear = 1 / 95; },
  },
  {
    id: 'supplier', icon: '🚚', name: 'Supplier disruption', where: 'Li-ion cells delayed 3 h', focus: 'BAT-10',
    desc: 'The cell supplier misses its slot: open orders slip 3 hours and lead times double. Tests procurement response.',
    apply(sim) {
      const s = sim.s;
      for (const po of s.pos) if (po.mat === 'cells' && po.st === 0) po.eta += 3 * 3600;
      s.leadMul.cells = 2; s.leadUntil.cells = s.t + 6 * 3600;
      s.inv.cells = Math.min(s.inv.cells, 55);
    },
  },
  {
    id: 'quality', icon: '🎯', name: 'Process drift', where: 'BIW-20 Side Frames weld', focus: 'BIW-20',
    desc: 'Weld parameters drift out of tolerance and start producing defects. Tests closed-loop quality control.',
    apply(sim) { sim.s.st['BIW-20'].drift = 0.95; },
  },
  {
    id: 'demand', icon: '📦', name: 'Demand surge', where: '+40% orders for 4 h', focus: null,
    desc: 'A fleet order lands: 45 rush orders now and +40% order intake for four hours. Tests schedule recovery.',
    apply(sim) { const s = sim.s; for (let i = 0; i < 45; i++) sim._newOrder({ tight: true }); s.demandMul = 1.4; s.demandUntil = s.t + 4 * 3600; },
  },
  {
    id: 'agv', icon: '🤖', name: 'AGV fleet outage', where: '7 of 10 AGVs offline 45 min', focus: null,
    desc: 'A fleet-manager fault takes most AGVs offline. Tests line-side replenishment under scarcity.',
    apply(sim) { sim.agvOutage(7, 45 * 60); },
  },
  {
    id: 'energy', icon: '💡', name: 'Energy price spike', where: 'Grid price ×3 for 2 h', focus: null,
    desc: 'Wholesale electricity triples. Tests cost-aware rate control.',
    apply(sim) { sim.s.priceMul = 3; sim.s.priceUntil = sim.s.t + 2 * 3600; },
  },
  {
    id: 'carrier', icon: '🚛', name: 'Outbound carrier strike', where: 'No dispatch for 75 min', focus: null,
    desc: 'No car carriers arrive for 75 minutes, so the yard fills up. Tests end-of-line blocking avoidance.',
    apply(sim) { sim.s.carrierBlockUntil = sim.s.t + 75 * 60; },
  },
  {
    id: 'booth', icon: '🎨', name: 'Paint booth contamination', where: 'PNT-60 Clear Coat', focus: 'PNT-60',
    desc: 'Filter breakthrough contaminates the clear-coat booth: dirt inclusions on every few bodies.',
    apply(sim) { const st = sim.s.st['PNT-60']; st.drift = 1; st.mode = 1; st.h = Math.min(st.h, 0.45); },
  },
];
export const SCENARIO = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));
