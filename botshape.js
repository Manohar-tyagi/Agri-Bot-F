// ---------- botshape.js : builds the robot's light map + particle list ----------
// Design space: 600 x 750. No images, no external assets, no CORS issues.
const DW = 600, DH = 750;
const REGION = { ground:0, wheels:1, chassis:2, armL:3, armR:4, torso:5, neck:6, head:7, eyes:8, mouth:9, antennas:10 };

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return require('canvas').createCanvas(w, h); // node test only
}

function buildLightMap() {
  const S = 2;                                   // supersample for clean edges
  const lightC = makeCanvas(DW * S, DH * S), idC = makeCanvas(DW * S, DH * S);
  const L = lightC.getContext('2d'), I = idC.getContext('2d');
  L.scale(S, S); I.scale(S, S);
  L.fillStyle = '#000'; L.fillRect(0, 0, DW, DH);
  I.clearRect(0, 0, DW, DH);

  const g = v => { const n = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${n},${n},${n})`; };
  // paint(region, pathFn, topLum, bottomLum, y0, y1): fills path with a vertical luminance gradient, id map flat
  function paint(region, pathFn, top, bot, y0, y1) {
    const grad = L.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, g(top)); grad.addColorStop(1, g(bot));
    L.beginPath(); pathFn(L); L.fillStyle = grad; L.fill();
    I.beginPath(); pathFn(I); I.fillStyle = `rgb(${region + 1},0,0)`; I.fill();
  }
  // line(region, pathFn, lum, width): bright strokes (rim lights, details)
  function line(region, pathFn, lum, w) {
    L.beginPath(); pathFn(L); L.strokeStyle = g(lum); L.lineWidth = w; L.lineCap = 'round'; L.stroke();
    I.beginPath(); pathFn(I); I.strokeStyle = `rgb(${region + 1},0,0)`; I.lineWidth = w; I.lineCap = 'round'; I.stroke();
  }
  const rrect = (x0, y0, x1, y1, r) => c => c.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  const circle = (cx, cy, r) => c => c.arc(cx, cy, r, 0, Math.PI * 2);
  const ellipse = (cx, cy, rx, ry) => c => c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const seg = (x0, y0, x1, y1) => c => { c.moveTo(x0, y0); c.lineTo(x1, y1); };
  const rr = (reg, x0, y0, x1, y1, r, top, bot, rim) => { paint(reg, rrect(x0, y0, x1, y1, r), top, bot, y0, y1); if (rim) line(reg, rrect(x0, y0, x1, y1, r), 1, rim); };
  const cp = (reg, x0, y0, x1, y1, w, v) => line(reg, seg(x0, y0, x1, y1), v, w);   // capsule / limb
  const dot = (reg, cx, cy, r, top, bot) => paint(reg, circle(cx, cy, r), top, bot, cy - r, cy + r);

  // ground glow
  paint(REGION.ground, ellipse(300, 705, 200, 26), 0.22, 0.08, 679, 731);
  // wheels with tread bands
  for (const [x0, x1] of [[90, 210], [390, 510]]) {
    rr(REGION.wheels, x0, 575, x1, 705, 34, 0.55, 0.38, 3);
    for (let y = 590; y < 700; y += 16) paint(REGION.wheels, rrect(x0 + 10, y, x1 - 10, y + 7, 3), 0.95, 0.95, y, y + 7);
  }
  // chassis
  rr(REGION.chassis, 150, 590, 450, 680, 30, 0.85, 0.5, 3);
  rr(REGION.chassis, 160, 662, 440, 682, 8, 0.45, 0.35, 0);
  for (const cx of [215, 385]) { dot(REGION.chassis, cx, 630, 17, 0.9, 0.7); dot(REGION.chassis, cx, 630, 9, 0.08, 0.08); }
  rr(REGION.chassis, 262, 610, 338, 652, 10, 0.12, 0.12, 2.5);
  paint(REGION.chassis, rrect(272, 622, 328, 626, 1), 1, 1, 622, 626);
  paint(REGION.chassis, rrect(272, 634, 312, 638, 1), 1, 1, 634, 638);
  // arms (behind torso): left arm raised with a two-finger gripper, right arm relaxed
  dot(REGION.armL, 170, 470, 30, 0.8, 0.55);
  cp(REGION.armL, 170, 470, 92, 500, 38, 0.7); dot(REGION.armL, 92, 500, 24, 0.9, 0.6);
  cp(REGION.armL, 92, 500, 70, 385, 30, 0.72); dot(REGION.armL, 70, 372, 19, 0.95, 0.7);
  cp(REGION.armL, 70, 360, 48, 312, 13, 0.95); cp(REGION.armL, 70, 360, 98, 312, 13, 0.95);
  dot(REGION.armR, 430, 470, 30, 0.8, 0.55);
  cp(REGION.armR, 430, 470, 488, 505, 38, 0.7); dot(REGION.armR, 488, 505, 22, 0.9, 0.6);
  cp(REGION.armR, 488, 505, 495, 548, 28, 0.7); dot(REGION.armR, 495, 552, 16, 0.95, 0.7);
  // torso
  rr(REGION.torso, 170, 380, 430, 600, 70, 0.9, 0.5, 3.5);
  rr(REGION.torso, 235, 470, 365, 540, 18, 0.55, 0.35, 2.5);
  paint(REGION.torso, rrect(255, 488, 345, 491, 1), 1, 1, 488, 491);
  paint(REGION.torso, rrect(255, 505, 325, 508, 1), 1, 1, 505, 508);
  rr(REGION.torso, 245, 402, 355, 442, 16, 0.15, 0.15, 2.5);
  dot(REGION.torso, 275, 422, 11, 1, 0.8); dot(REGION.torso, 325, 422, 11, 1, 0.8);
  // neck
  rr(REGION.neck, 270, 358, 330, 394, 8, 0.5, 0.4, 0);
  // ear pods
  for (const cx of [138, 462]) { dot(REGION.head, cx, 268, 34, 0.85, 0.6); line(REGION.head, circle(cx, 268, 34), 1, 3); dot(REGION.head, cx, 268, 16, 0.2, 0.2); }
  // antennas
  cp(REGION.antennas, 205, 175, 170, 78, 8, 0.95); cp(REGION.antennas, 395, 175, 430, 78, 8, 0.95);
  dot(REGION.antennas, 168, 70, 11, 1, 0.9); dot(REGION.antennas, 432, 70, 11, 1, 0.9);
  // head + dark visor screen (the dark visor is what makes the eyes glow)
  rr(REGION.head, 150, 170, 450, 372, 82, 0.95, 0.55, 4);
  rr(REGION.head, 180, 198, 420, 342, 56, 0.06, 0.06, 5);
  rr(REGION.head, 262, 128, 338, 180, 18, 0.8, 0.5, 2.5);
  dot(REGION.head, 300, 154, 13, 1, 0.9); dot(REGION.head, 300, 154, 6, 0.1, 0.1);
  // eyes + smile
  paint(REGION.eyes, ellipse(245, 262, 25, 30), 1, 0.85, 232, 292);
  paint(REGION.eyes, ellipse(355, 262, 25, 30), 1, 0.85, 232, 292);
  line(REGION.mouth, c => c.arc(300, 282, 40, Math.PI * 0.12, Math.PI * 0.88), 1, 8);

  return { light: L.getImageData(0, 0, DW * S, DH * S), ids: I.getImageData(0, 0, DW * S, DH * S), S };
}

// Turn the light map into particles: brighter pixels get more dots (stippling).
function buildParticles(targetCount, seed = 7) {
  const { light, ids, S } = buildLightMap();
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;   // seeded, so the bot looks identical every load
  const step = 1.5, cells = [];
  let total = 0;
  for (let y = 0; y < DH; y += step) for (let x = 0; x < DW; x += step) {
    const px = Math.min(DW * S - 1, Math.round(x * S)), py = Math.min(DH * S - 1, Math.round(y * S));
    const i = (py * DW * S + px) * 4;
    if (ids.data[i + 3] < 250) continue;                     // outside the robot
    const lum = light.data[i] / 255;
    if (lum < 0.05) continue;
    const w = Math.pow(lum, 1.5);
    cells.push([x, y, lum, ids.data[i] - 1, w]); total += w;
  }
  const out = [];
  for (const [x, y, lum, region, w] of cells) {
    const p = Math.min(1, targetCount * w / total);
    if (rnd() < p) out.push({ x: x + (rnd() - 0.5) * step, y: y + (rnd() - 0.5) * step, lum, region });
  }
  return out;   // each: {x,y} home position in design space, lum 0..1, region id
}
if (typeof module !== 'undefined') module.exports = { buildParticles, DW, DH, REGION };
