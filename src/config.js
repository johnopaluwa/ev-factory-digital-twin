// Static description of the plant: layout, lines, stations, equipment models,
// materials, product mix. Everything dynamic lives in the simulation state.

export const TAKT = 61;            // ideal seconds per vehicle at rate 1.0
export const PLAN_JPH = 46;        // planned jobs per hour
export const SHIFT_SEC = 8 * 3600;
export const DAY_START = 6 * 3600; // sim t=0 is 06:00

export const HALL = { x0: -150, x1: 130, z0: -70, z1: 74, h: 14 };
export const TRUNK_X = -118;       // north-south AGV trunk aisle
export const AISLES = [-30, 10, 37.5, 67.5];

export const ZONES = {
  inbound:  { name: 'Inbound & Warehouse', short: 'Inbound',  color: '#3987e5' },
  stamping: { name: 'Press Shop',          short: 'Stamping', color: '#9aa7b8' },
  body:     { name: 'Body Shop',           short: 'Body',     color: '#d95926' },
  paint:    { name: 'Paint Shop',          short: 'Paint',    color: '#9085e9' },
  battery:  { name: 'Battery Pack Line',   short: 'Battery',  color: '#199e70' },
  drive:    { name: 'Drive Unit Line',     short: 'Drive',    color: '#2ec4d6' },
  ga:       { name: 'General Assembly',    short: 'Assembly', color: '#c98500' },
  eol:      { name: 'End-of-Line Test',    short: 'EOL',      color: '#d55181' },
  yard:     { name: 'Yard & Delivery',     short: 'Delivery', color: '#8be9fd' },
};

// ---- product ---------------------------------------------------------------
export const VARIANTS = [
  { code: 'SR', name: 'Standard Range RWD', motors: 1, share: 0.40, gaMul: 1.00, kwh: 60 },
  { code: 'LR', name: 'Long Range AWD',     motors: 2, share: 0.40, gaMul: 1.04, kwh: 82 },
  { code: 'PF', name: 'Performance AWD',    motors: 2, share: 0.20, gaMul: 1.08, kwh: 82 },
];
export const COLORS = [
  { name: 'Glacier White',  hex: 0xe6eaee, share: 0.26 },
  { name: 'Obsidian Black', hex: 0x16181b, share: 0.20 },
  { name: 'Tungsten Grey',  hex: 0x596270, share: 0.18 },
  { name: 'Cobalt Blue',    hex: 0x1d4da6, share: 0.14 },
  { name: 'Signal Red',     hex: 0xb0151a, share: 0.12 },
  { name: 'Aurora Green',   hex: 0x1b6652, share: 0.10 },
];
export const REGIONS = [
  { name: 'Central Hub', transit: 0.30 },
  { name: 'North',       transit: 0.45 },
  { name: 'West',        transit: 0.50 },
  { name: 'South',       transit: 0.60 },
  { name: 'Export Port', transit: 0.35 },
];

// ---- equipment models (sensor signatures used for diagnosis) ----------------
// sig[i] = relative shift of sensor i at full severity for that fault mode.
export const EQUIP = {
  press: {
    label: 'Servo press', power: [35, 380],
    sensors: [
      { name: 'Ram tonnage', unit: 'kN', base: 8200, noise: 0.006 },
      { name: 'Hydraulic pressure', unit: 'bar', base: 285, noise: 0.006 },
      { name: 'Oil temperature', unit: '°C', base: 46, noise: 0.008 },
      { name: 'Frame vibration', unit: 'mm/s', base: 2.1, noise: 0.03 },
    ],
    faults: [
      { name: 'Hydraulic seal leak', sig: [-0.06, -0.24, 0.26, 0.15], fix: 'Replace cylinder seal kit, top up & bleed circuit' },
      { name: 'Die wear / galling', sig: [0.16, 0.04, 0.08, 0.55], fix: 'Pull die, polish & re-coat forming surfaces' },
      { name: 'Main drive bearing wear', sig: [0.03, 0.0, 0.3, 0.9], fix: 'Replace main drive bearing, re-align ram' },
    ],
  },
  robot: {
    label: '6-axis robot cell', power: [18, 95],
    sensors: [
      { name: 'Axis-2 motor current', unit: 'A', base: 14.5, noise: 0.012 },
      { name: 'Gearbox vibration', unit: 'mm/s', base: 1.6, noise: 0.03 },
      { name: 'Joint temperature', unit: '°C', base: 52, noise: 0.008 },
      { name: 'Weld / tool resistance', unit: 'µΩ', base: 118, noise: 0.012 },
    ],
    faults: [
      { name: 'Reducer (RV gearbox) wear', sig: [0.22, 0.95, 0.2, 0.0], fix: 'Swap axis-2 reducer, re-master robot' },
      { name: 'Weld-tip / tool degradation', sig: [0.1, 0.05, 0.06, 0.6], fix: 'Tip-dress and replace electrode caps' },
      { name: 'Servo drive overheating', sig: [0.35, 0.1, 0.45, 0.02], fix: 'Clean cabinet filters, replace drive fan' },
    ],
  },
  dip: {
    label: 'E-coat dip tank', power: [60, 150],
    sensors: [
      { name: 'Rectifier current', unit: 'A', base: 820, noise: 0.008 },
      { name: 'Bath temperature', unit: '°C', base: 32, noise: 0.004 },
      { name: 'Bath conductivity', unit: 'µS/cm', base: 1450, noise: 0.006 },
      { name: 'Circulation flow', unit: 'm³/h', base: 240, noise: 0.01 },
    ],
    faults: [
      { name: 'Circulation pump impeller wear', sig: [0.04, 0.12, 0.02, -0.35], fix: 'Replace pump impeller and mechanical seal' },
      { name: 'Anode cell fouling', sig: [-0.28, 0.03, 0.2, 0.0], fix: 'Flush anolyte circuit, replace membranes' },
      { name: 'Heat-exchanger scaling', sig: [0.03, 0.2, 0.05, -0.1], fix: 'Descale plate heat exchanger' },
    ],
  },
  oven: {
    label: 'Cure oven', power: [290, 430],
    sensors: [
      { name: 'Zone-2 temperature', unit: '°C', base: 178, noise: 0.004 },
      { name: 'Burner / heater current', unit: 'A', base: 310, noise: 0.008 },
      { name: 'Exhaust flow', unit: 'm³/h', base: 5200, noise: 0.008 },
      { name: 'Recirc fan vibration', unit: 'mm/s', base: 2.4, noise: 0.03 },
    ],
    faults: [
      { name: 'Recirculation fan bearing', sig: [-0.04, 0.05, -0.12, 0.9], fix: 'Replace fan bearing set and balance rotor' },
      { name: 'Heating element degradation', sig: [-0.09, 0.3, 0.0, 0.03], fix: 'Replace heater bank B elements' },
      { name: 'Exhaust filter loading', sig: [0.05, 0.06, -0.32, 0.12], fix: 'Change exhaust filter stage, check damper' },
    ],
  },
  spray: {
    label: 'Spray booth', power: [110, 215],
    sensors: [
      { name: 'Bell atomizer speed', unit: 'krpm', base: 55, noise: 0.006 },
      { name: 'Booth humidity', unit: '%RH', base: 65, noise: 0.008 },
      { name: 'Filter ΔP', unit: 'Pa', base: 180, noise: 0.015 },
      { name: 'Paint flow', unit: 'ml/min', base: 340, noise: 0.01 },
    ],
    faults: [
      { name: 'Bell atomizer bearing wear', sig: [-0.2, 0.0, 0.03, -0.08], fix: 'Replace atomizer turbine cartridge' },
      { name: 'Booth filter clogging', sig: [0.0, 0.07, 0.8, -0.03], fix: 'Replace ceiling & floor filter mats' },
      { name: 'Humidity control drift', sig: [0.0, 0.26, 0.06, 0.05], fix: 'Recalibrate humidifier valve & RH probe' },
    ],
  },
  tool: {
    label: 'Assembly tooling', power: [8, 34],
    sensors: [
      { name: 'Fastening torque', unit: 'Nm', base: 120, noise: 0.008 },
      { name: 'Drive current', unit: 'A', base: 9.2, noise: 0.012 },
      { name: 'Spindle vibration', unit: 'mm/s', base: 1.2, noise: 0.03 },
      { name: 'Tool temperature', unit: '°C', base: 38, noise: 0.008 },
    ],
    faults: [
      { name: 'Torque transducer drift', sig: [-0.14, 0.05, 0.03, 0.02], fix: 'Recalibrate / swap torque transducer' },
      { name: 'Conveyor drive chain stretch', sig: [0.0, 0.3, 0.75, 0.12], fix: 'Re-tension and replace drive chain' },
      { name: 'Spindle gearbox wear', sig: [0.05, 0.22, 0.5, 0.38], fix: 'Replace nutrunner gearbox module' },
    ],
  },
  laser: {
    label: 'Laser cell', power: [15, 95],
    sensors: [
      { name: 'Laser output power', unit: 'kW', base: 4.0, noise: 0.006 },
      { name: 'Chiller return temp', unit: '°C', base: 22, noise: 0.006 },
      { name: 'Back-reflection', unit: '%', base: 3.5, noise: 0.03 },
      { name: 'Seam tracking error', unit: 'µm', base: 28, noise: 0.03 },
    ],
    faults: [
      { name: 'Protective optics contamination', sig: [-0.18, 0.06, 0.9, 0.2], fix: 'Replace cover glass, clean focusing optics' },
      { name: 'Chiller degradation', sig: [-0.06, 0.4, 0.05, 0.05], fix: 'Service chiller compressor, change coolant' },
      { name: 'Scanner galvo drift', sig: [0.0, 0.02, 0.1, 0.95], fix: 'Recalibrate galvo scanner field' },
    ],
  },
  test: {
    label: 'Test & measurement rig', power: [10, 60],
    sensors: [
      { name: 'Reference offset', unit: 'µm', base: 12, noise: 0.03 },
      { name: 'Actuator current', unit: 'A', base: 6.4, noise: 0.012 },
      { name: 'Bearing temperature', unit: '°C', base: 41, noise: 0.008 },
      { name: 'Pump pressure', unit: 'bar', base: 6.2, noise: 0.008 },
    ],
    faults: [
      { name: 'Sensor calibration drift', sig: [0.9, 0.0, 0.02, 0.0], fix: 'Run master-part calibration routine' },
      { name: 'Roller / actuator bearing wear', sig: [0.1, 0.32, 0.42, 0.0], fix: 'Replace bearing cartridge' },
      { name: 'Pump / nozzle clogging', sig: [0.02, 0.15, 0.05, -0.3], fix: 'Clean nozzles, replace pump strainer' },
    ],
  },
};

// ---- lines -----------------------------------------------------------------
const S = (id, name, zone, x, z, cycle, eq, vis, extra = {}) =>
  ({ id, name, zone, pos: [x, 0, z], cycle, eq, vis, ...extra });
const B = (x, z, y = 0) => ({ buf: true, pos: [x, y, z] });

export const LINES = {
  stamp: {
    name: 'Press line', speed: 2, spawn: [-116, 0, -48],
    sink: { counter: 'panels', cap: 14 },
    nodes: [
      S('STP-10', 'Decoil & Blanking', 'stamping', -108, -48, 30, 'press', 'blank', { consumes: { steel: 1 }, drop: [-113, -41, -30] }),
      S('STP-20', 'Press 1 · Draw', 'stamping', -96, -48, 30, 'press', 'press'),
      S('STP-30', 'Press 2 · Trim', 'stamping', -84, -48, 30, 'press', 'press'),
      S('STP-40', 'Press 3 · Flange', 'stamping', -72, -48, 30, 'press', 'press'),
      S('STP-50', 'Press 4 · Pierce', 'stamping', -60, -48, 30, 'press', 'press'),
      B(-49, -48),
    ],
  },
  main: {
    name: 'Vehicle line', speed: 2, spawn: [-38, 0, -48],
    sink: { yard: true },
    nodes: [
      S('BIW-10', 'Underbody Weld', 'body', -30, -48, 50, 'robot', 'weld', { consumes: { alu: 1 }, needs: { panels: 1 }, drop: [-33, -41, -30] }),
      S('BIW-20', 'Side Frames', 'body', -16, -48, 52, 'robot', 'weld'),
      S('BIW-30', 'Framing & Roof', 'body', -2, -48, 54, 'robot', 'weld'),
      S('BIW-40', 'Respot Weld', 'body', 12, -48, 50, 'robot', 'weld'),
      S('BIW-50', 'Closures', 'body', 26, -48, 52, 'robot', 'weld'),
      S('BIW-60', 'Laser Metrology', 'body', 40, -48, 44, 'test', 'metro', { inspect: ['stamping', 'body'] }),
      B(52, -48), B(62, -48), B(72, -48), B(82, -48), B(91, -48), B(100, -48),
      B(100, -36), B(100, -24), B(100, -12),
      S('PNT-10', 'Pretreat & E-Coat', 'paint', 86, -12, 50, 'dip', 'dip'),
      S('PNT-20', 'E-Coat Oven', 'paint', 72, -12, 48, 'oven', 'oven'),
      S('PNT-30', 'Seam Sealing', 'paint', 58, -12, 50, 'robot', 'seal'),
      S('PNT-40', 'Primer', 'paint', 44, -12, 50, 'spray', 'spray'),
      S('PNT-50', 'Base Coat', 'paint', 30, -12, 54, 'spray', 'spray', { consumes: { paint: 1 }, drop: [27, -20, -30] }),
      S('PNT-60', 'Clear Coat', 'paint', 16, -12, 52, 'spray', 'spray'),
      S('PNT-70', 'Cure Oven', 'paint', 2, -12, 48, 'oven', 'oven'),
      S('PNT-80', 'Paint Inspection', 'paint', -12, -12, 42, 'test', 'light', { inspect: ['paint'] }),
      // painted body store: elevated accumulation bridge (AGVs pass underneath)
      B(-24, -12), B(-36, -12, 2.5), B(-48, -12, 5), B(-58, -12, 5),
      B(-58, -2, 5), B(-58, 8, 5), B(-58, 18, 5), B(-58, 28, 5), B(-49, 28, 2.5),
      S('GA-10', 'Cockpit & Harness', 'ga', -40, 28, 52, 'tool', 'cockpit', { consumes: { cockpit: 1 }, drop: [-40, 21, 10] }),
      S('GA-20', 'Glazing', 'ga', -26, 28, 50, 'robot', 'glaze', { consumes: { glass: 1 }, drop: [-30, 21, 10] }),
      S('GA-30', 'Battery & Drive Marriage', 'ga', -12, 28, 54, 'tool', 'marriage', { needs: { packs: 1, dus: 'motors' } }),
      S('GA-40', 'Chassis & Wheels', 'ga', 2, 28, 50, 'robot', 'wheels', { consumes: { wheels: 1 }, drop: [2, 21, 10] }),
      S('GA-50', 'Seats & Doors', 'ga', 16, 28, 53, 'tool', 'seats', { consumes: { seats: 1 }, drop: [21, 21, 10] }),
      S('GA-60', 'Fluid Fill & Software Flash', 'ga', 30, 28, 48, 'tool', 'fill'),
      B(42, 28), B(52, 28),
      S('EOL-10', 'Alignment & ADAS Calibration', 'eol', 64, 28, 46, 'test', 'align'),
      S('EOL-20', 'Roll & Dyno Test', 'eol', 78, 28, 50, 'test', 'dyno'),
      S('EOL-30', 'Water Leak Test', 'eol', 92, 28, 44, 'test', 'water'),
      S('EOL-40', 'Final Quality Audit', 'eol', 106, 28, 46, 'test', 'light', { inspect: ['ga', 'eol', 'battery', 'drive'] }),
      B(119, 28),
    ],
  },
  batt: {
    name: 'Battery line', speed: 1.6, spawn: [-112, 0, 46],
    sink: { counter: 'packs', cap: 4 },
    nodes: [
      S('BAT-10', 'Cell Test & Stacking', 'battery', -104, 46, 46, 'tool', 'cellstack', { consumes: { cells: 1 }, drop: [-100, 40.5, 37.5] }),
      S('BAT-20', 'Module Laser Weld', 'battery', -90, 46, 48, 'laser', 'laser'),
      S('BAT-30', 'Pack Assembly', 'battery', -76, 46, 48, 'robot', 'packasm', { consumes: { bms: 1 }, drop: [-76, 40.5, 37.5] }),
      S('BAT-40', 'Leak & HV Test', 'battery', -62, 46, 44, 'test', 'hvtest', { inspect: ['battery'] }),
      B(-51, 46), B(-41, 46), B(-31, 46), B(-21, 46), B(-12, 46), B(-12, 38),
    ],
  },
  drive: {
    name: 'Drive unit line', speed: 1.6, spawn: [-98, 0, 60],
    sink: { counter: 'dus', cap: 6 },
    nodes: [
      S('DU-10', 'Stator Winding & Rotor', 'drive', -90, 60, 27, 'tool', 'wind', { consumes: { magnets: 1 }, drop: [-90, 65, 67.5] }),
      S('DU-20', 'Inverter & Gearbox Assembly', 'drive', -76, 60, 29, 'robot', 'duasm', { consumes: { sic: 1 }, drop: [-76, 65, 67.5] }),
      S('DU-30', 'Drive Unit EOL Test', 'drive', -62, 60, 26, 'test', 'dutest', { inspect: ['drive'] }),
      B(-51, 60), B(-40, 60), B(-28, 60), B(-16, 60), B(-4, 60), B(-4, 49), B(-4, 38),
    ],
  },
};
export const LINE_ORDER = ['main', 'batt', 'drive', 'stamp'];

// derived lookup tables
export const STATIONS = {};       // id -> station def (+ line, index, sidx)
export const STATION_LIST = [];
for (const L of Object.keys(LINES)) {
  const def = LINES[L];
  let sidx = 0;
  def.dist = [];
  def.nodes.forEach((n, i) => {
    const prev = i === 0 ? def.spawn : def.nodes[i - 1].pos;
    def.dist[i] = Math.hypot(n.pos[0] - prev[0], n.pos[1] - prev[1], n.pos[2] - prev[2]);
    n.line = L; n.idx = i;
    if (!n.buf) { n.sidx = sidx++; STATIONS[n.id] = n; STATION_LIST.push(n); }
    else n.sidx = sidx; // number of stations before this buffer
  });
  def.nStations = sidx;
}
export const COUNTERS = { panels: { name: 'Panel sets', cap: 14 }, packs: { name: 'Battery packs', cap: 4 }, dus: { name: 'Drive units', cap: 6 } };

// ---- materials (inventory tracked in vehicle-sets) ---------------------------
export const MATERIALS = [
  { id: 'steel',   name: 'Steel coil',            supplier: 'Nordstahl',          lead: 2.5, lot: 170, rop: 190, init: 260, cost: 610,  rel: 0.95, per: 0.41, unit: 't',   pz: -52 },
  { id: 'alu',     name: 'Aluminium castings',    supplier: 'Alumet Casting',     lead: 3.0, lot: 170, rop: 220, init: 290, cost: 880,  rel: 0.93, per: 2,    unit: 'pcs', pz: -42 },
  { id: 'paint',   name: 'Basecoat & clear',      supplier: 'ChromaCoat',         lead: 2.0, lot: 170, rop: 160, init: 230, cost: 240,  rel: 0.97, per: 7.5,  unit: 'L',   pz: -14 },
  { id: 'cockpit', name: 'Cockpit & harness',     supplier: 'Lumen Interiors',    lead: 2.0, lot: 160, rop: 160, init: 230, cost: 2100, rel: 0.95, per: 1,    unit: 'pcs', pz: 2 },
  { id: 'glass',   name: 'Glazing set',           supplier: 'Vitro Clear',        lead: 2.5, lot: 170, rop: 190, init: 255, cost: 520,  rel: 0.96, per: 6,    unit: 'pcs', pz: 8 },
  { id: 'wheels',  name: 'Wheels & tyres',        supplier: 'Orbis Wheels',       lead: 2.0, lot: 160, rop: 160, init: 235, cost: 780,  rel: 0.96, per: 4,    unit: 'pcs', pz: 14 },
  { id: 'seats',   name: 'Seat sets',             supplier: 'Lumen Interiors',    lead: 1.5, lot: 140, rop: 130, init: 200, cost: 1650, rel: 0.97, per: 1,    unit: 'pcs', pz: 20 },
  { id: 'cells',   name: 'Li-ion cells',          supplier: 'Helion Cell Co.',    lead: 4.0, lot: 200, rop: 280, init: 350, cost: 7900, rel: 0.90, per: 4416, unit: 'cells', pz: 34 },
  { id: 'bms',     name: 'BMS & busbars',         supplier: 'Kestrel Semi',       lead: 3.5, lot: 190, rop: 250, init: 320, cost: 640,  rel: 0.90, per: 1,    unit: 'kits', pz: 42 },
  { id: 'magnets', name: 'Rotor magnets & copper', supplier: 'Tessera Magnetics', lead: 3.5, lot: 280, rop: 400, init: 500, cost: 1150, rel: 0.92, per: 1,    unit: 'kits', pz: 60 },
  { id: 'sic',     name: 'SiC inverter modules',  supplier: 'Kestrel Semi',       lead: 4.0, lot: 290, rop: 445, init: 540, cost: 1400, rel: 0.88, per: 1,    unit: 'pcs', pz: 68 },
];
export const MAT = {};
for (const m of MATERIALS) {
  MAT[m.id] = m;
  m.at = STATION_LIST.find(s => s.consumes && s.consumes[m.id]).id;
  m.pick = { x: -121, z: m.pz, a: null };
}

// ---- logistics geometry ------------------------------------------------------
export const DOCKS = [-56, -36, -16, 4, 24, 44, 64].map(z => ({ x: -150, z }));
export const AGV_COUNT = 10;
export const AGV_PARK = Array.from({ length: AGV_COUNT }, (_, k) => ({ x: -112, z: -24 + k * 3, a: null }));
export const YARD = { cols: 5, rows: 12, x0: 149, z0: -37, dx: 9, dz: 3.1 };
export const YARD_SLOTS = YARD.cols * YARD.rows;
export const yardSlotPos = i => {
  const c = Math.floor(i / YARD.rows), r = i % YARD.rows;
  return [YARD.x0 + c * YARD.dx, 0, YARD.z0 + r * YARD.dz];
};
export const CARRIER_BAYS = [0, 1, 2, 3, 4].map(r => ({ x: 198 + r * 6, z: 8 })); // one drive-through loading lane per region
export const CARRIERS = 6;
export const CREWS = 3;

export const fmtClock = t => {
  const d = Math.floor((t + DAY_START) / 86400);
  const s = ((t + DAY_START) % 86400 + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` + (d > 0 ? ` +${d}d` : '');
};
export const fmtDur = sec => {
  if (!isFinite(sec)) return '—';
  if (sec < 90) return `${Math.max(0, Math.round(sec))} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
};
