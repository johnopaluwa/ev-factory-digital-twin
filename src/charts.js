// Minimal canvas charts for the control-room UI: thin lines, recessive grid,
// range bands, crosshair + tooltip. Colours come from CSS custom properties.
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let INK = null;
const ink = () => INK || (INK = { ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--grid'), axis: css('--axis'), surface: css('--surface') });
export const SERIES = () => [css('--series-1'), css('--series-2'), css('--series-3')];

function fit(canvas, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px'; }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (n <= k) return k * p; return 10 * p; }

// cfg: { h, series: [{ name, color, pts: [[x, y]], dash, band: { lo: [], hi: [] }, muted }], xFmt, yFmt, yMin, yMax, xMin, xMax }
export function lineChart(canvas, cfg) {
  canvas._cfg = cfg;
  const c = ink(), { g, w, h } = fit(canvas, cfg.h || 120);
  const ml = 34, mr = 12, mt = 8, mb = 18, pw = w - ml - mr, ph = h - mt - mb;
  let x0 = cfg.xMin ?? Infinity, x1 = cfg.xMax ?? -Infinity, y1 = cfg.yMax ?? -Infinity; const y0 = cfg.yMin ?? 0;
  for (const s of cfg.series) for (const p of s.pts) { if (cfg.xMin == null && p[0] < x0) x0 = p[0]; if (cfg.xMax == null && p[0] > x1) x1 = p[0]; if (cfg.yMax == null && p[1] > y1) y1 = p[1]; }
  for (const s of cfg.series) if (s.band && cfg.yMax == null) for (const v of s.band.hi) if (v > y1) y1 = v;
  if (!isFinite(x0) || x1 <= x0) { x0 = 0; x1 = 1; }
  if (!isFinite(y1) || y1 <= y0) y1 = y0 + 1;
  if (cfg.yMax == null) y1 = y0 + niceMax((y1 - y0) * 1.05);
  const X = x => ml + (x - x0) / (x1 - x0) * pw, Y = y => mt + ph - (y - y0) / (y1 - y0) * ph;
  canvas._map = { X, x0, x1, ml, pw };
  g.font = '10px system-ui, "Segoe UI", sans-serif'; g.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) {
    const v = y0 + (y1 - y0) * i / 3, y = Math.round(Y(v)) + 0.5;
    g.strokeStyle = i === 0 ? c.axis : c.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(ml, y); g.lineTo(w - mr, y); g.stroke();
    g.fillStyle = c.muted; g.textAlign = 'right'; g.fillText(cfg.yFmt ? cfg.yFmt(v) : Math.round(v), ml - 5, y);
  }
  g.textBaseline = 'alphabetic';
  [[x0, 'left'], [(x0 + x1) / 2, 'center'], [x1, 'right']].forEach(([v, al]) => { g.textAlign = al; g.fillStyle = c.muted; g.fillText(cfg.xFmt ? cfg.xFmt(v) : v.toFixed(0), X(v), h - 4); });
  g.save(); g.beginPath(); g.rect(ml, mt - 4, pw + 6, ph + 8); g.clip();
  for (const s of cfg.series) {
    if (!s.pts.length) continue;
    if (s.band) {
      g.fillStyle = s.color; g.globalAlpha = 0.16; g.beginPath();
      s.pts.forEach((p, i) => { const x = X(p[0]), y = Y(s.band.hi[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (let i = s.pts.length - 1; i >= 0; i--) g.lineTo(X(s.pts[i][0]), Y(s.band.lo[i]));
      g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    g.strokeStyle = s.color; g.lineWidth = s.muted ? 1.25 : 2; g.lineJoin = 'round'; g.setLineDash(s.dash || []);
    g.beginPath(); s.pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    if (!s.muted && !s.noDot) { const p = s.pts[s.pts.length - 1]; g.fillStyle = c.surface; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 5, 0, 7); g.fill(); g.fillStyle = s.color; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 3.2, 0, 7); g.fill(); }
  }
  if (cfg.hover != null) { const x = Math.round(X(cfg.hover)) + 0.5; g.strokeStyle = c.muted; g.lineWidth = 1; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, mt + ph); g.stroke(); }
  g.restore();
  if (!canvas._bound) {
    canvas._bound = true;
    const tip = canvas.parentElement.querySelector('.tip');
    canvas.addEventListener('mousemove', ev => {
      const cf = canvas._cfg, m = canvas._map; if (!cf || !m) return;
      const r = canvas.getBoundingClientRect(), xv = m.x0 + (ev.clientX - r.left - m.ml) / m.pw * (m.x1 - m.x0);
      let best = null, bd = Infinity;
      for (const s of cf.series) for (const p of s.pts) { const d = Math.abs(p[0] - xv); if (d < bd) { bd = d; best = p[0]; } }
      if (best == null) return;
      cf.hover = best; lineChart(canvas, cf);
      const rows = cf.series.map(s => { let q = null, qd = Infinity; for (const p of s.pts) { const d = Math.abs(p[0] - best); if (d < qd) { qd = d; q = p; } } return q && qd <= (m.x1 - m.x0) * 0.04 ? `<div><i style="background:${s.color}"></i>${s.name}: <b>${cf.yFmt ? cf.yFmt(q[1]) : Math.round(q[1])}</b></div>` : ''; }).join('');
      if (tip) { tip.innerHTML = `<div class="muted">${cf.xFmt ? cf.xFmt(best) : best}</div>${rows}`; tip.style.display = 'block'; const tx = m.X(best); tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, tx + 10)) + 'px'; tip.style.top = '4px'; }
    });
    canvas.addEventListener('mouseleave', () => { if (canvas._cfg) { canvas._cfg.hover = null; lineChart(canvas, canvas._cfg); } if (tip) tip.style.display = 'none'; });
  }
}

// tiny trend line with a dashed reference level
export function spark(canvas, vals, base, color) {
  const c = ink(), { g, w, h } = fit(canvas, 30);
  if (!vals || vals.length < 2) return;
  let lo = base, hi = base; for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.15 || Math.abs(base) * 0.02 || 1; lo -= pad; hi += pad;
  const X = i => 2 + i / (vals.length - 1) * (w - 8), Y = v => h - 3 - (v - lo) / (hi - lo) * (h - 6);
  g.strokeStyle = c.axis; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(base)); g.lineTo(w, Y(base)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); vals.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(X(vals.length - 1), Y(vals[vals.length - 1]), 3, 0, 7); g.fill();
}
