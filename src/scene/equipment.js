// Station equipment. Each builder fills a static group S (baked into merged
// geometry) and a dynamic group D (animated parts), both in station-local
// coordinates with the line running along local X, and may return
// { update(ctx), carY(prog) }.
import * as THREE from 'three';
import { mat, emat, glass, box, cyl, grp, add, mergeLocal, VC } from './kit.js';
import { makeRobot, robotBase, person } from './vehicles.js';

const ORANGE = 0xf28c1e, YELLOW = 0xf2c230, WHITE = 0xe9edf0;
const steel = mat(0x8e949c, 0.45, 0.8), dark = mat(0x24282e, 0.55, 0.5), white = mat(0xe6e9ec, 0.5, 0.15), ylw = mat(0xf2c230, 0.6, 0.1),
  grey = mat(0x596270, 0.6, 0.4), blue = mat(0x2f6fb5, 0.5, 0.3), cab = mat(0xcfd4d9, 0.5, 0.3), copper = mat(0xc87533, 0.35, 0.9), red = mat(0xb5161b, 0.5, 0.2);
const FENCE = glass(0xc6ced6, 0.1);
const SCREEN = emat(0x39b8ff, 1.3), LIGHT = emat(0xffffff, 2.2), HOT = emat(0xff6a1a, 2.4), GREEN_E = emat(0x33ff88, 2);
const v3 = new THREE.Vector3(), vel = new THREE.Vector3();
const SPARK = new THREE.Color(1, 0.72, 0.32), WATER = new THREE.Color(0.45, 0.75, 1), LASERC = new THREE.Color(0.5, 1, 0.7);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function robotAt(S, D, x, z, color, tool, scale = 1.25, riser = 0) {
  const b = robotBase(scale, riser); b.position.set(x, 0, z); S.add(b);
  const r = makeRobot(color, scale, tool);
  r.root.position.set(x, riser, z); r.root.rotation.y = z > 0 ? Math.PI / 2 : -Math.PI / 2;
  D.add(r.root);
  return r;
}
function cabinet(S, x, z, w = 0.9, h = 2, d = 0.6, m = cab) {
  add(S, box(w, h, d, m, x, h / 2, z), box(w * 0.7, 0.12, 0.02, emat(0x33ff88, 1.5), x, h * 0.82, z + (z > 0 ? -d / 2 - 0.011 : d / 2 + 0.011)));
}
function kiosk(S, x, z, face = 1) {
  add(S, box(0.12, 1.3, 0.12, dark, x, 0.65, z), box(1.3, 0.8, 0.08, dark, x, 1.7, z), box(1.2, 0.7, 0.02, SCREEN, x, 1.7, z + face * 0.05));
}
function fence(S, x0, x1, z, h = 2.1) {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 2.5));
  for (let i = 0; i <= n; i++) S.add(box(0.07, h, 0.07, ylw, x0 + (x1 - x0) * i / n, h / 2, z));
  add(S, box(Math.abs(x1 - x0), h - 0.3, 0.03, FENCE, (x0 + x1) / 2, h / 2 + 0.1, z), box(Math.abs(x1 - x0), 0.05, 0.05, ylw, (x0 + x1) / 2, h, z));
}
function portal(S, x, zHalf, h, m = steel, t = 0.22) {
  add(S, box(t, h, t, m, x, h / 2, zHalf), box(t, h, t, m, x, h / 2, -zHalf), box(t, t, zHalf * 2 + t, m, x, h, 0));
}
function sparks(fx, r, n = 2) {
  r.tip.getWorldPosition(v3);
  for (let i = 0; i < n; i++) fx.emit(v3, vel.set(0, 1.6, 0), SPARK, 0.55, 9, 5);
}

export const BUILD = {
  // ------------------------------------------------------------ press shop
  blank(S, D, def, dir) {
    const cx = -dir * 4.6;
    add(S, box(1.6, 1.0, 2.6, grey, cx, 0.5, 0), box(0.5, 2.0, 0.4, blue, cx, 1.0, 1.25), box(0.5, 2.0, 0.4, blue, cx, 1.0, -1.25),
      box(2.4, 1.3, 2.4, blue, cx + dir * 2.3, 0.65, 0), cyl(0.16, 2.2, steel, cx + dir * 2.0, 1.42, 0, 'z'), cyl(0.16, 2.2, steel, cx + dir * 2.6, 1.42, 0, 'z'),
      box(2.6, 4.6, 0.7, blue, 0.6 * dir, 2.3, 2.0), box(2.6, 4.6, 0.7, blue, 0.6 * dir, 2.3, -2.0), box(3.0, 1.2, 4.7, blue, 0.6 * dir, 5.0, 0), box(2.6, 0.95, 3.3, grey, 0.6 * dir, 0.47, 0));
    cabinet(S, 3.6, 3.6); kiosk(S, -2.5, -3.6, 1);
    const cg = grp(0, 0, 0, cyl(1.25, 1.5, mat(0xc3c9d0, 0.3, 0.9), 0, 0, 0, 'z', 28), cyl(0.5, 1.56, dark, 0, 0, 0, 'z', 16), box(2.3, 0.14, 1.58, mat(0x9ba2ab, 0.4, 0.8)), box(0.14, 2.3, 1.58, mat(0x9ba2ab, 0.4, 0.8)));
    const coil = new THREE.Mesh(mergeLocal(cg), VC.std); coil.position.set(cx, 2.05, 0); coil.castShadow = true; D.add(coil);
    const ram = new THREE.Mesh(mergeLocal(grp(0, 0, 0, box(2.4, 0.9, 3.2, grey, 0, 0.6, 0), box(2.0, 0.22, 1.9, ylw, 0, 0.04, 0))), VC.std);
    ram.position.set(0.6 * dir, 3.0, 0); ram.castShadow = true; D.add(ram);
    return { update(c) { if (c.act) coil.rotation.z -= c.dt * 0.9 * dir; ram.position.y = 3.0 - (c.act ? 1.82 * Math.abs(Math.sin(c.prog * Math.PI * 4)) : 0); } };
  },
  press(S, D) {
    const fr = mat(0x33658f, 0.5, 0.35);
    add(S, box(3.8, 6.6, 1.15, fr, 0, 3.3, 2.85), box(3.8, 6.6, 1.15, fr, 0, 3.3, -2.85), box(4.4, 1.9, 6.9, fr, 0, 7.3, 0), box(3.9, 0.92, 4.6, grey, 0, 0.46, 0),
      box(3.0, 0.1, 2.1, blue, 0, 0.97, 0), box(1.2, 0.9, 1.2, dark, 1.0, 8.6, 1.5), cyl(0.5, 1.1, steel, -1.0, 8.75, -1.2), box(4.6, 0.08, 0.08, ylw, 0, 1.1, 3.6), box(4.6, 0.08, 0.08, ylw, 0, 1.1, -3.6),
      box(0.2, 1.4, 0.2, ylw, 2.2, 0.7, 3.6), box(0.2, 1.4, 0.2, ylw, -2.2, 0.7, 3.6), box(0.2, 1.4, 0.2, ylw, 2.2, 0.7, -3.6), box(0.2, 1.4, 0.2, ylw, -2.2, 0.7, -3.6));
    cabinet(S, 3.2, 4.4, 1.2, 2.1, 0.6);
    const ram = new THREE.Mesh(mergeLocal(grp(0, 0, 0, box(3.5, 1.5, 4.4, grey, 0, 1.1, 0), box(3.0, 0.3, 2.1, ylw, 0, 0.2, 0), cyl(0.3, 1.6, steel, 1.1, 2.5, 0), cyl(0.3, 1.6, steel, -1.1, 2.5, 0))), VC.std);
    ram.position.y = 3.6; ram.castShadow = true; D.add(ram);
    return { update(c) { ram.position.y = 3.6 - (c.act ? 2.45 * Math.pow(Math.abs(Math.sin(c.prog * Math.PI * 3)), 1.5) : 0); } };
  },
  // ------------------------------------------------------------- body shop
  weld(S, D, def) {
    // four process robots at the corners; two handling robots mid-cell feed parts from the racks
    const n = +def.id.slice(-2) / 10, cols = [ORANGE, YELLOW, WHITE], closures = def.id === 'BIW-50';
    const R = [];
    [[2.4, 2.75], [-2.4, 2.75], [2.4, -2.75], [-2.4, -2.75]].forEach(([x, z], k) => R.push(robotAt(S, D, x, z, cols[(n + k) % 3], closures ? 'grip' : 'weld', 1.28)));
    if (def.id !== 'BIW-40') { R.push(robotAt(S, D, 0, 3.2, WHITE, 'grip', 1.4)); R.push(robotAt(S, D, 0, -3.2, WHITE, 'grip', 1.4)); }
    fence(S, -6, 6, 5.4); fence(S, -6, 6, -5.4);
    for (const sx of [-5.6, 5.6]) portal(S, sx, 4.6, 4.8);
    add(S, box(11.4, 0.2, 0.3, steel, 0, 4.8, 3.2), box(11.4, 0.2, 0.3, steel, 0, 4.8, -3.2), box(10.5, 0.06, 0.2, LIGHT, 0, 4.66, 3.2), box(10.5, 0.06, 0.2, LIGHT, 0, 4.66, -3.2));
    cabinet(S, 4.9, 4.8); cabinet(S, -4.9, 4.8); cabinet(S, 4.9, -4.8); cabinet(S, -4.9, -4.8);
    // geometry fixture: locating pins and clamps the body sits on
    for (const [x, z] of [[1.7, 0.45], [-1.7, 0.45], [1.7, -0.45], [-1.7, -0.45]]) add(S, box(0.22, 0.2, 0.22, blue, x, 0.1, z), cyl(0.03, 0.12, ylw, x, 0.26, z, 'y', 8));
    return { robots: R };
  },
  metro(S, D) {
    const R = [robotAt(S, D, 1.8, 2.7, WHITE, 'scan', 1.1, 0.5), robotAt(S, D, -1.8, -2.7, WHITE, 'scan', 1.1, 0.5)];
    for (const x of [-4.5, 0, 4.5]) portal(S, x, 3.6, 4.2, white);
    add(S, box(9.2, 0.2, 0.2, white, 0, 4.2, 3.6), box(9.2, 0.2, 0.2, white, 0, 4.2, -3.6));
    kiosk(S, 3.6, 4.2, -1); cabinet(S, -3.8, 4.3);
    const beam = box(0.04, 2.0, 2.6, new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }), 0, 1.1, 0);
    D.add(beam);
    return { robots: R, update(c) { beam.visible = c.act && c.prog > 0.2 && c.prog < 0.75; beam.position.x = Math.sin(c.prog * Math.PI * 6) * 2.3; } };
  },
  // ------------------------------------------------------------ paint shop
  dip(S, D) {
    const liq = new THREE.MeshStandardMaterial({ color: 0x3f6f58, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.3 }); liq.userData.noShadow = true;
    add(S, box(8.6, 1.5, 0.3, steel, 0, 0.75, 2.2), box(8.6, 1.5, 0.3, steel, 0, 0.75, -2.2), box(0.3, 1.0, 4.1, steel, 4.15, 0.5, 0), box(0.3, 1.0, 4.1, steel, -4.15, 0.5, 0), box(8.0, 0.05, 4.1, liq, 0, 0.92, 0));
    for (const x of [-5, 5]) portal(S, x, 3.2, 5.2);
    add(S, box(10.2, 0.3, 0.3, ylw, 0, 5.2, 1.3), box(10.2, 0.3, 0.3, ylw, 0, 5.2, -1.3),
      cyl(0.9, 2.6, white, -2.5, 1.3, 4.6, 'y', 18), cyl(0.9, 2.6, white, 0, 1.3, 4.6, 'y', 18), cyl(0.1, 6, blue, -1.2, 0.5, 3.4, 'x', 8), cyl(0.1, 1.2, blue, 2.2, 0.6, 3.0, 'z', 8), box(1.0, 0.8, 0.8, blue, 2.4, 0.4, 4.4));
    for (const x of [-3, -1.5, 0, 1.5]) cabinet(S, x, -4.2, 1.3, 2.1, 0.7, mat(0xb8bfc6, 0.5, 0.3));
    return {};
  },
  oven(S, D) {
    const gl = glass(0xff7a2a, 0.26);
    add(S, box(11.4, 0.5, 4.6, steel, 0, 3.75, 0), box(11.4, 3.3, 0.08, gl, 0, 1.85, 2.2), box(11.4, 3.3, 0.08, gl, 0, 1.85, -2.2),
      box(10.8, 0.08, 0.35, HOT, 0, 3.44, 1.2), box(10.8, 0.08, 0.35, HOT, 0, 3.44, -1.2), box(10.8, 0.04, 0.25, HOT, 0, 0.05, 1.75), box(10.8, 0.04, 0.25, HOT, 0, 0.05, -1.75));
    for (let i = 0; i <= 5; i++) for (const z of [-2.25, 2.25]) S.add(box(0.22, 3.6, 0.22, steel, -5.6 + i * 2.24, 1.8, z));
    for (const x of [-3.2, 0, 3.2]) add(S, box(1.8, 1.0, 2.2, mat(0xaab1b9, 0.5, 0.5), x, 4.5, 0), cyl(0.36, 2.6, steel, x + 0.5, 6.2, 0.4));
    add(S, cyl(0.28, 11, steel, 0, 4.4, -1.9, 'x', 10));
    cabinet(S, 4.6, 3.4, 1.2, 2.0, 0.6);
    return {};
  },
  seal(S, D) {
    const R = [robotAt(S, D, 2.2, 2.8, WHITE, 'seal', 1.2), robotAt(S, D, -2.2, -2.8, WHITE, 'seal', 1.2)];
    for (const x of [-5, 5]) portal(S, x, 3.8, 4.2, white);
    add(S, box(10, 0.06, 0.2, LIGHT, 0, 4.05, 2), box(10, 0.06, 0.2, LIGHT, 0, 4.05, -2), cyl(0.32, 0.95, blue, 4.2, 0.48, 4.2), cyl(0.32, 0.95, blue, 3.4, 0.48, 4.3), cyl(0.32, 0.95, blue, -4.0, 0.48, -4.2));
    cabinet(S, -4.3, 4.3);
    return { update(c) { for (const r of R) r.update(c.act ? 1 : 0, c.t, c.dt); } };
  },
  spray(S, D, def) {
    const gl = glass(0x9fd0e8, 0.18);
    const R = [robotAt(S, D, 1.9, 2.3, WHITE, 'spray', 1.02, 0.3), robotAt(S, D, -1.9, -2.3, WHITE, 'spray', 1.02, 0.3)];
    add(S, box(10.6, 3.5, 0.06, gl, 0, 1.85, 3.0), box(10.6, 3.5, 0.06, gl, 0, 1.85, -3.0), box(10.8, 0.5, 0.5, white, 0, 3.9, 3.0), box(10.8, 0.5, 0.5, white, 0, 3.9, -3.0), box(0.4, 0.5, 6.4, white, 5.3, 3.9, 0), box(0.4, 0.5, 6.4, white, -5.3, 3.9, 0), box(10.4, 0.05, 5.8, gl, 0, 3.95, 0), box(10.6, 0.04, 5.9, mat(0x3a4048, 0.7, 0.3), 0, 0.02, 0),
      box(9.6, 0.05, 0.6, LIGHT, 0, 3.62, 1.5), box(9.6, 0.05, 0.6, LIGHT, 0, 3.62, -1.5), cyl(0.4, 1.8, steel, -4.6, 5.0, 2.4), cyl(0.4, 1.8, steel, 4.6, 5.0, -2.4));
    for (const x of [-5.3, -1.77, 1.77, 5.3]) for (const z of [-3.05, 3.05]) S.add(box(0.18, 3.7, 0.18, white, x, 1.85, z));
    cabinet(S, 3.8, 4.3, 1.6, 2.0, 0.7, white);
    [0xe6eaee, 0x16181b, 0x596270, 0x1d4da6, 0xb0151a, 0x1b6652].forEach((cx, i) => S.add(cyl(0.2, 0.7, mat(cx, 0.4, 0.3), -1 + i * 0.5, 0.35, 4.3)));
    return {
      update(c) {
        for (const r of R) {
          r.update(c.act ? 1 : 0, c.t, c.dt);
          if (c.act && r.a > 0.6) { r.tip.getWorldPosition(v3); vel.set(c.origin.x - v3.x, 0, c.origin.z - v3.z).normalize().multiplyScalar(1.7); vel.y = -0.3; for (let i = 0; i < 2; i++) c.fx.emit(v3, vel, c.color, 0.7, 0.6, 1.1); }
        }
      },
    };
  },
  light(S, D, def) {
    for (let i = 0; i < 6; i++) {
      const x = -4.5 + i * 1.8;
      add(S, box(0.14, 3.2, 0.14, white, x, 1.6, 2.3), box(0.14, 3.2, 0.14, white, x, 1.6, -2.3), box(0.14, 0.14, 4.74, white, x, 3.2, 0),
        box(0.05, 2.7, 0.08, LIGHT, x, 1.6, 2.2), box(0.05, 2.7, 0.08, LIGHT, x, 1.6, -2.2), box(0.05, 0.08, 4.2, LIGHT, x, 3.1, 0));
    }
    kiosk(S, 3.2, 3.6, -1);
    const p1 = person(0x0ca30c); p1.position.set(1.2, 0, 2.0); p1.rotation.y = Math.PI / 2; S.add(p1);
    const p2 = person(0x0ca30c); p2.position.set(-1.8, 0, -1.9); p2.rotation.y = -Math.PI / 2; S.add(p2);
    return {};
  },
  // ------------------------------------------------------ general assembly
  cockpit(S, D) {
    const r = robotAt(S, D, 0.6, 3.1, YELLOW, 'grip', 1.35);
    add(S, box(0.08, 1.9, 0.08, steel, 2.9, 0.95, 4.6), box(0.08, 1.9, 0.08, steel, 4.5, 0.95, 4.6), box(1.7, 0.06, 0.7, steel, 3.7, 1.9, 4.6), box(5, 0.25, 1.2, grey, 0, 0.12, -2.0));
    const p = person(); p.position.set(-1.0, 0.25, -1.9); p.rotation.y = -Math.PI / 2; S.add(p);
    const p2 = person(); p2.position.set(1.4, 0.25, -1.9); p2.rotation.y = -Math.PI / 2; S.add(p2);
    kiosk(S, -3.6, 3.6, -1); portal(S, -5, 3.8, 4.4); portal(S, 5, 3.8, 4.4);
    return { robots: [r] };
  },
  glaze(S, D) {
    const R = [robotAt(S, D, 1.7, 2.95, ORANGE, 'grip', 1.25), robotAt(S, D, -1.7, -2.95, ORANGE, 'grip', 1.25)];
    add(S, cyl(0.3, 0.9, blue, 4.3, 0.45, 4.3), cyl(0.3, 0.9, blue, -4.3, 0.45, -4.3), box(0.5, 1.2, 0.5, grey, 3.6, 0.6, 4.3));
    portal(S, -5, 3.8, 4.4); portal(S, 5, 3.8, 4.4); cabinet(S, 4.4, -3.0);
    const p = person(); p.position.set(-0.4, 0, 2.0); p.rotation.y = Math.PI / 2; S.add(p);
    return { robots: R };
  },
  marriage(S, D) {
    for (const [x, z] of [[2.9, 1.7], [-2.9, 1.7], [2.9, -1.7], [-2.9, -1.7]]) add(S, box(0.4, 3.0, 0.4, ylw, x, 1.5, z), box(0.7, 0.1, 0.7, dark, x, 0.05, z), box(0.2, 0.2, 0.9, steel, x * 0.92, 1.0, z * 0.6));
    add(S, box(6.2, 0.3, 0.3, ylw, 0, 3.0, 1.7), box(6.2, 0.3, 0.3, ylw, 0, 3.0, -1.7));
    // shuttle rails the chassis pallet and the pack table run in on
    for (const x of [-1.6, 1.6]) add(S, box(0.08, 0.03, 9, steel, x, 0.015, 0));
    kiosk(S, 3.8, 4.6, -1); cabinet(S, -4.6, 4.6, 1.4, 2.1, 0.7, mat(0xff7a1a, 0.5, 0.2));
    const p = person(0x0ca30c); p.position.set(3.6, 0, -2.6); p.rotation.y = -Math.PI / 2; S.add(p);
    const lift = new THREE.Mesh(mergeLocal(grp(0, 0, 0, box(4.4, 0.08, 1.7, ylw, 0, 0, 0), box(0.3, 0.06, 1.5, dark, 1.2, -0.06, 0), box(0.3, 0.06, 1.5, dark, -1.2, -0.06, 0))), VC.std); lift.castShadow = true; D.add(lift);
    const sc = box(0.2, 1, 0.2, steel, 0, 0, 0); D.add(sc);
    const carY = p => 0.95 * sstep(0, 0.14, p) * (1 - sstep(0.86, 1, p));
    return {
      carY,
      update(c) {
        lift.position.y = 0.05 + (c.under || 0);
        sc.scale.y = Math.max(0.03, lift.position.y - 0.04); sc.position.y = lift.position.y / 2;
      },
    };
  },
  wheels(S, D) {
    const R = [], ty = mat(0x111214, 0.9, 0);
    for (const [x, z] of [[1.5, 3.05], [-1.5, 3.05], [1.5, -3.05], [-1.5, -3.05]]) R.push(robotAt(S, D, x, z, ORANGE, 'grip', 1.1));
    for (const [x, z] of [[4.6, 4.6], [-4.6, 4.6], [4.6, -4.6], [-4.6, -4.6]]) for (let i = 0; i < 5; i++) S.add(cyl(0.34, 0.24, ty, x, 0.14 + i * 0.26, z, 'y', 16));
    portal(S, -5.2, 4.0, 4.2); portal(S, 5.2, 4.0, 4.2); fence(S, -5.2, 5.2, 5.4, 1.4); fence(S, -5.2, 5.2, -5.4, 1.4);
    return { robots: R };
  },
  seats(S, D) {
    const r = robotAt(S, D, -0.4, 3.15, YELLOW, 'grip', 1.35);
    add(S, box(4.2, 0.3, 1.6, steel, 2.6, 0.15, 4.4), box(10.5, 0.2, 0.2, steel, 0, 4.6, -2.6));
    portal(S, -5.2, 3.8, 4.6); portal(S, 5.2, 3.8, 4.6);
    const p = person(); p.position.set(1.3, 0, -1.9); p.rotation.y = -Math.PI / 2; S.add(p);
    return { robots: [r] };
  },
  fill(S, D) {
    portal(S, -3.4, 2.8, 3.9, ylw); portal(S, 3.4, 2.8, 3.9, ylw);
    add(S, box(7, 0.25, 0.25, ylw, 0, 3.9, 0));
    for (const [x, c] of [[-2, 0x2f6fb5], [0, 0xb5161b], [2, 0x0ca30c]]) add(S, box(1.1, 1.7, 0.8, mat(c, 0.5, 0.3), x, 0.85, 3.7), cyl(0.04, 2.4, dark, x, 2.7, 1.8, 'y', 6), cyl(0.04, 2.0, dark, x, 3.85, 2.75, 'z', 6));
    kiosk(S, -1.5, -3.5, 1); kiosk(S, 1.5, -3.5, 1);
    const p = person(0x3987e5); p.position.set(0, 0, -2.6); p.rotation.y = Math.PI / 2; S.add(p);
    return {};
  },
  // --------------------------------------------------------------- testing
  align(S, D, def, dir) {
    for (const [x, z] of [[2.7, 2.0], [-2.7, 2.0], [2.7, -2.0], [-2.7, -2.0]]) add(S, box(0.34, 1.7, 0.34, dark, x, 0.85, z), box(0.2, 0.2, 0.05, emat(0xff3030, 2), x, 1.2, z - Math.sign(z) * 0.18), cyl(0.55, 0.04, steel, x * 0.53, 0.02, z * 0.42, 'y', 18));
    for (const sz of [-1, 1]) {
      const b = grp(dir * 4.6, 1.5, sz * 2.9); b.rotation.y = -sz * dir * 0.5;
      b.add(box(0.06, 1.9, 2.2, white));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) b.add(box(0.07, 0.42, 0.5, dark, 0, -0.65 + i * 0.44, -0.75 + j * 0.5));
      add(S, b, box(0.1, 1.2, 0.1, steel, dir * 4.6, 0.6, sz * 2.9));
    }
    kiosk(S, 0, 3.6, -1);
    return {};
  },
  dyno(S, D) {
    for (const x of [-1.42, 1.42]) for (const z of [-0.83, 0.83]) add(S, cyl(0.2, 0.6, steel, x - 0.24, 0.02, z, 'z', 12), cyl(0.2, 0.6, steel, x + 0.24, 0.02, z, 'z', 12), box(1.3, 0.04, 0.9, dark, x, 0.01, z));
    add(S, box(2.6, 2.4, 0.2, white, -2.5, 1.2, 3.9), box(0.2, 2.4, 2.0, white, -3.7, 1.2, 3.0), box(2.6, 0.15, 2.0, white, -2.5, 2.4, 3.0), box(2.2, 1.0, 0.03, glass(0x9fd0e8, 0.25), -2.5, 1.6, 2.02),
      cyl(0.7, 0.5, grey, 4.6, 1.4, 0, 'x', 16), box(0.5, 1.4, 1.6, grey, 4.9, 0.7, 0));
    kiosk(S, -2.5, 3.4, -1); fence(S, -5, 5, -3.8, 1.3);
    return {};
  },
  water(S, D) {
    const gl = glass(0x7ec8ff, 0.16);
    add(S, box(9.4, 3.3, 0.06, gl, 0, 1.7, 2.6), box(9.4, 3.3, 0.06, gl, 0, 1.7, -2.6), box(9.6, 0.25, 5.4, white, 0, 3.5, 0), box(9.4, 0.04, 5.2, mat(0x3a4048, 0.6, 0.4), 0, 0.02, 0));
    for (let i = 0; i < 5; i++) { const x = -3.6 + i * 1.8; add(S, cyl(0.05, 3.1, blue, x, 1.55, 2.2, 'y', 6), cyl(0.05, 3.1, blue, x, 1.55, -2.2, 'y', 6), cyl(0.05, 4.4, blue, x, 3.1, 0, 'z', 6)); }
    add(S, cyl(0.6, 1.8, blue, 3.2, 0.9, 4.2), box(1.0, 0.9, 0.8, grey, 1.6, 0.45, 4.2));
    return {
      update(c) {
        if (!c.act) return;
        for (let i = 0; i < 7; i++) {
          v3.set(c.origin.x + (Math.random() - 0.5) * 7.4, 3.0, c.origin.z + (Math.random() - 0.5) * 3.6);
          c.fx.emit(v3, vel.set(0, -3, 0), WATER, 0.6, 9, 0.6);
        }
      },
    };
  },
  // ----------------------------------------------------------- battery line
  cellstack(S, D) {
    for (const [x, z] of [[3.2, 3.6], [-3.2, 3.6], [3.2, -1.4], [-3.2, -1.4]]) S.add(box(0.2, 3.3, 0.2, white, x, 1.65, z));
    add(S, box(6.6, 0.2, 0.2, white, 0, 3.3, 3.6), box(6.6, 0.2, 0.2, white, 0, 3.3, -1.4));
    const cell = mat(0x1fa37a, 0.45, 0.4);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) add(S, box(0.9, 0.06, 0.7, steel, -2 + i * 2, 0.3 + j * 0.3, 4.4), box(0.8, 0.22, 0.6, cell, -2 + i * 2, 0.45 + j * 0.3, 4.4));
    cabinet(S, 3.8, -3.4); cabinet(S, 2.7, -3.4); kiosk(S, -3.4, -3.4, 1);
    const bridge = box(0.24, 0.24, 5.2, ylw, 0, 3.3, 1.1); D.add(bridge);
    const head = new THREE.Mesh(mergeLocal(grp(0, 0, 0, box(0.4, 0.4, 0.4, dark, 0, 0, 0), cyl(0.05, 1.9, steel, 0, -1.05, 0), box(2.0, 0.08, 0.5, dark, 0, -2.02, 0))), VC.std); D.add(head);
    const tgt = new THREE.Vector3(0, 3.3, 2.5);
    return {
      update(c) {
        if (c.focus) tgt.set(0, Math.min(3.3, c.focus.y + 2.2), c.focus.z); else tgt.set(0, 3.3, 2.5);
        head.position.lerp(tgt, Math.min(1, c.dt * 6));
      },
    };
  },
  laser(S, D) {
    const gl = glass(0x21c46b, 0.3), wall = mat(0x2a2f36, 0.6, 0.3);
    add(S, box(6.4, 0.25, 5.2, wall, 0, 3.4, 0), box(6.4, 1.0, 0.1, wall, 0, 0.5, 2.6), box(6.4, 1.0, 0.1, wall, 0, 0.5, -2.6), box(6.4, 2.3, 0.06, gl, 0, 2.15, 2.6), box(6.4, 2.3, 0.06, gl, 0, 2.15, -2.6));
    for (const x of [-3.2, 3.2]) for (const z of [-2.6, 2.6]) S.add(box(0.2, 3.4, 0.2, wall, x, 1.7, z));
    add(S, box(1.4, 1.8, 0.9, white, 2.6, 0.9, 4.0), box(1.2, 1.3, 0.9, blue, 0.8, 0.65, 4.0), cyl(0.08, 2, ylw, 1.7, 2.6, 3.4, 'z', 6), box(0.5, 0.2, 0.06, emat(0xffc21a, 2), 0, 3.0, 2.68));
    const r = robotAt(S, D, 0, 1.85, YELLOW, 'seal', 1.0);
    return { robots: [r] };
  },
  packasm(S, D) {
    const R = [robotAt(S, D, 1.7, 2.7, ORANGE, 'grip', 1.12), robotAt(S, D, -1.7, -2.7, ORANGE, 'seal', 1.12)];
    portal(S, -4.4, 3.6, 3.8); portal(S, 4.4, 3.6, 3.8); cabinet(S, 3.8, -3.6);
    add(S, box(9, 0.2, 0.2, ylw, 0, 3.8, 0), box(0.3, 0.3, 0.3, dark, 0, 3.6, 0));
    return { robots: R };
  },
  hvtest(S, D) {
    const gl = glass(0xffb020, 0.16), hv = mat(0xff7a1a, 0.5, 0.2);
    add(S, box(5.6, 2.2, 0.06, gl, 0, 1.6, 2.0), box(5.6, 2.2, 0.06, gl, 0, 1.6, -2.0), box(5.8, 0.2, 4.2, steel, 0, 2.8, 0));
    for (const x of [-2.8, 2.8]) for (const z of [-2.0, 2.0]) S.add(box(0.18, 2.8, 0.18, steel, x, 1.4, z));
    add(S, box(2.6, 2.3, 0.9, hv, -1.2, 1.15, 3.6), box(2.4, 0.2, 0.02, mat(0x111214), -1.2, 1.9, 3.14), box(0.5, 0.3, 0.02, emat(0xffe01a, 2), -1.2, 1.5, 3.14),
      cyl(0.3, 1.3, steel, 1.6, 0.65, 3.5), cyl(0.3, 1.3, steel, 2.4, 0.65, 3.5), box(0.6, 0.1, 0.1, GREEN_E, 0, 2.95, 2.0));
    kiosk(S, 2.2, -3.2, 1);
    return {};
  },
  // --------------------------------------------------------- drive unit line
  wind(S, D) {
    for (const z of [2.7, -2.7]) {
      add(S, box(2.4, 1.5, 1.4, white, 0, 0.75, z), box(2.5, 1.0, 0.06, glass(0x9fd0e8, 0.25), 0, 2.05, z + Math.sign(z) * 0.7), box(2.5, 0.1, 1.5, white, 0, 2.6, z), box(0.1, 1.1, 0.1, white, 1.2, 2.05, z), box(0.1, 1.1, 0.1, white, -1.2, 2.05, z),
        cyl(0.42, 0.5, copper, 2.0, 0.42, z, 'y', 16), cyl(0.42, 0.5, copper, 2.0, 0.95, z, 'y', 16), cyl(0.12, 1.6, dark, 2.0, 0.8, z, 'y', 8));
    }
    add(S, box(0.5, 0.5, 0.4, blue, 0, 0.25, 1.75), box(0.12, 0.3, 0.12, steel, 0, 0.62, 1.75));
    cabinet(S, -2.6, 3.4); kiosk(S, -2.4, -3.9, 1);
    return {};
  },
  duasm(S, D) {
    const r = robotAt(S, D, 0.8, 2.7, YELLOW, 'grip', 1.12);
    add(S, box(1.4, 3.0, 0.5, blue, -0.8, 1.5, -2.9), box(1.4, 0.5, 1.4, blue, -0.8, 2.9, -2.4), box(1.2, 0.9, 1.2, grey, -0.8, 0.45, -2.2), cyl(0.18, 1.0, steel, -0.8, 2.2, -2.2));
    cabinet(S, -3.4, 3.4);
    return { robots: [r] };
  },
  dutest(S, D) {
    const gl = glass(0x9fd0e8, 0.2);
    add(S, box(4.6, 2.4, 0.06, gl, 0, 1.5, 1.9), box(4.6, 2.4, 0.06, gl, 0, 1.5, -1.9), box(4.8, 0.2, 4.0, white, 0, 2.8, 0));
    for (const x of [-2.3, 2.3]) for (const z of [-1.9, 1.9]) S.add(box(0.16, 2.8, 0.16, white, x, 1.4, z));
    add(S, cyl(0.5, 1.2, blue, 0, 0.9, -3.1, 'z', 16), box(1.2, 0.5, 1.4, grey, 0, 0.25, -3.1), cyl(0.07, 1.4, steel, 0, 0.9, -1.9, 'z', 8));
    kiosk(S, 2.0, 3.2, -1); cabinet(S, -2.2, 3.2);
    return {};
  },
};
