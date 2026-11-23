// The building and everything bolted to it: floor, structure, markings,
// conveyors, warehouse, docks, yard, support areas. Almost all of it is baked
// into a few merged meshes; a small set of handles is returned for live parts.
import * as THREE from 'three';
import { mat, emat, glass, box, cyl, grp, add, bake, textSprite, floorText } from './kit.js';
import { person } from './vehicles.js';
import { HALL, LINES, STATION_LIST, ZONES, MATERIALS, DOCKS, AGV_PARK, AISLES, TRUNK_X, YARD, YARD_SLOTS, yardSlotPos, CARRIER_BAYS, REGIONS, COUNTERS } from '../config.js';

export const MAT_COLOR = { steel: 0xb9bec6, alu: 0x8f98a3, paint: 0x9085e9, cockpit: 0x596270, glass: 0x7ec8ff, wheels: 0x2a2e34, seats: 0x8a5a44, cells: 0x1fa37a, bms: 0x199e70, magnets: 0xc87533, sic: 0x2ec4d6 };

const steel = mat(0x8e949c, 0.45, 0.8), dark = mat(0x24282e, 0.55, 0.5), white = mat(0xe6e9ec, 0.55, 0.1), ylw = mat(0xe8b923, 0.7, 0), concrete = mat(0x9a9fa5, 0.85, 0),
  grey = mat(0x596270, 0.6, 0.4), blue = mat(0x2f6fb5, 0.5, 0.3), red = mat(0xb5161b, 0.5, 0.2), line = mat(0xf2f4f6, 0.8, 0), roof = mat(0xd7dbdf, 0.6, 0.3), truss = mat(0x8b949e, 0.6, 0.4);
const LAMP = emat(0xfff4dc, 2.4), SCREEN = emat(0x39b8ff, 1.3), GREEN = emat(0x33ff88, 1.8);

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6f757c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function beam(S, a, b, w, h, m, off = 0, dy = 0) {
  const dx = b[0] - a[0], dyy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dyy, dz);
  if (len < 0.01) return;
  const hl = Math.hypot(dx, dz) || 1, px = -dz / hl * off, pz = dx / hl * off;
  const mesh = box(w, h, len, m, (a[0] + b[0]) / 2 + px, (a[1] + b[1]) / 2 + dy, (a[2] + b[2]) / 2 + pz);
  mesh.lookAt(b[0] + px, b[1] + dy, b[2] + pz);
  S.add(mesh);
}
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / l2));
  return Math.hypot(px - a[0] - t * dx, pz - a[2] - t * dz);
}
function blocked(x, z) {
  for (const s of STATION_LIST) if (Math.abs(x - s.pos[0]) < 6.6 && Math.abs(z - s.pos[2]) < 6) return true;
  for (const L in LINES) { const n = LINES[L].nodes; for (let i = 1; i < n.length; i++) if (segDist(x, z, n[i - 1].pos, n[i].pos) < 3.4) return true; }
  if (x > 30 && x < 126 && z > 42 && z < 68) return true;       // control centre, lab, rework
  if (x > -108 && x < -70 && z > -26 && z < 6) return true;      // maintenance + AGV bays
  if (Math.abs(x - TRUNK_X) < 3) return true;
  return false;
}

export function buildWorld(scene) {
  const S = new THREE.Group();        // static, baked
  const live = { labels: [], lineSide: {}, counters: {}, crewHome: [] };
  const cx = (HALL.x0 + HALL.x1) / 2, cz = (HALL.z0 + HALL.z1) / 2, hw = HALL.x1 - HALL.x0, hd = HALL.z1 - HALL.z0;

  // ---- ground planes
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1100), new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(20, -0.06, 0); ground.receiveShadow = true; scene.add(ground);
  const ft = floorTexture(); ft.repeat.set(hw / 8, hd / 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw, hd), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.42, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true; scene.add(floor);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.9 });
  const slab = (x0, x1, z0, z1, m = asphalt, y = -0.03) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m); p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); p.receiveShadow = true; scene.add(p); return p; };
  slab(130, 242, -46, 76); slab(224, 242, -260, 260); slab(-178, -150, -260, 260);
  slab(HALL.x0 - 1.5, HALL.x1 + 1.5, HALL.z0 - 1.5, HALL.z1 + 1.5, new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 }), -0.045);

  // ---- floor markings
  const mark = (x0, z0, x1, z1, m = ylw, w = 0.14) => beam(S, [x0, 0.012, z0], [x1, 0.012, z1], w, 0.012, m);
  const aisleEnd = { '-30': 92, '10': 124, '37.5': -24, '67.5': -56 };
  for (const a of AISLES) for (const o of [-1.7, 1.7]) mark(TRUNK_X + 1.7, a + o, aisleEnd[a], a + o);
  for (const o of [-1.7, 1.7]) mark(TRUNK_X + o, -60, TRUNK_X + o, 71);
  for (const d of STATION_LIST) if (d.drop) { const [x, z, a] = d.drop; for (const o of [-1.1, 1.1]) mark(x + o, z, x + o, a + Math.sign(z - a) * 1.7, line, 0.08); }
  for (const p of AGV_PARK) { mark(p.x - 1.3, p.z - 1.1, p.x + 3.5, p.z - 1.1, line, 0.08); add(S, box(0.3, 1.1, 0.5, dark, p.x - 1.8, 0.55, p.z), box(0.2, 0.08, 0.3, GREEN, p.x - 1.8, 1.14, p.z)); }
  mark(AGV_PARK[0].x - 1.3, AGV_PARK[9].z + 1.9, AGV_PARK[0].x + 3.5, AGV_PARK[9].z + 1.9, line, 0.08);

  // ---- zone tints + floor lettering
  const zrect = {
    inbound: [-149, -122.5, -67, 72], stamping: [-114.5, -43, -56.5, -40.5], body: [-38, 104.5, -56.5, -40.5], paint: [-28, 104.5, -19.5, -4.5],
    battery: [-110.5, -8, 40.8, 51.5], drive: [-96.5, 0, 55.2, 65.2], ga: [-62, 58, 21.5, 35], eol: [58, 124.5, 21.5, 35],
  };
  for (const z in zrect) {
    const [x0, x1, z0, z1] = zrect[z], col = new THREE.Color(ZONES[z].color);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.09, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, 0.008, (z0 + z1) / 2); scene.add(p);
    const em = mat(col.getHex(), 0.7, 0);
    mark(x0, z0, x1, z0, em, 0.12); mark(x0, z1, x1, z1, em, 0.12); mark(x0, z0, x0, z1, em, 0.12); mark(x1, z0, x1, z1, em, 0.12);
    const t = floorText(ZONES[z].name.toUpperCase(), { height: z === 'inbound' ? 2.4 : 2 });
    if (z === 'inbound') { t.rotation.z = Math.PI / 2; t.position.set(x0 + 2.2, 0.03, 26); } else t.position.set(x0 + t.geometry.parameters.width / 2 + 1.5, 0.03, z1 + 1.6);
    scene.add(t);
  }
  // hanging zone signs
  const signAt = { stamping: [-84, -48], body: [5, -48], paint: [36, -12], battery: [-80, 46], drive: [-72, 60], ga: [-5, 28], eol: [85, 28], inbound: [-136, 0], yard: [168, -18] };
  for (const z in signAt) { const sp = textSprite(ZONES[z].name.toUpperCase(), { size: 56, accent: ZONES[z].color, scale: 2.1 }); sp.position.set(signAt[z][0], z === 'yard' ? 9 : 11.5, signAt[z][1]); scene.add(sp); live.labels.push({ sp, far: true }); }

  // ---- structure: columns, trusses, purlins, lamps
  const colX = []; for (let x = -145; x <= 116; x += 20) colX.push(x);
  for (const x of colX) {
    for (const z of [-36, -1, 18, 53]) if (!blocked(x, z)) add(S, box(0.55, HALL.h, 0.55, white, x, HALL.h / 2, z), box(0.9, 0.5, 0.9, ylw, x, 0.25, z), box(0.57, 0.9, 0.57, dark, x, 0.95, z));
    for (const z of [HALL.z0, HALL.z1]) S.add(box(0.6, HALL.h, 0.6, white, x, HALL.h / 2, z));
    add(S, box(0.2, 0.2, hd, truss, x, HALL.h + 1.7, cz), box(0.2, 0.2, hd, truss, x, HALL.h, cz));
    for (let z = HALL.z0; z < HALL.z1 - 1; z += 8) { beam(S, [x, HALL.h, z], [x, HALL.h + 1.7, z + 4], 0.1, 0.1, truss); beam(S, [x, HALL.h + 1.7, z + 4], [x, HALL.h, z + 8], 0.1, 0.1, truss); }
  }
  for (let z = HALL.z0; z <= HALL.z1; z += 24) S.add(box(hw, 0.16, 0.16, truss, cx, HALL.h + 1.82, z));
  for (const x of [HALL.x0, HALL.x1]) for (let z = HALL.z0; z <= HALL.z1; z += 24) S.add(box(0.6, HALL.h, 0.6, white, x, HALL.h / 2, z));
  add(S, box(hw, 0.4, 0.4, white, cx, HALL.h, HALL.z0), box(hw, 0.4, 0.4, white, cx, HALL.h, HALL.z1), box(0.4, 0.4, hd, white, HALL.x0, HALL.h, cz), box(0.4, 0.4, hd, white, HALL.x1, HALL.h, cz));
  // partial roof deck (two strips, leaving the hall open to view)
  for (const z of [HALL.z0 + 3, HALL.z1 - 3]) S.add(box(hw, 0.12, 6, roof, cx, HALL.h + 2, z));
  for (let x = -135; x <= 120; x += 20) for (let z = -60; z <= 68; z += 16) add(S, cyl(0.02, 2.6, dark, x, HALL.h - 1.3, z, 'y', 5), cyl(0.5, 0.3, dark, x, HALL.h - 2.7, z, 'y', 12), cyl(0.42, 0.04, LAMP, x, HALL.h - 2.87, z, 'y', 12));

  // ---- perimeter walls (cut-away height) with dock and exit openings
  const wall = (x0, z0, x1, z1, h = 1.5) => beam(S, [x0, h / 2, z0], [x1, h / 2, z1], 0.35, h, concrete);
  wall(HALL.x0, HALL.z0, HALL.x1, HALL.z0); wall(HALL.x0, HALL.z1, HALL.x1, HALL.z1);
  wall(HALL.x1, HALL.z0, HALL.x1, 24); wall(HALL.x1, 32, HALL.x1, HALL.z1);
  add(S, box(0.5, 5.2, 0.5, ylw, HALL.x1, 2.6, 24), box(0.5, 5.2, 0.5, ylw, HALL.x1, 2.6, 32), box(0.5, 0.5, 8.5, ylw, HALL.x1, 5.2, 28));
  let zPrev = HALL.z0;
  DOCKS.forEach((d, i) => {
    wall(HALL.x0, zPrev, HALL.x0, d.z - 2.2, 5.4); zPrev = d.z + 2.2;
    add(S, box(0.6, 5.4, 0.3, ylw, HALL.x0, 2.7, d.z - 2.2), box(0.6, 5.4, 0.3, ylw, HALL.x0, 2.7, d.z + 2.2), box(0.5, 0.9, 4.7, concrete, HALL.x0, 4.95, d.z),
      box(2.6, 0.12, 3.6, steel, HALL.x0 + 1.4, 0.06, d.z), box(0.3, 0.5, 0.3, dark, HALL.x0 - 0.3, 1.0, d.z - 1.6), box(0.3, 0.5, 0.3, dark, HALL.x0 - 0.3, 1.0, d.z + 1.6));
    const sp = textSprite(`DOCK ${i + 1}`, { size: 40, scale: 1.2 }); sp.position.set(HALL.x0 + 0.5, 6.6, d.z); scene.add(sp); live.labels.push({ sp });
  });
  wall(HALL.x0, zPrev, HALL.x0, HALL.z1, 5.4);

  // ---- warehouse racking (static frames; stock boxes are instanced live)
  for (const m of MATERIALS) {
    const z = m.pz;
    for (let i = 0; i <= 5; i++) for (const dz of [-0.75, 0.75]) S.add(box(0.12, 6.2, 0.12, blue, -146.5 + i * 4.2, 3.1, z + dz));
    for (let lv = 0; lv < 4; lv++) for (const dz of [-0.75, 0.75]) S.add(box(21.2, 0.14, 0.1, mat(0xd95926, 0.6, 0.2), -136, 0.2 + lv * 1.5, z + dz));
    const sp = textSprite([m.name, m.supplier], { size: 34, scale: 1.15, accent: '#' + MAT_COLOR[m.id].toString(16).padStart(6, '0') });
    sp.position.set(-135.5, 7.6, z); scene.add(sp); live.labels.push({ sp });
    add(S, box(2.6, 0.02, 2.2, mat(0x14b8a6, 0.7, 0), m.pick.x - 0.4, 0.012, z));
  }
  live.stock = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.1, 1.15), new THREE.MeshStandardMaterial({ roughness: 0.75 }), MATERIALS.length * 52);
  live.stock.castShadow = true; live.stock.frustumCulled = false; scene.add(live.stock);

  // ---- conveyors
  const railM = mat(0x6d747d, 0.45, 0.8), tieM = mat(0x444a52, 0.6, 0.5), beltM = mat(0x2a2e34, 0.8, 0.1), sideM = mat(0xe8b923, 0.6, 0.1);
  for (const L in LINES) {
    const def = LINES[L], pts = [def.spawn, ...def.nodes.map(n => n.pos)];
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    if (L === 'main') pts.push([HALL.x1 + 4, 0, 28]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (L === 'main') {
        beam(S, a, b, 0.14, 0.18, railM, 0.62, 0.0); beam(S, a, b, 0.14, 0.18, railM, -0.62, 0.0);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.round(len / 1.4);
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 0.04, a[2] + (b[2] - a[2]) * t]; const horiz = Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]); S.add(box(horiz ? 0.12 : 1.5, 0.08, horiz ? 1.5 : 0.12, tieM, p[0], p[1], p[2])); }
        for (const p of [a, b]) if (p[1] > 0.5) for (const o of [-1.2, 1.2]) { const horiz = Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]); S.add(box(0.25, p[1], 0.25, sideM, p[0] + (horiz ? 0 : o), p[1] / 2 - 0.1, p[2] + (horiz ? o : 0))); }
        if (a[1] > 0.5 || b[1] > 0.5) { beam(S, a, b, 2.8, 0.08, mat(0x6d747d, 0.7, 0.5), 0, -0.14); beam(S, a, b, 0.06, 0.06, sideM, 1.4, 1.0); beam(S, a, b, 0.06, 0.06, sideM, -1.4, 1.0); }
      } else {
        const w = L === 'stamp' ? 2.0 : L === 'batt' ? 1.7 : 1.1, top = L === 'stamp' ? 0.98 : 0.4;
        beam(S, a, b, w, 0.14, beltM, 0, top - 0.07); beam(S, a, b, 0.08, 0.2, sideM, w / 2, top); beam(S, a, b, 0.08, 0.2, sideM, -w / 2, top);
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(len / 3));
        for (let k = 0; k <= n; k++) { const t = k / n; S.add(box(0.12, top - 0.1, w * 0.8, tieM, a[0] + (b[0] - a[0]) * t, (top - 0.1) / 2, a[2] + (b[2] - a[2]) * t)); }
      }
    }
  }
  // end-of-line racks for sub-assemblies (live stacks)
  const rackAt = { panels: [-44.5, -48], packs: [-12, 34.4], dus: [-4, 34.4] };
  for (const c in rackAt) {
    const [x, z] = rackAt[c];
    add(S, box(c === 'panels' ? 3.6 : 2.6, 0.2, c === 'panels' ? 2.2 : 1.8, grey, x, 0.1, z));
    live.counters[c] = { x, z, items: [] };
  }

  // ---- line-side supermarkets at every AGV drop point
  for (const d of STATION_LIST) {
    if (!d.drop) continue;
    const [x, z, a] = d.drop, s = Math.sign(z - a), mid = Object.keys(d.consumes)[0];
    const rz = z + s * 1.5;
    add(S, box(2.6, 0.1, 1.3, steel, x, 0.45, rz), box(2.6, 0.1, 1.3, steel, x, 1.25, rz));
    for (const ox of [-1.25, 1.25]) for (const oz of [-0.6, 0.6]) S.add(box(0.08, 1.9, 0.08, blue, x + ox, 0.95, rz + oz));
    const fill = box(2.3, 0.7, 1.1, new THREE.MeshStandardMaterial({ color: MAT_COLOR[mid], roughness: 0.7 }), x, 0.85, rz);
    fill.castShadow = true; scene.add(fill);
    live.lineSide[d.id] = { mesh: fill, mat: mid };
  }

  // ---- maintenance workshop + spare parts
  const mw = [-104, -74, -22, 2];
  for (const [a, b] of [[[mw[0], mw[2]], [mw[1], mw[2]]], [[mw[1], mw[2]], [mw[1], mw[3]]], [[mw[0], mw[3]], [mw[1], mw[3]]]]) beam(S, [a[0], 0.7, a[1]], [b[0], 0.7, b[1]], 0.12, 1.4, mat(0xcfd4d9, 0.6, 0.2));
  for (let i = 0; i < 4; i++) add(S, box(3.2, 0.1, 1.2, mat(0x8a5a44, 0.7, 0), -100 + i * 6, 0.95, -19.5), box(0.1, 0.95, 1.0, steel, -101.4 + i * 6, 0.47, -19.5), box(0.1, 0.95, 1.0, steel, -98.6 + i * 6, 0.47, -19.5), box(0.9, 1.9, 0.6, red, -97.4 + i * 6, 0.95, -19.6));
  for (let i = 0; i < 5; i++) for (let lv = 0; lv < 3; lv++) add(S, box(2.6, 0.08, 0.9, steel, -76, 0.5 + lv * 0.9, -18 + i * 4), box(0.8, 0.5, 0.6, mat([0xf28c1e, 0x596270, 0x2f6fb5][(i + lv) % 3], 0.6, 0.2), -76.3 + ((i + lv) % 3) * 0.4, 0.82 + lv * 0.9, -18 + i * 4));
  add(S, cyl(0.45, 0.3, dark, -88, 0.15, -6), box(0.3, 1.3, 0.3, mat(0xf28c1e, 0.45, 0.3), -88, 0.95, -6), box(1.2, 0.2, 0.2, mat(0xf28c1e, 0.45, 0.3), -87.5, 1.6, -6));
  const ms = textSprite(['MAINTENANCE & SPARES', 'crew base · predictive work orders'], { size: 40, scale: 1.4, accent: '#d95926' }); ms.position.set(-89, 6.5, -10); scene.add(ms); live.labels.push({ sp: ms });
  for (let i = 0; i < 3; i++) live.crewHome.push([-96 + i * 5, 0, -12]);
  const as = textSprite('AGV CHARGING', { size: 36, scale: 1.2, accent: '#14b8a6' }); as.position.set(-111, 4.6, -10); scene.add(as); live.labels.push({ sp: as });

  // ---- control centre (glass room with video wall)
  const gl = glass(0x9fd0e8, 0.16);
  const cc = [36, 64, 46, 62];
  add(S, box(cc[1] - cc[0], 0.3, cc[3] - cc[2], mat(0x3a4048, 0.7, 0.2), (cc[0] + cc[1]) / 2, 0.15, (cc[2] + cc[3]) / 2), box(cc[1] - cc[0], 0.2, cc[3] - cc[2] + 0.4, white, (cc[0] + cc[1]) / 2, 4.2, (cc[2] + cc[3]) / 2),
    box(cc[1] - cc[0], 3.7, 0.06, gl, (cc[0] + cc[1]) / 2, 2.25, cc[2]), box(0.06, 3.7, cc[3] - cc[2], gl, cc[0], 2.25, (cc[2] + cc[3]) / 2), box(0.06, 3.7, cc[3] - cc[2], gl, cc[1], 2.25, (cc[2] + cc[3]) / 2),
    box(cc[1] - cc[0], 3.9, 0.3, mat(0x1b1e22, 0.7, 0.2), (cc[0] + cc[1]) / 2, 2.25, cc[3]));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) S.add(box(4.9, 1.5, 0.05, emat([0x39b8ff, 0x3ddc97, 0x39b8ff, 0xfab219, 0x39b8ff][(i + j * 2) % 5], 1.1), 39.6 + i * 5.2, 1.4 + j * 1.65, cc[3] - 0.2));
  for (const x of [cc[0], cc[1]]) for (const z of [cc[2], cc[3]]) S.add(box(0.25, 4.1, 0.25, white, x, 2.2, z));
  for (let i = 0; i < 4; i++) {
    add(S, box(4.4, 0.08, 1.3, white, 41 + i * 6, 1.1, 53), box(0.1, 0.8, 1.1, steel, 39.2 + i * 6, 0.7, 53), box(0.1, 0.8, 1.1, steel, 42.8 + i * 6, 0.7, 53));
    for (const o of [-1.1, 0, 1.1]) add(S, box(0.9, 0.55, 0.04, dark, 41 + i * 6 + o, 1.62, 53.4), box(0.84, 0.49, 0.01, SCREEN, 41 + i * 6 + o, 1.62, 53.37));
    const p = person(0x3987e5); p.position.set(41 + i * 6, 0.3, 51.8); p.rotation.y = -Math.PI / 2; S.add(p);
  }
  const cs = textSprite(['PLANT CONTROL CENTRE', 'digital twin · autonomous operations'], { size: 40, scale: 1.4, accent: '#3987e5' }); cs.position.set(50, 7, 54); scene.add(cs); live.labels.push({ sp: cs });
  // ---- quality lab + rework bays
  add(S, box(22, 0.12, 14, mat(0xdfe3e7, 0.5, 0.1), 83, 0.06, 55), box(3.4, 0.9, 2.2, mat(0x30343a, 0.4, 0.2), 78, 0.55, 54), box(0.3, 2.0, 0.3, white, 76.6, 1.9, 54), box(0.3, 2.0, 0.3, white, 79.4, 1.9, 54), box(3.2, 0.3, 0.4, white, 78, 2.9, 54), cyl(0.05, 1.0, steel, 78, 2.3, 54),
    box(3, 0.08, 1.2, white, 88, 1.0, 58), box(0.9, 0.55, 0.04, SCREEN, 88, 1.5, 58.5), box(2.4, 1.9, 0.7, white, 90, 0.95, 50));
  const ql = textSprite(['QUALITY LAB', 'CMM · metrology · SPC'], { size: 38, scale: 1.3, accent: '#d55181' }); ql.position.set(83, 6, 55); scene.add(ql); live.labels.push({ sp: ql });
  for (const x of [106, 116]) { for (const [ox, oz] of [[-1.6, -2.4], [1.6, -2.4], [-1.6, 2.4], [1.6, 2.4]]) S.add(box(0.3, 2.4, 0.3, blue, x + ox, 1.2, 54 + oz)); add(S, box(0.4, 0.12, 5.2, steel, x - 0.75, 0.3, 54), box(0.4, 0.12, 5.2, steel, x + 0.75, 0.3, 54)); }
  const rw = textSprite('REWORK BAYS', { size: 36, scale: 1.2, accent: '#ec835a' }); rw.position.set(111, 5.4, 54); scene.add(rw); live.labels.push({ sp: rw });

  // ---- yard, charging posts, carrier bays, lighting
  for (let i = 0; i < YARD_SLOTS; i++) {
    const p = yardSlotPos(i);
    add(S, box(5.4, 0.012, 0.1, line, p[0], 0.0, p[2] - YARD.dz / 2));
    if (i % YARD.rows === YARD.rows - 1) S.add(box(5.4, 0.012, 0.1, line, p[0], 0.0, p[2] + YARD.dz / 2));
    if (i % 2 === 0) add(S, box(0.22, 1.3, 0.3, white, p[0] - 2.9, 0.65, p[2] + YARD.dz / 2), box(0.1, 0.2, 0.31, GREEN, p[0] - 2.9, 1.05, p[2] + YARD.dz / 2));
  }
  CARRIER_BAYS.forEach((b, r) => {
    add(S, box(0.14, 0.012, 30, ylw, b.x - 2.6, 0, b.z), box(0.14, 0.012, 30, ylw, b.x + 2.6, 0, b.z));
    const sp = textSprite([REGIONS[r].name, `lane ${r + 1}`], { size: 34, scale: 1.0, accent: ZONES.yard.color }); sp.position.set(b.x, 6.4 + (r % 2) * 2.2, b.z + 18); scene.add(sp); live.labels.push({ sp });
  });
  for (const [x, z] of [[142, -42], [191, -42], [142, 40], [191, 40], [142, 72], [221, 72], [221, -42]]) add(S, cyl(0.14, 11, steel, x, 5.5, z, 'y', 8), box(2.2, 0.16, 0.5, dark, x + 0.9, 11, z), box(1.8, 0.05, 0.4, LAMP, x + 0.9, 10.9, z));
  for (let z = -44; z <= 74; z += 4) add(S, box(0.08, 1.8, 0.08, steel, 242, 0.9, z)); S.add(box(0.05, 0.05, 118, steel, 242, 1.8, 15));
  for (let z = -250; z <= 250; z += 12) add(S, box(0.16, 0.012, 5, line, 233, 0, z), box(0.16, 0.012, 5, line, -164, 0, z));
  add(S, box(4, 2.6, 4, white, 190, 1.3, 66), box(4.4, 0.2, 4.4, dark, 190, 2.7, 66), box(3, 1, 0.05, glass(0x9fd0e8, 0.3), 190, 1.7, 63.97));
  // yard lanes
  for (let c = 0; c < YARD.cols; c++) { const lx = YARD.x0 + c * YARD.dx - 4.5; add(S, box(0.1, 0.012, 46, ylw, lx - 1.2, 0, -16), box(0.1, 0.012, 46, ylw, lx + 1.2, 0, -16)); }
  add(S, box(60, 0.012, 0.1, ylw, 164, 0, 7.6), box(60, 0.012, 0.1, ylw, 164, 0, 4.4));

  // ---- a few people on the shop floor
  for (const [x, z, r, v] of [[-112, -30, 0, 0xfab219], [60, 10, 1.6, 0xfab219], [-20, 10, 3, 0x0ca30c], [10, -30, 0.5, 0xfab219], [-100, 37.5, 1, 0xfab219], [124, 20, 2, 0x0ca30c], [70, 40, -1, 0x3987e5]]) { const p = person(v); p.position.set(x, 0, z); p.rotation.y = r; S.add(p); }

  scene.add(bake(S));
  return live;
}

// stock boxes on the warehouse racks follow live inventory
const _m4 = new THREE.Matrix4(), _c = new THREE.Color();
export function updateStock(live, sim) {
  let k = 0;
  for (const m of MATERIALS) {
    const cap = m.rop + m.lot * 1.3, n = Math.max(0, Math.min(52, Math.round(52 * sim.s.inv[m.id] / cap)));
    _c.setHex(MAT_COLOR[m.id]);
    for (let i = 0; i < n; i++) {
      const col = i % 13, lv = Math.floor(i / 13);
      _m4.makeTranslation(-145.3 + col * 1.6, 0.85 + lv * 1.5, m.pz);
      live.stock.setMatrixAt(k, _m4); live.stock.setColorAt(k, _c); k++;
    }
  }
  live.stock.count = k; live.stock.instanceMatrix.needsUpdate = true; if (live.stock.instanceColor) live.stock.instanceColor.needsUpdate = true;
}
