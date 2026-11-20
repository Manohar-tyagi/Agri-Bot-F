// ---------- contours.js : animated topographic "swiggly line" background ----------
// Draws contour lines (marching squares) of a slowly evolving noise field on a <canvas>.
// No images, no libraries. Usage:  const bg = createContours(sectionElement, { /* options */ });  bg.destroy() to remove.

// --- tiny seeded 3D simplex noise (public-domain algorithm) ---
function makeNoise3(seed = 7) {
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0 || 1; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const g = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0, 1,0,1,-1,0,1,1,0,-1,-1,0,-1, 0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const F3 = 1 / 3, G3 = 1 / 6;
  return (xin, yin, zin) => {
    const sk = (xin + yin + zin) * F3, i = Math.floor(xin + sk), j = Math.floor(yin + sk), k = Math.floor(zin + sk);
    const t = (i + j + k) * G3, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; } else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; } else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; } }
    else { if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; } else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; } else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; } }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt, gi;
    tt = 0.6 - x0*x0 - y0*y0 - z0*z0; if (tt > 0) { gi = pm12[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt*tt*(g[gi]*x0 + g[gi+1]*y0 + g[gi+2]*z0); }
    tt = 0.6 - x1*x1 - y1*y1 - z1*z1; if (tt > 0) { gi = pm12[ii+i1 + perm[jj+j1 + perm[kk+k1]]] * 3; tt *= tt; n += tt*tt*(g[gi]*x1 + g[gi+1]*y1 + g[gi+2]*z1); }
    tt = 0.6 - x2*x2 - y2*y2 - z2*z2; if (tt > 0) { gi = pm12[ii+i2 + perm[jj+j2 + perm[kk+k2]]] * 3; tt *= tt; n += tt*tt*(g[gi]*x2 + g[gi+1]*y2 + g[gi+2]*z2); }
    tt = 0.6 - x3*x3 - y3*y3 - z3*z3; if (tt > 0) { gi = pm12[ii+1 + perm[jj+1 + perm[kk+1]]] * 3; tt *= tt; n += tt*tt*(g[gi]*x3 + g[gi+1]*y3 + g[gi+2]*z3); }
    return 32 * n;
  };
}

const CONTOUR_DEFAULTS = {
  color: 'rgba(30, 95, 62, 0.20)',   // line colour (soft green-grey; raise alpha for stronger lines)
  lineWidth: 1.1,                      // CSS px
  cell: 18,                            // grid size in CSS px (smaller = smoother lines, more work)
  scale: 950,                          // size of the swirls in CSS px (bigger = broader loops)
  levels: 7,                           // number of contour lines
  speed: 0.05,                          // drift speed (noise units per second)
  mouse: true,                         // lines bend around the pointer
  parallax: 0.3,                       // lines lag behind the page when scrolling (0 = off)
  fps: 30, seed: 7,
};

// Core drawing, no DOM: fills `field`, extracts contour segments and strokes them. Safe to call from tests.
function drawContourFrame(ctx, W, H, o, state) {
  const cell = o.cell, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
  if (!state.field || state.field.length !== cols * rows) state.field = new Float32Array(cols * rows);
  const f = state.field, inv = 1 / o.scale, t = state.t, ox = state.ox || 0, oy = state.oy || 0;
  const noise = state.noise, mx = state.mx, my = state.my, hasM = o.mouse && mx != null, sig = 190, amp = 0.34, cut2 = (sig * 2.6) * (sig * 2.6);
  for (let r = 0, idx = 0; r < rows; r++) {
    const y = r * cell;
    for (let c = 0; c < cols; c++, idx++) {
      const x = c * cell, nx = (x + ox) * inv, ny = (y + oy) * inv;
      let v = noise(nx, ny, t) + 0.28 * noise(nx * 2.3 + 17.3, ny * 2.3 + 4.1, t * 1.4);   // main swirl + a little detail
      if (hasM) { const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy; if (d2 < cut2) v += amp * Math.exp(-d2 / (2 * sig * sig)); }
      f[idx] = v;
    }
  }
  const lv = []; for (let i = 0; i < o.levels; i++) lv.push(-0.5 + (1.0 * i) / (o.levels - 1));
  ctx.lineWidth = o.lineWidth; ctx.strokeStyle = o.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const L of lv) {
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c, a = f[i], b = f[i + 1], cc = f[i + cols + 1], d = f[i + cols];
      const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (cc > L ? 2 : 0) | (d > L ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x0 = c * cell, y0 = r * cell, x1 = x0 + cell, y1 = y0 + cell;
      const tx = x0 + cell * (L - a) / (b - a);      // where the line crosses the top edge
      const ry = y0 + cell * (L - b) / (cc - b);     // right edge
      const bx = x0 + cell * (L - d) / (cc - d);     // bottom edge
      const ly = y0 + cell * (L - a) / (d - a);      // left edge
      switch (k) {
        case 1: case 14: ctx.moveTo(x0, ly); ctx.lineTo(bx, y1); break;
        case 2: case 13: ctx.moveTo(bx, y1); ctx.lineTo(x1, ry); break;
        case 3: case 12: ctx.moveTo(x0, ly); ctx.lineTo(x1, ry); break;
        case 4: case 11: ctx.moveTo(tx, y0); ctx.lineTo(x1, ry); break;
        case 6: case 9: ctx.moveTo(tx, y0); ctx.lineTo(bx, y1); break;
        case 7: case 8: ctx.moveTo(tx, y0); ctx.lineTo(x0, ly); break;
        case 5: if ((a + b + cc + d) / 4 > L) { ctx.moveTo(tx, y0); ctx.lineTo(x0, ly); ctx.moveTo(bx, y1); ctx.lineTo(x1, ry); } else { ctx.moveTo(tx, y0); ctx.lineTo(x1, ry); ctx.moveTo(x0, ly); ctx.lineTo(bx, y1); } break;
        case 10: if ((a + b + cc + d) / 4 > L) { ctx.moveTo(tx, y0); ctx.lineTo(x1, ry); ctx.moveTo(x0, ly); ctx.lineTo(bx, y1); } else { ctx.moveTo(tx, y0); ctx.lineTo(x0, ly); ctx.moveTo(bx, y1); ctx.lineTo(x1, ry); } break;
      }
    }
  }
  ctx.stroke();
}

// DOM wrapper: creates the canvas inside `container`, handles resize, visibility, pointer, scroll, reduced motion.
function createContours(container, userOpts = {}) {
  const o = Object.assign({}, CONTOUR_DEFAULTS, userOpts);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block';
  container.insertBefore(canvas, container.firstChild);
  const ctx = canvas.getContext('2d');
  const state = { noise: makeNoise3(o.seed), t: 0, ox: 0, oy: 0, mx: null, my: null, field: null };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0, visible = true, last = 0, start = performance.now(), tm = { x: null, y: null }, destroyed = false;

  function size() {
    const r = container.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function frame(now) {
    if (destroyed) return;
    raf = 0;
    if (visible && !document.hidden && (now - last >= 1000 / o.fps || !last)) {
      last = now;
      const r = container.getBoundingClientRect();
      state.t = (now - start) / 1000 * o.speed + 3.1;
      state.oy = r.top * o.parallax;                                      // lines lag behind the page when scrolling
      if (tm.x != null) { state.mx = (state.mx == null ? tm.x - r.left : state.mx + (tm.x - r.left - state.mx) * 0.14); state.my = (state.my == null ? tm.y - r.top : state.my + (tm.y - r.top - state.my) * 0.14); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      drawContourFrame(ctx, W, H, o, state);
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  const onMove = (e) => { tm.x = e.clientX; tm.y = e.clientY; };
  const onLeave = () => { tm.x = tm.y = null; state.mx = state.my = null; };
  size();
  const ro = new ResizeObserver(() => { size(); last = 0; if (reduce) requestAnimationFrame(frame); }); ro.observe(container);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf && !reduce) raf = requestAnimationFrame(frame); }, { threshold: 0 }); io.observe(container);
  if (o.mouse && !reduce && matchMedia('(pointer: fine)').matches) { window.addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerleave', onLeave); }
  raf = requestAnimationFrame(frame);
  return {
    destroy() { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); canvas.remove(); },
    options: o,
  };
}
if (typeof module !== 'undefined') module.exports = { makeNoise3, drawContourFrame, CONTOUR_DEFAULTS };
