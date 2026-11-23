// Moving equipment: articulated robots (with inverse kinematics so the tool
// really reaches its target), AGVs, trucks, car carriers, people.
import * as THREE from 'three';
import { mat, box, cyl, grp, add, mergeLocal, VC } from './kit.js';

// --------------------------------------------------------------------- robot
const ROBOT_GEO = {};
const L1 = 1.2, L2 = 1.05, SHOULDER = 0.85;
const _t = new THREE.Vector3(), _w = new THREE.Vector3();
const lerpA = (a, b, f) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * f; };
// tool: 'weld' | 'spray' | 'grip' | 'seal' | 'scan'
export function makeRobot(color = 0xf28c1e, scale = 1.25, tool = 'weld') {
  const key = `${color}|${tool}`;
  let G = ROBOT_GEO[key];
  if (!G) {
    const c = mat(color, 0.45, 0.3), d = mat(0x24282e, 0.5, 0.5), s = mat(0xb9bec6, 0.35, 0.8);
    const turret = grp(0, 0, 0, cyl(0.3, 0.32, c, 0, 0.16, 0, 'y', 16), box(0.5, 0.44, 0.52, c, 0.02, 0.5, 0), cyl(0.2, 0.62, d, 0.02, 0.6, 0, 'z', 12), box(0.26, 0.3, 0.2, d, -0.3, 0.42, 0));
    const upper = grp(0, 0, 0, box(0.2, 1.22, 0.2, c, 0, 0.6, 0.18), cyl(0.19, 0.24, c, 0, 0, 0.18, 'z', 12), cyl(0.17, 0.5, d, 0, 1.2, 0.02, 'z', 12), box(0.06, 0.9, 0.06, d, 0.12, 0.6, 0.3));
    const fore = grp(0, 0, 0, box(0.34, 0.28, 0.3, c, -0.02, 0, 0), box(1.0, 0.16, 0.18, c, 0.55, 0, 0), cyl(0.11, 0.3, d, -0.26, 0, 0, 'x', 10), cyl(0.1, 0.22, d, 1.05, 0, 0, 'z', 10));
    const wrist = new THREE.Group();
    add(wrist, cyl(0.08, 0.14, s, 0.08, 0, 0, 'x', 10));
    if (tool === 'weld') add(wrist, box(0.3, 0.42, 0.12, d, 0.3, -0.05, 0), box(0.34, 0.07, 0.07, s, 0.52, 0.14, 0), box(0.34, 0.07, 0.07, s, 0.52, -0.22, 0), cyl(0.025, 0.12, mat(0xc87533, 0.3, 0.9), 0.66, 0.06, 0, 'y', 8), cyl(0.025, 0.12, mat(0xc87533, 0.3, 0.9), 0.66, -0.14, 0, 'y', 8));
    else if (tool === 'spray') add(wrist, cyl(0.07, 0.3, s, 0.3, 0, 0, 'x', 12), cyl(0.11, 0.08, s, 0.48, 0, 0, 'x', 14), box(0.14, 0.14, 0.2, d, 0.18, 0.1, 0));
    else if (tool === 'seal') add(wrist, box(0.2, 0.12, 0.12, d, 0.22, 0, 0), cyl(0.02, 0.3, s, 0.42, -0.06, 0, 'x', 6));
    else if (tool === 'scan') add(wrist, box(0.2, 0.22, 0.26, mat(0xe9edf0, 0.4, 0.2), 0.24, 0, 0), box(0.02, 0.08, 0.18, mat(0x1b6cff), 0.35, 0, 0));
    else add(wrist, box(0.1, 0.5, 0.5, d, 0.2, 0, 0), box(0.16, 0.06, 0.06, s, 0.32, 0.2, 0.2), box(0.16, 0.06, 0.06, s, 0.32, -0.2, 0.2), box(0.16, 0.06, 0.06, s, 0.32, 0.2, -0.2), box(0.16, 0.06, 0.06, s, 0.32, -0.2, -0.2));
    G = ROBOT_GEO[key] = { turret: mergeLocal(turret), upper: mergeLocal(upper), fore: mergeLocal(fore), wrist: mergeLocal(wrist) };
  }
  const mk = geo => { const m = new THREE.Mesh(geo, VC.std); m.castShadow = true; return m; };
  const root = new THREE.Group(); root.scale.setScalar(scale);
  const j1 = grp(0, 0.25, 0, mk(G.turret)), j2 = grp(0, 0.6, 0, mk(G.upper)), j3 = grp(0, 1.2, 0, mk(G.fore)), j4 = grp(1.05, 0, 0, mk(G.wrist));
  const tipX = tool === 'weld' ? 0.66 : tool === 'grip' ? 0.4 : 0.5;
  const tip = new THREE.Object3D(); tip.position.set(tipX, 0, 0);
  j4.add(tip); j3.add(j4); j2.add(j3); j1.add(j2); root.add(j1);
  const ph = Math.random() * 10, sp = 0.8 + Math.random() * 0.5;
  const home = [0, 0.15, 0.55, -0.4];
  const apply = (q1, q2, q3, q4, f) => {
    j1.rotation.y = lerpA(j1.rotation.y, q1, f); j2.rotation.z = lerpA(j2.rotation.z, q2, f);
    j3.rotation.z = lerpA(j3.rotation.z, q3, f); j4.rotation.z = lerpA(j4.rotation.z, q4, f);
  };
  const r = {
    root, tip, wrist: j4, a: 0, err: 9, tool, reachMax: (L1 + L2 + tipX - 0.03) * scale,
    // generic process motion (act 0..1); act = 0 parks the arm at home
    update(act, t, dt) {
      r.a += (act - r.a) * Math.min(1, dt * 3); r.err = 9;
      const a = r.a, w = t * sp + ph;
      const q1 = 0.55 * Math.sin(w * 0.9) + 0.2 * Math.sin(w * 2.3), q2 = -0.52 + 0.24 * Math.sin(w * 1.4 + 1), q3 = -0.28 + 0.34 * Math.sin(w * 1.9 + 2), q4 = -0.2 + 0.5 * Math.sin(w * 2.6);
      apply(home[0] + (q1 - home[0]) * a, home[1] + (q2 - home[1]) * a, home[2] + (q3 - home[2]) * a, home[3] + (q4 - home[3]) * a, Math.min(1, dt * 5));
    },
    // inverse kinematics: drive the tool tip to a world-space point
    reach(world, dt) {
      root.updateWorldMatrix(true, false);
      _t.copy(world); root.worldToLocal(_t);
      const rad = Math.hypot(_t.x, _t.z), h = _t.y - SHOULDER, l2 = L2 + tipX;
      const dist = Math.hypot(rad, h), d = Math.max(0.55, Math.min(L1 + l2 - 0.03, dist)), k = d / (dist || 1);
      const al = Math.atan2(h, rad), be = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - l2 * l2) / (2 * L1 * d)))), psi = al + be;
      const ex = L1 * Math.cos(psi), ey = L1 * Math.sin(psi), phi = Math.atan2(h * k - ey, rad * k - ex);
      const q2 = psi - Math.PI / 2;
      apply(Math.atan2(-_t.z, _t.x), q2, phi - q2, 0, Math.min(1, dt * 7));
      r.a = 1;
      tip.getWorldPosition(_w); r.err = _w.distanceTo(world);
    },
  };
  return r;
}
export function robotBase(scale = 1.25, riser = 0) {
  const d = mat(0x24282e, 0.5, 0.5);
  const g = grp(0, 0, 0, cyl(0.42 * scale, 0.25 * scale, d, 0, riser + 0.125 * scale, 0, 'y', 16), box(1.0 * scale, 0.06, 1.0 * scale, mat(0x3a4048, 0.6, 0.4), 0, riser + 0.03, 0));
  if (riser > 0) g.add(box(0.7, riser, 0.7, mat(0x4a515a, 0.6, 0.4), 0, riser / 2, 0));
  return g;
}

// ----------------------------------------------------------------------- AGV
let AGV_G = null;
export function makeAGV() {
  if (!AGV_G) {
    const g = new THREE.Group(), body = mat(0x2a2f36, 0.5, 0.4), acc = mat(0x14b8a6, 0.5, 0.2);
    add(g, box(1.9, 0.26, 1.15, body, 0, 0.2, 0), box(1.94, 0.06, 1.19, acc, 0, 0.12, 0), box(1.5, 0.04, 0.9, mat(0x596270, 0.4, 0.7), 0, 0.35, 0), cyl(0.05, 0.3, mat(0x8a9099), 0.8, 0.5, 0.45, 'y', 8));
    AGV_G = mergeLocal(g);
  }
  const g = new THREE.Group();
  const b = new THREE.Mesh(AGV_G, VC.std); b.castShadow = true;
  const loadM = new THREE.MeshStandardMaterial({ color: 0x3987e5, roughness: 0.7 });
  const load = box(1.3, 0.75, 0.85, loadM, 0, 0.75, 0); load.castShadow = true;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14e0c8 })); lamp.position.set(0.8, 0.7, 0.45);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 0.8;
  add(g, b, load, lamp, pick);
  g.userData = { load, loadM, lamp, pick };
  return g;
}

// -------------------------------------------------------------------- trucks
let TRUCK_G = null;
export function makeTruck() {
  if (!TRUCK_G) {
    const cabG = new THREE.Group(), white = mat(0xe8ecef, 0.4, 0.3), dark = mat(0x1b1e22, 0.6, 0.3), tyre = mat(0x101113, 0.9, 0);
    add(cabG, box(2.3, 2.6, 2.5, white, 6.4, 2.1, 0), box(0.1, 1.0, 2.2, dark, 7.56, 2.6, 0), box(3.2, 0.5, 2.2, dark, 5.6, 0.9, 0));
    for (const x of [6.6, 4.6]) for (const z of [-1.15, 1.15]) cabG.add(cyl(0.52, 0.34, tyre, x, 0.52, z, 'z', 14));
    const tr = new THREE.Group();
    add(tr, box(13.2, 0.3, 2.5, dark, -2.4, 1.2, 0));
    for (const x of [-6.8, -5.5, -4.2]) for (const z of [-1.15, 1.15]) tr.add(cyl(0.52, 0.34, tyre, x, 0.52, z, 'z', 14));
    TRUCK_G = { cab: mergeLocal(cabG), trailer: mergeLocal(tr) };
  }
  const g = new THREE.Group();
  const cab = new THREE.Mesh(TRUCK_G.cab, VC.std), tr = new THREE.Mesh(TRUCK_G.trailer, VC.std);
  const bm = new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.55, metalness: 0.2 });
  const bx = box(13.2, 2.8, 2.55, bm, -2.4, 2.75, 0);
  const stripe = new THREE.MeshStandardMaterial({ color: 0x3987e5, roughness: 0.6 });
  const st = box(13.24, 0.5, 2.59, stripe, -2.4, 2.2, 0);
  cab.castShadow = tr.castShadow = bx.castShadow = true;
  add(g, cab, tr, bx, st);
  g.userData = { box: bx, stripe };
  return g;
}
// car-carrier: cab + two-deck open trailer; vehicles are drawn by the CarFleet
export const CARRIER_SLOTS = [];
for (let i = 0; i < 4; i++) { CARRIER_SLOTS.push([-8.6 + i * 5.1, 1.25, 0]); CARRIER_SLOTS.push([-8.6 + i * 5.1, 3.1, 0]); }
let CARRIER_G = null;
export function makeCarrier() {
  if (!CARRIER_G) {
    const g = new THREE.Group(), blue = mat(0x1c5cab, 0.4, 0.4), dark = mat(0x1b1e22, 0.6, 0.3), tyre = mat(0x101113, 0.9, 0), steel = mat(0x9aa1a9, 0.4, 0.8);
    add(g, box(2.3, 2.5, 2.5, blue, 12.3, 2.0, 0), box(0.1, 1.0, 2.2, dark, 13.46, 2.5, 0), box(3.0, 0.5, 2.2, dark, 11.6, 0.9, 0));
    for (const x of [12.4, 10.6]) for (const z of [-1.15, 1.15]) g.add(cyl(0.52, 0.34, tyre, x, 0.52, z, 'z', 14));
    for (const z of [-1.2, 1.2]) add(g, box(21.4, 0.14, 0.14, steel, -1.0, 1.15, z), box(21.4, 0.14, 0.14, steel, -1.0, 3.0, z));
    for (let i = 0; i < 6; i++) for (const z of [-1.2, 1.2]) g.add(box(0.12, 1.9, 0.12, steel, -11.2 + i * 4.1, 2.05, z));
    for (const y of [1.12, 2.97]) for (const z of [-0.7, 0.7]) g.add(box(21.2, 0.05, 0.5, mat(0x596270, 0.5, 0.7), -1.0, y, z));
    for (const x of [-9.5, -8.2, -6.9]) for (const z of [-1.15, 1.15]) g.add(cyl(0.48, 0.34, tyre, x, 0.5, z, 'z', 14));
    CARRIER_G = mergeLocal(g);
  }
  const m = new THREE.Mesh(CARRIER_G, VC.std); m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

// -------------------------------------------------------------------- people
export function person(vest = 0xfab219) {
  const skin = mat(0xd9a57e, 0.8, 0), cloth = mat(0x2b3440, 0.9, 0), v = mat(vest, 0.7, 0), helm = mat(0xf4f4f0, 0.5, 0);
  return grp(0, 0, 0,
    box(0.16, 0.82, 0.18, cloth, 0, 0.41, 0.1), box(0.16, 0.82, 0.18, cloth, 0, 0.41, -0.1),
    box(0.26, 0.6, 0.44, v, 0, 1.12, 0), box(0.12, 0.56, 0.1, cloth, 0, 1.1, 0.28), box(0.12, 0.56, 0.1, cloth, 0, 1.1, -0.28),
    cyl(0.11, 0.2, skin, 0, 1.54, 0, 'y', 10), cyl(0.13, 0.1, helm, 0, 1.67, 0, 'y', 10));
}
let PERSON_G = null;
export function makeCrew() {
  if (!PERSON_G) PERSON_G = mergeLocal(person(0xd95926));
  const m = new THREE.Mesh(PERSON_G, VC.matte); m.castShadow = true;
  return m;
}
