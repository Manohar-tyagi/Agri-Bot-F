// AGRI-PAL bill of materials. Prices are approximate Indian online retail (INR) — verify before ordering.
// [item, spec / purpose, qty, unit ₹, 3D part key (optional)]
export const BOM = [
  ['Control & sensing', [
    ['Arduino Uno R3 (ATmega328P)', 'Main controller — PID line following, motors, sensors', 1, 550, 'arduino'],
    ['ESP32-CAM (OV2640, Wi-Fi)', 'Head camera, ripeness detection, posts telemetry to /api/status', 1, 650, 'camera'],
    ['ESP32-CAM-MB USB programmer', 'Flashing the ESP32-CAM', 1, 200],
    ['5-channel IR line sensor array (TCRT5000)', 'Reads the black guide line', 1, 350, 'ir'],
    ['HC-SR04 ultrasonic sensor', 'Obstacle detection, 2–400 cm', 1, 90, 'ultrasonic'],
    ['HC-SR04 mounting bracket', 'Chest mount', 1, 30],
    ['Logic level shifter, 4-ch', '5 V ↔ 3.3 V UART between Uno and ESP32', 1, 60],
  ]],
  ['Drive train', [
    ['BO DC gear motor, 300 RPM, 3–12 V', 'Wheel drive', 4, 70, 'motor'],
    ['Off-road rubber wheel, 85 mm, BO shaft', 'Traction on soil', 4, 90, 'wheel'],
    ['L298N dual H-bridge motor driver', 'Left/right motor control (PWM)', 1, 180, 'driver'],
    ['BO motor mounting clamp', 'Fixes motors to the chassis', 4, 25],
    ['0.1 µF ceramic capacitor', 'Motor noise suppression (one per motor)', 4, 2],
  ]],
  ['Arm & gripper', [
    ['MG996R metal-gear servo, 11 kg·cm', 'Base yaw, shoulder, elbow joints', 3, 350, 'servo'],
    ['MG90S metal-gear micro servo', 'Wrist pitch', 1, 180],
    ['Mechanical claw gripper kit (with MG90S)', 'Plucks the produce', 1, 450, 'gripper'],
    ['PCA9685 16-ch PWM servo driver (I²C)', 'Drives all arm servos', 1, 350, 'pca'],
    ['Aluminium multi-purpose servo bracket', 'Joint housings', 4, 60],
    ['Aluminium long U-bracket', 'Upper arm & forearm links', 2, 70],
    ['25T round metal servo horn', 'Rigid servo-to-bracket coupling', 3, 40],
    ['Lazy-susan turntable bearing, 3"', 'Arm base rotation, takes load off the servo', 1, 150],
    ['Servo extension cable, 30 cm', 'Routing servo leads to the PCA9685', 4, 20],
  ]],
  ['Power', [
    ['3S Li-Po battery, 11.1 V 2200 mAh 25C', 'Main power, ~45 min run time', 1, 1450, 'battery'],
    ['XT60 connector pair', 'Battery connector', 1, 40],
    ['XL4016 8 A buck converter', '6.0 V servo rail', 1, 350, 'buck'],
    ['LM2596 buck converter', '5 V logic rail (Uno, ESP32, sensors)', 1, 90],
    ['Inline blade fuse holder + 10 A fuse', 'Short-circuit protection', 1, 40],
    ['KCD1 rocker power switch, 6 A', 'Main on/off (rear panel)', 1, 20, 'switch'],
    ['Li-Po voltage checker / low-voltage alarm', 'Battery protection', 1, 120],
    ['Resistor 10 kΩ + 3.3 kΩ', 'Battery voltage divider → A0 (battery %)', 2, 1],
    ['1000 µF 16 V electrolytic capacitor', 'Servo rail smoothing', 2, 10],
    ['Li-Po balance charger (B3/B6)', 'Charging', 1, 600],
    ['Li-Po fire-safe charging bag', 'Safe charging & storage', 1, 250],
  ]],
  ['Display & indicators', [
    ['MAX7219 32×8 LED dot-matrix module (4-in-1)', 'Animated face (two stacked = 32×16)', 2, 280, 'face'],
    ['0.96" I²C OLED 128×64', 'Front battery / mode display', 1, 220, 'oled'],
    ['Smoked acrylic face window, 3 mm, 100×70 mm', 'Covers the LED matrix', 1, 80],
    ['2.4 GHz RP-SMA antenna + IPEX pigtail', 'ESP32 external antenna (pair, one decorative)', 2, 90, 'antenna'],
    ['Blue 5 mm LED', 'Antenna tip status lights', 2, 3],
    ['White 5 mm high-bright LED', 'Headlights', 2, 5],
    ['Red 5 mm LED', 'Tail lights', 2, 3],
    ['220 Ω resistor', 'LED current limiting', 6, 1],
    ['Active buzzer, 5 V', 'Obstacle / low-battery beeps', 1, 15],
    ['12 mm tactile push button', 'Front start / mode buttons', 2, 10],
  ]],
  ['Wiring & connectors', [
    ['Jumper wires M-M, 20 cm (40 pcs)', 'Signal wiring', 1, 60],
    ['Jumper wires M-F, 20 cm (40 pcs)', 'Sensor wiring', 1, 60],
    ['Jumper wires F-F, 20 cm (40 pcs)', 'Module-to-module wiring', 1, 60],
    ['22 AWG silicone wire, red + black, 2 m each', 'Logic power distribution', 1, 90],
    ['18 AWG silicone wire, red + black, 1 m each', 'Battery & motor power', 1, 80],
    ['JST-XH 2-pin connector set', 'Detachable power leads', 5, 8],
    ['Male + female header strip, 40-pin', 'Perfboard connections', 2, 15],
    ['2-pin screw terminal block, 5 mm', 'Power distribution board', 4, 5],
    ['Heat-shrink tubing assortment', 'Insulating solder joints', 1, 120],
    ['Spiral cable wrap, 6 mm, 1 m', 'Neck & arm cable bundles', 1, 60],
    ['Cable zip ties, 100 mm (100 pcs)', 'Cable management', 1, 50],
    ['Perfboard, 7×9 cm', 'Power distribution board', 1, 40],
    ['Mini breadboard, 170 tie-points', 'Prototyping sensor wiring', 1, 30],
  ]],
  ['Structure & body', [
    ['4WD acrylic chassis plates, 3 mm (2-deck)', 'Base frame', 1, 350],
    ['PLA filament, ~450 g', '3D-printed body shell, head, shoulder pod, tray bracket', 1, 550],
    ['Spray paint — blue, white, clear coat', 'Shell finish', 3, 180],
    ['PVC pipe, 40 mm × 10 cm', 'Neck', 1, 30],
    ['Plastic basket, 18×10 cm', 'Harvest tray', 1, 60, 'tray'],
    ['Rubber bumper strip, 30 cm', 'Front bumper', 1, 40],
    ['Velcro battery strap, 20 cm', 'Holds the Li-Po', 1, 40],
    ['Double-sided foam tape, 1 roll', 'Mounting modules', 1, 60],
  ]],
  ['Fasteners', [
    ['M3 × 8 mm pan-head screw', 'Shell panels, brackets', 40, 1.5, 'screws'],
    ['M3 × 12 mm screw', 'Deck plates, sensor mounts', 24, 1.5],
    ['M3 × 20 mm screw', 'Servo brackets', 8, 2],
    ['M3 × 30 mm bolt', 'Motor clamps', 8, 3],
    ['M3 hex nut', 'General', 50, 1],
    ['M3 nylock nut', 'Arm joints (won’t vibrate loose)', 10, 2],
    ['M3 flat washer', 'General', 30, 0.5],
    ['M3 brass standoff, 10 mm', 'PCB mounting', 12, 6],
    ['M3 brass standoff, 30 mm', 'Deck spacers', 6, 10],
    ['M2 × 8 mm screw + nut', 'Servo horns, IR/ultrasonic boards', 20, 1.5],
    ['M2.5 × 6 mm screw', 'Arduino mounting holes', 4, 2],
    ['Self-tapping screw, 2 × 6 mm', 'Servo horn to bracket', 10, 1],
  ]],
  ['Consumables', [
    ['Solder wire 63/37, 0.8 mm, 50 g', 'All soldered joints', 1, 150],
    ['Hot-glue sticks (10 pcs)', 'Strain relief, cable anchoring', 1, 50],
    ['Black PVC electrical tape, 19 mm', 'Laying the guide-line track', 2, 30],
    ['Kapton / insulation tape', 'Insulating PCB undersides', 1, 60],
    ['Thread-locker (medium)', 'Servo & arm screws', 1, 120],
  ]],
];
export const TOOLS = ['Soldering iron (25–60 W) + stand', 'Digital multimeter', 'Precision screwdriver set', 'Wire stripper / cutter',
  'Hot-glue gun', 'Allen key set', 'Needle-nose pliers', '3D printer access (for the shell)'];

const inr = n => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initBom(locate) {
  const dlg = document.getElementById('bom');
  const body = document.getElementById('bomBody');
  const search = document.getElementById('bomSearch');
  let grand = 0, count = 0, pieces = 0;
  for (const [, items] of BOM) for (const [, , q, u] of items) { grand += q * u; count++; pieces += q; }
  document.getElementById('bomSummary').textContent =
    `${count} line items · ${pieces} pieces · estimated total ${inr(Math.round(grand))}`;

  function render(filter = '') {
    const f = filter.trim().toLowerCase();
    let html = '', n = 0;
    for (const [cat, items] of BOM) {
      const rows = items.filter(([a, b]) => !f || (a + ' ' + b + ' ' + cat).toLowerCase().includes(f));
      if (!rows.length) continue;
      const sub = rows.reduce((s, [, , q, u]) => s + q * u, 0);
      html += `<tr class="cat"><th colspan="5">${esc(cat)}</th><th class="num">${inr(Math.round(sub))}</th><th></th></tr>`;
      for (const [item, spec, q, u, part] of rows) {
        n++;
        html += `<tr><td class="num muted">${n}</td><td><b>${esc(item)}</b></td><td class="muted">${esc(spec)}</td>
          <td class="num">${q}</td><td class="num">${inr(u)}</td><td class="num">${inr(Math.round(q * u * 100) / 100)}</td>
          <td>${part ? `<button class="locate" data-part="${part}" title="Show on the 3D bot">◎ Locate</button>` : ''}</td></tr>`;
      }
    }
    body.innerHTML = html || '<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">No matching parts</td></tr>';
  }
  render();
  search.oninput = () => render(search.value);
  body.onclick = e => { const b = e.target.closest('.locate'); if (b) { dlg.close(); locate(b.dataset.part, b.closest('tr').querySelector('b').textContent); } };
  document.getElementById('bomTools').textContent = TOOLS.join(' · ');
  document.getElementById('btnBom').onclick = () => dlg.showModal();
  document.getElementById('bomClose').onclick = () => dlg.close();
  document.getElementById('bomPrint').onclick = () => { search.value = ''; render(); window.print(); };
  document.getElementById('bomCsv').onclick = () => {
    const lines = [['Category', 'Item', 'Spec / purpose', 'Qty', 'Unit (INR)', 'Total (INR)']];
    for (const [cat, items] of BOM) for (const [a, b, q, u] of items) lines.push([cat, a, b, q, u, Math.round(q * u * 100) / 100]);
    lines.push(['', 'TOTAL', '', '', '', Math.round(grand)]);
    const csv = lines.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'agri-pal-bill-of-materials.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
