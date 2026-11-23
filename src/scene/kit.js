// Small modelling toolkit: cached materials, primitive helpers, static-geometry
// baking (merges thousands of primitives into a handful of draw calls), text
// sprites and a CPU particle system.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = {};
const cylGeo = seg => CYL[seg] || (CYL[seg] = new THREE.CylinderGeometry(1, 1, 1, seg));
const _mats = new Map();

// opaque standard material; all with equal roughness/metalness bake into one mesh
export function mat(color, r = 0.6, m = 0.1) {
  const k = `${color}|${r}|${m}`;
  let x = _mats.get(k);
  if (!x) { x = new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m }); x.userData.bk = `std|${r}|${m}`; _mats.set(k, x); }
  return x;
}
export function emat(color, intensity = 1.6) {
  const k = `e|${color}|${intensity}`;
  let x = _mats.get(k);
  if (!x) { x = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: color, emissiveIntensity: intensity, roughness: 0.5 }); x.userData.noShadow = true; _mats.set(k, x); }
  return x;
}
export function glass(color = 0x9fd0e8, opacity = 0.22) {
  const k = `g|${color}|${opacity}`;
  let x = _mats.get(k);
  if (!x) {
    x = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.08, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    x.userData.noShadow = true; _mats.set(k, x);
  }
  return x;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}
// vertical cylinder by default; axis: 'x' | 'y' | 'z'
export function cyl(r, h, material, x = 0, y = 0, z = 0, axis = 'y', seg = 14) {
  const m = new THREE.Mesh(cylGeo(seg), material);
  m.scale.set(r, h, r); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
export function grp(x = 0, y = 0, z = 0, ...children) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}
export const add = (parent, ...children) => { for (const c of children) parent.add(c); return parent; };

// Merge every mesh under `root` into world-space geometry grouped by material class.
export function bake(root, shadows = true) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const col = new THREE.Color();
  root.traverse(o => {
    if (!o.isMesh) return;
    const mt = o.material, std = mt.userData.bk;
    const key = std || mt.uuid;
    let b = buckets.get(key);
    if (!b) { b = { geoms: [], mt, std }; buckets.set(key, b); }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    if (std) {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      col.copy(mt.color);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    b.geoms.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geoms, false);
    let material = b.mt;
    if (b.std) { const [, r, m] = b.std.split('|'); material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: +r, metalness: +m }); }
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = shadows && !b.mt.userData.noShadow; mesh.receiveShadow = shadows && !b.mt.userData.noShadow;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
    for (const x of b.geoms) x.dispose();
  }
  return out;
}

// merge a small set of meshes (local space of `root`) into one vertex-coloured geometry
export function mergeLocal(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), geoms = [], col = new THREE.Color(), m4 = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    col.copy(o.material.emissive && o.material.emissive.getHex() ? o.material.emissive : o.material.color);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geoms.push(g);
  });
  return mergeGeometries(geoms, false);
}
export const VC = {
  std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 }),
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }),
  basic: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

// ---- text ------------------------------------------------------------------
export function textSprite(lines, opts = {}) {
  const { size = 44, color = '#f0efec', bg = 'rgba(13,17,23,0.82)', accent = null, pad = 18, scale = 1, sub = '#c3c2b7' } = opts;
  const arr = Array.isArray(lines) ? lines : [lines];
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = i => `${i === 0 ? 600 : 400} ${i === 0 ? size : Math.round(size * 0.62)}px system-ui, "Segoe UI", sans-serif`;
  let w = 0; arr.forEach((t, i) => { ctx.font = font(i); w = Math.max(w, ctx.measureText(t).width); });
  const lh = size * 1.2;
  c.width = Math.ceil(w + pad * 2 + (accent ? 14 : 0)); c.height = Math.ceil(lh + (arr.length - 1) * size * 0.8 + pad * 1.2);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 12); ctx.fill();
  if (accent) { ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(0, 0, 12, c.height, [12, 0, 0, 12]); ctx.fill(); }
  ctx.textBaseline = 'top';
  arr.forEach((t, i) => { ctx.font = font(i); ctx.fillStyle = i === 0 ? color : sub; ctx.fillText(t, pad + (accent ? 14 : 0), pad * 0.6 + (i === 0 ? 0 : lh + (i - 1) * size * 0.8)); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = 0.012 * scale * (size / 44);
  sp.scale.set(c.width * k, c.height * k, 1);
  return sp;
}
// flat text decal lying on the floor
export function floorText(text, opts = {}) {
  const { size = 96, color = 'rgba(255,255,255,0.55)', height = 3 } = opts;
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  ctx.font = `700 ${size}px system-ui, "Segoe UI", sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width + 20); c.height = Math.ceil(size * 1.25);
  ctx.font = `700 ${size}px system-ui, "Segoe UI", sans-serif`; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 10, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * c.width / c.height, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---- particles -------------------------------------------------------------
export class Particles {
  constructor(n = 1600) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
  }
  emit(p, v, color, life = 0.6, grav = 9, spread = 1) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread; this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * spread; this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life * (0.6 + Math.random() * 0.8); this.grav[i] = grav;
  }
  update(dt) {
    const { pos, vel, life, grav, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.03 && grav[i] > 0) { pos[i * 3 + 1] = 0.03; vel[i * 3 + 1] *= -0.3; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
