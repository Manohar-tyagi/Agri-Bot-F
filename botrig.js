// ---------- botrig.js : poses and animates the robot from botshape.js ----------
// Works in the same 600x750 design space. No DOM, no canvas: pure math, easy to drop into any renderer.
// Usage:
//   const pts = buildParticles(6000);            // from botshape.js
//   const rig = new BotRig(pts);                 // once
//   each frame: rig.update(dt, cursorDesign|null, cursorInsidePanel)   // cursor in design coords
//               then draw particle i at (rig.x[i] + rig.ox[i], rig.y[i] + rig.oy[i])
const R_ARM_L = 3, R_HEAD = 7, R_EYES = 8, R_MOUTH = 9, R_ANT = 10;
const ELBOW = [92, 500], WRIST = [70, 360], NECK = [300, 372], EYE_Y = 262, MOUTH_C = [300, 302];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay; const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1); return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)); };

class BotRig {
  constructor(pts, seed = 11) {
    const n = this.n = pts.length;
    this.hx = new Float32Array(n); this.hy = new Float32Array(n); this.region = new Uint8Array(n);
    this.x = new Float32Array(n); this.y = new Float32Array(n);      // posed position (before repulsion)
    this.ox = new Float32Array(n); this.oy = new Float32Array(n);    // cursor repulsion offset
    this.wFore = new Float32Array(n);   // 0..1: how much this arm particle belongs to the forearm (bends at the elbow)
    this.wFing = new Float32Array(n);   // 0..1: gripper finger weight; fingerSide -1 left / +1 right
    this.fingSide = new Int8Array(n);
    const f = [WRIST[0] - ELBOW[0], WRIST[1] - ELBOW[1]], fl = Math.hypot(f[0], f[1]); f[0] /= fl; f[1] /= fl;
    for (let i = 0; i < n; i++) {
      const p = pts[i]; this.hx[i] = p.x; this.hy[i] = p.y; this.region[i] = p.region;
      if (p.region === R_ARM_L) {
        const sF = (p.x - ELBOW[0]) * f[0] + (p.y - ELBOW[1]) * f[1];                       // distance along the forearm
        const dF = segDist(p.x, p.y, ELBOW[0], ELBOW[1], WRIST[0], WRIST[1]);
        const dU = segDist(p.x, p.y, ELBOW[0], ELBOW[1], 170, 470);                          // upper arm segment
        this.wFore[i] = sstep(-8, 22, sF) * clamp((dU - dF) / 14 + 0.5, 0, 1);
        this.wFing[i] = sstep(366, 346, p.y); this.fingSide[i] = p.x < WRIST[0] ? -1 : 1;
      }
    }
    // state
    this.t = 0; this.look = { x: 0, y: 0 }; this.blink = 0; this.waveEnv = 0; this.waveT = 0;
    this.armAngle = 0; this.grip = 0; this.headTilt = 0; this.headX = 0; this.headY = 0; this.smile = 0;
    this.s = seed; this.nextBlink = 1.2; this.nextWave = 0.8; this.blinkT = -1; this.doubleBlink = false; this.waving = false;
    this.cursorWasInside = false; this.lastWaveEnd = -99;
    this.cfg = { blinkMin: 1.8, blinkMax: 3.4, wave: true, waveMin: 5, waveMax: 8, waveDur: 2.1, eyeTravelX: 13, eyeTravelY: 9, repelR: 72, repelPush: 30 };
  }
  rnd() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  rr(a, b) { return a + (b - a) * this.rnd(); }
  triggerWave() { if (this.cfg.wave && !this.waving) { this.waving = true; this.waveT = 0; } }

  update(dt, cursor, inside) {
    dt = Math.min(dt, 0.05); this.t += dt; const c = this.cfg, t = this.t;
    // --- blink: random, sometimes a double blink ---
    if (this.blinkT < 0) { this.nextBlink -= dt; if (this.nextBlink <= 0) { this.blinkT = 0; this.doubleBlink = this.rnd() < 0.22; } }
    else {
      this.blinkT += dt; const T = this.blinkT;
      const one = (u) => u < 0.07 ? u / 0.07 : u < 0.11 ? 1 : u < 0.22 ? 1 - (u - 0.11) / 0.11 : 0;
      this.blink = this.doubleBlink && T > 0.3 ? one(T - 0.3) : one(T);
      if (T > (this.doubleBlink ? 0.55 : 0.25)) { this.blinkT = -1; this.blink = 0; this.nextBlink = this.rr(c.blinkMin, c.blinkMax); }
    }
    // --- wave hi: forearm swings at the elbow, gripper flaps, head tilts, smile grows ---
    if (c.wave && !this.waving) { this.nextWave -= dt; if (this.nextWave <= 0) this.waving = true, this.waveT = 0; }
    if (this.waving) {
      this.waveT += dt; const T = this.waveT, D = c.waveDur;
      this.waveEnv = sstep(0, 0.3, T) * (1 - sstep(D - 0.4, D, T));
      const ph = Math.PI * 2 * 2.3 * T;
      this.armAngle = this.waveEnv * (-0.06 + 0.26 * Math.sin(ph));
      this.grip = this.waveEnv * (0.2 + 0.18 * Math.sin(ph + 1.2));
      this.headTilt = this.waveEnv * 0.06 * Math.sin(Math.PI * 2 * 1.15 * T);
      this.smile = this.waveEnv;
      if (T >= D) { this.waving = false; this.nextWave = this.rr(c.waveMin, c.waveMax); this.lastWaveEnd = t; this.armAngle = this.grip = this.headTilt = this.smile = 0; this.waveEnv = 0; }
    }
    // --- look at the cursor (anywhere on the page), or wander when there is none (touch screens) ---
    let tx, ty;
    if (cursor) { tx = clamp((cursor.x - 300) / 260, -1, 1); ty = clamp((cursor.y - EYE_Y) / 260, -1, 1); }
    else { tx = 0.55 * Math.sin(t * 0.6); ty = 0.2 * Math.sin(t * 0.9 + 1); }
    const k = 1 - Math.exp(-dt * 9); this.look.x += (tx - this.look.x) * k; this.look.y += (ty - this.look.y) * k;
    // greet when the cursor enters the panel after a quiet spell
    if (c.wave && inside && !this.cursorWasInside && t - this.lastWaveEnd > 4) this.triggerWave();
    this.cursorWasInside = !!inside;

    // --- pose every particle ---
    const lx = this.look.x, ly = this.look.y;
    const tilt = this.headTilt + lx * 0.05, hx = lx * 6, hy = ly * 3.5 + this.smile * -1.5;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const ca = Math.cos(this.armAngle), sa = Math.sin(this.armAngle);
    for (let i = 0; i < this.n; i++) {
      let x = this.hx[i], y = this.hy[i]; const r = this.region[i];
      if (r === R_ARM_L) {
        const g = this.grip * this.wFing[i] * this.fingSide[i];                 // gripper opens and closes around the wrist
        if (g !== 0) { const cg = Math.cos(g), sg = Math.sin(g), vx = x - WRIST[0], vy = y - WRIST[1]; x = WRIST[0] + vx * cg - vy * sg; y = WRIST[1] + vx * sg + vy * cg; }
        const w = this.wFore[i];
        if (w > 0) { const a = this.armAngle * w, c2 = Math.cos(a), s2 = Math.sin(a), vx = x - ELBOW[0], vy = y - ELBOW[1]; x = ELBOW[0] + vx * c2 - vy * s2; y = ELBOW[1] + vx * s2 + vy * c2; }
      } else if (r === R_EYES || r === R_MOUTH || r === R_HEAD || r === R_ANT) {
        if (r === R_EYES) {                                                       // eyes slide toward the cursor; blink squashes them
          y = EYE_Y + (y - EYE_Y) * (1 - 0.9 * this.blink);
          x += lx * c.eyeTravelX; y += ly * c.eyeTravelY;
        } else if (r === R_MOUTH) {
          x = MOUTH_C[0] + (x - MOUTH_C[0]) * (1 + 0.16 * this.smile) + lx * 5;   // smile widens, mouth follows the gaze a little
          y = MOUTH_C[1] + (y - MOUTH_C[1]) * (1 + 0.4 * this.smile) + ly * 3 + this.smile * 3;
        }
        const vx = x - NECK[0], vy = y - NECK[1];                                 // whole head turns about the neck
        x = NECK[0] + vx * ct - vy * st + hx; y = NECK[1] + vx * st + vy * ct + hy;
      }
      this.x[i] = x; this.y[i] = y;
    }
    // --- cursor repulsion: particles near the pointer get pushed away, then spring back ---
    const R = c.repelR, push = c.repelPush, kk = 1 - Math.exp(-dt * (cursor && inside ? 14 : 6));
    for (let i = 0; i < this.n; i++) {
      let tx2 = 0, ty2 = 0;
      if (cursor && inside) {
        const dx = this.x[i] - cursor.x, dy = this.y[i] - cursor.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) { const d = Math.sqrt(d2), f2 = (1 - d / R); const m = f2 * f2 * push / d; tx2 = dx * m; ty2 = dy * m; }
      }
      this.ox[i] += (tx2 - this.ox[i]) * kk; this.oy[i] += (ty2 - this.oy[i]) * kk;
    }
  }
}
if (typeof module !== 'undefined') module.exports = { BotRig };
