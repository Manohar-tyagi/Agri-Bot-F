// AGRI-PAL 3D simulator — bot model, field, sensors, line-follow PID, obstacle avoid, IK plucking arm.
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { EffectComposer } from './vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/postprocessing/OutputPass.js';
import { initBom } from './bom.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- renderer / scene
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0xcfe3ef;
scene.fog = new THREE.Fog(SKY, 35, 160);
const windU = { value: 0 };   // shared clock for grass / leaf sway shaders
// image-based lighting for realistic reflections on plastic/metal
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
{ // sky dome: vertical gradient blending into the fog colour at the horizon
  const g = new THREE.SphereGeometry(150, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f95d6) }, mid: { value: new THREE.Color(SKY) },
      sunDir: { value: new THREE.Vector3(7, 14, 5).normalize() }, sunCol: { value: new THREE.Color(1, .93, .8) }, sunSize: { value: 900 },
    },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, mid, sunDir, sunCol; uniform float sunSize; varying vec3 vp;
      void main(){
        vec3 c = mix(mid, top, smoothstep(0.0, 0.55, vp.y));
        float s = max(dot(vp, sunDir), 0.);
        c += sunCol * (pow(s, sunSize) * 6. + pow(s, 12.) * .18);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
  scene.userData.sky = sky; scene.userData.skyU = m.uniforms;
  // stars (fade in at night)
  const N = 2500, pos = new Float32Array(N * 3), r = rng(99);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, y = r() * 0.95 + 0.05, k = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * k * 140, y * 140, Math.sin(a) * k * 140], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  sky.add(stars); scene.userData.stars = stars;
}

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
camera.position.set(-1.9, 1.45, -3.9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(-1, 0.6, -6.5);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 1.2;
controls.maxDistance = 45;

const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x6b4f2a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
sun.position.set(7, 14, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---------------------------------------------------------------- helpers
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
const M = {
  blue: new THREE.MeshPhysicalMaterial({ color: 0x5a87b0, roughness: .38, clearcoat: .7, clearcoatRoughness: .25 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xeef1f3, roughness: .4, clearcoat: .5, clearcoatRoughness: .3 }),
  dark: std(0x262b31, { roughness: .6 }),
  screen: std(0x05080b, { roughness: .2, metalness: .2 }),
  rubber: std(0x3b3631, { roughness: .95 }),
  metal: std(0xb9c1c9, { metalness: .85, roughness: .3 }),
  lens: std(0x0a0d12, { metalness: .5, roughness: .1 }),
  tray: std(0x2f9e5b, { roughness: .6 }),
};
const shellBlue = M.blue.clone(), shellWhite = M.white.clone();
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 4, r);
const cyl = (r, h, s = 24) => new THREE.CylinderGeometry(r, r, h, s);
function mk(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.userData.ctx = c.getContext('2d'); t.userData.draw = draw;
  if (draw) { draw(t.userData.ctx, w, h); t.needsUpdate = true; }
  return t;
}
function noiseTex(base, amt, rep) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) {
      const l = (r() - .5) * amt;
      g.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });
}

// ---------------------------------------------------------------- the bot
// Local frame: +z forward, +y up, +x = bot's LEFT (arm side).
const bot = new THREE.Group();
scene.add(bot);
const shell = [];
const parts = {};

// wheels (rugged tyres with lugs) + hubs
const wheels = [];
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  const pivot = new THREE.Group(); pivot.position.set(sx * 0.43, 0.2, sz * 0.27); bot.add(pivot);
  const spin = new THREE.Group(); pivot.add(spin);
  mk(cyl(0.185, 0.16, 32), M.rubber, spin).rotation.z = Math.PI / 2;
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    const lug = mk(box(0.16, 0.035, 0.05), M.rubber, spin, 0, Math.cos(a) * 0.19, Math.sin(a) * 0.19);
    lug.rotation.x = a; lug.rotation.y = (i % 2 ? .25 : -.25);
  }
  const hub = mk(cyl(0.09, 0.17, 20), M.dark, spin); hub.rotation.z = Math.PI / 2;
  mk(cyl(0.035, 0.175, 12), M.metal, spin).rotation.z = Math.PI / 2;
  wheels.push({ spin, side: sx });
}

// lower chassis (white) + bumper + front panel
shell.push(mk(rbox(0.68, 0.24, 0.66, 0.05), shellWhite, bot, 0, 0.34, 0));
mk(box(0.74, 0.05, 0.05), M.dark, bot, 0, 0.2, 0.37);
for (const s of [1, -1]) {
  mk(box(0.04, 0.05, 0.06), M.dark, bot, s * 0.3, 0.22, 0.345);
  mk(cyl(0.035, 0.03), M.dark, bot, s * 0.2, 0.36, 0.335).rotation.x = Math.PI / 2;
  mk(cyl(0.02, 0.035), M.metal, bot, s * 0.2, 0.36, 0.338).rotation.x = Math.PI / 2;
}
const lcdTex = canvasTex(128, 64);
parts.oled = mk(new THREE.PlaneGeometry(0.15, 0.075), new THREE.MeshBasicMaterial({ map: lcdTex, color: new THREE.Color(1.6, 1.6, 1.6) }), bot, 0, 0.37, 0.332);
for (let i = 0; i < 6; i++) mk(box(0.03, 0.012, 0.01), M.dark, bot, -0.1 + i * 0.04, 0.27, 0.332);

// upper body (blue) + white side panels + logo
shell.push(mk(rbox(0.72, 0.36, 0.6, 0.08), shellBlue, bot, 0, 0.62, 0));
for (const s of [1, -1]) shell.push(mk(rbox(0.05, 0.28, 0.48, 0.02), shellWhite, bot, s * 0.36, 0.6, 0));
const logoTex = canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#fff'; g.font = '800 64px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('AGRI-PAL', w / 2, h / 2 + 4);
});
mk(new THREE.PlaneGeometry(0.34, 0.064), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }), bot, 0, 0.56, 0.302).castShadow = false;

// ultrasonic sensor (HC-SR04 "eyes") on the chest
const usHousing = mk(rbox(0.2, 0.08, 0.04, 0.012), M.dark, bot, 0, 0.69, 0.31);
for (const s of [1, -1]) {
  mk(cyl(0.03, 0.035, 20), M.metal, bot, s * 0.05, 0.69, 0.335).rotation.x = Math.PI / 2;
  mk(cyl(0.02, 0.037, 20), M.lens, bot, s * 0.05, 0.69, 0.337).rotation.x = Math.PI / 2;
}
parts.ultrasonic = usHousing;
// corner camera
mk(rbox(0.08, 0.07, 0.08, 0.015), M.dark, bot, -0.27, 0.835, 0.2);
mk(cyl(0.022, 0.02), M.lens, bot, -0.27, 0.835, 0.245).rotation.x = Math.PI / 2;

// ultrasonic beam cone (tip at sensor, opening toward +z)
const coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
const coneMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
const usCone = new THREE.Mesh(coneGeo, coneMat); usCone.position.set(0, 0.69, 0.34); bot.add(usCone);

// IR line-sensor array under the nose
const IRX = [0.12, 0.06, 0, -0.06, -0.12]; // local x, left → right
const IRZ = 0.42;
mk(box(0.06, 0.12, 0.03), M.dark, bot, 0, 0.16, 0.37);
parts.ir = mk(box(0.32, 0.02, 0.06), M.dark, bot, 0, 0.1, IRZ);
const irLeds = IRX.map(x => {
  const m = mk(new THREE.SphereGeometry(0.014, 10, 8), std(0x401010, { emissive: 0x000000, emissiveIntensity: 4 }), bot, x, 0.085, IRZ);
  return m;
});

// neck + head
mk(cyl(0.12, 0.14, 24), M.dark, bot, 0, 0.86, 0);
for (let i = 0; i < 3; i++) mk(new THREE.TorusGeometry(0.122, 0.008, 6, 24), M.dark, bot, 0, 0.81 + i * 0.045, 0).rotation.x = Math.PI / 2;
const head = new THREE.Group(); head.position.set(0, 1.13, 0); bot.add(head);
mk(rbox(0.58, 0.44, 0.4, 0.1), M.blue, head);
mk(rbox(0.49, 0.35, 0.03, 0.05), M.screen, head, 0, 0, 0.19);
const faceTex = canvasTex(288, 192);
faceTex.minFilter = THREE.LinearFilter;
parts.face = mk(new THREE.PlaneGeometry(0.44, 0.293), new THREE.MeshBasicMaterial({ map: faceTex, color: new THREE.Color(2.4, 2.4, 2.4) }), head, 0, 0, 0.207);
parts.face.castShadow = false;
for (const s of [1, -1]) {
  mk(cyl(0.075, 0.05), M.blue, head, s * 0.3, 0, 0).rotation.z = Math.PI / 2;
  mk(cyl(0.05, 0.055), M.white, head, s * 0.31, 0, 0).rotation.z = Math.PI / 2;
}
const antennaTips = [];
for (const s of [1, -1]) {
  const a = new THREE.Group(); a.position.set(s * 0.17, 0.2, -0.02); a.rotation.z = -s * 0.28; head.add(a);
  mk(cyl(0.012, 0.3, 8), M.dark, a, 0, 0.15, 0);
  antennaTips.push(parts.antenna = mk(new THREE.SphereGeometry(0.024, 12, 10), new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }), a, 0, 0.31, 0));
}
const topCam = mk(cyl(0.065, 0.08, 24), M.dark, head, 0, 0.26, 0);
mk(cyl(0.03, 0.02), M.lens, head, 0, 0.26, 0.064).rotation.x = Math.PI / 2;
parts.camera = topCam;
const headCam = new THREE.PerspectiveCamera(62, 1.6, 0.12, 200);
headCam.rotation.order = 'YXZ'; headCam.rotation.set(-0.32, Math.PI, 0);
headCam.position.set(0, 0.3, 0.16);
head.add(headCam);

// harvest tray at the back
const tray = new THREE.Group(); tray.position.set(0, 0.46, -0.45); bot.add(tray);
mk(box(0.5, 0.02, 0.26), M.tray, tray);
for (const s of [1, -1]) {
  mk(box(0.5, 0.13, 0.015), M.tray, tray, 0, 0.065, s * 0.125);
  mk(box(0.015, 0.13, 0.26), M.tray, tray, s * 0.25, 0.065, 0);
}
mk(box(0.3, 0.05, 0.08), M.dark, bot, 0, 0.44, -0.34);
parts.tray = tray;

// internals (visible in x-ray mode)
const internals = new THREE.Group(); bot.add(internals); internals.visible = false;
parts.battery = mk(box(0.26, 0.06, 0.14), std(0x9aa4ad, { metalness: .6, roughness: .35 }), internals, 0, 0.27, 0.02);
mk(box(0.262, 0.03, 0.03), std(0xd23a3a), internals, 0, 0.27, -0.04);
parts.arduino = mk(box(0.2, 0.012, 0.14), std(0x0a6e9e), internals, 0, 0.47, 0.08);
mk(box(0.05, 0.03, 0.04), M.metal, internals, -0.08, 0.49, 0.13);
mk(box(0.09, 0.012, 0.025), M.dark, internals, 0.02, 0.482, 0.05);
mk(box(0.15, 0.015, 0.012), M.dark, internals, 0, 0.484, 0.14);
parts.driver = mk(box(0.12, 0.01, 0.12), std(0xc02a2a), internals, 0, 0.47, -0.16);
for (let i = 0; i < 6; i++) mk(box(0.006, 0.05, 0.06), M.dark, internals, -0.035 + i * 0.014, 0.5, -0.16);
const motorMat = std(0xf2c230);
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  const m = mk(box(0.12, 0.07, 0.07), motorMat, internals, sx * 0.25, 0.27, sz * 0.22);
  if (sx === 1 && sz === 1) parts.motor = m;
}
const wireMat = std(0xd23a3a);
mk(cyl(0.006, 0.2, 6), wireMat, internals, 0.05, 0.37, 0.02);
mk(cyl(0.006, 0.2, 6), M.dark, internals, 0.065, 0.37, 0.02);

// ---------------------------------------------------------------- bot detail pass
const brass = std(0xc9a14a, { metalness: .9, roughness: .3 });
const screwGeo = cyl(0.009, 0.006, 10), slotGeo = box(0.012, 0.0025, 0.002);
function screw(parent, x, y, z, axis) {
  const m = mk(screwGeo, M.metal, parent, x, y, z); m.castShadow = false;
  const sl = mk(slotGeo, M.dark, parent, x, y, z); sl.castShadow = false;
  if (axis === 'z') { m.rotation.x = Math.PI / 2; sl.position.z += Math.sign(z) * 0.0035; }
  else { m.rotation.z = Math.PI / 2; sl.rotation.y = Math.PI / 2; sl.position.x += Math.sign(x) * 0.0035; }
  return m;
}
for (const sx of [1, -1]) {
  for (const y of [0.535, 0.705]) parts.screws = screw(bot, sx * 0.27, y, 0.302, 'z');
  for (const y of [0.26, 0.44]) screw(bot, sx * 0.3, y, 0.332, 'z');
  for (const y of [0.26, 0.44]) screw(bot, sx * 0.3, y, -0.332, 'z');
  for (const y of [0.49, 0.71]) for (const z of [-0.2, 0.2]) screw(bot, sx * 0.386, y, z, 'x');
  for (const y of [-0.15, 0.15]) screw(head, sx * 0.21, y, -0.201, 'z');
}
// tyre sidewalls + hub bolts
const sideGeo = new THREE.TorusGeometry(0.148, 0.03, 10, 36);
for (const wh of wheels) {
  for (const s of [1, -1]) { const t = mk(sideGeo, M.rubber, wh.spin, s * 0.07, 0, 0); t.rotation.y = Math.PI / 2; }
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    mk(cyl(0.008, 0.012, 8), M.metal, wh.spin, wh.side * 0.088, Math.cos(a) * 0.055, Math.sin(a) * 0.055).rotation.z = Math.PI / 2;
  }
}
parts.wheel = wheels[0].spin;
// side vents between the wheels
for (const sx of [1, -1]) for (let i = 0; i < 5; i++) mk(box(0.004, 0.1, 0.012), M.dark, bot, sx * 0.341, 0.34, -0.05 + i * 0.025);
// cables: head → body (like the photo), wrapped in black sleeve
const cableMat = std(0x15181c, { roughness: .7 });
function tube(points, r, mat, parent) {
  const m = mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, r, 8), mat, parent);
  m.castShadow = false; return m;
}
tube([[-0.3, 1.06, -0.06], [-0.375, 0.99, -0.12], [-0.37, 0.87, -0.18], [-0.3, 0.8, -0.21]], 0.011, cableMat, bot);
// headlights, tail lights, rear panel
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 0.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff2020, emissiveIntensity: 0.4 });
for (const sx of [1, -1]) {
  mk(rbox(0.075, 0.028, 0.012, 0.005), M.dark, bot, sx * 0.2, 0.43, 0.331);
  mk(rbox(0.065, 0.018, 0.012, 0.004), headMat, bot, sx * 0.2, 0.43, 0.334).castShadow = false;
  mk(rbox(0.06, 0.025, 0.012, 0.005), tailMat, bot, sx * 0.25, 0.4, -0.334).castShadow = false;
}
const headlights = [1, -1].map(sx => {
  const l = new THREE.SpotLight(0xfff0d0, 0, 14, 0.5, 0.6, 1.6);
  l.position.set(sx * 0.2, 0.43, 0.36); l.target.position.set(sx * 0.3, 0, 3.5);
  bot.add(l, l.target); return l;
});
mk(rbox(0.05, 0.035, 0.01, 0.006), M.dark, bot, 0.12, 0.29, -0.333);
parts.switch = mk(box(0.028, 0.02, 0.012), std(0xd22b2b, { roughness: .4 }), bot, 0.12, 0.29, -0.338);
parts.switch.rotation.x = 0.25;
mk(box(0.036, 0.02, 0.014), std(0xf2c230), bot, -0.1, 0.29, -0.335);
const statusLed = mk(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x00aa33, emissive: 0x3ddc84, emissiveIntensity: 3 }), bot, 0.02, 0.29, -0.334);
// internals: upper deck with servo driver + buck converters, wiring harness
mk(box(0.6, 0.005, 0.5), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: .35, roughness: .1 }), internals, 0, 0.53, 0);
for (const sx of [1, -1]) for (const sz of [1, -1]) mk(cyl(0.007, 0.06, 8), brass, internals, sx * 0.27, 0.5, sz * 0.22);
parts.pca = mk(box(0.1, 0.008, 0.055), std(0x1a4fa0), internals, 0.15, 0.537, 0.12);
for (let i = 0; i < 8; i++) mk(box(0.006, 0.014, 0.01), M.dark, internals, 0.115 + i * 0.01, 0.546, 0.1);
parts.buck = mk(box(0.085, 0.008, 0.06), std(0x1a4fa0), internals, -0.15, 0.537, 0.12);
for (let i = 0; i < 6; i++) mk(box(0.004, 0.03, 0.05), M.dark, internals, -0.175 + i * 0.008, 0.556, 0.12);
mk(new THREE.TorusGeometry(0.014, 0.008, 8, 16), std(0xd9b64a), internals, -0.12, 0.552, 0.12).rotation.x = Math.PI / 2;
mk(box(0.065, 0.008, 0.045), std(0x1a4fa0), internals, -0.15, 0.537, -0.1);
mk(new THREE.TorusGeometry(0.01, 0.006, 8, 16), std(0x333333), internals, -0.14, 0.548, -0.1).rotation.x = Math.PI / 2;
mk(box(0.05, 0.02, 0.03), std(0x2b2b2b), internals, 0.15, 0.55, -0.12); // buzzer + fuse holder
const red = std(0xd23a3a), blk = std(0x1a1a1a), yel = std(0xf2c230), grn = std(0x2fa84f), blu = std(0x2f6fd6);
tube([[0.1, 0.29, 0.02], [0.05, 0.4, 0.05], [-0.15, 0.5, 0.11]], 0.005, red, internals);
tube([[0.1, 0.28, 0.0], [0.03, 0.41, 0.04], [-0.14, 0.5, 0.1]], 0.005, blk, internals);
tube([[-0.15, 0.53, 0.09], [-0.05, 0.55, 0.06], [0.12, 0.54, 0.1]], 0.004, red, internals);
[yel, grn, blu, red].forEach((m, i) => tube([[0.05 - i * 0.012, 0.475, 0.02], [0.03 - i * 0.012, 0.5, -0.06], [0.02 - i * 0.012, 0.48, -0.12]], 0.0025, m, internals));
for (const sx of [1, -1]) for (const sz of [1, -1]) tube([[sx * 0.05, 0.475, -0.16], [sx * 0.15, 0.4, sz * 0.05], [sx * 0.22, 0.3, sz * 0.2]], 0.0035, sz > 0 ? red : blk, internals);
tube([[0.2, 0.54, 0.14], [0.3, 0.7, 0.1], [0.38, 0.8, 0.06]], 0.005, cableMat, internals);

// ---------------------------------------------------------------- the arm (3-DOF + wrist + gripper)
const L1 = 0.45, L2 = 0.42, LG = 0.18;
const SHOULDER = new THREE.Vector3(0.42, 0.84, 0.05);
mk(rbox(0.1, 0.08, 0.14, 0.03), M.white, bot, 0.38, 0.8, 0.05);
const armRoot = new THREE.Group(); armRoot.position.copy(SHOULDER); bot.add(armRoot);
mk(cyl(0.07, 0.08, 24), M.white, armRoot);
const jShoulder = new THREE.Group(); jShoulder.position.y = 0.04; armRoot.add(jShoulder);
function link(parent, len, r) {
  mk(cyl(r + 0.022, 0.1, 24), M.white, parent).rotation.x = Math.PI / 2;
  const c = mk(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 16), M.blue, parent, len / 2, 0, 0);
  c.rotation.z = Math.PI / 2;
  mk(cyl(r + 0.004, 0.06, 20), M.white, parent, len * 0.5, 0, 0).rotation.z = Math.PI / 2;
}
link(jShoulder, L1, 0.045);
const jElbow = new THREE.Group(); jElbow.position.x = L1; jShoulder.add(jElbow);
link(jElbow, L2, 0.04);
const jWrist = new THREE.Group(); jWrist.position.x = L2; jElbow.add(jWrist);
mk(cyl(0.05, 0.08, 20), M.white, jWrist).rotation.x = Math.PI / 2;
mk(box(0.06, 0.05, 0.06), M.dark, jWrist, 0.045, 0, 0);
parts.gripper = mk(box(0.03, 0.11, 0.05), M.metal, jWrist, 0.085, 0, 0);
const fingers = [1, -1].map(s => {
  const f = new THREE.Group(); f.position.x = 0.1; jWrist.add(f);
  mk(box(0.1, 0.014, 0.035), M.metal, f, 0.05, 0, 0);
  mk(box(0.03, 0.02, 0.037), M.dark, f, 0.09, -s * 0.008, 0);
  return { f, s };
});
const gripPoint = new THREE.Group(); gripPoint.position.x = LG; jWrist.add(gripPoint);
for (const [j, len, rr] of [[jShoulder, L1, 0.045], [jElbow, L2, 0.04]]) {   // joint servos + arm cables
  const sv = mk(rbox(0.075, 0.055, 0.04, 0.006), M.dark, j, 0, 0, 0.075);
  mk(cyl(0.022, 0.008, 18), M.metal, j, 0, 0, 0.098).rotation.x = Math.PI / 2;
  for (const xx of [-0.03, 0.03]) mk(cyl(0.004, 0.006, 6), M.metal, j, xx, 0.022, 0.096).rotation.x = Math.PI / 2;
  if (j === jShoulder) parts.servo = sv;
  tube([[0.05, -rr - 0.012, 0.03], [len * 0.5, -rr - 0.02, 0.035], [len - 0.05, -rr - 0.012, 0.03]], 0.007, cableMat, j);
}
mk(rbox(0.06, 0.05, 0.035, 0.006), M.dark, armRoot, 0, -0.02, -0.07);

const HOME = { yaw: 0.2, q1: 1.25, q2: 0.25, q3: 0.1, grip: 1 };
const arm = { cur: { ...HOME }, queue: [], seg: null, busy: false, held: null, look: 0 };
function applyArm() {
  const c = arm.cur;
  armRoot.rotation.y = c.yaw; jShoulder.rotation.z = c.q1; jElbow.rotation.z = c.q2; jWrist.rotation.z = c.q3;
  for (const { f, s } of fingers) f.position.y = s * (0.014 + c.grip * 0.036);
}
function armTo(to, dur, onEnd) { arm.queue.push({ to, dur, onEnd }); }
function updateArm(dt) {
  if (!arm.seg && arm.queue.length) { arm.seg = arm.queue.shift(); arm.seg.from = { ...arm.cur }; arm.seg.t = 0; }
  const s = arm.seg;
  if (s) {
    s.t = Math.min(1, s.t + dt / s.dur);
    const e = ease(s.t);
    for (const k in s.to) arm.cur[k] = lerp(s.from[k], s.to[k], e);
    if (s.t >= 1) { arm.seg = null; s.onEnd && s.onEnd(); }
  }
  arm.busy = !!arm.seg || arm.queue.length > 0;
  applyArm();
}
// Analytic IK in the shoulder frame. Gripper either horizontal-outward or pointing down.
function ik(t, down) {
  const yaw = Math.atan2(-t.z, t.x);
  let r = Math.hypot(t.x, t.z), h = t.y - 0.04;
  if (down) h += LG; else r -= LG;
  const d2 = r * r + h * h, d = Math.sqrt(d2);
  if (d > L1 + L2 - 0.01 || d < 0.12) return null;
  const q2 = -Math.acos(clamp((d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
  const q1 = Math.atan2(h, r) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return { yaw, q1, q2, q3: (down ? -Math.PI / 2 : 0) - q1 - q2 };
}
const _v = new THREE.Vector3();
function toShoulder(obj) {
  obj.getWorldPosition(_v); bot.updateMatrixWorld(); bot.worldToLocal(_v);
  return _v.sub(SHOULDER).clone();
}

// ---------------------------------------------------------------- field: path, soil, plants
// Guide line: two lanes (x = -1 heading +z, x = +1 heading -z) joined by semicircles around the middle row.
const path = (() => {
  const raw = [];
  const push = (x, z) => raw.push([x, z]);
  for (let z = -9; z < 9; z += 0.05) push(-1, z);
  for (let a = Math.PI; a > 0; a -= 0.02) push(Math.cos(a), 9 + Math.sin(a));
  for (let z = 9; z > -9; z -= 0.05) push(1, z);
  for (let a = 0; a > -Math.PI; a -= 0.02) push(Math.cos(a), -9 + Math.sin(a));
  // resample at uniform 2 cm
  const out = []; const STEP = 0.02; let carry = 0;
  for (let i = 0; i < raw.length; i++) {
    const [ax, az] = raw[i], [bx, bz] = raw[(i + 1) % raw.length];
    const seg = Math.hypot(bx - ax, bz - az); let d = carry;
    while (d < seg) { const t = d / seg; out.push([ax + (bx - ax) * t, az + (bz - az) * t]); d += STEP; }
    carry = d - seg;
  }
  const N = out.length, X = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N);
  out.forEach(([x, z], i) => { X[i] = x; Z[i] = z; });
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, k = (i - 1 + N) % N, dx = X[j] - X[k], dz = Z[j] - Z[k], l = Math.hypot(dx, dz);
    TX[i] = dx / l; TZ[i] = dz / l;
  }
  return { N, X, Z, TX, TZ, STEP };
})();
function nearest(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.N; i++) { const dx = path.X[i] - x, dz = path.Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  return { i: bi, d: Math.sqrt(bd) };
}

const grassTex = noiseTex('#7aa35a', .25); grassTex.repeat.set(30, 30);
const ground = mk(new THREE.PlaneGeometry(140, 140), std(0xffffff, { map: grassTex, roughness: 1 }), scene);
ground.rotation.x = -Math.PI / 2;
const soilTex = noiseTex('#6e4c31', .35); soilTex.repeat.set(4, 12);
const soil = mk(new THREE.PlaneGeometry(7.4, 23), std(0xffffff, { map: soilTex, bumpMap: soilTex, bumpScale: 3, roughness: 1 }), scene, 0, 0.002, 0);
soil.rotation.x = -Math.PI / 2;
for (const x of [0, -2.6, 2.6]) mk(rbox(0.8, 0.1, 17.2, 0.04), std(0x5a3c25, { roughness: 1 }), scene, x, 0.0, 0);

{ // black guide-line ribbon
  const pos = [], idx = [], W = 0.025;
  for (let i = 0; i < path.N; i++) {
    const nx = -path.TZ[i], nz = path.TX[i];
    pos.push(path.X[i] + nx * W, 0.006, path.Z[i] + nz * W, path.X[i] - nx * W, 0.006, path.Z[i] - nz * W);
    const a = i * 2, b = ((i + 1) % path.N) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const line = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .8, side: THREE.DoubleSide }));
  line.receiveShadow = true; scene.add(line);
}

// plants: instanced stems + leaves; pickable fruits are individual meshes
const fieldGroup = new THREE.Group(); scene.add(fieldGroup);
const fruitGeo = new THREE.SphereGeometry(0.06, 24, 16); fruitGeo.scale(1, 0.84, 1);
const calyxGeo = (() => {   // 5-pointed green star of sepals
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.01 : 0.042; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g;
})();
const leafGeo = (() => {    // cupped, drooping tomato leaflet, length 1 along +y
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  sh.bezierCurveTo(0.42, 0.18, 0.36, 0.7, 0, 1); sh.bezierCurveTo(-0.36, 0.7, -0.42, 0.18, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.38 * y * y + 0.5 * x * x); }
  g.computeVertexNormals(); return g;
})();
// gentle wind sway for instanced foliage and grass (vertex shader patch)
function addWind(mat, amp) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(0.);
      #ifdef USE_INSTANCING
        ip = instanceMatrix[3].xyz;
      #endif
      float sw = sin(uTime * 1.6 + ip.x * .8 + ip.z * .45) * .6 + sin(uTime * 3.3 + ip.z * 1.7) * .25;
      transformed.x += sw * ${amp.toFixed(3)} * max(position.y, 0.);
      transformed.z += sw * ${(amp * .5).toFixed(3)} * max(position.y, 0.);`);
  };
  return mat;
}
const leafMat = addWind(std(0xffffff, { side: THREE.DoubleSide, roughness: .65 }), 0.22);
const stalkGeo = new THREE.CylinderGeometry(0.009, 0.02, 1, 7); stalkGeo.translate(0, 0.5, 0);
const caneGeo = cyl(0.011, 1.2, 6); caneGeo.translate(0, 0.6, 0);
const tieGeo = new THREE.TorusGeometry(0.03, 0.004, 5, 12); tieGeo.rotateX(Math.PI / 2);
const ripeMat = std(0xd8342a, { roughness: .35 }), unripeMat = std(0x86c043, { roughness: .45 }), calyxMat = std(0x2f6b22);
let fruits = [];
function buildField() {
  fieldGroup.clear(); fruits = [];
  const r = rng(42);
  const plants = [];
  for (const row of [-2.6, 0, 2.6]) for (let z = -8; z <= 8; z += 1) plants.push({ x: row + (r() - .5) * .06, z: z + (r() - .5) * .1, main: row === 0 });
  const LPP = 64;
  const stemMesh = new THREE.InstancedMesh(stalkGeo, std(0x3f7a2a, { roughness: .8 }), plants.length * 5);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, plants.length * LPP);
  const caneMesh = new THREE.InstancedMesh(caneGeo, std(0xc8a96b, { roughness: .7 }), plants.length);
  const tieMesh = new THREE.InstancedMesh(tieGeo, std(0xe8dcc0, { roughness: 1 }), plants.length * 2);
  stemMesh.castShadow = leafMesh.castShadow = caneMesh.castShadow = true; leafMesh.receiveShadow = true;
  let si = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  let li = 0;
  plants.forEach((p, pi) => {
    const h = 0.9 + r() * 0.2;
    // main stalk + 4 side branches
    m4.compose(new THREE.Vector3(p.x, 0.04, p.z), q.setFromEuler(e.set((r() - .5) * .08, 0, (r() - .5) * .08)), new THREE.Vector3(1, h, 1));
    stemMesh.setMatrixAt(si++, m4);
    for (let b = 0; b < 4; b++) {
      const a = b / 4 * Math.PI * 2 + r(), y = 0.25 + b * 0.17;
      q.setFromEuler(e.set(0.9 + r() * 0.3, a, 0, 'YXZ'));
      m4.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(0.55, 0.28, 0.55));
      stemMesh.setMatrixAt(si++, m4);
    }
    // bamboo cane + twine ties
    m4.compose(new THREE.Vector3(p.x + 0.05, 0, p.z + 0.04), q.setFromEuler(e.set(0.03, 0, -0.03, 'XYZ')), new THREE.Vector3(1, 1, 1));
    caneMesh.setMatrixAt(pi, m4);
    [0.45, 0.8].forEach((ty, n) => { m4.compose(new THREE.Vector3(p.x + 0.03, ty, p.z + 0.02), q.identity(), new THREE.Vector3(1, 1, 1)); tieMesh.setMatrixAt(pi * 2 + n, m4); });
    for (let k = 0; k < LPP; k++) {
      const a = r() * Math.PI * 2, y = 0.18 + (k / LPP) * (h - 0.12) + (r() - .5) * 0.06, s = 0.11 + r() * 0.08 - (y > h - .15 ? .03 : 0);
      q.setFromEuler(e.set(0.75 + r() * 0.8, a, (r() - .5) * 0.8, 'YXZ'));
      m4.compose(new THREE.Vector3(p.x + Math.cos(a) * 0.03, y, p.z + Math.sin(a) * 0.03), q, new THREE.Vector3(s * 0.8, s, s));
      leafMesh.setMatrixAt(li, m4);
      leafMesh.setColorAt(li++, col.setHSL(0.26 + r() * 0.06, 0.5 + r() * 0.15, 0.13 + r() * 0.09));
    }
    const n = p.main ? 6 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * .6, rad = 0.17 + r() * 0.08, y = 0.42 + r() * 0.42;
      const ripe = r() < 0.62;
      const f = mk(fruitGeo, ripe ? ripeMat : unripeMat, fieldGroup, p.x + Math.cos(a) * rad, y, p.z + Math.sin(a) * rad);
      const cx = mk(calyxGeo, calyxMat, f, 0, 0.049, 0); cx.castShadow = false; cx.rotation.y = r() * 6;
      f.rotation.y = r() * 6;
      if (p.main) { f.userData = { ripe, picked: false }; fruits.push(f); }
    }
  });
  fieldGroup.add(stemMesh, leafMesh, caneMesh, tieMesh);
}
buildField();

{ // instanced grass tufts around the soil bed (one draw call)
  const r = rng(11), N = 26000;
  const blade = new THREE.ConeGeometry(0.022, 0.26, 3); blade.translate(0, 0.13, 0);
  const g = new THREE.InstancedMesh(blade, addWind(std(0xffffff, { roughness: .9 }), 0.5), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z;
    do { x = (r() - .5) * 56; z = (r() - .5) * 60; } while ((Math.abs(x) < 3.8 && Math.abs(z) < 11.6) || (x > -4.2 && x < -2.6 && z > -11.2 && z < -10));
    const s = 0.6 + r() * 0.9;
    q.setFromEuler(e.set((r() - .5) * .5, r() * 6, (r() - .5) * .5));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    g.setMatrixAt(i, m4); g.setColorAt(i, c.setHSL(0.24 + r() * 0.06, 0.5, 0.3 + r() * 0.15));
  }
  g.receiveShadow = true; scene.add(g);
}
const butterflies = [], clouds = [];
{ // scenery
  const r = rng(3);
  // trees: tapered trunk + clustered crown
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 1, 8), crown = new THREE.IcosahedronGeometry(1, 1);
  const barkMat = std(0x5e4330, { roughness: 1 });
  const crownMats = [0x3f7a34, 0x4f8a3a, 0x5b9442, 0x36682e].map(c => std(c, { flatShading: true, roughness: .85 }));
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2, d = 17 + r() * 22, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.9 + r() * 1.1;
    if (x < -9 && x > -20 && z > -4 && z < 12) continue; // keep the barn clear
    const t = mk(trunkGeo, barkMat, scene, x, 1.1 * s, z); t.scale.set(s, 2.2 * s, s);
    for (let k = 0; k < 4; k++) {
      const c = mk(crown, crownMats[(i + k) % 4], scene, x + (r() - .5) * s, (2.4 + r() * 0.9) * s, z + (r() - .5) * s);
      c.scale.setScalar((0.7 + r() * 0.5) * s); c.rotation.set(r() * 3, r() * 3, 0);
    }
  }
  // fence: posts + two rails
  const wood = std(0x8a6a48, { roughness: .9 });
  for (const x of [-3.9, 3.9]) {
    for (let z = -11.5; z <= 11.5; z += 1.5) mk(box(0.08, 0.6, 0.08), wood, scene, x, 0.3, z);
    for (const y of [0.22, 0.45]) mk(box(0.03, 0.07, 23.1), wood, scene, x, y, 0);
  }
  // red barn
  const barn = new THREE.Group(); barn.position.set(-14, 0, 5); barn.rotation.y = Math.PI / 2 + 0.35; scene.add(barn);
  const redWall = std(0x9c2f25, { roughness: .8 }), trim = std(0xf2efe8, { roughness: .7 }), roofMat = std(0x4a4f55, { roughness: .55, metalness: .4 });
  mk(box(6, 3.2, 4.4), redWall, barn, 0, 1.6, 0);
  for (const sz of [1, -1]) { const rf = mk(box(6.4, 0.1, 2.75), roofMat, barn, 0, 3.95, sz * 1.08); rf.rotation.x = sz * 0.6; }
  const gable = new THREE.Shape(); gable.moveTo(-2.2, 0); gable.lineTo(2.2, 0); gable.lineTo(0, 1.5); gable.lineTo(-2.2, 0);
  for (const sx of [1, -1]) { const gm = mk(new THREE.ShapeGeometry(gable), redWall, barn, sx * 3.0, 3.2, 0); gm.rotation.y = sx * Math.PI / 2; gm.material = redWall; }
  mk(box(1.8, 2.2, 0.06), std(0x7d241c), barn, 0, 1.1, 2.23);
  for (const sgn of [1, -1]) mk(box(2.6, 0.1, 0.03), trim, barn, 0, 1.1, 2.27).rotation.z = sgn * 0.88;
  mk(box(1.95, 0.12, 0.05), trim, barn, 0, 2.25, 2.25);
  for (const sx of [-2.2, 2.2]) { mk(box(0.95, 0.95, 0.03), trim, barn, sx, 2, 2.215); mk(box(0.8, 0.8, 0.05), std(0x223040, { roughness: .2, metalness: .5 }), barn, sx, 2, 2.23); }
  // silo
  const silo = new THREE.Group(); silo.position.set(-16, 0, -1.2); scene.add(silo);
  const steel = std(0xb8bec4, { metalness: .8, roughness: .35 });
  mk(cyl(1.2, 6.5, 32), steel, silo, 0, 3.25, 0);
  mk(new THREE.SphereGeometry(1.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, silo, 0, 6.5, 0);
  for (let i = 1; i < 6; i++) mk(new THREE.TorusGeometry(1.21, 0.025, 6, 40), M.dark, silo, 0, i * 1.1, 0).rotation.x = Math.PI / 2;
  // water tank on a stand
  const tank = new THREE.Group(); tank.position.set(13, 0, -5); scene.add(tank);
  for (const sx of [-.8, .8]) for (const sz of [-.8, .8]) mk(box(0.12, 3, 0.12), M.dark, tank, sx, 1.5, sz);
  mk(box(1.9, 0.12, 1.9), M.dark, tank, 0, 3.05, 0);
  mk(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 28), std(0x1d2226, { roughness: .5 }), tank, 0, 3.9, 0);
  mk(new THREE.CylinderGeometry(0.2, 0.85, 0.35, 28), std(0x1d2226, { roughness: .5 }), tank, 0, 4.87, 0);
  // solar charging dock at the start of the line
  const dock = new THREE.Group(); dock.position.set(-3.4, 0, -10.6); scene.add(dock);
  mk(box(1.4, 0.06, 1.0), std(0x9b9a95, { roughness: .95 }), dock, 0, 0.03, 0);
  mk(cyl(0.04, 1.6, 12), steel, dock, 0, 0.8, -0.3);
  const solarTex = canvasTex(256, 160, (g2, w, h) => {
    g2.fillStyle = '#0e1d3a'; g2.fillRect(0, 0, w, h); g2.strokeStyle = '#7f93b5'; g2.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 8) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, h); g2.stroke(); }
    for (let y = 0; y <= h; y += h / 5) { g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y); g2.stroke(); }
  });
  const panel = mk(box(1.3, 0.035, 0.8), new THREE.MeshPhysicalMaterial({ map: solarTex, roughness: .15, metalness: .4, clearcoat: 1 }), dock, 0, 1.62, -0.25);
  panel.rotation.x = -0.45;
  mk(rbox(0.32, 0.42, 0.18, 0.03), M.white, dock, 0.35, 0.27, 0.15);
  mk(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: 0x00aa33, emissive: 0x3ddc84, emissiveIntensity: 4 }), dock, 0.35, 0.4, 0.245);
  const signTex = canvasTex(256, 64, (g2, w, h) => { g2.fillStyle = '#3ddc84'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#06140c'; g2.font = '800 30px Inter, Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('CHARGING DOCK', w / 2, h / 2 + 2); });
  mk(new THREE.PlaneGeometry(0.3, 0.075), new THREE.MeshBasicMaterial({ map: signTex }), dock, 0.35, 0.24, 0.241);
  // distant hills
  const hillMats = [0x6f9a5a, 0x5d8a5f, 0x7aa267].map(c => std(c, { flatShading: true, roughness: 1 }));
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2 + r() * .2, d = 95 + r() * 25, rad = 18 + r() * 18, h = 7 + r() * 12;
    const hl = mk(new THREE.ConeGeometry(rad, h, 9, 2), hillMats[i % 3], scene, Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d);
    hl.castShadow = hl.receiveShadow = false; hl.rotation.y = r() * 3;
  }
  // soft billboard clouds
  const cloudTex = canvasTex(256, 128, (g2, w, h) => {
    const rr = rng(5);
    for (let i = 0; i < 22; i++) {
      const x = w * (0.2 + rr() * 0.6), y = h * (0.45 + rr() * 0.25), rad = 18 + rr() * 34;
      const gr = g2.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, w, h);
    }
  });
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    const a = r() * Math.PI * 2, d = 60 + r() * 60;
    sp.position.set(Math.cos(a) * d, 28 + r() * 22, Math.sin(a) * d); sp.scale.set(40 + r() * 30, 16 + r() * 10, 1);
    scene.add(sp); clouds.push(sp);
  }
  // butterflies drifting over the crop rows
  const wingTex = canvasTex(64, 64, (g2) => {
    g2.fillStyle = '#ff9f1c'; g2.beginPath(); g2.ellipse(32, 30, 26, 22, 0, 0, Math.PI * 2); g2.fill();
    g2.lineWidth = 4; g2.strokeStyle = '#1b1b1b'; g2.stroke();
    g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(44, 20, 4, 0, 7); g2.fill();
  });
  const wingGeo = new THREE.PlaneGeometry(0.07, 0.06); wingGeo.translate(0.035, 0, 0); wingGeo.rotateX(-Math.PI / 2);
  const wingMat = new THREE.MeshStandardMaterial({ map: wingTex, transparent: true, side: THREE.DoubleSide, alphaTest: .3 });
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Group(); scene.add(b);
    const wl = new THREE.Mesh(wingGeo, wingMat), wr = new THREE.Mesh(wingGeo, wingMat); wr.scale.x = -1;
    b.add(wl, wr);
    butterflies.push({ b, wl, wr, cx: (r() - .5) * 5, cz: (r() - .5) * 16, ph: r() * 10, sp: 0.3 + r() * 0.4 });
  }
}
{ // soil detail: pebbles + drip-irrigation lines
  const r = rng(21), N = 3000, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const pb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0xffffff, { flatShading: true, roughness: 1 }), N);
  for (let i = 0; i < N; i++) {
    const s = 0.008 + r() * r() * 0.028;
    q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
    m4.compose(new THREE.Vector3((r() - .5) * 7.2, s * 0.3, (r() - .5) * 22.6), q, new THREE.Vector3(s, s * .6, s));
    pb.setMatrixAt(i, m4); pb.setColorAt(i, c.setHSL(0.07, 0.12 + r() * .12, 0.1 + r() * 0.12));
  }
  pb.receiveShadow = true; scene.add(pb);
  const pipe = std(0x111315, { roughness: .5 }), emitMat = std(0x2f6fd6), emitGeo = box(0.03, 0.02, 0.02);
  for (const x of [0.32, -2.28, 2.92]) {
    mk(cyl(0.012, 17.6, 10), pipe, scene, x, 0.11, 0).rotation.x = Math.PI / 2;
    for (let z = -8.5; z <= 8.5; z += 0.5) mk(emitGeo, emitMat, scene, x, 0.1, z).castShadow = false;
  }
}

// obstacles (rocks)
const rockGeo = new THREE.DodecahedronGeometry(0.17, 0);
const rockMat = std(0x8b8f93, { flatShading: true, roughness: .9 });
let obstacles = [];
function addObstacleAt(i) {
  const m = mk(rockGeo, rockMat, scene, path.X[i], 0.1, path.Z[i]);
  m.scale.set(1, 0.75, 1.1); m.rotation.y = Math.random() * 3;
  obstacles.push({ mesh: m, x: path.X[i], z: path.Z[i], r: 0.17, i });
}
function clearObstacles() { for (const o of obstacles) scene.remove(o.mesh); obstacles = []; }
const pathIndexAt = (x, z) => nearest(x, z).i;

// ---------------------------------------------------------------- face + LCD
const faceSmall = document.createElement('canvas'); faceSmall.width = 48; faceSmall.height = 32;
const fs = faceSmall.getContext('2d');
let faceKey = '';
function drawFace(expr, blink, look, color) {
  const key = expr + blink + look + color;
  if (key === faceKey) return; faceKey = key;
  fs.clearRect(0, 0, 48, 32);
  fs.strokeStyle = fs.fillStyle = '#fff'; fs.lineWidth = 2.2; fs.lineCap = 'round';
  const ey = 13;
  for (const ex of [15, 33]) {
    fs.beginPath();
    if (blink && expr !== 'alert') { fs.moveTo(ex - 6, ey + 1); fs.lineTo(ex + 6, ey + 1); fs.stroke(); continue; }
    if (expr === 'joy') { fs.arc(ex, ey + 4, 5.5, Math.PI * 1.15, Math.PI * 1.85); fs.stroke(); continue; }
    fs.arc(ex, ey, expr === 'alert' ? 7.5 : 6.5, 0, Math.PI * 2); fs.stroke();
    fs.beginPath(); fs.arc(ex + look * 2.5, ey + 0.5, expr === 'alert' ? 2 : 2.8, 0, Math.PI * 2); fs.fill();
    if (expr === 'focus') { fs.clearRect(ex - 9, ey - 9, 18, 6.5); fs.beginPath(); fs.moveTo(ex - 7, ey - 3); fs.lineTo(ex + 7, ey - 3); fs.stroke(); }
    else { fs.beginPath(); fs.arc(ex, ey + (expr === 'alert' ? 6 : 8), 13, Math.PI * 1.36, Math.PI * 1.64); fs.stroke(); }
  }
  fs.beginPath();
  if (expr === 'joy') { fs.arc(24, 23, 5.5, 0, Math.PI); fs.fill(); }
  else if (expr === 'alert') { fs.arc(24, 26, 2.6, 0, Math.PI * 2); fs.stroke(); }
  else if (expr === 'focus') { fs.moveTo(21, 26); fs.lineTo(27, 26); fs.stroke(); }
  else { fs.arc(24, 21, 4.5, Math.PI * 0.2, Math.PI * 0.8); fs.stroke(); }
  const d = fs.getImageData(0, 0, 48, 32).data, g = faceTex.userData.ctx;
  g.fillStyle = '#020406'; g.fillRect(0, 0, 288, 192);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
    const on = d[(y * 48 + x) * 4 + 3] > 90;
    g.fillStyle = on ? color : 'rgba(76,201,240,0.07)';
    g.beginPath(); g.arc(x * 6 + 3, y * 6 + 3, on ? 2.6 : 1.6, 0, Math.PI * 2); g.fill();
  }
  faceTex.needsUpdate = true;
}
function drawLcd(batt) {
  const g = lcdTex.userData.ctx;
  g.fillStyle = '#061009'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#3ddc84'; g.lineWidth = 3; g.strokeRect(8, 12, 50, 22); g.fillStyle = '#3ddc84'; g.fillRect(58, 18, 4, 10);
  g.fillStyle = batt < 20 ? '#ff4d4f' : '#3ddc84'; g.fillRect(11, 15, 44 * batt / 100, 16);
  g.font = 'bold 22px monospace'; g.fillText(Math.round(batt) + '%', 68, 32);
  g.font = 'bold 14px monospace'; g.fillStyle = '#9fffc6'; g.fillText(state.mode === 'auto' ? 'AUTO' : 'MANUAL', 10, 56);
  lcdTex.needsUpdate = true;
}

// ---------------------------------------------------------------- state
const START = { x: -1, z: -6.5, th: 0 };
const state = {
  ...START, v: 0, w: 0, mode: 'manual', phase: 'idle', battery: 100, plucked: 0, dist: 0, obsCount: 0,
  ir: [0, 0, 0, 0, 0], err: null, lastErr: 0, lostT: 0, us: Infinity, usObs: null,
  avoid: null, off: 0, joyUntil: 0, lowBattWarned: false, safetyWarned: false,
};
const keys = { f: false, b: false, l: false, r: false };
let maxSpeed = 0.55;

function toLocal(wx, wz) {
  const dx = wx - state.x, dz = wz - state.z, c = Math.cos(state.th), s = Math.sin(state.th);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function toWorld(lx, lz) {
  const c = Math.cos(state.th), s = Math.sin(state.th);
  return { x: state.x + lx * c + lz * s, z: state.z - lx * s + lz * c };
}

// ---------------------------------------------------------------- sensors
function sense() {
  let sum = 0, n = 0;
  IRX.forEach((lx, k) => {
    const p = toWorld(lx, IRZ), on = nearest(p.x, p.z).d < 0.036;
    state.ir[k] = on ? 1 : 0;
    if (on) { sum += lx; n++; }
  });
  state.err = n ? sum / n : null;
  let best = Infinity, bo = null;
  for (const o of obstacles) {
    const l = toLocal(o.x, o.z);
    if (l.z < 0.3) continue;
    const half = 0.12 + (l.z - 0.34) * Math.tan(15 * Math.PI / 180);
    if (Math.abs(l.x) < half + o.r) { const d = l.z - 0.34 - o.r; if (d < best) { best = d; bo = o; } }
  }
  state.us = best > 4 ? Infinity : Math.max(0.02, best);
  state.usObs = bo;
}

// ---------------------------------------------------------------- plucking
const TRAY_DROP = new THREE.Vector3(0, 0.74, -0.45).sub(SHOULDER);
function reachableFruit(window) {
  let best = null, bd = Infinity;
  for (const f of fruits) {
    if (f.userData.picked) continue;
    const dx = f.position.x - state.x, dz = f.position.z - state.z;
    if (dx * dx + dz * dz > 2.2) continue;
    const t = toShoulder(f);
    if (t.x < 0.15 || Math.abs(t.z) > window) continue;
    if (!ik(t, false)) continue;
    const d = Math.abs(t.z) + (f.userData.ripe ? 0 : 100);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
let trayCount = 0;
const dropping = [];
function startPluck(f) {
  const t = toShoulder(f);
  const grasp = ik(t, false);
  const preT = t.clone(); preT.x -= 0.12 * Math.sign(t.x); preT.y += 0.06;
  const pre = ik(preT, false) || grasp;
  const liftT = t.clone(); liftT.y += 0.18; liftT.x *= 0.8;
  const lift = ik(liftT, false) || { ...grasp, q1: grasp.q1 + 0.4 };
  const drop = ik(TRAY_DROP, true);
  f.userData.picked = true;
  arm.look = clamp(t.x * Math.sin(-grasp.yaw), -1, 1) || 1;
  log('Ripe tomato detected — plucking', '');
  armTo({ grip: 1, yaw: grasp.yaw, q1: pre.q1, q2: pre.q2, q3: pre.q3 }, 0.7);
  armTo({ q1: grasp.q1, q2: grasp.q2, q3: grasp.q3 }, 0.45);
  armTo({ grip: 0.35 }, 0.25, () => { gripPoint.attach(f); f.position.set(0, 0, 0); arm.held = f; });
  armTo({ q1: lift.q1, q2: lift.q2, q3: lift.q3 }, 0.4);
  armTo({ yaw: 1.2, q1: 1.15, q2: -1.3, q3: 0.3 }, 0.55);
  armTo({ ...drop }, 0.55);
  armTo({ grip: 1 }, 0.2, () => {
    tray.attach(f); arm.held = null;
    const n = trayCount++, slot = new THREE.Vector3(-0.18 + (n % 4) * 0.12, 0.075 + Math.floor(n / 8) * 0.1, -0.06 + (Math.floor(n / 4) % 2) * 0.12);
    if (n >= 24) f.visible = false;
    dropping.push({ m: f, from: f.position.clone(), to: slot, t: 0 });
    state.plucked++; state.joyUntil = simNow + 1600;
    log(`Placed in tray · ${state.plucked} harvested`, '');
  });
  armTo({ ...HOME }, 0.7, () => { arm.look = 0; });
}
function pluckButton() {
  if (arm.busy) return;
  const f = reachableFruit(0.45);
  if (!f) return log('No fruit in reach — drive alongside the middle row', 'warn');
  if (!f.userData.ripe) return log('Only unripe (green) fruit in reach — skipped', 'warn');
  state.v = state.w = 0;
  startPluck(f);
}

// ---------------------------------------------------------------- control
function setPhase(p) { state.phase = p; }
function manualStep() {
  if (arm.busy) return { v: 0, w: 0 };
  let v = (keys.f - keys.b) * maxSpeed, w = (keys.l - keys.r) * 1.6;
  if (v > 0 && state.us < 0.12) {
    v = 0;
    if (!state.safetyWarned) { log(`Safety stop — obstacle ${Math.round(state.us * 100)} cm ahead`, 'bad'); state.safetyWarned = true; }
  } else if (state.us > 0.3) state.safetyWarned = false;
  setPhase(v || w ? 'driving' : 'idle');
  return { v, w };
}
function pursuit(offset, v) {
  const n = nearest(state.x, state.z), j = (n.i + Math.round(0.55 / path.STEP)) % path.N;
  const tx = path.X[j] - path.TZ[j] * offset, tz = path.Z[j] + path.TX[j] * offset; // offset >0 → to path's right
  const l = toLocal(tx, tz), L2s = l.x * l.x + l.z * l.z;
  if (l.z < 0.05) return { v: 0.12, w: Math.sign(l.x || 1) * 1.4 }; // target behind: turn in place-ish
  return { v, w: clamp(v * 2 * l.x / L2s, -2.2, 2.2) };
}
function autoStep(dt, now) {
  const cruise = maxSpeed * 0.8;
  if (arm.busy) { setPhase('plucking'); return { v: 0, w: 0 }; }
  const f = state.avoid ? null : reachableFruit(0.09);
  if (f && f.userData.ripe) { startPluck(f); setPhase('plucking'); return { v: 0, w: 0 }; }

  // obstacle handling: halt → swerve right → return to line
  const A = state.avoid;
  if (!A && state.us < 0.5 && state.usObs) {
    state.avoid = { obs: state.usObs, stage: 'halt', until: now + 1300 };
    state.obsCount++;
    log(`Obstacle at ${Math.round(state.us * 100)} cm — halting`, 'bad');
    return { v: 0, w: 0 };
  }
  if (A) {
    if (A.stage === 'halt') {
      setPhase('halted');
      if (now > A.until) { A.stage = 'swerve'; log('Rerouting around obstacle', 'warn'); }
      return { v: 0, w: 0 };
    }
    const bi = nearest(state.x, state.z).i;
    const ahead = (A.obs.i - bi + path.N) % path.N;
    const passed = ahead > path.N / 2 && (path.N - ahead) * path.STEP > 0.75;
    if (A.stage === 'swerve' && passed) A.stage = 'return';
    const target = A.stage === 'swerve' ? 0.6 : 0;
    state.off += clamp(target - state.off, -dt * 0.9, dt * 0.9);
    setPhase('avoiding');
    if (A.stage === 'return' && Math.abs(state.off) < 0.02 && state.err !== null) {
      state.avoid = null; state.off = 0; log('Back on the guide line', '');
    }
    return pursuit(state.off, cruise * 0.7);
  }

  // IR line following (PD on weighted sensor position)
  if (state.err === null) {
    state.lostT += dt;
    if (state.lostT > 0.25) { setPhase('seeking'); return pursuit(0, cruise * 0.6); }
    return { v: cruise * 0.6, w: state.w };
  }
  state.lostT = 0;
  const d = (state.err - state.lastErr) / Math.max(dt, 1e-3);
  state.lastErr = state.err;
  setPhase('following');
  return { v: cruise * (1 - Math.min(0.5, Math.abs(state.err) * 3)), w: clamp(9 * state.err + 0.25 * d, -2.5, 2.5) };
}

// ---------------------------------------------------------------- UI
const PHASE = {
  idle: ['Standby', ''], driving: ['Manual drive', ''], following: ['Line following', ''], seeking: ['Seeking line', 'warn'],
  halted: ['Obstacle — halted', 'bad'], avoiding: ['Rerouting', 'warn'], plucking: ['Plucking', ''],
};
const logEl = $('log');
function log(msg, cls) {
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls;
  logEl.prepend(d); setTimeout(() => d.remove(), 6000);
  while (logEl.children.length > 4) logEl.lastChild.remove();
}
function setMode(m) {
  if (m === state.mode) return;
  state.mode = m; state.avoid = null; state.off = 0; state.lostT = 0;
  $('modeManual').setAttribute('aria-pressed', m === 'manual');
  $('modeAuto').setAttribute('aria-pressed', m === 'auto');
  $('modeHint').textContent = m === 'auto'
    ? 'Follows the black guide line, avoids obstacles and plucks ripe tomatoes on its own.'
    : 'Drive with the pad or WASD / arrow keys.';
  document.querySelectorAll('.drive').forEach(b => b.disabled = m === 'auto');
  log(m === 'auto' ? 'Autonomous mode engaged' : 'Manual control', '');
}
$('modeManual').onclick = () => setMode('manual');
$('modeAuto').onclick = () => setMode('auto');
$('btnStop').onclick = () => { setMode('manual'); state.v = state.w = 0; Object.keys(keys).forEach(k => keys[k] = false); log('Emergency stop', 'bad'); };
document.querySelectorAll('.drive').forEach(b => {
  const k = b.dataset.dir;
  const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); };
  const off = () => { keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, off));
});
const speed = $('speed');
speed.oninput = () => { maxSpeed = +speed.value; $('speedOut').textContent = (+speed.value).toFixed(2); };
$('btnPluck').onclick = pluckButton;
$('btnGrip').onclick = () => { if (!arm.busy) armTo({ grip: arm.cur.grip > 0.5 ? 0.2 : 1 }, 0.3); };
$('btnHome').onclick = () => { if (!arm.busy) armTo({ ...HOME }, 0.8); };
$('btnWave').onclick = () => {
  if (arm.busy) return;
  state.joyUntil = simNow + 3200;
  armTo({ yaw: 0.5, q1: 1.35, q2: 0.1, q3: 0.05, grip: 1 }, 0.5);
  for (let i = 0; i < 3; i++) { armTo({ q2: 0.55, q3: 0.4 }, 0.3); armTo({ q2: -0.25, q3: -0.3 }, 0.3); }
  armTo({ ...HOME }, 0.6);
  log('Hello! 👋', '');
};
let xray = false;
const labelsEl = $('labels');
const LABELS = [
  ['Arduino Uno — brain', () => parts.arduino, 0.38], ['L298N motor driver', () => parts.driver, 0.55],
  ['Li-Po battery', () => parts.battery, 0.25], ['DC gear motor ×4', () => parts.motor, 0.12],
  ['IR line sensors', () => parts.ir, 0.08], ['Ultrasonic HC-SR04', () => parts.ultrasonic, 0.12],
  ['Servo gripper', () => parts.gripper, 0.1], ['ESP32-CAM', () => parts.camera, 0.1], ['Harvest tray', () => parts.tray, 0.2],
  ['PCA9685 servo driver', () => parts.pca, 0], ['XL4016 buck converter', () => parts.buck, 0], ['MG996R servo', () => parts.servo, 0],
].map(([text, get, dy]) => { const d = document.createElement('div'); d.textContent = text; labelsEl.append(d); return { d, get, dy }; });
const leaderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
leaderSvg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible');
labelsEl.prepend(leaderSvg);
// Labels sit in two columns beside the bot, spaced so they never overlap, with a leader line to each part.
function layoutLabels() {
  bot.getWorldPosition(tmp); tmp.y += 0.6; tmp.project(camera);
  const cx = (tmp.x + 1) / 2 * W, items = [];
  for (const L of LABELS) {
    L.get().getWorldPosition(tmp); tmp.project(camera);
    items.push({ L, ax: (tmp.x + 1) / 2 * W, ay: (1 - tmp.y) / 2 * H, ok: tmp.z < 1 });
  }
  items.sort((a, b) => a.ay - b.ay);
  const cols = { l: [], r: [] };
  items.forEach(it => (it.ax < cx ? cols.l : cols.r).push(it));
  let lines = '';
  for (const side of ['l', 'r']) {
    let y = 70;
    for (const it of cols[side]) {
      it.y = Math.max(it.ay, y); y = it.y + 34;
      const x = side === 'l' ? Math.max(90, cx - 230) : Math.min(W - 90, cx + 230);
      Object.assign(it.L.d.style, { display: it.ok ? '' : 'none', left: x + 'px', top: it.y + 'px' });
      if (it.ok) lines += `<line x1="${x}" y1="${it.y}" x2="${it.ax}" y2="${it.ay}"/><circle cx="${it.ax}" cy="${it.ay}" r="3.5"/>`;
    }
  }
  leaderSvg.innerHTML = `<g stroke="#3ddc84" stroke-width="1.5" fill="#3ddc84">${lines}</g>`;
}
function setXray(on) {
  xray = on; internals.visible = on;
  for (const m of [shellBlue, shellWhite]) { m.transparent = on; m.opacity = on ? 0.16 : 1; m.depthWrite = !on; m.needsUpdate = true; }
  shell.forEach(s => s.castShadow = !on);
  labelsEl.style.display = on ? '' : 'none';
  $('btnXray').setAttribute('aria-pressed', on);
  $('btnXray').textContent = on ? '🔍 Hide internals' : '🔍 Show internals';
  if (on && camMode === 'top') setCam('orbit');
}
labelsEl.style.display = 'none';
$('btnXray').onclick = () => setXray(!xray);
$('btnObstacle').onclick = () => {
  const n = nearest(state.x, state.z), dir = Math.sin(state.th) * path.TX[n.i] + Math.cos(state.th) * path.TZ[n.i] >= 0 ? 1 : -1;
  addObstacleAt((n.i + dir * Math.round(1.8 / path.STEP) + path.N) % path.N);
  log('Obstacle placed ahead on the line', 'warn');
};
$('btnClear').onclick = () => { clearObstacles(); state.avoid = null; log('Obstacles cleared', ''); };
$('btnReset').onclick = reset;
function reset() {
  Object.assign(state, START, { v: 0, w: 0, battery: 100, plucked: 0, dist: 0, obsCount: 0, avoid: null, off: 0, lowBattWarned: false });
  arm.queue.length = 0; arm.seg = null; Object.assign(arm.cur, HOME); arm.held = null;
  for (const c of [...tray.children]) if (c.geometry === fruitGeo) tray.remove(c);
  gripPoint.clear(); dropping.length = 0; trayCount = 0;
  clearObstacles(); addObstacleAt(pathIndexAt(-1, 2.5)); addObstacleAt(pathIndexAt(1, -3));
  buildField();
  log('Field reset', '');
}
// locate a part on the bot (from the bill of materials)
let hl = null;
const hlLabel = document.createElement('div');
hlLabel.style.cssText = 'position:absolute;pointer-events:none;transform:translate(-50%,-160%);background:#3ddc84;color:#06140c;font-weight:700;font-size:12px;padding:4px 10px;border-radius:8px;display:none;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.35)';
view.append(hlLabel);
function locate(key, name) {
  const obj = parts[key]; if (!obj) return;
  let inside = false; obj.traverseAncestors(a => { if (a === internals) inside = true; });
  if (inside && !xray) setXray(true);
  setCam('orbit');
  const off = camera.position.clone().sub(controls.target); off.setLength(clamp(off.length(), 1.6, 2.6)); camera.position.copy(controls.target).add(off);
  if (hl) scene.remove(hl.box);
  const bx = new THREE.BoxHelper(obj, 0x3ddc84); bx.material.depthTest = false; bx.material.transparent = true; bx.renderOrder = 10;
  scene.add(bx); hl = { box: bx, obj, until: performance.now() + 5000 };
  hlLabel.textContent = '📍 ' + name; hlLabel.style.display = '';
}
initBom(locate);

// day / night
let night = false, nightK = 0;
const DAY = { top: new THREE.Color(0x4f95d6), mid: new THREE.Color(SKY), sun: new THREE.Color(0xfff3df), sunI: 2.4, hemi: 1.1, env: 0.45, exp: 1.05 };
const NIGHT = { top: new THREE.Color(0x030814), mid: new THREE.Color(0x1a2540), sun: new THREE.Color(0x8fa6ff), sunI: 0.35, hemi: 0.14, env: 0.1, exp: 1.25 };
$('btnNight').onclick = () => {
  night = !night;
  $('btnNight').textContent = night ? '☀️ Day mode' : '🌙 Night mode';
  $('btnNight').setAttribute('aria-pressed', night);
  log(night ? 'Night run — headlights on' : 'Daylight', '');
};
const _c = new THREE.Color(), SUN_DAY = new THREE.Color(1, .93, .8), SUN_NIGHT = new THREE.Color(.75, .8, 1);
function applyTimeOfDay(dt) {
  nightK = clamp(nightK + (night ? dt : -dt) * 0.8, 0, 1);
  const k = nightK, U = scene.userData.skyU;
  U.top.value.lerpColors(DAY.top, NIGHT.top, k); U.mid.value.lerpColors(DAY.mid, NIGHT.mid, k);
  U.sunCol.value.lerpColors(SUN_DAY, SUN_NIGHT, k); U.sunSize.value = lerp(900, 2500, k);
  scene.fog.color.copy(U.mid.value);
  sun.color.lerpColors(DAY.sun, NIGHT.sun, k); sun.intensity = lerp(DAY.sunI, NIGHT.sunI, k);
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, k);
  scene.environmentIntensity = lerp(DAY.env, NIGHT.env, k);
  renderer.toneMappingExposure = lerp(DAY.exp, NIGHT.exp, k);
  scene.userData.stars.material.opacity = k;
  headlights.forEach(l => l.intensity = k * 30);
  headMat.emissiveIntensity = 0.6 + k * 5; tailMat.emissiveIntensity = 0.4 + k * 4;
  bloom.strength = lerp(0.32, 0.9, k);
  for (const c of clouds) c.material.opacity = lerp(0.9, 0.12, k);
}

// wheel dust
const DUST = 240, dustPos = new Float32Array(DUST * 3), dustCol = new Float32Array(DUST * 4), dustVel = new Float32Array(DUST * 3), dustAge = new Float32Array(DUST).fill(9);
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 4));
const dustTex = canvasTex(64, 64, (g2) => { const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); });
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.16, map: dustTex, vertexColors: true, transparent: true, depthWrite: false }));
dust.frustumCulled = false; scene.add(dust);
let dustI = 0;
function updateDust(dt) {
  const sp = Math.abs(state.v);
  if (sp > 0.06) for (let n = 0; n < 2; n++) for (const sx of [0.43, -0.43]) {
    const i = dustI = (dustI + 1) % DUST, p = toWorld(sx + (Math.random() - .5) * .1, -0.32 * Math.sign(state.v || 1));
    dustPos.set([p.x, 0.04, p.z], i * 3);
    dustVel.set([(Math.random() - .5) * .3, 0.15 + Math.random() * 0.5 * sp, (Math.random() - .5) * .3], i * 3);
    dustAge[i] = 0;
  }
  for (let i = 0; i < DUST; i++) {
    dustAge[i] += dt; const life = dustAge[i] / 1.4;
    if (life < 1) { for (let k = 0; k < 3; k++) dustPos[i * 3 + k] += dustVel[i * 3 + k] * dt; dustVel[i * 3 + 1] *= 0.97; }
    dustCol.set([0.55, 0.42, 0.3, life < 1 ? (1 - life) * 0.45 : 0], i * 4);
  }
  dustGeo.attributes.position.needsUpdate = dustGeo.attributes.color.needsUpdate = true;
}

// cameras
let camMode = 'orbit', studioA = 0;
function setCam(m) {
  camMode = m; controls.enabled = m === 'orbit';
  document.querySelectorAll('[data-cam]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cam === m));
}
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => setCam(b.dataset.cam));
const CAMS = ['orbit', 'chase', 'top', 'studio'];
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.repeat && !'wasdArrowUpArrowDownArrowLeftArrowRight'.includes(e.key)) return;
  const k = { w: 'f', ArrowUp: 'f', s: 'b', ArrowDown: 'b', a: 'l', ArrowLeft: 'l', d: 'r', ArrowRight: 'r' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (k && state.mode === 'manual') { keys[k] = true; e.preventDefault(); return; }
  const key = e.key.toLowerCase();
  if (key === ' ') { e.preventDefault(); $('btnStop').click(); }
  else if (key === 'p') pluckButton();
  else if (key === 'm') setMode(state.mode === 'auto' ? 'manual' : 'auto');
  else if (key === 'x') setXray(!xray);
  else if (key === 'c') setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]);
});
addEventListener('keyup', e => {
  const k = { w: 'f', ArrowUp: 'f', s: 'b', ArrowDown: 'b', a: 'l', ArrowLeft: 'l', d: 'r', ArrowRight: 'r' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (k) keys[k] = false;
});
addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

// ---------------------------------------------------------------- post-processing (bloom)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- resize
let W = 1, H = 1, pip = { w: 0, h: 0 };
const pipLabel = document.querySelector('.pip-label');
new ResizeObserver(() => {
  W = view.clientWidth; H = view.clientHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  pip.w = Math.round(clamp(W * 0.26, 180, 360)); pip.h = Math.round(pip.w * 0.62);
  headCam.aspect = pip.w / pip.h; headCam.updateProjectionMatrix();
  Object.assign(pipLabel.style, { right: 'auto', bottom: 'auto', left: (W - 16 - pip.w + 8) + 'px', top: (H - 16 - pip.h + 8) + 'px' });
}).observe(view);

// ---------------------------------------------------------------- backend sync
// Pushes simulator telemetry to the website backend (POST /api/status), so the
// site's Live Status dashboard shows exactly what the 3D bot is doing.
const API = (window.AGRIPAL_API_BASE || 'http://localhost:8080') + '/api/status';
const apiEl = $('hudApi');
let apiBusy = false, lastObsTs = null;
function backendMode() {
  return { following: 'LINE_FOLLOWING', seeking: 'LINE_FOLLOWING', driving: 'LINE_FOLLOWING', avoiding: 'AVOIDING_OBSTACLE', halted: 'AVOIDING_OBSTACLE', plucking: 'PLUCKING' }[state.phase] || 'IDLE';
}
async function syncBackend() {
  if (apiBusy) return; apiBusy = true;
  const seen = state.us < 1.2;
  if (seen) lastObsTs = new Date().toISOString();
  try {
    const token = (function () { try { return localStorage.getItem('agripal_token') || sessionStorage.getItem('agripal_token'); } catch (e) { return null; } })();
    const r = await fetch(API, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {}),
      body: JSON.stringify({
        batteryPercent: Math.round(state.battery), mode: backendMode(), itemsPlucked: state.plucked,
        positionOnRow: clamp(Math.round((state.z + 9) / 18 * 16) + 1, 1, 17),
        lastObstacle: { detected: seen, distanceCm: seen ? Math.round(state.us * 100) : 0, timestamp: lastObsTs || new Date().toISOString() },
      }),
    });
    apiEl.textContent = r.ok ? 'Synced' : 'Error ' + r.status;
    apiEl.parentElement.dataset.ok = r.ok;
  } catch { apiEl.textContent = 'Offline'; apiEl.parentElement.dataset.ok = false; }
  apiBusy = false;
}
setInterval(syncBackend, 1500);

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let uiT = 0, blinkAt = 2, lastPos = new THREE.Vector3(START.x, 0, START.z);
const usBar = $('usBar'), irDots = [...$('ir').children];
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
reset();
log('Welcome to Agri-Pal — press Autonomous to start a harvest run', '');

let simNow = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const ff = window.agripal?.ff || 1;          // fast-forward (debug/testing)
  for (let i = 0; i < ff; i++) { simNow += dt * 1000; simStep(dt, simNow); }
  const now = simNow;
  render(dt, now, t);
  requestAnimationFrame(frame);
}
function simStep(dt, now) {
  sense();
  const cmd = state.mode === 'auto' ? autoStep(dt, now) : manualStep();
  const k = Math.min(1, dt * (state.mode === 'auto' ? 10 : 6));
  state.v += (cmd.v - state.v) * k; state.w += (cmd.w - state.w) * k;
  if (Math.abs(state.v) < 1e-3 && !cmd.v) state.v = 0;
  state.th += state.w * dt;
  state.x += Math.sin(state.th) * state.v * dt; state.z += Math.cos(state.th) * state.v * dt;
  state.dist += Math.abs(state.v) * dt;
  state.battery = Math.max(0, state.battery - dt * (0.03 + Math.abs(state.v) * 0.12 + (arm.busy ? 0.06 : 0)));
  if (state.battery < 15 && !state.lowBattWarned) { state.lowBattWarned = true; log('Battery low — return to charge', 'warn'); }

  bot.position.set(state.x, Math.abs(Math.sin(state.dist * 9)) * 0.004, state.z);
  bot.rotation.y = state.th;
  for (const wh of wheels) wh.spin.rotation.x += (state.v - wh.side * state.w * 0.43) / 0.2 * dt;
  updateArm(dt);
  for (let i = dropping.length - 1; i >= 0; i--) {
    const d = dropping[i]; d.t = Math.min(1, d.t + dt / 0.35);
    d.m.position.lerpVectors(d.from, d.to, d.t * d.t);
    if (d.t >= 1) dropping.splice(i, 1);
  }
}
function render(dt, now, t) {

  // head + face
  const alert = state.phase === 'halted' || (state.mode === 'manual' && state.us < 0.25);
  const expr = alert ? 'alert' : now < state.joyUntil ? 'joy' : state.phase === 'following' || state.phase === 'plucking' ? 'focus' : 'happy';
  if (t > blinkAt + 0.13) blinkAt = t + 2.5 + Math.random() * 2.5;
  const color = alert ? '#ffb020' : '#4cc9f0';
  drawFace(expr, t > blinkAt, arm.busy ? Math.sign(arm.look) : Math.round(clamp(-state.w, -1, 1)), color);
  head.rotation.y = lerp(head.rotation.y, arm.busy ? 0.35 : state.w * 0.15, dt * 3);
  head.rotation.x = lerp(head.rotation.x, arm.busy ? 0.15 : 0, dt * 3);
  head.position.y = 1.13 + Math.sin(t * 2) * 0.006;
  const tipCol = alert ? 0xffb020 : state.mode === 'auto' ? 0x3ddc84 : 0x4cc9f0;
  antennaTips.forEach(a => a.material.color.setHex((t * 2 % 1) < 0.5 ? tipCol : 0x22303a).multiplyScalar((t * 2 % 1) < 0.5 ? 3 : 1));

  // sensor visuals
  irLeds.forEach((m, i) => m.material.emissive.setHex(state.ir[i] ? 0xff2020 : 0x000000));
  const len = Math.min(state.us, 2.2);
  usCone.scale.set(len * 0.27, len * 0.27, len);
  coneMat.color.setHex(state.us < 0.5 ? 0xff4d4f : state.us < 1.2 ? 0xffb020 : 0x3ddc84);

  // cameras
  tmp.set(state.x, 0.6, state.z);
  if (camMode === 'orbit') {
    tmp2.subVectors(tmp, controls.target); controls.target.add(tmp2); camera.position.add(tmp2); controls.update();
  } else if (camMode === 'chase') {
    const p = toWorld(0, -2.9); camera.position.lerp(tmp2.set(p.x, 1.9, p.z), dt * 3);
    const a = toWorld(0, 1.5); camera.lookAt(a.x, 0.6, a.z);
  } else if (camMode === 'top') {
    camera.position.lerp(tmp2.set(0.01, 24, 0.5), dt * 3); camera.lookAt(0, 0, 0);
  } else {
    studioA += dt * 0.35;
    camera.position.lerp(tmp2.set(state.x + Math.cos(studioA) * 3, 1.5, state.z + Math.sin(studioA) * 3), dt * 2);
    camera.lookAt(state.x, 0.75, state.z);
  }
  if (camMode !== 'orbit') controls.target.copy(tmp);
  sun.position.set(state.x + 7, 14, state.z + 5); sun.target.position.set(state.x, 0, state.z); sun.target.updateMatrixWorld();

  // world animation
  windU.value = t;
  applyTimeOfDay(dt);
  updateDust(dt);
  for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x > 130) c.position.x = -130; }
  for (const B of butterflies) {
    const a = t * B.sp + B.ph;
    B.b.position.set(B.cx + Math.sin(a) * 1.6, 1.05 + Math.sin(a * 2.3) * 0.25, B.cz + Math.cos(a * 0.7) * 2.2);
    B.b.rotation.y = -a + Math.PI;
    const f = Math.sin(t * 22 + B.ph) * 1.1;
    B.wl.rotation.z = f; B.wr.rotation.z = -f;
  }
  statusLed.material.emissiveIntensity = (t % 1.5) < 0.1 ? 0 : 3;
  if (hl) {
    hl.box.update(); hl.box.material.opacity = 0.5 + Math.sin(t * 8) * 0.5;
    hl.obj.getWorldPosition(tmp2); tmp2.project(camera);
    Object.assign(hlLabel.style, { left: ((tmp2.x + 1) / 2 * W) + 'px', top: ((1 - tmp2.y) / 2 * H) + 'px' });
    if (performance.now() > hl.until) { scene.remove(hl.box); hl = null; hlLabel.style.display = 'none'; }
  }

  // render main (with bloom) + head-cam PiP
  scene.userData.sky.position.copy(camera.position);
  renderer.setViewport(0, 0, W, H); renderer.setScissorTest(false);
  usCone.visible = true;
  composer.render(dt);
  renderer.setScissorTest(true);
  renderer.setScissor(W - 16 - pip.w, 16, pip.w, pip.h); renderer.setViewport(W - 16 - pip.w, 16, pip.w, pip.h);
  usCone.visible = false;
  scene.userData.sky.position.copy(headCam.getWorldPosition(tmp2));
  renderer.render(scene, headCam);
  renderer.setScissorTest(false);

  if (xray) layoutLabels();

  // panel (10 Hz)
  uiT += dt;
  if (uiT > 0.1) {
    uiT = 0;
    const [txt, cls] = PHASE[state.phase];
    $('stateText').textContent = (state.mode === 'auto' ? 'Auto · ' : '') + txt;
    $('statePill').className = 'pill ' + cls;
    irDots.forEach((d, i) => d.classList.toggle('on', !!state.ir[i]));
    $('irErr').textContent = state.err === null ? 'LINE LOST' : (state.err >= 0 ? '+' : '') + (state.err * 100).toFixed(1) + ' cm';
    const cm = state.us === Infinity ? '> 400 cm' : Math.round(state.us * 100) + ' cm';
    $('usDist').textContent = cm; $('hudDist').textContent = cm;
    usBar.style.width = (state.us === Infinity ? 100 : clamp(state.us / 4, 0, 1) * 100) + '%';
    usBar.style.background = state.us < 0.5 ? 'var(--bad)' : state.us < 1.2 ? 'var(--warn)' : 'var(--accent)';
    $('hudSpeed').textContent = Math.abs(state.v).toFixed(2) + ' m/s';
    $('tBatt').textContent = Math.round(state.battery) + '%';
    $('tPlucked').textContent = state.plucked;
    $('tDist').textContent = state.dist.toFixed(1) + ' m';
    $('tObs').textContent = state.obsCount;
    let ripe = 0, raw = 0;
    for (const f of fruits) {
      if (f.userData.picked) continue;
      const l = toLocal(f.position.x, f.position.z);
      if (l.z > 0 && l.z < 2.5 && Math.abs(l.x) < l.z * 0.9 + 0.6) f.userData.ripe ? ripe++ : raw++;
    }
    $('ripe').textContent = `${ripe} ripe · ${raw} unripe`;
    $('btnGrip').textContent = arm.cur.grip > 0.5 ? '✊ Close grip' : '✋ Open grip';
    drawLcd(state.battery);
  }
}
requestAnimationFrame(frame);
window.agripal = { state, scene, camera, renderer, arm, get hl() { return hl; }, get nightK() { return nightK; }, set nightK(v) { nightK = v; }, get frames() { return renderer.info.render.frame; } };
