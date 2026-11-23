// Bill of process: for every station, the ordered operations performed during one
// cycle — which components go in, how they are joined, with what tool and to what
// specification. The 3D view plays these operations back against cycle progress.
//
// op fields
//   n      operation name
//   t      [start, end] as a fraction of the station cycle
//   how    joining / process specification
//   tool   equipment performing it
//   parts  [[part number, description, quantity], ...]
//   comps  3D component keys installed by this op (see scene/products.js)
//   from   { key: [dx, dy, dz] } where each component is staged, relative to its installed position
//   by     { key: robotIndex } which robot carries it
//   spots  points on the product (product coordinates) worked by process robots
//   kind   'weld' | 'rivet' | 'laser' | 'seal' | 'bolt' | 'scan' — effect shown at the tool
//   robots robot indices that work the spots (default: all process robots)
//   path   'under' = slides in beneath a raised body, then lifts

const both = pts => pts.flatMap(p => [[p[0], p[1], p[2]], [p[0], p[1], -p[2]]]);
const run = (a, b, n) => Array.from({ length: n }, (_, i) => a.map((v, k) => v + (b[k] - v) * (n === 1 ? 0.5 : i / (n - 1))));
const sill = both(run([-0.9, 0.4, 0.86], [0.9, 0.4, 0.86], 6));
const pillars = both([[1.0, 0.6, 0.9], [1.0, 0.9, 0.9], [0.0, 0.6, 0.9], [0.0, 1.0, 0.9], [-1.0, 0.8, 0.9], [-1.6, 1.0, 0.9]]);
const roofRail = both(run([0.25, 1.46, 0.86], [-1.25, 1.46, 0.86], 6));
const wheelhouse = both([[-1.42, 0.78, 0.8], [-1.75, 0.6, 0.8], [-1.1, 0.6, 0.8], [1.42, 0.8, 0.7], [1.75, 0.6, 0.7]]);
const floorJoints = [...run([-0.95, 0.36, -0.6], [-0.95, 0.36, 0.6], 4), ...run([0.98, 0.36, -0.6], [0.98, 0.36, 0.6], 4), ...sill];

export const PROCESS = {
  // ------------------------------------------------------------- press shop
  'STP-10': [
    { n: 'Decoil & straighten', t: [0, 0.3], how: 'Coil DP600 0.8 mm × 1 520 mm fed through 7-roll leveller, flatness < 2 I-units', tool: 'Decoiler + leveller', parts: [['RM-ST-0812', 'Cold-rolled steel coil DP600, 0.8 mm', '4.9 m']] },
    { n: 'Wash & lubricate', t: [0.3, 0.5], how: 'Brush wash, drawing oil 1.0 g/m² both sides', tool: 'Strip washer' },
    { n: 'Blank cut', t: [0.5, 1], how: 'Servo shear to 4 850 × 1 520 mm, burr < 0.05 mm, double-blank detection', tool: 'Blanking press 800 t', parts: [['BL-5101', 'Body-side outer blank', 1]] },
  ],
  'STP-20': [
    { n: 'Load blank', t: [0, 0.2], how: 'Vacuum-cup crossbar feeder, optical centring ±0.5 mm', tool: 'Transfer feeder' },
    { n: 'Deep draw', t: [0.2, 0.8], how: '2 100 t, draw depth 160 mm, 6-segment binder force control', tool: 'Servo press 1 (draw die)' },
    { n: 'Transfer out', t: [0.8, 1], how: 'Panel lifted on die-opening stroke', tool: 'Transfer feeder' },
  ],
  'STP-30': [
    { n: 'Trim outline', t: [0.15, 0.7], how: 'Perimeter trim, scrap shed through die chutes; trim line ±0.5 mm', tool: 'Servo press 2 (trim die)' },
    { n: 'Scrap evacuation', t: [0.7, 1], how: 'Offal to under-floor scrap conveyor, baled for remelt', tool: 'Scrap conveyor' },
  ],
  'STP-40': [
    { n: 'Flange & restrike', t: [0.15, 0.85], how: 'Door-opening and roof-rail flanges formed 90°, radii restruck', tool: 'Servo press 3 (flange die)' },
  ],
  'STP-50': [
    { n: 'Pierce apertures', t: [0.15, 0.6], how: 'Door and window openings cut out, 46 holes cam-pierced', tool: 'Servo press 4 (pierce die)' },
    { n: 'Vision inspection & racking', t: [0.6, 1], how: 'Split / neck / surface check by line-scan camera, panel racked', tool: 'Inspection tunnel', parts: [['5101-PNL', 'Body-side outer panel (pressed)', 1]] },
  ],
  // --------------------------------------------------------------- body shop
  'BIW-10': [
    { n: 'Load front casting', t: [0, 0.18], how: 'Located on 4 NC pins, clamped', tool: 'Handling robot H1', parts: [['5210-FC', 'Front structural casting, AlSi10MnMg', 1]], comps: ['frontCast'], from: { frontCast: [0, 0.35, 4.4] }, by: { frontCast: 4 } },
    { n: 'Load rear casting', t: [0.16, 0.36], how: 'Located on 4 NC pins, clamped', tool: 'Handling robot H1', parts: [['5220-RC', 'Rear underbody mega-casting', 1]], comps: ['rearCast'], from: { rearCast: [0, 0.35, 4.4] }, by: { rearCast: 4 } },
    { n: 'Set floor panel & sills', t: [0.3, 0.5], how: 'Floor with 3 seat cross-members dropped between castings', tool: 'Handling robot H2', parts: [['5230-FP', 'Floor panel assembly with seat cross-members', 1], ['5235-SL', 'Sill inner reinforcement L/R', 2]], comps: ['floorPan'], from: { floorPan: [0, 0.6, -4.5] }, by: { floorPan: 5 } },
    { n: 'Apply structural adhesive', t: [0.5, 0.62], how: '1K epoxy, 6.4 m bead along casting-to-floor joints', tool: 'Process robots R1–R4', kind: 'seal', spots: floorJoints },
    { n: 'Self-piercing rivets', t: [0.62, 0.96], how: '64 SPR Ø5.3 mm, C-frame 78 kN — steel floor to aluminium castings', tool: 'Process robots R1–R4', kind: 'rivet', spots: floorJoints, parts: [['FX-SPR-53', 'Self-piercing rivet Ø5.3 × 6.5', 64]] },
  ],
  'BIW-20': [
    { n: 'Load LH body side', t: [0, 0.24], how: 'Body-side assembly presented to underbody on geo pins', tool: 'Handling robot H1', parts: [['5101-L', 'Body side outer/inner assembly LH', 1]], comps: ['sideL'], from: { sideL: [0, 0.25, 3.1] }, by: { sideL: 4 } },
    { n: 'Load RH body side', t: [0.04, 0.28], how: 'Body-side assembly presented to underbody on geo pins', tool: 'Handling robot H2', parts: [['5101-R', 'Body side outer/inner assembly RH', 1]], comps: ['sideR'], from: { sideR: [0, 0.25, -3.1] }, by: { sideR: 5 } },
    { n: 'Spot weld sills', t: [0.28, 0.6], how: '38 resistance spot welds — 9.5 kA, 280 ms, 3.4 kN, nugget ≥ 5.5 mm', tool: 'Process robots R1–R4 (servo guns)', kind: 'weld', spots: sill },
    { n: 'Spot weld pillars & wheelhouses', t: [0.6, 0.96], how: '44 resistance spot welds, adaptive current control', tool: 'Process robots R1–R4 (servo guns)', kind: 'weld', spots: [...pillars, ...wheelhouse] },
  ],
  'BIW-30': [
    { n: 'Close framing gates', t: [0, 0.1], how: 'Open-gate framer, 18 NC locators hold body geometry to ±0.3 mm', tool: 'Framing station' },
    { n: 'Set dash & cowl panel', t: [0.1, 0.3], how: 'Dropped between A-pillars, tab-and-slot located', tool: 'Handling robot H1', parts: [['5310-DP', 'Dash & cowl panel assembly', 1]], comps: ['dashPanel'], from: { dashPanel: [0.3, 0.5, 4.3] }, by: { dashPanel: 4 } },
    { n: 'Set roof bows & headers', t: [0.2, 0.42], how: 'Three bows and two headers placed on roof-rail brackets', tool: 'Handling robot H1', parts: [['5321-RB', 'Roof bow', 3], ['5325-RH', 'Windshield / rear header', 2]], comps: ['roofBows'], from: { roofBows: [-0.3, 0.1, 4.5] }, by: { roofBows: 4 } },
    { n: 'Set roof panel', t: [0.38, 0.58], how: 'Vacuum gripper, panel centred to roof ditch ±0.4 mm', tool: 'Handling robot H2', parts: [['5330-RF', 'Roof panel BH220, 0.7 mm', 1]], comps: ['roofPanel'], from: { roofPanel: [0, -0.4, -4.4] }, by: { roofPanel: 5 } },
    { n: 'Laser-braze roof seams', t: [0.58, 0.8], how: 'CuSi3 wire, 2 × 1.62 m, 4 kW diode laser, seam tracking', tool: 'Process robots R1–R4 (braze optics)', kind: 'laser', spots: roofRail },
    { n: 'Framing spot welds', t: [0.8, 0.97], how: '52 resistance spot welds at headers, cowl and pillar joints', tool: 'Process robots R1–R4 (servo guns)', kind: 'weld', spots: [...pillars, ...both([[0.25, 1.4, 0.7], [-1.25, 1.4, 0.7], [1.0, 0.98, 0.6]])] },
  ],
  'BIW-40': [
    { n: 'Respot — sills & floor', t: [0, 0.3], how: '48 resistance spot welds to full structural pitch (35 mm)', tool: 'Robots R1–R4 (servo guns)', kind: 'weld', spots: [...sill, ...floorJoints] },
    { n: 'Respot — pillars & roof rail', t: [0.3, 0.6], how: '54 resistance spot welds', tool: 'Robots R1–R4 (servo guns)', kind: 'weld', spots: [...pillars, ...roofRail] },
    { n: 'Stud welding', t: [0.6, 0.86], how: '62 M6 drawn-arc studs for harness clips, trim and underbody shields', tool: 'Robots R1–R4 (stud heads)', kind: 'rivet', spots: [...run([-0.8, 0.34, -0.5], [0.8, 0.34, -0.5], 5), ...run([-0.8, 0.34, 0.5], [0.8, 0.34, 0.5], 5), ...wheelhouse], parts: [['FX-STD-M6', 'Weld stud M6 × 16', 62]] },
    { n: 'Tip dress & weld check', t: [0.86, 1], how: 'Electrode caps dressed; 6 nuggets sampled ultrasonically', tool: 'Tip dresser / UT probe' },
  ],
  'BIW-50': [
    { n: 'Mount front fenders', t: [0, 0.2], how: 'M6 × 9 per side, 9 Nm, slotted for gap setting', tool: 'Robots R1 / R3', parts: [['5410-L/R', 'Front fender', 2], ['FX-M6-16', 'Flange bolt M6 × 16', 18]], comps: ['fenderL', 'fenderR'], from: { fenderL: [0.2, 0.3, 3.2], fenderR: [0.2, 0.3, -3.2] }, by: { fenderL: 0, fenderR: 2 } },
    { n: 'Hang front doors', t: [0.2, 0.44], how: 'Two hinges each, M8 × 4, 24 Nm; check strap pinned', tool: 'Robots R1 / R3', parts: [['5511-L/R', 'Front door assembly', 2], ['FX-M8-20', 'Hinge bolt M8 × 20', 16]], comps: ['doorFL', 'doorFR'], from: { doorFL: [0.9, 0.2, 3.0], doorFR: [0.9, 0.2, -3.0] }, by: { doorFL: 0, doorFR: 2 } },
    { n: 'Hang rear doors', t: [0.24, 0.48], how: 'Two hinges each, M8 × 4, 24 Nm', tool: 'Robots R2 / R4', parts: [['5521-L/R', 'Rear door assembly', 2]], comps: ['doorRL', 'doorRR'], from: { doorRL: [-0.9, 0.2, 3.0], doorRR: [-0.9, 0.2, -3.0] }, by: { doorRL: 1, doorRR: 3 } },
    { n: 'Fit hood', t: [0.48, 0.66], how: 'Hinges M8 × 4, 24 Nm; two gas struts; latch striker set', tool: 'Handling robot H1', parts: [['5610', 'Hood assembly, aluminium', 1]], comps: ['hood'], from: { hood: [-1.0, 0.3, 4.4] }, by: { hood: 4 } },
    { n: 'Fit liftgate', t: [0.56, 0.76], how: 'Hinges M8 × 4, 24 Nm; power struts connected', tool: 'Handling robot H2', parts: [['5710', 'Liftgate assembly', 1]], comps: ['liftgate'], from: { liftgate: [1.2, 0.1, -4.4] }, by: { liftgate: 5 } },
    { n: 'Gap & flush setting', t: [0.76, 1], how: 'Vision-guided best fit: gap 3.5 ± 0.5 mm, flush ± 0.7 mm', tool: 'Robots R1–R4 (vision)', kind: 'scan', spots: both([[0.95, 0.8, 0.95], [0.0, 0.8, 0.95], [-0.95, 0.8, 0.95], [1.6, 0.95, 0.85]]) },
  ],
  'BIW-60': [
    { n: 'Reference alignment', t: [0, 0.2], how: 'Body aligned on RPS points, thermal compensation applied', tool: 'Metrology cell' },
    { n: 'Scan feature points', t: [0.2, 0.75], how: '124 features by laser triangulation, ± 0.1 mm', tool: 'Scanner robots S1 / S2', kind: 'scan', spots: [...pillars, ...roofRail, ...sill] },
    { n: 'Evaluate & release', t: [0.75, 1], how: 'Deviation vs CAD, SPC upload, rework flag if out of tolerance', tool: 'Metrology server' },
  ],
  // -------------------------------------------------------------- paint shop
  'PNT-10': [
    { n: 'Degrease & rinse', t: [0, 0.25], how: 'Alkaline spray/dip 55 °C, two DI-water rinses', tool: 'Pretreatment tunnel' },
    { n: 'Conversion coat', t: [0.25, 0.45], how: 'Zirconium-oxide thin film (phosphate-free), 50–80 nm', tool: 'Pretreatment tunnel' },
    { n: 'Cathodic e-coat dip', t: [0.45, 0.85], how: '320 V DC, bath 32 °C, film build 20 µm inside and out', tool: 'E-coat tank + rectifier' },
    { n: 'UF rinse & drain', t: [0.85, 1], how: 'Ultrafiltrate rinse, body tilted to drain cavities', tool: 'Rinse stages' },
  ],
  'PNT-20': [
    { n: 'Ramp up', t: [0, 0.25], how: 'Body to 180 °C metal temperature', tool: 'E-coat oven zone 1' },
    { n: 'Bake e-coat', t: [0.25, 0.8], how: 'Hold 20 min at 180 °C for full cross-linking', tool: 'E-coat oven zones 2–3' },
    { n: 'Cool down', t: [0.8, 1], how: 'Forced air to < 40 °C', tool: 'Cooling zone' },
  ],
  'PNT-30': [
    { n: 'Underbody seam sealing', t: [0, 0.4], how: 'PVC plastisol on 28 m of seams', tool: 'Sealing robots', parts: [['CH-PVC-11', 'PVC seam sealer', '2.6 kg']] },
    { n: 'Interior seam sealing', t: [0.4, 0.7], how: 'Flat-stream nozzles on door openings and floor', tool: 'Sealing robots' },
    { n: 'Sound deadener', t: [0.7, 1], how: 'Liquid-applied sound deadener sprayed on floor and dash', tool: 'Sealing robots', parts: [['CH-LASD-3', 'Liquid sound deadener', '3.1 kg']] },
  ],
  'PNT-40': [
    { n: 'Tack-off', t: [0, 0.2], how: 'Ionised air and feather rollers remove dust', tool: 'Cleaning station' },
    { n: 'Primer surfacer', t: [0.2, 0.8], how: 'Rotary bells 55 000 rpm, 30 µm, exterior and door shuts', tool: 'Paint robots P1 / P2', parts: [['CH-PRM-G', 'Primer surfacer, grey', '2.4 L']] },
    { n: 'Flash-off', t: [0.8, 1], how: '3 min at 60 °C', tool: 'Flash zone' },
  ],
  'PNT-50': [
    { n: 'Colour change', t: [0, 0.15], how: 'Purge and load only when colour differs from previous body', tool: 'Colour changer' },
    { n: 'Base coat 1', t: [0.15, 0.5], how: 'Electrostatic bells, 12 µm', tool: 'Paint robots P1 / P2', parts: [['CH-BC', 'Water-borne base coat', '3.8 L']] },
    { n: 'Base coat 2', t: [0.5, 0.85], how: 'Second pass 6 µm, effect pigment orientation', tool: 'Paint robots P1 / P2' },
    { n: 'Flash-off', t: [0.85, 1], how: '4 min at 80 °C, water removal > 85 %', tool: 'Flash zone' },
  ],
  'PNT-60': [
    { n: 'Clear coat', t: [0.05, 0.8], how: '2K clear, two bell passes, 45 µm', tool: 'Paint robots P1 / P2', parts: [['CH-CC-2K', '2K clear coat + hardener', '3.1 L']] },
    { n: 'Flash-off', t: [0.8, 1], how: '7 min ambient', tool: 'Flash zone' },
  ],
  'PNT-70': [
    { n: 'Ramp up', t: [0, 0.25], how: 'Infra-red boost then convection', tool: 'Top-coat oven zone 1' },
    { n: 'Cure top coat', t: [0.25, 0.85], how: '30 min at 140 °C', tool: 'Top-coat oven zones 2–4' },
    { n: 'Cool down', t: [0.85, 1], how: 'To < 35 °C', tool: 'Cooling zone' },
  ],
  'PNT-80': [
    { n: 'Automated surface scan', t: [0, 0.4], how: 'Deflectometry: dirt, craters, sags > 0.3 mm flagged', tool: 'Light tunnel + cameras' },
    { n: 'Film build check', t: [0.4, 0.6], how: 'Total 105–125 µm, 18 points', tool: 'Terahertz gauge' },
    { n: 'Spot repair & release', t: [0.6, 1], how: 'Sand and polish flagged defects, release to assembly', tool: 'Finish operators' },
  ],
  // -------------------------------------------------------- general assembly
  'GA-10': [
    { n: 'Lay harnesses & carpet', t: [0, 0.36], how: '46 clips; HV connectors with interlock; carpet heat-staked', tool: 'Operators with assist arm', parts: [['6110', 'Main body harness', 1], ['6120', 'HV harness 800 V, shielded', 1], ['6205', 'Floor carpet with insulator', 1]], comps: ['harness'], from: { harness: [0.3, 0.2, -3.2] } },
    { n: 'Insert cockpit module', t: [0.36, 0.7], how: 'Through front-door aperture on a manipulator; 6 × M8, 22 Nm', tool: 'Cockpit robot', parts: [['6300', 'Cockpit module: IP, HVAC, steering column, display', 1], ['FX-M8-25', 'Flange bolt M8 × 25', 6]], comps: ['cockpit'], from: { cockpit: [0, 0.25, 4.3] }, by: { cockpit: 0 } },
    { n: 'Connect & secure', t: [0.7, 1], how: 'Steering column M10 × 2, 45 Nm; 14 connectors mated, pin check', tool: 'DC tools', kind: 'bolt', spots: [[0.85, 0.9, 0.7], [0.85, 0.9, -0.7], [0.6, 0.8, 0.38]] },
  ],
  'GA-20': [
    { n: 'Prime & apply PU bead', t: [0, 0.3], how: 'Primer on flange, 12 mm triangular polyurethane bead, 4.6 m', tool: 'Glazing robots', kind: 'seal', spots: [[1.0, 1.02, 0.8], [0.35, 1.44, 0.8], [0.35, 1.44, -0.8], [1.0, 1.02, -0.8], [-1.35, 1.43, 0.7], [-2.1, 1.04, 0.7], [-2.1, 1.04, -0.7], [-1.35, 1.43, -0.7]], parts: [['CH-PU-1K', 'PU glass adhesive', '0.9 kg']] },
    { n: 'Set windshield', t: [0.3, 0.56], how: 'Vision-centred, pressed to 5 mm stand-off', tool: 'Glazing robot G1', parts: [['6410', 'Windshield, acoustic laminated', 1]], comps: ['windshield'], from: { windshield: [0.5, 0.3, 4.0] }, by: { windshield: 0 } },
    { n: 'Set rear glass', t: [0.4, 0.66], how: 'Heated backlight bonded into liftgate', tool: 'Glazing robot G2', parts: [['6420', 'Rear glass, heated', 1]], comps: ['rearGlass'], from: { rearGlass: [0.2, 0.3, -4.0] }, by: { rearGlass: 1 } },
    { n: 'Fit side glass', t: [0.66, 0.9], how: 'Door glass on regulators (M6, 8 Nm); quarter glass bonded', tool: 'Operators', parts: [['6431', 'Door glass, tempered', 4], ['6440', 'Quarter glass', 2]], comps: ['sideGlass'], from: { sideGlass: [-0.3, 0.2, 3.4] } },
    { n: 'Tape & cure check', t: [0.9, 1], how: 'Retention tape applied; adhesive skin time verified', tool: 'Operators' },
  ],
  'GA-30': [
    { n: 'Raise body', t: [0, 0.14], how: 'Body lifted 950 mm on four-post hangers', tool: 'Body lift' },
    { n: 'Position chassis modules', t: [0.14, 0.4], how: 'Subframes with suspension shuttle in on pallet; M14 × 8, 150 Nm + 90°', tool: 'Chassis pallet + lift', parts: [['7110', 'Front subframe & suspension module', 1], ['7120', 'Rear subframe & 5-link suspension module', 1]], comps: ['subframes'], from: { subframes: [0, 0, 3.6] }, path: 'under' },
    { n: 'Marry drive unit(s)', t: [0.2, 0.48], how: 'Drive unit to subframe: 3 mounts, M12, 90 Nm; half-shafts engaged', tool: 'Chassis pallet + lift', parts: [['7310', 'Rear drive unit 220 kW', 1], ['7320', 'Front drive unit 160 kW (AWD only)', 1]], comps: ['rdu', 'fdu'], from: { rdu: [0, 0, 3.6], fdu: [0, 0, 3.6] }, path: 'under' },
    { n: 'Marry battery pack', t: [0.3, 0.6], how: 'Pack raised into floor aperture; M12 × 32, 110 Nm, centre-out sequence', tool: 'Pack lift table', parts: [['7500', 'Battery pack 82 / 60 kWh', 1], ['FX-M12-60', 'Pack bolt M12 × 60, coated', 32]], comps: ['pack'], from: { pack: [0, 0, -3.6] }, path: 'under' },
    { n: 'Torque & connect HV', t: [0.6, 0.86], how: '8 DC nutrunners in parallel; HV connector, HVIL check; coolant quick-connects', tool: 'Nutrunner array', kind: 'bolt', spots: both([[0.9, 0.95, 0.6], [0.3, 0.95, 0.6], [-0.3, 0.95, 0.6], [-0.9, 0.95, 0.6]]) },
    { n: 'Lower body', t: [0.86, 1], how: 'Body lowered onto skid, hangers released', tool: 'Body lift' },
  ],
  'GA-40': [
    { n: 'Fit fascias', t: [0, 0.3], how: 'Clips plus M6 × 12, 8 Nm; radar and parking-sensor connectors', tool: 'Operators with assist arm', parts: [['7710', 'Front fascia with radar & grille shutter', 1], ['7720', 'Rear fascia with parking sensors', 1]], comps: ['fasciaF', 'fasciaR'], from: { fasciaF: [1.3, 0.2, 0], fasciaR: [-1.3, 0.2, 0] } },
    { n: 'Mount wheels', t: [0.3, 0.64], how: 'Wheel presented to hub, stud pattern matched by vision', tool: 'Wheel robots W1–W4', parts: [['7810', 'Wheel & tyre assembly 19", 255/45', 4]], comps: ['wheelFL', 'wheelRL', 'wheelFR', 'wheelRR'], from: { wheelFL: [1.4, 0.3, 3.2], wheelRL: [-1.4, 0.3, 3.2], wheelFR: [1.4, 0.3, -3.2], wheelRR: [-1.4, 0.3, -3.2] }, by: { wheelFL: 0, wheelRL: 1, wheelFR: 2, wheelRR: 3 } },
    { n: 'Torque wheel bolts', t: [0.64, 0.9], how: '5-spindle nutrunner, M14 × 1.5, 140 Nm, crosswise sequence', tool: 'Wheel robots W1–W4', kind: 'bolt', spots: both([[1.42, 0.34, 0.95], [-1.42, 0.34, 0.95]]), parts: [['FX-WB-M14', 'Wheel bolt M14 × 1.5', 20]] },
    { n: 'TPMS learn', t: [0.9, 1], how: 'Sensor IDs written to body controller', tool: 'LF trigger antennas' },
  ],
  'GA-50': [
    { n: 'Install front seats', t: [0, 0.42], how: 'M10 × 4 each, 48 Nm; airbag and heating connectors, SRS check', tool: 'Seat robot', parts: [['8110', 'Front seat, heated/ventilated, side airbag', 2], ['FX-M10-30', 'Seat bolt M10 × 30', 8]], comps: ['seatFL', 'seatFR'], from: { seatFL: [2.0, 0.3, 4.2], seatFR: [2.9, 0.3, 5.0] }, by: { seatFL: 0, seatFR: 0 } },
    { n: 'Install rear seat', t: [0.36, 0.64], how: '60/40 bench latched to floor strikers, M10 × 4, 48 Nm', tool: 'Seat robot', parts: [['8120', 'Rear seat 60/40', 1]], comps: ['seatRear'], from: { seatRear: [3.2, 0.5, 3.6] }, by: { seatRear: 0 } },
    { n: 'Fit lamps', t: [0.64, 0.86], how: 'M6 × 3 each, 6 Nm; connectors mated', tool: 'Operators', parts: [['8210', 'LED matrix headlamp', 2], ['8220', 'Tail-lamp light bar', 1]], comps: ['lights'], from: { lights: [0.2, 0.3, -3.0] } },
    { n: 'Door trim & seals', t: [0.86, 1], how: 'Trim panels clipped, primary seals rolled, closing effort checked', tool: 'Operators' },
  ],
  'GA-60': [
    { n: 'Evacuate & leak-check', t: [0, 0.25], how: 'Circuits pulled to < 5 mbar, 20 s decay test', tool: 'Fill heads' },
    { n: 'Fill fluids', t: [0.25, 0.6], how: 'Coolant 9.8 L · brake fluid DOT 4 0.9 L · R-1234yf 0.62 kg · washer 4.5 L', tool: 'Fill heads', parts: [['FL-G48', 'Coolant, glycol 50 %', '9.8 L'], ['FL-DOT4', 'Brake fluid DOT 4', '0.9 L'], ['FL-YF', 'Refrigerant R-1234yf', '0.62 kg']] },
    { n: 'Flash software', t: [0.3, 0.9], how: '71 ECUs, 2.4 GB over DoIP; VIN, keys and options coded', tool: 'Flash station' },
    { n: 'HV wake-up', t: [0.9, 1], how: 'Isolation > 500 Ω/V, contactors close, no fault codes', tool: 'Flash station' },
  ],
  // ------------------------------------------------------------- end of line
  'EOL-10': [
    { n: 'Centre steering', t: [0, 0.15], how: 'Steering wheel levelled and clamped', tool: 'Alignment rig' },
    { n: 'Wheel alignment', t: [0.15, 0.55], how: 'Toe and camber by laser heads; tie rods set to ± 0.03°', tool: 'Alignment rig', kind: 'scan', spots: both([[1.42, 0.34, 0.95], [-1.42, 0.34, 0.95]]) },
    { n: 'Headlamp aim', t: [0.55, 0.7], how: 'Cut-off set to −1.0 % ± 0.1', tool: 'Aiming camera' },
    { n: 'ADAS calibration', t: [0.7, 1], how: 'Front camera and radar calibrated against targets', tool: 'Target boards' },
  ],
  'EOL-20': [
    { n: 'Brake test', t: [0, 0.25], how: 'Brake force and balance per axle', tool: 'Roller dyno' },
    { n: 'Drive & regen cycle', t: [0.25, 0.75], how: 'Acceleration to 120 km/h, regenerative braking, torque vectoring check', tool: 'Roller dyno' },
    { n: 'ABS / ESC & speedo', t: [0.75, 1], how: 'Wheel-speed plausibility, parking brake, speedometer accuracy', tool: 'Roller dyno' },
  ],
  'EOL-30': [
    { n: 'Storm test', t: [0, 0.7], how: '4 min at 300 L/min·m² from 148 nozzles', tool: 'Water booth' },
    { n: 'Leak detection', t: [0.7, 0.9], how: 'Moisture sensors and ultrasonic check in cabin and trunk', tool: 'Leak sensors' },
    { n: 'Blow-off', t: [0.9, 1], how: 'Air knives remove standing water', tool: 'Dryer' },
  ],
  'EOL-40': [
    { n: 'Electrical check-out', t: [0, 0.35], how: 'All 71 ECUs read: zero fault codes, function tests', tool: 'Diagnostic tester' },
    { n: 'Fit & finish audit', t: [0.35, 0.7], how: 'Gaps, flushness, paint and interior under light tunnel', tool: 'Audit bay' },
    { n: 'Release', t: [0.7, 1], how: 'Squeak and rattle check, certificate of conformity printed', tool: 'Audit bay' },
  ],
  // ------------------------------------------------------------ battery line
  'BAT-10': [
    { n: 'Incoming cell test', t: [0, 0.2], how: 'OCV and AC resistance per cell; sorted into ± 5 mV bins', tool: 'Cell tester', parts: [['BC-NMC-117', 'Prismatic Li-ion cell, 117 Ah', 96]] },
    { n: 'Stack modules — row A', t: [0.2, 0.55], how: '12 cells per module with compression pads, end plates, 3 kN pre-load, banded', tool: 'Stacking gantry', parts: [['BM-EP-01', 'Module end plate', 8], ['BM-PAD', 'Compression pad', 44]], comps: ['modA'], from: { modA: [0, 0.3, 2.9] } },
    { n: 'Stack modules — row B', t: [0.55, 0.92], how: '12 cells per module, same sequence', tool: 'Stacking gantry', parts: [['BM-EP-01', 'Module end plate', 8], ['BM-PAD', 'Compression pad', 44]], comps: ['modB'], from: { modB: [0, 0.62, 2.22] } },
  ],
  'BAT-20': [
    { n: 'Place busbars & sense boards', t: [0, 0.3], how: 'Al/Cu busbars and flexible sense circuits located on terminals', tool: 'Placement head', parts: [['BB-ALCU', 'Cell-to-cell busbar', 88], ['BS-FPC', 'Voltage/temperature sense board', 8]], comps: ['bus'], from: { bus: [0, 1.2, 0] } },
    { n: 'Laser-weld busbars', t: [0.3, 0.85], how: '192 welds, wobble pattern, 4 kW; penetration monitored in-process', tool: 'Laser robot', kind: 'laser', spots: [...run([-0.9, 0.7, -0.34], [0.9, 0.7, -0.34], 6), ...run([0.9, 0.7, 0.34], [-0.9, 0.7, 0.34], 6)] },
    { n: 'Weld inspection', t: [0.85, 1], how: 'Joint resistance < 35 µΩ, thermography sweep', tool: 'Inspection head' },
  ],
  'BAT-30': [
    { n: 'Shuttle tray under modules', t: [0, 0.25], how: 'Thermal gap filler dispensed in tray; modules lowered and bolted M6 × 32, 10 Nm', tool: 'Tray shuttle', parts: [['BT-TRAY', 'Pack tray, extruded aluminium with cooling plate', 1], ['CH-TIM', 'Thermal gap filler', '2.8 kg']], comps: ['tray'], from: { tray: [0.6, 0, -3.0] } },
    { n: 'Install BMS & HV distribution', t: [0.25, 0.5], how: 'Battery management unit, junction box with contactors and fuse, HV busbars M6 9 Nm, coolant manifold', tool: 'Pack robot A', parts: [['BE-BMU', 'Battery management unit', 1], ['BE-BJB', 'Battery junction box, 800 V', 1], ['BE-HVB', 'HV busbar set', 1]], comps: ['bms'], from: { bms: [-0.6, 0.4, 3.4] }, by: { bms: 0 } },
    { n: 'Seal & place lid', t: [0.5, 0.74], how: 'Continuous FIPG seal bead on tray flange; lid placed', tool: 'Sealing robot B + lid manipulator', parts: [['BT-LID', 'Pack lid, SMC composite', 1]], comps: ['lid'], from: { lid: [0, 1.5, 0] } },
    { n: 'Bolt lid', t: [0.74, 1], how: '46 × M6, 8 Nm, spiral sequence, torque-angle logged per bolt', tool: 'Pack robot B (screwdriver)', kind: 'bolt', spots: [...run([-1.2, 0.74, -0.72], [1.2, 0.74, -0.72], 6), ...run([1.2, 0.74, 0.72], [-1.2, 0.74, 0.72], 6)], robots: [1], parts: [['FX-M6-20S', 'Sealing bolt M6 × 20', 46]], comps: ['bolts'], from: { bolts: [0, 0.5, 0] } },
  ],
  'BAT-40': [
    { n: 'Leak test', t: [0, 0.3], how: 'Pressure decay at 30 mbar, < 0.5 mbar drop in 60 s; coolant circuit helium test', tool: 'Leak tester' },
    { n: 'Insulation & hipot', t: [0.3, 0.55], how: 'Insulation > 1 GΩ at 1 000 V; hipot 2.7 kV, 60 s', tool: 'HV tester' },
    { n: 'BMS flash & balance', t: [0.55, 0.9], how: 'Firmware flashed, cells balanced, pack charged to 30 % SOC', tool: 'Cycler' },
    { n: 'Release', t: [0.9, 1], how: 'Pack serial bound to cell genealogy', tool: 'MES' },
  ],
  // ---------------------------------------------------------- drive unit line
  'DU-10': [
    { n: 'Insert hairpins', t: [0, 0.3], how: '192 rectangular copper hairpins into 48-slot lamination stack with slot liners', tool: 'Hairpin inserter', parts: [['DS-LAM', 'Stator lamination stack, 0.25 mm NO steel', 1], ['DS-HP', 'Copper hairpin, enamelled', 192]], comps: ['stator'], from: { stator: [0, 1.13, 2.7] } },
    { n: 'Twist & laser-weld ends', t: [0.3, 0.55], how: 'Pin ends twisted and laser-welded (192), then trickle impregnation', tool: 'Twist & weld cell', kind: 'laser', spots: [[0.15, 0.95, 0.2], [-0.15, 0.95, 0.2], [0.15, 0.7, 0.2], [-0.15, 0.7, 0.2]] },
    { n: 'Insert rotor', t: [0.55, 0.92], how: 'Rotor with 48 NdFeB magnets, balanced to G2.5, guided into stator bore (air gap 0.7 mm)', tool: 'Rotor joining press', parts: [['DR-ASM', 'Rotor assembly with shaft & magnets', 1], ['DR-BRG', 'Deep-groove bearing 6208 hybrid', 2]], comps: ['rotor'], from: { rotor: [0, 0, 1.3] } },
  ],
  'DU-20': [
    { n: 'Press stator into housing', t: [0, 0.28], how: 'Housing heated to 180 °C, shrink-fit over stator', tool: 'Shrink-fit press', parts: [['DH-MAIN', 'Motor housing with cooling jacket', 1]], comps: ['housing'], from: { housing: [0, 0, -1.4] } },
    { n: 'Assemble gearset', t: [0.28, 0.54], how: 'Input shaft, intermediate gear, differential; shimmed for backlash 0.06–0.10 mm', tool: 'Assembly robot', parts: [['DG-SET', 'Reduction gearset 9.1 : 1', 1], ['DG-DIFF', 'Differential', 1]], comps: ['gears'], from: { gears: [-0.8, 0.3, 2.6] }, by: { gears: 0 } },
    { n: 'Close gearbox cover', t: [0.54, 0.76], how: 'RTV sealant bead; M8 × 14, 25 Nm', tool: 'Assembly robot', parts: [['DG-CVR', 'Gearbox cover', 1], ['FX-M8-30', 'Flange bolt M8 × 30', 14]], comps: ['gbCover'], from: { gbCover: [-1.5, 0.2, 2.3] }, by: { gbCover: 0 } },
    { n: 'Mount inverter', t: [0.76, 1], how: 'SiC inverter on housing; phase busbars M6 × 3, 9 Nm; coolant ports sealed', tool: 'Assembly robot', parts: [['DI-SIC', 'SiC traction inverter, 800 V', 1]], comps: ['inverter'], from: { inverter: [2.0, 0.1, 2.6] }, by: { inverter: 0 } },
  ],
  'DU-30': [
    { n: 'Oil fill & leak test', t: [0, 0.25], how: '1.9 L ATF; pressure-decay leak test', tool: 'Fill station', parts: [['FL-ATF', 'Transmission fluid', '1.9 L']] },
    { n: 'Back-to-back dyno', t: [0.25, 0.8], how: 'Efficiency map, peak torque, NVH order tracking', tool: 'Test bench' },
    { n: 'Resolver calibration', t: [0.8, 1], how: 'Rotor position offset written to inverter', tool: 'Test bench' },
  ],
};

// index of the operation in progress at cycle fraction p
export function currentOp(id, p) {
  const ops = PROCESS[id]; if (!ops) return -1;
  let k = 0;
  for (let i = 0; i < ops.length; i++) if (ops[i].t[0] <= p) k = i;
  return k;
}
