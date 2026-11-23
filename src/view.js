// Live 3D view: mirrors simulation state into the scene every frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LINES, STATIONS, STATION_LIST, ZONES, COLORS, VARIANTS, EQUIP, DOCKS, CARRIER_BAYS, REGIONS, YARD, yardSlotPos, COUNTERS } from './config.js';
import { bake, box, cyl, mat, textSprite, Particles } from './scene/kit.js';
import { BUILD } from './scene/equipment.js';
import { buildWorld, updateStock, MAT_COLOR } from './scene/world.js';
import { makeAGV, makeTruck, makeCarrier, makeCrew, CARRIER_SLOTS } from './scene/vehicles.js';
import { makeProduct, makeKit, updateKit, CarFleet } from './scene/products.js';
import { PROCESS, currentOp } from './process.js';

export const STATE_COLOR = { proc: 0x0ca30c, idle: 0x6b7480, blocked: 0xfab219, nomat: 0x3987e5, down: 0xd03b3b, maint: 0x9085e9, micro: 0xec835a };
export const STATE_LABEL = { proc: 'Running', idle: 'Waiting for part', blocked: 'Blocked downstream', nomat: 'Waiting for material', down: 'Breakdown', maint: 'Maintenance', micro: 'Minor stop' };

export const VIEWS = {
  overview: { name: 'Plant overview', p: [-6, 150, 196], t: [8, 0, 6] },
  inbound: { name: 'Inbound & warehouse', p: [-206, 46, 44], t: [-136, 0, 2] },
  stamping: { name: 'Press shop', p: [-84, 24, -12], t: [-84, 2, -48] },
  body: { name: 'Body shop', p: [8, 26, -14], t: [5, 1, -48] },
  paint: { name: 'Paint shop', p: [38, 26, 24], t: [36, 1, -12] },
  battery: { name: 'Battery & drive unit', p: [-74, 24, 92], t: [-66, 1, 52] },
  ga: { name: 'General assembly', p: [-8, 20, 58], t: [-6, 1, 28] },
  eol: { name: 'End-of-line test', p: [88, 20, 58], t: [86, 1, 28] },
  yard: { name: 'Yard & delivery', p: [176, 58, 84], t: [176, 0, -4] },
  control: { name: 'Control centre', p: [50, 9, 36], t: [50, 2, 58] },
};

const FX_COL = { weld: new THREE.Color(1, 0.72, 0.32), rivet: new THREE.Color(0.9, 0.95, 1), laser: new THREE.Color(0.5, 1, 0.7), bolt: new THREE.Color(0.4, 0.75, 1), scan: new THREE.Color(0.3, 0.6, 1) };
const lerpAngle = (a, b, f) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * f; };
const sm = x => x * x * (3 - 2 * x);
const clamp01 = x => Math.max(0, Math.min(1, x));
const _v = new THREE.Vector3(), _vel = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

// polyline helper: returns [x, z, yaw] at fraction f of total length
function along(pts, f) {
  let tot = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
  let d = clamp01(f) * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0, a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(b[1] - a[1]), b[0] - a[0])];
    }
    d -= seg[i];
  }
  return [pts[0][0], pts[0][1], 0];
}

export class FactoryView {
  constructor(canvas, sim, brain) {
    this.sim = sim; this.brain = brain; this.canvas = canvas;
    this.overlay = 'state'; this.selected = null; this.follow = false; this.onSelect = null; this.onHover = null;
    this.time = 0; this.slow = 0; this.fly = null; this.tour = false; this.tourT = 0; this.tourI = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);
    scene.fog = new THREE.FogExp2(0x0b0f14, 0.0013);
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.42;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1600);
    this.camera.position.set(...VIEWS.overview.p);
    const c = this.controls = new OrbitControls(this.camera, canvas);
    c.target.set(...VIEWS.overview.t); c.enableDamping = true; c.dampingFactor = 0.08; c.maxPolarAngle = Math.PI * 0.495; c.minDistance = 4; c.maxDistance = 520; c.zoomSpeed = 1.1;
    c.addEventListener('start', () => { this.fly = null; this.tour = false; });

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2e34, 0.55));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1df, 1.55);
    sun.position.set(-60, 190, 120); sun.target.position.set(30, 0, 0); scene.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -230, right: 250, top: 150, bottom: -150, near: 20, far: 520 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35;

    this.live = buildWorld(scene);
    this.fx = new Particles(1800); scene.add(this.fx.points);
    this._stations();
    this._dynamic();
    this._picking();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setQuality(high) {
    this.renderer.shadowMap.enabled = high; this.sun.castShadow = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  // ------------------------------------------------------------ stations
  _stations() {
    const S = new THREE.Group();
    this.st = {}; this.pick = [];
    const padG = {}; const proxyM = new THREE.MeshBasicMaterial({ visible: false });
    for (const def of STATION_LIST) {
      const nodes = LINES[def.line].nodes, nx = nodes[def.idx + 1] || nodes[def.idx - 1];
      const flip = (nx.pos[0] - def.pos[0]) * (nodes[def.idx + 1] ? 1 : -1) < 0;
      const s = new THREE.Group(), d = new THREE.Group();
      s.position.set(def.pos[0], 0, def.pos[2]); d.position.copy(s.position);
      if (flip) { s.rotation.y = Math.PI; d.rotation.y = Math.PI; }
      const h = BUILD[def.vis](s, d, def, 1) || {};
      const kit = makeKit(def.id);
      if (kit) {
        d.add(kit.group);
        for (const it of kit.items) {            // a stand under every part staged beside the line
          const bb = it.c.box, minY = bb.min.y + it.from.y;
          if (!it.under && it.from.y < 1.4 && minY > 0.3 && it.from.lengthSq() > 1) s.add(box(Math.max(0.35, (bb.max.x - bb.min.x) * 0.7), minY - 0.02, Math.max(0.35, (bb.max.z - bb.min.z) * 0.7), mat(0x39424d, 0.6, 0.4), it.c.center.x + it.from.x, (minY - 0.02) / 2, it.c.center.z + it.from.z));
        }
      }
      // andon pole
      s.add(box(0.1, 3.6, 0.1, mat(0x8e949c, 0.45, 0.8), -5.3, 1.8, -4.4), box(0.5, 0.06, 0.5, mat(0x24282e, 0.55, 0.5), -5.3, 0.03, -4.4));
      const andon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 12), new THREE.MeshBasicMaterial({ color: 0x0ca30c }));
      andon.position.set(-5.3, 3.9, -4.4); d.add(andon);
      S.add(s); this.scene.add(d);
      const pw = def.zone === 'stamping' ? 11.3 : 12.6, ph = def.zone === 'stamping' ? 9.6 : def.zone === 'battery' || def.zone === 'drive' ? 9.4 : 11;
      const pg = padG[pw + '|' + ph] || (padG[pw + '|' + ph] = new THREE.PlaneGeometry(pw, ph));
      const pad = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x0ca30c, transparent: true, opacity: 0.16, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(def.pos[0], 0.016, def.pos[2]); this.scene.add(pad);
      const tall = def.vis === 'press' ? 10.6 : def.vis === 'blank' ? 7.2 : 6.6;
      const label = textSprite([def.id, def.name], { size: 38, scale: 0.9, accent: ZONES[def.zone].color });
      label.position.set(def.pos[0], tall, def.pos[2]); this.scene.add(label); this.live.labels.push({ sp: label });
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(pw - 1, 4.5, ph - 1.5), proxyM);
      proxy.position.set(def.pos[0], 2.25, def.pos[2]); proxy.userData.sel = { type: 'station', id: def.id }; this.scene.add(proxy); this.pick.push(proxy);
      this.st[def.id] = { def, h, d, andon, pad, kit, flying: [], tall, tv: (h.robots || []).map(() => new THREE.Vector3()), asg: new Map(), origin: new THREE.Vector3(def.pos[0], 0, def.pos[2]), paint: new THREE.Color(0xffffff) };
    }
    this.scene.add(bake(S));
  }

  // ------------------------------------------------- pools & live objects
  _dynamic() {
    const sc = this.scene;
    this.ents = new Map(); this.pool = { main: [], stamp: [], batt: [], drive: [] };
    this.fleet = new CarFleet(150); sc.add(this.fleet.group);
    this.agvs = this.sim.s.agvs.map(a => { const g = makeAGV(); g.userData.pick.userData.sel = { type: 'agv', id: a.id }; this.pick.push(g.userData.pick); sc.add(g); return g; });
    this.trucks = []; this.carriers = this.sim.s.carriers.map(() => { const g = makeCarrier(); g.visible = false; sc.add(g); return g; });
    this.crew = this.live.crewHome.map(p => { const m = makeCrew(); m.position.set(p[0], 0, p[2]); sc.add(m); return m; });
    // sub-assembly racks
    const C = this.live.counters;
    const pm = new THREE.MeshStandardMaterial({ color: 0xc3c9d0, roughness: 0.3, metalness: 0.9 }), dk = mat(0x23272d, 0.6, 0.5), al = mat(0xc4c9cf, 0.35, 0.85);
    for (let i = 0; i < COUNTERS.panels.cap; i++) { const m = box(3.0, 0.035, 1.7, pm, C.panels.x, 0.24 + i * 0.055, C.panels.z); m.castShadow = true; sc.add(m); C.panels.items.push(m); }
    for (let i = 0; i < COUNTERS.packs.cap; i++) { const m = box(2.2, 0.2, 1.42, dk, C.packs.x, 0.32 + i * 0.26, C.packs.z); m.castShadow = true; sc.add(m); C.packs.items.push(m); }
    for (let i = 0; i < COUNTERS.dus.cap; i++) { const m = cyl(0.24, 0.42, al, C.dus.x - 0.7 + (i % 3) * 0.7, 0.46, C.dus.z + (i < 3 ? -0.4 : 0.4), 'z', 14); m.castShadow = true; sc.add(m); C.dus.items.push(m); }
    // selection ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0x39b8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; sc.add(this.ring);
  }
  _obj(kind) {
    const p = this.pool[kind];
    if (p.length) { const o = p.pop(); o.visible = true; return o; }
    const o = makeProduct(kind);
    if (kind === 'main') this.pick.push(o.userData.pick);
    this.scene.add(o);
    return o;
  }

  // ---------------------------------------------------------------- frame
  render(dt, speed) {
    const sim = this.sim, s = sim.s, running = speed > 0;
    const adt = running ? dt * Math.max(0.7, Math.min(2.4, speed / 12)) : 0;
    this.time += adt;
    const kf = 1 - Math.exp(-dt * 8);

    // ---- entities on the lines
    const seen = new Set();
    for (const id in s.ents) {
      const e = s.ents[id], def = LINES[e.L], nd = def.nodes[e.i];
      let rec = this.ents.get(e.id);
      if (!rec) { rec = { o: this._obj(e.L), kind: e.L, yaw: null }; this.ents.set(e.id, rec); if (e.L === 'main') rec.o.userData.pick.userData.sel = { type: 'car', id: e.id }; }
      seen.add(e.id);
      const to = nd.pos, from = e.i === 0 ? def.spawn : def.nodes[e.i - 1].pos;
      let x = to[0], y = to[1], z = to[2];
      const prog = e.m === 2 ? clamp01(1 - e.t / e.d) : 0;
      if (e.m === 0) {
        const f = sm(clamp01(1 - e.t / e.d));
        x = from[0] + (to[0] - from[0]) * f; y = from[1] + (to[1] - from[1]) * f; z = from[2] + (to[2] - from[2]) * f;
        if (nd.id === 'PNT-10' || (e.i > 0 && def.nodes[e.i - 1].id === 'PNT-10')) y += 1.5 * Math.sin(Math.PI * f);
      }
      const dx = to[0] - from[0], dz = to[2] - from[2];
      const yaw = Math.abs(dx) + Math.abs(dz) > 0.01 ? Math.atan2(-dz, dx) : 0;
      rec.yaw = rec.yaw === null ? yaw : lerpAngle(rec.yaw, yaw, e.m === 0 ? kf * 0.6 : kf * 0.2);
      if (e.L === 'main') {
        const h = nd.id && this.st[nd.id].h;
        if (e.m === 2 && h && h.carY) y += h.carY(prog);
        if (e.m === 2 && nd.id === 'PNT-10') y += 0.12 * Math.sin(this.time * 2.2);
        rec.o.userData.set(e, prog, COLORS[e.c].hex, VARIANTS[e.v].motors);
      } else rec.o.userData.set(e, prog);
      rec.o.position.set(x, y, z); rec.o.rotation.y = e.L === 'main' ? rec.yaw : 0;
    }
    for (const [id, rec] of this.ents) if (!seen.has(id)) { rec.o.visible = false; this.pool[rec.kind].push(rec.o); this.ents.delete(id); if (this.selected && this.selected.type === 'car' && this.selected.id === id) this.select(null); }

    // ---- stations
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
    for (const id in this.st) {
      const v = this.st[id], def = v.def, st = s.st[id];
      const eid = s.occ[def.line][def.idx], e = eid ? s.ents[eid] : null;
      const inProc = !!e && e.m === 2, act = running && inProc && !st.down;
      const prog = inProc ? clamp01(1 - e.t / e.d) : 0;
      if (e && e.c !== undefined) v.paint.setHex(COLORS[e.c].hex);
      const lift = inProc && v.h.carY ? v.h.carY(prog) : 0;
      let focus = null, under = 0;
      v.flying.length = 0; v.prog = prog; v.inProc = inProc;
      if (v.kit) {
        updateKit(v.kit, inProc, prog, lift, e && e.v !== undefined ? VARIANTS[e.v].motors : 1, v.flying);
        const rec = inProc && def.line === 'main' ? this.ents.get(eid) : null;
        if (rec) { const ub = rec.o.userData.body, us = rec.o.userData.struct, kb = v.kit.body, ks = v.kit.struct; kb.color.copy(ub.color); kb.roughness = ub.roughness; kb.metalness = ub.metalness; ks.color.copy(us.color); ks.roughness = us.roughness; ks.metalness = us.metalness; }
        if (v.flying.length) { focus = v.flying[0].pos; for (const it of v.flying) if (it.under) under = Math.max(under, it.mesh.position.y); }
      }
      if (v.h.robots && running) this._robots(v, act, prog, lift, adt, speed);
      if (v.h.update && (running || this.time === 0)) v.h.update({ act, prog, t: this.time, dt: adt, fx: this.fx, color: v.paint, origin: v.origin, focus, under });
      v.andon.material.color.setHex(STATE_COLOR[st.state]);
      if (st.state === 'down') v.andon.material.color.multiplyScalar(0.35 + 0.65 * pulse);
      this._pad(v, st, pulse);
    }

    // ---- slow (4 Hz) updates
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.25;
      updateStock(this.live, sim);
      for (const c in this.live.counters) this.live.counters[c].items.forEach((m, i) => { m.visible = i < s.cnt[c]; });
      for (const id in this.live.lineSide) { const ls = this.live.lineSide[id], q = s.st[id].ls[ls.mat] || 0, k = Math.max(0.04, Math.min(1.25, q / 14)); ls.mesh.scale.y = 0.7 * k; ls.mesh.position.y = 0.5 + 0.35 * k; }
      const cp = this.camera.position;
      for (const l of this.live.labels) l.sp.visible = this.showLabels !== false && cp.distanceTo(l.sp.position) < (l.far ? 900 : 150);
    }

    // ---- AGVs
    s.agvs.forEach((a, i) => {
      const g = this.agvs[i], u = g.userData;
      g.position.set(a.x, 0, a.z); g.rotation.y = lerpAngle(g.rotation.y, a.hdg - Math.PI / 2, kf);
      u.load.visible = a.load > 0; if (a.mat) u.loadM.color.setHex(MAT_COLOR[a.mat]);
      u.lamp.material.color.setHex(a.down ? 0xd03b3b : a.m === 0 ? 0x3a4a52 : 0x14e0c8);
    });

    // ---- inbound trucks
    let ti = 0;
    for (const po of s.pos) {
      if (po.dock < 0) continue;
      const dz = DOCKS[po.dock].z; let p;
      if (po.st === 0) p = along([[-170, -250], [-170, dz - 14], [-170, dz], [-160.4, dz]], sm(clamp01((s.t - po.tApp) / 78)));
      else if (po.st === 1) p = [-160.4, dz, 0];
      else p = along([[-160.4, dz], [-170, dz], [-170, dz + 14], [-170, 260]], sm(clamp01((s.t - po.tDone) / 90)));
      const tr = this.trucks[ti] || (this.trucks[ti] = (() => { const g = makeTruck(); this.scene.add(g); return g; })());
      ti++;
      tr.visible = true; tr.position.set(p[0], 0, p[1]);
      // reverse into the dock: on the final leg the truck faces away from the building
      const yaw = po.st === 1 ? Math.PI : po.st === 0 && Math.abs(p[1] - dz) < 0.01 ? Math.PI : p[2];
      tr.rotation.y = tr.userData.init ? lerpAngle(tr.rotation.y, yaw, kf * 0.5) : yaw; tr.userData.init = true;
      tr.userData.stripe.color.setHex(MAT_COLOR[po.mat]); tr.userData.box.material.color.setHex(po.exp ? 0xf3c9b5 : 0xdfe3e7);
    }
    for (; ti < this.trucks.length; ti++) { this.trucks[ti].visible = false; this.trucks[ti].userData.init = false; }

    // ---- yard + outbound carriers
    const fleet = this.fleet; fleet.begin();
    for (const id in s.ycars) {
      const yc = s.ycars[id], sp = yardSlotPos(yc.slot), age = s.t - yc.tIn;
      if (age < 28) {
        const lx = sp[0] - 4.6, p = along([[119, 28], [137, 28], [137, 6], [lx, 6], [lx, sp[2]], [sp[0], sp[2]]], sm(age / 28));
        fleet.put(p[0], 0, p[1], p[2], COLORS[yc.c].hex);
      } else fleet.put(sp[0], 0, sp[2], 0, COLORS[yc.c].hex);
    }
    s.carriers.forEach((c, i) => {
      const g = this.carriers[i];
      if (c.m === 0 || c.m === 4) { g.visible = false; return; }
      const bay = CARRIER_BAYS[c.r]; let p;
      if (c.m === 1) p = along([[233, 250], [233, 70], [bay.x, 48], [bay.x, bay.z]], sm(clamp01(1 - c.t / 50)));
      else if (c.m === 2) p = [bay.x, bay.z, Math.PI / 2];
      else {
        const el = REGIONS[c.r].transit * 3600 - c.t;
        if (el > 80) { g.visible = false; return; }
        p = along([[bay.x, bay.z], [bay.x, -30], [233, -52], [233, -270]], clamp01(el / 80) ** 2);
      }
      g.visible = true; g.position.set(p[0], 0, p[1]);
      g.rotation.y = g.userData.init ? lerpAngle(g.rotation.y, p[2], kf * 0.5) : p[2]; g.userData.init = true;
      g.updateMatrix();
      c.cars.forEach((car, k) => { const sl = CARRIER_SLOTS[k]; _v.set(sl[0], sl[1], sl[2]).applyMatrix4(g.matrix); fleet.put(_v.x, _v.y, _v.z, g.rotation.y, COLORS[car.c].hex); });
    });
    fleet.end();

    // ---- maintenance crews walk to whichever station they are working on
    const jobs = []; for (const d of STATION_LIST) { const dn = s.st[d.id].down; if (dn && dn.crew) jobs.push(d); }
    this.crew.forEach((m, i) => {
      const j = jobs[i], h = this.live.crewHome[i];
      _v.set(j ? j.pos[0] - 3.4 : h[0], 0, j ? j.pos[2] + (j.pos[2] > 0 ? -3.9 : 3.9) : h[2]);
      m.position.lerp(_v, 1 - Math.exp(-dt * 1.6));
    });

    this._callout();
    this.fx.update(running ? Math.min(dt, 0.05) : 0);
    this._camera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // Robots are driven from the bill of process: a robot named in op.by carries that
  // component from its rack to the product; process robots step along op.spots.
  _robots(v, act, prog, lift, dt, speed) {
    const R = v.h.robots, ops = PROCESS[v.def.id], tg = v.tg || (v.tg = []);
    for (let i = 0; i < R.length; i++) tg[i] = null;
    let op = null, fire = null;
    if (act && ops) {
      for (const it of v.flying) if (it.by != null && R[it.by]) tg[it.by] = v.tv[it.by].copy(it.pos).add(v.origin);
      op = ops[currentOp(v.def.id, prog)];
      if (op.spots && prog < op.t[1]) {
        const asg = this._assign(v, op), u = (prog - op.t[0]) / (op.t[1] - op.t[0]);
        fire = [];
        asg.forEach((list, i) => {
          if (tg[i] || !list.length) return;
          const q = u * list.length, k = Math.min(list.length - 1, Math.floor(q));
          tg[i] = v.tv[i].copy(list[k]).add(v.origin); tg[i].y += lift;
          fire[i] = q - k > 0.35;
        });
      }
    }
    for (let i = 0; i < R.length; i++) {
      const r = R[i];
      if (!tg[i]) { r.update(0, this.time, dt); continue; }
      r.reach(tg[i], dt);
      if (fire && fire[i] && FX_COL[op.kind] && (r.err < 0.45 || speed > 8)) {
        r.tip.getWorldPosition(_v);
        if (op.kind === 'weld') { if (Math.random() < 0.55) for (let k = 0; k < 4; k++) this.fx.emit(_v, _vel.set(0, 1.6, 0), FX_COL.weld, 0.55, 9, 5); }
        else if (Math.random() < 0.3) this.fx.emit(_v, _vel.set(0, 0.4, 0), FX_COL[op.kind], 0.2, 1.5, op.kind === 'laser' ? 2.2 : 0.8);
      }
    }
  }
  // split an operation's work points between the robots able to do it (nearest base wins)
  _assign(v, op) {
    let a = v.asg.get(op); if (a) return a;
    const R = v.h.robots; a = R.map(() => []);
    const proc = R.map((r, i) => i).filter(i => R[i].tool !== 'grip');
    const who = op.robots || (proc.length ? proc : R.map((r, i) => i));
    for (const sp of op.spots) {
      let best = who[0], bd = 1e9;
      for (const i of who) { const p = R[i].root.position, d = Math.hypot(p.x - sp[0], p.z - sp[2]); if (d < bd) { bd = d; best = i; } }
      a[best].push(new THREE.Vector3(sp[0], sp[1], sp[2]));
    }
    v.asg.set(op, a);
    return a;
  }
  // floating label naming the operation in progress at the selected station
  _callout() {
    const sel = this.selected; let key = '', v = null, k = -1;
    if (sel && sel.type === 'station' && PROCESS[sel.id]) { v = this.st[sel.id]; if (v.inProc) { k = currentOp(sel.id, v.prog); key = sel.id + ':' + k; } }
    if (key !== this.coKey) {
      this.coKey = key;
      if (this.co) { this.scene.remove(this.co); this.co.material.map.dispose(); this.co.material.dispose(); this.co = null; }
      if (key) {
        const ops = PROCESS[sel.id], op = ops[k], how = op.how.length > 74 ? op.how.slice(0, 72) + '…' : op.how;
        this.co = textSprite([`Step ${k + 1} of ${ops.length} · ${op.n}`, how], { size: 34, scale: 0.72, accent: '#39b8ff' });
        this.co.material.depthTest = false; this.co.renderOrder = 10;
        this.scene.add(this.co);
      }
    }
    if (this.co && v) this.co.position.set(v.origin.x, v.tall - 1.7, v.origin.z);
  }

  _pad(v, st, pulse) {
    const m = v.pad.material, ov = this.overlay, id = v.def.id;
    if (ov === 'state') { m.color.setHex(STATE_COLOR[st.state]); m.opacity = st.state === 'down' ? 0.25 + 0.3 * pulse : st.state === 'proc' ? 0.1 : 0.22; return; }
    const est = this.brain.est[id], fl = this.brain.flow[id] || { busy: 0 };
    let f = 0;
    if (ov === 'health') { f = clamp01(est.health); m.color.copy(_c.setHex(0xd03b3b)).lerp(_c2.setHex(f < 0.5 ? 0xfab219 : 0x0ca30c), f < 0.5 ? f * 2 : 1); if (f >= 0.5) m.color.copy(_c.setHex(0xfab219)).lerp(_c2.setHex(0x0ca30c), (f - 0.5) * 2); }
    else if (ov === 'util') { f = clamp01(fl.busy); m.color.copy(_c.setHex(0xcde2fb)).lerp(_c2.setHex(0x184f95), f); }
    else if (ov === 'quality') { f = clamp01(est.qrate / 0.12); m.color.copy(_c.setHex(0x0ca30c)).lerp(_c2.setHex(0xd03b3b), f); }
    else if (ov === 'energy') { const pw = EQUIP[v.def.eq].power; f = clamp01((st.state === 'proc' ? pw[1] : pw[0]) / 430); m.color.copy(_c.setHex(0xf6d9c2)).lerp(_c2.setHex(0xd95926), Math.sqrt(f)); }
    m.opacity = 0.62;
  }

  // ------------------------------------------------------------- camera
  flyTo(key, dur = 1.4) {
    const v = typeof key === 'string' ? VIEWS[key] : key; if (!v) return;
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: new THREE.Vector3(...v.p), t1: new THREE.Vector3(...v.t), k: 0, dur };
    this.follow = false;
  }
  focus(x, z, dist = 34) {
    const dir = _v.copy(this.camera.position).sub(this.controls.target).normalize();
    if (dir.y < 0.35) { dir.y = 0.5; dir.normalize(); }
    const hl = Math.hypot(dir.x, dir.z) || 1, sh = dist * 0.3, ox = dir.x / hl * sh, oz = dir.z / hl * sh;
    this.flyTo({ p: [x + ox + dir.x * dist, Math.max(6, dir.y * dist), z + oz + dir.z * dist], t: [x + ox, 1, z + oz] }, 1.1);
  }
  _camera(dt) {
    if (this.tour && !this.fly) {
      this.tourT -= dt;
      if (this.tourT <= 0) { const keys = Object.keys(VIEWS); this.tourI = (this.tourI + 1) % keys.length; this.flyTo(keys[this.tourI], 2.6); this.tourT = 11; this.tour = true; }
      this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.5;
    } else this.controls.autoRotate = false;
    if (this.fly) {
      const f = this.fly; f.k = Math.min(1, f.k + dt / f.dur); const e = sm(f.k);
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.fly = null;
    }
    const pos = this.selectedPos();
    if (pos) {
      this.ring.visible = true; this.ring.position.set(pos.x, 0.05 + (pos.y || 0), pos.z);
      const sc = (this.selected.type === 'station' ? 6.6 : 3.2) * (1 + 0.04 * Math.sin(performance.now() * 0.006)); this.ring.scale.set(sc, sc, 1);
      if (this.follow && !this.fly) { _v.set(pos.x, 1, pos.z).sub(this.controls.target); this.controls.target.add(_v); this.camera.position.add(_v); }
    } else this.ring.visible = false;
    this.controls.update();
  }
  selectedPos() {
    const sel = this.selected; if (!sel) return null;
    if (sel.type === 'station') return this.st[sel.id].origin;
    if (sel.type === 'car') { const r = this.ents.get(sel.id); return r ? r.o.position : null; }
    if (sel.type === 'agv') return this.agvs[sel.id - 1].position;
    return null;
  }
  select(sel, focus = false) {
    this.selected = sel; this.follow = false;
    if (sel && focus) { const p = this.selectedPos(); if (p) this.focus(p.x, p.z, sel.type === 'station' ? 36 : 22); }
    if (this.onSelect) this.onSelect(sel);
  }

  // ------------------------------------------------------------ picking
  _picking() {
    const ray = new THREE.Raycaster(), m = new THREE.Vector2(); let down = null, lastHover = 0;
    const hit = ev => {
      const r = this.canvas.getBoundingClientRect();
      m.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(m, this.camera);
      const list = this.pick.filter(o => o.parent && (o.parent.visible !== false));
      const hits = ray.intersectObjects(list, false);
      if (!hits.length) return null;
      // prefer small things (cars, AGVs) over the station volume they sit in
      const small = hits.find(h => h.object.userData.sel.type !== 'station' && h.distance < hits[0].distance + 14);
      return (small || hits[0]).object.userData.sel;
    };
    this.canvas.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
    this.canvas.addEventListener('pointerup', ev => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
      this.select(hit(ev));
    });
    this.canvas.addEventListener('dblclick', ev => { const h = hit(ev); if (h) this.select(h, true); });
    this.canvas.addEventListener('pointermove', ev => {
      const now = performance.now(); if (now - lastHover < 70 || ev.buttons) return; lastHover = now;
      const h = hit(ev); this.canvas.style.cursor = h ? 'pointer' : 'grab';
      if (this.onHover) this.onHover(h, ev.clientX, ev.clientY);
    });
    this.canvas.addEventListener('pointerleave', () => { if (this.onHover) this.onHover(null); });
  }
}
