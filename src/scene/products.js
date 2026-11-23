// Product models built from individual components — the vehicle, the battery
// pack, the drive unit and the pressed body-side panel. Each component is its own
// geometry so a station can stage it, carry it and join it; once a station has
// finished, its components collapse into one merged mesh per material so that a
// full line of vehicles stays cheap to draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, box, cyl, grp, add, mergeLocal, VC } from './kit.js';
import { LINES, STATIONS } from '../config.js';
import { PROCESS } from '../process.js';

export const COMP = {};     // key -> { geo, mat, station, line, center }
export const GROUP = {};    // stationId -> { body, struct, vc, glass, light }  (merged geometry per material)
const ALL = {};             // line -> { body, glass, rest } merged finished product

const strip = g => { const x = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(x.attributes)) if (n !== 'position' && n !== 'normal') x.deleteAttribute(n); return x; };
function tint(g, hex) {
  const x = strip(g), n = x.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  x.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return x;
}
function shapeOf(pts, holes = []) {
  const draw = (s, list) => list.forEach((p, i) => { if (p.arc) s.absarc(...p.arc); else if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); });
  const s = new THREE.Shape(); draw(s, pts); s.closePath();
  for (const h of holes) { const p = new THREE.Path(); draw(p, h); p.closePath(); s.holes.push(p); }
  return s;
}
// extrude an XY profile to a plate of thickness d centred on z = zc
function plate(pts, holes, d, zc, hex) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts, holes), { depth: d, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, zc - d / 2);
  return tint(g, hex);
}
// flat slab spanning the profile segment (x0,y0)-(x1,y1), width w across the car
function slab(x0, y0, x1, y1, w, th, hex, shrink = 1, off = 0) {
  const len = Math.hypot(x1 - x0, y1 - y0), g = new THREE.BoxGeometry(len * shrink, th, w);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  g.translate((x0 + x1) / 2 - (y1 - y0) / len * off, (y0 + y1) / 2 + (x1 - x0) / len * off, 0);
  return tint(g, hex);
}
const fromMeshes = (...meshes) => mergeLocal(grp(0, 0, 0, ...meshes));
const join = (...gs) => mergeGeometries(gs.map(strip_keepColor));
function strip_keepColor(g) { const x = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(x.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'color') x.deleteAttribute(n); return x; }

function reg(line, key, station, material, geo) {
  geo.computeBoundingBox();
  COMP[key] = { key, geo, mat: material, station, line, center: geo.boundingBox.getCenter(new THREE.Vector3()), box: geo.boundingBox.clone() };
}

// ------------------------------------------------------------------ vehicle
const BARE = 0xb1b7bf, ALU = 0xc9ced4, DARK = 0x23272d;
const SIDE = [[-2.28, 0.36], [-1.84, 0.27], { arc: [-1.42, 0.3, 0.42, Math.PI, 0, true] }, [-1.0, 0.27], [1.0, 0.27], [1.0, 0.98], [1.05, 1.0], [0.3, 1.47], [-1.3, 1.46], [-2.18, 1.0], [-2.34, 0.8]];
const H_FD = [[0.06, 0.44], [0.94, 0.44], [0.94, 1.0], [0.37, 1.36], [0.06, 1.37]];
const H_RD = [[-0.96, 0.44], [-0.06, 0.44], [-0.06, 1.37], [-0.9, 1.365], [-0.96, 1.3]];
const H_QW = [[-1.08, 1.06], [-1.08, 1.36], [-1.3, 1.35], [-1.9, 1.06]];
const D_F = [[0.075, 0.455], [0.925, 0.455], [0.925, 0.995], [0.365, 1.345], [0.075, 1.355]], W_F = [[0.14, 1.03], [0.86, 1.03], [0.375, 1.315], [0.14, 1.32]];
const D_R = [[-0.945, 0.455], [-0.075, 0.455], [-0.075, 1.355], [-0.895, 1.35], [-0.945, 1.29]], W_R = [[-0.88, 1.03], [-0.14, 1.03], [-0.14, 1.32], [-0.87, 1.315]];
const FEND = [[1.0, 0.3], { arc: [1.42, 0.3, 0.42, Math.PI, 0, true] }, [1.84, 0.27], [2.26, 0.36], [2.35, 0.62], [2.2, 0.84], [1.05, 1.0], [1.0, 0.98]];
const ZS = 0.9;   // half-width to the centre of the body-side plates

function buildCar() {
  const st = mat(BARE, 0.4, 0.8), al = mat(ALU, 0.45, 0.7), dk = mat(DARK, 0.6, 0.4), R = (...a) => reg('main', ...a);
  // --- underbody (BIW-10)
  R('frontCast', 'BIW-10', 'struct', fromMeshes(box(1.15, 0.16, 0.14, al, 1.6, 0.5, 0.42), box(1.15, 0.16, 0.14, al, 1.6, 0.5, -0.42), box(0.34, 0.5, 0.26, al, 1.42, 0.74, 0.6), box(0.34, 0.5, 0.26, al, 1.42, 0.74, -0.6),
    box(0.12, 0.2, 1.3, al, 2.15, 0.5, 0), box(0.1, 0.3, 1.56, al, 1.03, 0.47, 0), box(0.5, 0.06, 0.9, al, 1.5, 0.42, 0)));
  R('rearCast', 'BIW-10', 'struct', fromMeshes(box(1.3, 0.12, 1.5, al, -1.6, 0.5, 0), box(0.86, 0.5, 0.2, al, -1.42, 0.72, 0.68), box(0.86, 0.5, 0.2, al, -1.42, 0.72, -0.68),
    box(0.5, 0.2, 0.16, al, -2.05, 0.52, 0.45), box(0.5, 0.2, 0.16, al, -2.05, 0.52, -0.45), box(0.1, 0.26, 1.5, al, -2.24, 0.52, 0), box(0.08, 0.1, 1.5, al, -1.2, 0.6, 0), box(0.08, 0.1, 1.5, al, -1.9, 0.6, 0)));
  R('floorPan', 'BIW-10', 'struct', fromMeshes(box(1.95, 0.04, 1.62, st, 0.02, 0.31, 0), box(0.1, 0.09, 1.56, st, -0.6, 0.375, 0), box(0.1, 0.09, 1.56, st, 0, 0.375, 0), box(0.1, 0.09, 1.56, st, 0.6, 0.375, 0),
    box(1.98, 0.15, 0.1, st, 0.01, 0.36, 0.8), box(1.98, 0.15, 0.1, st, 0.01, 0.36, -0.8)));
  // --- body sides (BIW-20)
  R('sideL', 'BIW-20', 'body', plate(SIDE, [H_FD, H_RD, H_QW], 0.05, ZS, BARE));
  R('sideR', 'BIW-20', 'body', plate(SIDE, [H_FD, H_RD, H_QW], 0.05, -ZS, BARE));
  // --- framing & roof (BIW-30)
  R('dashPanel', 'BIW-30', 'struct', fromMeshes(box(0.05, 0.62, 1.74, st, 1.0, 0.68, 0), box(0.26, 0.05, 1.74, st, 1.1, 0.985, 0), box(0.3, 0.3, 0.5, st, 0.9, 0.5, 0)));
  R('roofBows', 'BIW-30', 'struct', fromMeshes(box(0.07, 0.05, 1.74, st, 0.26, 1.43, 0), box(0.06, 0.04, 1.74, st, -0.25, 1.44, 0), box(0.06, 0.04, 1.74, st, -0.78, 1.44, 0), box(0.07, 0.05, 1.74, st, -1.27, 1.43, 0)));
  R('roofPanel', 'BIW-30', 'body', slab(0.3, 1.47, -1.3, 1.46, 1.75, 0.03, BARE));
  // --- closures (BIW-50)
  R('fenderL', 'BIW-50', 'body', plate(FEND, [], 0.05, ZS, BARE));
  R('fenderR', 'BIW-50', 'body', plate(FEND, [], 0.05, -ZS, BARE));
  R('doorFL', 'BIW-50', 'body', plate(D_F, [W_F], 0.05, ZS, BARE));
  R('doorFR', 'BIW-50', 'body', plate(D_F, [W_F], 0.05, -ZS, BARE));
  R('doorRL', 'BIW-50', 'body', plate(D_R, [W_R], 0.05, ZS, BARE));
  R('doorRR', 'BIW-50', 'body', plate(D_R, [W_R], 0.05, -ZS, BARE));
  R('hood', 'BIW-50', 'body', slab(1.05, 1.0, 2.2, 0.84, 1.75, 0.035, BARE));
  R('liftgate', 'BIW-50', 'body', join(slab(-1.3, 1.46, -2.18, 1.0, 1.75, 0.035, BARE), slab(-2.18, 1.0, -2.34, 0.8, 1.75, 0.035, BARE)));
  // --- cockpit & harness (GA-10)
  const hv = mat(0xff7a1a, 0.5, 0.2), carpet = mat(0x1b1d21, 0.95, 0);
  R('harness', 'GA-10', 'vc', fromMeshes(box(1.9, 0.015, 1.5, carpet, 0.02, 0.338, 0), box(1.9, 0.03, 0.04, hv, 0.02, 0.36, 0.68), box(0.04, 0.03, 1.36, hv, 0.92, 0.36, 0), box(1.6, 0.025, 0.03, dk, 0.02, 0.36, -0.68), box(0.03, 0.5, 0.03, dk, 0.96, 0.62, -0.68)));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), dk); wheel.position.set(0.5, 1.02, 0.38); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.35;
  R('cockpit', 'GA-10', 'vc', fromMeshes(box(0.08, 0.08, 1.7, mat(0x8e949c, 0.45, 0.8), 0.92, 0.88, 0), box(0.36, 0.26, 1.66, mat(0x2b2f36, 0.85, 0), 0.82, 0.95, 0), box(0.02, 0.2, 0.42, mat(0x39b8ff, 0.3, 0.1), 0.63, 1.08, 0),
    cyl(0.025, 0.3, dk, 0.62, 0.98, 0.38, 'x', 8), wheel, box(0.3, 0.3, 0.44, mat(0x40464e, 0.7, 0.2), 0.86, 0.66, 0), box(0.5, 0.16, 0.3, mat(0x2b2f36, 0.85, 0), 0.45, 0.5, 0)));
  // --- glazing (GA-20)
  R('windshield', 'GA-20', 'glass', slab(1.05, 1.0, 0.3, 1.47, 1.74, 0.02, 0x1a2a33));
  R('rearGlass', 'GA-20', 'glass', slab(-1.3, 1.46, -2.18, 1.0, 1.42, 0.02, 0x1a2a33, 0.72, -0.03));
  R('sideGlass', 'GA-20', 'glass', join(...[ZS, -ZS].flatMap(z => [plate(W_F, [], 0.012, z, 0x1a2a33), plate(W_R, [], 0.012, z, 0x1a2a33), plate(H_QW, [], 0.012, z, 0x1a2a33)])));
  // --- chassis, drive units, battery (GA-30)
  const sub = [], disc = mat(0x8e949c, 0.4, 0.9), arm = mat(0x30353c, 0.6, 0.5);
  for (const x of [1.42, -1.42]) {
    sub.push(box(0.5, 0.07, 1.16, arm, x, 0.27, 0), box(0.07, 0.07, 1.3, arm, x + 0.3, 0.3, 0), box(0.07, 0.07, 1.3, arm, x - 0.3, 0.3, 0));
    for (const z of [0.66, -0.66]) sub.push(cyl(0.16, 0.03, disc, x, 0.34, z, 'z', 16), cyl(0.045, 0.5, mat(0xd9a400, 0.5, 0.4), x, 0.58, z * 0.92, 'y', 8), box(0.06, 0.04, 0.34, arm, x + 0.1, 0.3, z * 0.75), box(0.12, 0.14, 0.08, mat(0xb5161b, 0.5, 0.3), x + 0.12, 0.42, z));
  }
  R('subframes', 'GA-30', 'vc', fromMeshes(...sub));
  const du = x => fromMeshes(cyl(0.17, 0.34, mat(ALU, 0.35, 0.85), x, 0.36, -0.14, 'z', 16), box(0.3, 0.3, 0.22, mat(ALU, 0.35, 0.85), x + 0.04, 0.37, 0.16), box(0.34, 0.1, 0.3, dk, x, 0.57, -0.1), box(0.1, 0.05, 0.14, hv, x + 0.12, 0.64, -0.1), cyl(0.03, 1.2, disc, x, 0.34, 0, 'z', 8));
  R('rdu', 'GA-30', 'vc', du(-1.42));
  R('fdu', 'GA-30', 'vc', du(1.42));
  R('pack', 'GA-30', 'vc', fromMeshes(box(2.1, 0.12, 1.44, dk, 0.02, 0.21, 0), box(2.16, 0.04, 0.08, mat(0x8e949c, 0.45, 0.8), 0.02, 0.2, 0.74), box(2.16, 0.04, 0.08, mat(0x8e949c, 0.45, 0.8), 0.02, 0.2, -0.74),
    box(1.9, 0.01, 1.2, mat(0x9aa3ad, 0.4, 0.7), 0.02, 0.275, 0), box(0.14, 0.08, 0.26, hv, 1.1, 0.24, 0)));
  // --- wheels & fascias (GA-40)
  const tyre = mat(0x111214, 0.9, 0), rim = mat(0xb9bec6, 0.35, 0.8);
  const wh = (x, z) => fromMeshes(cyl(0.34, 0.24, tyre, x, 0.34, z, 'z', 20), cyl(0.21, 0.25, rim, x, 0.34, z, 'z', 14), cyl(0.06, 0.26, dk, x, 0.34, z, 'z', 8));
  R('wheelFL', 'GA-40', 'vc', wh(1.42, 0.8)); R('wheelFR', 'GA-40', 'vc', wh(1.42, -0.8)); R('wheelRL', 'GA-40', 'vc', wh(-1.42, 0.8)); R('wheelRR', 'GA-40', 'vc', wh(-1.42, -0.8));
  R('fasciaF', 'GA-40', 'body', join(slab(2.2, 0.84, 2.35, 0.62, 1.85, 0.05, BARE), slab(2.35, 0.62, 2.26, 0.36, 1.85, 0.05, BARE)));
  R('fasciaR', 'GA-40', 'body', slab(-2.34, 0.8, -2.28, 0.36, 1.85, 0.05, BARE));
  // --- seats & lamps (GA-50)
  const sm = mat(0x3a3530, 0.9, 0), sm2 = mat(0x25221f, 0.9, 0);
  const seat = z => fromMeshes(box(0.5, 0.12, 0.48, sm, 0.12, 0.5, z), box(0.1, 0.6, 0.46, sm, -0.14, 0.82, z), box(0.08, 0.16, 0.26, sm2, -0.15, 1.2, z), box(0.5, 0.08, 0.4, mat(0x30353c, 0.6, 0.5), 0.12, 0.4, z));
  R('seatFL', 'GA-50', 'vc', seat(0.4)); R('seatFR', 'GA-50', 'vc', seat(-0.4));
  R('seatRear', 'GA-50', 'vc', fromMeshes(box(0.5, 0.12, 1.5, sm, -0.72, 0.5, 0), box(0.1, 0.55, 1.5, sm, -0.98, 0.8, 0), box(0.08, 0.14, 0.26, sm2, -0.99, 1.15, 0.45), box(0.08, 0.14, 0.26, sm2, -0.99, 1.15, -0.45)));
  R('lights', 'GA-50', 'light', fromMeshes(box(0.05, 0.07, 0.4, mat(0xf4f8ff), 2.3, 0.75, 0.62), box(0.05, 0.07, 0.4, mat(0xf4f8ff), 2.3, 0.75, -0.62), box(0.04, 0.05, 1.6, mat(0xff2a2a), -2.33, 0.86, 0)));
  // skid the body rides on until it stands on its own wheels
  const sk = mat(0x2f6fb5, 0.6, 0.3);
  ALL.skid = fromMeshes(box(4.6, 0.1, 0.14, sk, 0, 0.1, 0.55), box(4.6, 0.1, 0.14, sk, 0, 0.1, -0.55), box(0.14, 0.1, 1.24, sk, 1.6, 0.1, 0), box(0.14, 0.1, 1.24, sk, -1.6, 0.1, 0), box(0.14, 0.1, 1.24, sk, 0, 0.1, 0),
    box(0.1, 0.12, 0.1, sk, 1.6, 0.2, 0.55), box(0.1, 0.12, 0.1, sk, 1.6, 0.2, -0.55), box(0.1, 0.12, 0.1, sk, -1.6, 0.2, 0.55), box(0.1, 0.12, 0.1, sk, -1.6, 0.2, -0.55));
}

// --------------------------------------------------------------- battery pack
function buildPack() {
  const R = (...a) => reg('batt', ...a), cell = mat(0x1fa37a, 0.45, 0.4), plateM = mat(0x9aa3ad, 0.4, 0.7), cu = mat(0xc87533, 0.35, 0.9), alu = mat(ALU, 0.45, 0.7), dk = mat(DARK, 0.6, 0.4), hv = mat(0xff7a1a, 0.5, 0.2);
  const mods = z => { const m = []; for (let i = 0; i < 4; i++) { const x = -0.78 + i * 0.52; m.push(box(0.46, 0.14, 0.56, cell, x, 0.61, z), box(0.48, 0.15, 0.02, plateM, x, 0.61, z + 0.29), box(0.48, 0.15, 0.02, plateM, x, 0.61, z - 0.29)); for (let k = 1; k < 12; k++) m.push(box(0.47, 0.142, 0.004, dk, x, 0.61, z - 0.28 + k * 0.0467)); } return fromMeshes(...m); };
  R('modA', 'BAT-10', 'vc', mods(-0.34)); R('modB', 'BAT-10', 'vc', mods(0.34));
  const bb = []; for (const z of [-0.34, 0.34]) for (let i = 0; i < 4; i++) { const x = -0.78 + i * 0.52; bb.push(box(0.05, 0.012, 0.5, cu, x - 0.14, 0.687, z), box(0.05, 0.012, 0.5, plateM, x + 0.14, 0.687, z), box(0.06, 0.006, 0.52, mat(0xd9a400, 0.6, 0.2), x, 0.684, z)); }
  R('bus', 'BAT-20', 'vc', fromMeshes(...bb));
  R('tray', 'BAT-30', 'vc', fromMeshes(box(2.5, 0.04, 1.46, alu, 0.1, 0.5, 0), box(2.5, 0.2, 0.05, alu, 0.1, 0.6, 0.73), box(2.5, 0.2, 0.05, alu, 0.1, 0.6, -0.73), box(0.05, 0.2, 1.46, alu, 1.35, 0.6, 0), box(0.05, 0.2, 1.46, alu, -1.15, 0.6, 0),
    box(2.2, 0.15, 0.03, alu, 0, 0.6, 0), box(0.02, 0.15, 1.4, alu, -0.52, 0.6, 0), box(0.02, 0.15, 1.4, alu, 0, 0.6, 0), box(0.02, 0.15, 1.4, alu, 0.52, 0.6, 0), box(2.0, 0.012, 1.3, mat(0x2f6fb5, 0.5, 0.4), 0, 0.526, 0)));
  R('bms', 'BAT-30', 'vc', fromMeshes(box(0.2, 0.12, 0.7, dk, 1.19, 0.61, -0.2), box(0.2, 0.1, 0.4, mat(0x40464e, 0.6, 0.3), 1.19, 0.6, 0.45), box(2.3, 0.014, 0.04, hv, 0.02, 0.7, 0.02), box(0.2, 0.08, 0.2, hv, 1.42, 0.6, 0), cyl(0.025, 1.3, mat(0x2f6fb5, 0.5, 0.4), -1.08, 0.58, 0, 'z', 8)));
  R('lid', 'BAT-30', 'vc', fromMeshes(box(2.54, 0.03, 1.5, mat(0x3a3f46, 0.55, 0.3), 0.1, 0.725, 0), box(2.2, 0.02, 0.1, mat(0x4a5058, 0.55, 0.3), 0.1, 0.75, 0.35), box(2.2, 0.02, 0.1, mat(0x4a5058, 0.55, 0.3), 0.1, 0.75, -0.35), box(2.2, 0.02, 0.1, mat(0x4a5058, 0.55, 0.3), 0.1, 0.75, 0)));
  const bolts = []; for (let i = 0; i < 12; i++) for (const z of [-0.72, 0.72]) bolts.push(cyl(0.018, 0.02, plateM, -1.1 + i * 0.22, 0.75, z, 'y', 6)); for (let i = 0; i < 5; i++) for (const x of [-1.13, 1.33]) bolts.push(cyl(0.018, 0.02, plateM, x, 0.75, -0.5 + i * 0.25, 'y', 6));
  R('bolts', 'BAT-30', 'vc', fromMeshes(...bolts));
  ALL.battPallet = fromMeshes(box(2.7, 0.07, 1.6, mat(0x6b7480, 0.5, 0.6), 0.1, 0.44, 0), box(0.2, 0.06, 1.2, mat(0x39424d, 0.6, 0.4), -0.9, 0.39, 0), box(0.2, 0.06, 1.2, mat(0x39424d, 0.6, 0.4), 1.1, 0.39, 0));
}

// ------------------------------------------------------------------ drive unit
function ring(r0, r1, len, hex, zc = 0, seg = 28) {
  const g = new THREE.LatheGeometry([new THREE.Vector2(r0, -len / 2), new THREE.Vector2(r1, -len / 2), new THREE.Vector2(r1, len / 2), new THREE.Vector2(r0, len / 2), new THREE.Vector2(r0, -len / 2)], seg);
  g.rotateX(Math.PI / 2); g.translate(0, 0.82, zc);
  return tint(g, hex);
}
function buildDU() {
  const R = (...a) => reg('drive', ...a), cu = mat(0xc87533, 0.35, 0.9), stl = mat(0x8e949c, 0.4, 0.85), dk = mat(DARK, 0.6, 0.4), alu = mat(ALU, 0.4, 0.75), hv = mat(0xff7a1a, 0.5, 0.2);
  const teeth = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const m = box(0.012, 0.05, 0.3, mat(0x1b1d21, 0.7, 0.3), Math.cos(a) * 0.185, 0.82 + Math.sin(a) * 0.185, 0); m.rotation.z = a + Math.PI / 2; teeth.push(m); }
  R('stator', 'DU-10', 'vc', join(ring(0.165, 0.235, 0.3, 0x4a5058), ring(0.17, 0.225, 0.07, 0xc87533, 0.185), ring(0.17, 0.225, 0.07, 0xc87533, -0.185), fromMeshes(...teeth)));
  const mags = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const m = box(0.07, 0.012, 0.26, mat(0xb9bec6, 0.3, 0.9), Math.cos(a) * 0.15, 0.82 + Math.sin(a) * 0.15, 0); m.rotation.z = a + Math.PI / 2; mags.push(m); }
  R('rotor', 'DU-10', 'vc', fromMeshes(cyl(0.035, 0.74, stl, 0, 0.82, 0, 'z', 12), cyl(0.148, 0.28, mat(0x30353c, 0.5, 0.6), 0, 0.82, 0, 'z', 24), cyl(0.06, 0.03, stl, 0, 0.82, 0.2, 'z', 12), cyl(0.06, 0.03, stl, 0, 0.82, -0.2, 'z', 12), ...mags));
  R('housing', 'DU-20', 'vc', join(ring(0.24, 0.275, 0.46, ALU, 0, 32), fromMeshes(box(0.6, 0.04, 0.12, alu, 0, 0.56, 0.12), box(0.6, 0.04, 0.12, alu, 0, 0.56, -0.12), box(0.12, 0.08, 0.3, alu, 0.27, 0.82, 0), box(0.12, 0.08, 0.3, alu, -0.27, 0.82, 0), cyl(0.26, 0.03, alu, 0, 0.82, -0.24, 'z', 28))));
  R('gears', 'DU-20', 'vc', fromMeshes(cyl(0.07, 0.05, stl, 0, 0.82, 0.29, 'z', 14), cyl(0.15, 0.05, stl, 0.2, 0.8, 0.29, 'z', 22), cyl(0.05, 0.05, stl, 0.2, 0.8, 0.35, 'z', 12), cyl(0.17, 0.06, mat(0x6b7480, 0.4, 0.8), 0.34, 0.66, 0.35, 'z', 22)));
  R('gbCover', 'DU-20', 'vc', fromMeshes(box(0.72, 0.52, 0.16, alu, 0.17, 0.76, 0.34), cyl(0.2, 0.06, alu, 0.34, 0.66, 0.44, 'z', 20), cyl(0.05, 0.1, stl, 0.34, 0.66, 0.5, 'z', 10)));
  R('inverter', 'DU-20', 'vc', fromMeshes(box(0.42, 0.12, 0.44, dk, 0, 1.16, -0.02), box(0.38, 0.02, 0.4, mat(0x40464e, 0.5, 0.4), 0, 1.23, -0.02), box(0.12, 0.07, 0.16, hv, 0.26, 1.16, -0.05), box(0.03, 0.06, 0.03, cu, -0.1, 1.08, 0.1), box(0.03, 0.06, 0.03, cu, 0, 1.08, 0.1), box(0.03, 0.06, 0.03, cu, 0.1, 1.08, 0.1)));
  ALL.drivePallet = fromMeshes(box(1.0, 0.07, 0.8, mat(0x39424d, 0.6, 0.4), 0, 0.44, 0), box(0.5, 0.1, 0.08, mat(0x6b7480, 0.5, 0.6), 0, 0.52, 0.14), box(0.5, 0.1, 0.08, mat(0x6b7480, 0.5, 0.6), 0, 0.52, -0.14));
}

// --------------------------------------------- pressed body-side panel (5 stages)
function buildPanel() {
  const flat = g => { g.rotateX(-Math.PI / 2); g.translate(0, 1.02, 0.87); return g; };
  const blank = tint(new THREE.BoxGeometry(4.9, 0.012, 1.5), 0xc3c9d0); blank.translate(0, 1.02, 0);
  ALL.panel = [
    blank,
    join(blank.clone(), flat(plate(SIDE, [], 0.07, 0.035, 0xc3c9d0))),
    flat(plate(SIDE, [], 0.07, 0.035, 0xc3c9d0)),
    flat(plate(SIDE, [], 0.1, 0.05, 0xc3c9d0)),
    flat(plate(SIDE, [H_FD, H_RD, H_QW], 0.1, 0.05, 0xc3c9d0)),
  ];
}

let built = false;
export function buildProducts() {
  if (built) return; built = true;
  buildCar(); buildPack(); buildDU(); buildPanel();
  for (const k in COMP) {
    const c = COMP[k], gk = c.key === 'fdu' ? c.station + '+awd' : c.station;
    const g = GROUP[gk] || (GROUP[gk] = {});
    (g[c.mat] || (g[c.mat] = [])).push(c.geo);
  }
  for (const s in GROUP) for (const m in GROUP[s]) GROUP[s][m] = mergeGeometries(GROUP[s][m]);
  // finished vehicle for instancing (yard, carriers): body colour / glass / everything else
  const of = (m) => Object.values(COMP).filter(c => c.line === 'main' && c.mat === m && c.key !== 'fdu').map(c => c.geo);
  const dark = g => { const x = g.clone(), a = x.attributes.color.array; for (let i = 0; i < a.length; i += 3) { a[i] = 0.03; a[i + 1] = 0.04; a[i + 2] = 0.035; } return x; };
  ALL.carBody = mergeGeometries(of('body')); ALL.carGlass = mergeGeometries(of('glass'));
  ALL.carRest = mergeGeometries([...of('vc'), ...of('light'), ...of('struct').map(dark)]);
}

// -------------------------------------------------------------- materials
export const GLASS_M = new THREE.MeshStandardMaterial({ color: 0x1a2a33, transparent: true, opacity: 0.42, roughness: 0.05, metalness: 0.6, depthWrite: false });
const P_BARE = { c: new THREE.Color(BARE), r: 0.36, m: 0.88 }, P_ECOAT = { c: new THREE.Color(0x2c322e), r: 0.7, m: 0.2 }, P_PRIMER = { c: new THREE.Color(0xa4a8ab), r: 0.75, m: 0.1 };
const blend = (mt, a, b, f) => { mt.color.copy(a.c).lerp(b.c, f); mt.roughness = a.r + (b.r - a.r) * f; mt.metalness = a.m + (b.m - a.m) * f; };
const IX = { ecoat: STATIONS['PNT-10'].sidx, primer: STATIONS['PNT-40'].sidx, base: STATIONS['PNT-50'].sidx, clear: STATIONS['PNT-60'].sidx, skidOff: STATIONS['EOL-10'].sidx };
const c01 = x => Math.max(0, Math.min(1, x));
// paint state of the body-colour and structural materials at build progress es
export function paintState(body, struct, es, colorHex, fin) {
  fin.base.c.setHex(colorHex); fin.clear.c.setHex(colorHex);
  if (es < IX.ecoat) blend(body, P_BARE, P_BARE, 0);
  else if (es < IX.primer) blend(body, P_BARE, P_ECOAT, c01(es - IX.ecoat));
  else if (es < IX.base) blend(body, P_ECOAT, P_PRIMER, c01(es - IX.primer));
  else if (es < IX.clear) blend(body, P_PRIMER, fin.base, c01(es - IX.base));
  else blend(body, fin.base, fin.clear, c01(es - IX.clear));
  blend(struct, P_BARE, P_ECOAT, c01(es - IX.ecoat));
}
const newFin = () => ({ base: { c: new THREE.Color(), r: 0.5, m: 0.35 }, clear: { c: new THREE.Color(), r: 0.16, m: 0.5 } });

// ------------------------------------------------------ product on the line
// A product shows one merged mesh per completed station (per material).
export function makeProduct(line) {
  buildProducts();
  const g = new THREE.Group();
  if (line === 'stamp') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 });
    const ms = ALL.panel.map(geo => { const x = new THREE.Mesh(geo, m); x.castShadow = true; g.add(x); return x; });
    g.userData = { set(e, prog) { const es = e.sd + prog, k = es < 1.5 ? 0 : es < 2.5 ? 1 : es < 3.5 ? 2 : es < 4.5 ? 3 : 4; ms.forEach((x, i) => { x.visible = i === k && es > 0.55; }); } };
    return g;
  }
  const body = new THREE.MeshStandardMaterial({ color: BARE, roughness: 0.36, metalness: 0.88 });
  const struct = new THREE.MeshStandardMaterial({ color: BARE, roughness: 0.45, metalness: 0.75 });
  const mats = { body, struct, vc: VC.std, glass: GLASS_M, light: VC.basic };
  const parts = [];
  for (const def of LINES[line].nodes) {
    if (def.buf) continue;
    for (const gk of [def.id, def.id + '+awd']) {
      const G = GROUP[gk]; if (!G) continue;
      for (const m in G) { const mesh = new THREE.Mesh(G[m], mats[m]); mesh.castShadow = m !== 'glass' && m !== 'light'; mesh.visible = false; g.add(mesh); parts.push({ mesh, sidx: def.sidx, awd: gk.endsWith('+awd') }); }
    }
  }
  const base = new THREE.Mesh(line === 'main' ? ALL.skid : line === 'batt' ? ALL.battPallet : ALL.drivePallet, VC.std); base.castShadow = true; g.add(base);
  let pick = null;
  if (line === 'main') { pick = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.6, 2), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 0.8; g.add(pick); }
  const fin = newFin();
  g.userData = {
    pick, body, struct,
    // e: simulation entity; prog: 0..1 progress in the current station; colorHex / motors for vehicles
    set(e, prog, colorHex = BARE, motors = 1) {
      for (const p of parts) p.mesh.visible = e.sd > p.sidx && (!p.awd || motors > 1);
      if (line === 'main') { base.visible = e.sd < IX.skidOff; paintState(body, struct, e.sd + prog, colorHex, fin); }
    },
  };
  return g;
}

// ------------------------------------------------ station kit (parts in work)
// The components a station installs, as individual meshes: staged beside the
// line, then carried to the product in the order and timing of the bill of process.
export function makeKit(stationId) {
  buildProducts();
  const ops = PROCESS[stationId]; if (!ops) return null;
  const items = [], group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: BARE, roughness: 0.36, metalness: 0.88 });
  const struct = new THREE.MeshStandardMaterial({ color: BARE, roughness: 0.45, metalness: 0.75 });
  const mats = { body, struct, vc: VC.std, glass: GLASS_M, light: VC.basic };
  ops.forEach((op, oi) => {
    for (const key of op.comps || []) {
      const c = COMP[key], mesh = new THREE.Mesh(c.geo, mats[c.mat]);
      mesh.castShadow = c.mat !== 'glass' && c.mat !== 'light';
      const f = (op.from && op.from[key]) || [0, 1.2, 0];
      group.add(mesh);
      items.push({ key, c, mesh, op, oi, from: new THREE.Vector3(...f), by: op.by && op.by[key] != null ? op.by[key] : null, under: op.path === 'under', pos: new THREE.Vector3() });
    }
  });
  if (!items.length) return null;
  return { stationId, group, items, body, struct, fin: newFin(), line: STATIONS[stationId].line };
}
const smooth = x => x * x * (3 - 2 * x);
// inProc: a product is being worked on; prog: cycle fraction; lift: current body lift height
export function updateKit(kit, inProc, prog, lift, motors, flying) {
  for (const it of kit.items) {
    const m = it.mesh, [t0, t1] = it.op.t;
    if (!inProc) { m.position.copy(it.from); m.visible = true; continue; }
    if (it.key === 'fdu' && motors < 2) { m.visible = false; continue; }
    m.visible = true;
    const u = c01((prog - t0) / (t1 - t0));
    if (it.under) {               // shuttle in beneath the raised body, then lift into place
      const k1 = smooth(c01(u / 0.6)), k2 = smooth(c01((u - 0.6) / 0.4));
      m.position.set(it.from.x * (1 - k1), u >= 1 ? lift : lift * k2, it.from.z * (1 - k1));
    } else {
      const k = smooth(u);
      m.position.copy(it.from).multiplyScalar(1 - k);
      if (it.from.y >= 0 && it.from.y < 1) m.position.y += Math.sin(Math.PI * k) * 0.35;
      m.position.y += lift * k;
    }
    if (u > 0 && u < 1) { it.pos.copy(it.c.center).add(m.position); flying.push(it); }
  }
}

// -------------------------------------------- instanced finished vehicles
export class CarFleet {
  constructor(n) {
    buildProducts();
    this.n = n; this.count = 0;
    this.body = new THREE.InstancedMesh(ALL.carBody, new THREE.MeshStandardMaterial({ roughness: 0.16, metalness: 0.5 }), n);
    this.glass = new THREE.InstancedMesh(ALL.carGlass, GLASS_M, n);
    this.rest = new THREE.InstancedMesh(ALL.carRest, VC.std, n);
    this.all = [this.body, this.glass, this.rest];
    this.group = grp(0, 0, 0, ...this.all);
    for (const m of this.all) { m.frustumCulled = false; m.count = 0; }
    this.body.castShadow = true; this.rest.castShadow = true;
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3(); this._c = new THREE.Color(); this._e = new THREE.Euler();
  }
  begin() { this.count = 0; }
  put(x, y, z, yaw, colorHex) {
    if (this.count >= this.n) return;
    const i = this.count++;
    this._e.set(0, yaw, 0); this._q.setFromEuler(this._e); this._p.set(x, y, z);
    this._m.compose(this._p, this._q, this._s);
    for (const m of this.all) m.setMatrixAt(i, this._m);
    this.body.setColorAt(i, this._c.setHex(colorHex));
  }
  end() { for (const m of this.all) { m.count = this.count; m.instanceMatrix.needsUpdate = true; } this.body.instanceColor.needsUpdate = true; }
}
