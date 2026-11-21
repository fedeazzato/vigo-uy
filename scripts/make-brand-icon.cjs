// WikiVigo brand icon in the Vigo head unit's launcher-tile style (same recipe as the car launcher tiles of our car apps,
// vigo-hack charge_app/tools/make_icons.js; spec: specs/stock-head-unit-look.md):
// 180x180 canvas, 120x120 tile at (30,30) with 4 px corners, ONE warm amber hue as a gradient (lighter top-left -> deeper bottom-right),
// two soft translucent circles from the top-right, a faint light band along the bottom, a white glyph.
// Glyph: the Dongfeng Vigo seen straight from the front, traced from the owner's reference photo (800x450, front view; mapped with
// X = 90 + (x-409)*0.285, Y = 88 + (y-237)*0.285): cabin with roof-rail stubs and mirrors, tall windshield, the full-width light bar
// joining the two vertical headlights, the bumper line and grille slot, the tyres below, and a small lightning bolt (EV) on the face.
// Usage: node scripts/make-brand-icon.cjs            -> public/favicon.svg (source of the PWA icons: npx pwa-assets-generator)
//        node scripts/make-brand-icon.cjs --preview DIR  -> also DIR/tile_day.png, tile_night.png (180x180 launcher-tile look),
//                                                          DIR/preview_x3.png and DIR/favicon_night.svg, for reviewing a change
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const pi = process.argv.indexOf('--preview'), previewDir = pi > 0 ? process.argv[pi + 1] : null;
const S = 180, SS = 4;

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rrect = (x, y, x0, y0, x1, y1, r) => { const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1; };
const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if (((p[i][1] > y) !== (p[j][1] > y)) && (x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) c = !c; } return c; };

const TILE = [30, 30, 150, 150], R = 4;
const COL = {
  day:   { top: '#ecbd8c', bot: '#b37b4f', ring: 0.15, glyph: '#ffffff', glow: [190, 130, 80], glowA: 0.30 },
  night: { top: '#b98a5f', bot: '#7d5233', ring: 0.09, glyph: '#efe4da', glow: [80, 50, 30], glowA: 0.22 },
};

// ---- glyph: shapes are {p: polygon} or {r: [x0, y0, x1, y1, radius]}; WHITE is the union, CUT is removed from it
const rect = (x0, y0, x1, y1, rad = 0) => ({ r: [x0, y0, x1, y1, rad] });
const sym = (x0, y0, x1, y1, rad = 0) => [rect(x0, y0, x1, y1, rad), rect(180 - x1, y0, 180 - x0, y1, rad)];
// 2026-11-21 redraw (owner: "like the car icon of the head unit's bottom bar"): an ORIGINAL drawing in the spirit of that dock icon
// (smooth crossover silhouette: rounded roof, cabin narrower than the body, soft shoulders, light bar ending in swept headlights),
// not a copy of Dongfeng's bitmap (wikivigo/DISTRIBUTION.md section 5). Keeps the wide windshield with thin A-pillars (owner 2026-11-20).
// Options: --no-bolt drops the EV lightning bolt.
const arc = (cx, cy, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)];
});
const mirrorX = p => p.map(([x, y]) => [+(180 - x).toFixed(2), y]).reverse();
// left half, top to bottom, then mirrored: roof with round corners, cabin tapering out, shoulder, body with round lower corners
const HALF = [
  [90, 49.2], ...arc(70.5, 56.2, 7, 270, 200, 6),         // roof line to the left round corner
  [57.4, 74.2], [50.2, 78.4],                             // A-pillar foot, shoulder
  ...arc(52.4, 83.6, 6, 220, 180, 4),                     // soft shoulder corner
  [46.4, 108.6], ...arc(52.4, 108.6, 6, 180, 90, 6), [90, 114.6],
];
const BODY = [...HALF, ...mirrorX(HALF.slice(1, -1))];
const WHITE = [
  { p: BODY },
  ...sym(41.8, 66.4, 51.2, 73.2, 2.2),                    // mirrors
  ...sym(49.6, 69.2, 55.4, 71.4, 0.4),                    // mirror arms
  ...sym(48.6, 113, 62.6, 125.4, 2.6),                    // tyres seen from the front
];
// windshield inset ~2.5 px inside the cabin outline (x = 63.5 - 0.339 * (y - 56.2) on the left): wide glass, thin but visible A-pillars
const WIND = [[67.6, 56.6], [112.4, 56.6], [114.4, 57.8], [119.3, 71.2], [60.7, 71.2], [65.6, 57.8]];
const LAMP = [[47.6, 84.2], [62, 85.4], [62, 87.8], [50.2, 92.6], [48.2, 91.2]];                       // swept headlight (left)
const BOLT = [[92.6, 89.6], [86.6, 97.4], [89.9, 97.4], [88.3, 102.6], [94.3, 94.8], [91, 94.8]];
const CUT = [
  { p: WIND },                                            // windshield
  rect(61, 85.4, 119, 87.8, 1.2),                         // light bar across the front
  { p: LAMP }, { p: mirrorX(LAMP) },                      // headlights sweeping down at the ends of the light bar
  rect(66.5, 105.2, 113.5, 109.4, 2.1),                   // lower grille slot
  ...(process.argv.includes('--no-bolt') ? [] : [{ p: BOLT, keepShape: true }]),   // lightning bolt on the face (EV)
];
// Proportions (owner 2026-11-21: "less tall, or wider"): the whole glyph is stretched SX wide and SY tall around its centre
// (90, GY); the bolt only moves with it (its own shape is kept).
const SX = 1.10, SY = 0.94, GY = 87;
const tx = x => +(90 + (x - 90) * SX).toFixed(2), ty = y => +(GY + (y - GY) * SY).toFixed(2);
const fit = s => {
  if (s.r) return rect(tx(s.r[0]), ty(s.r[1]), tx(s.r[2]), ty(s.r[3]), s.r[4]);
  if (!s.keepShape) return { p: s.p.map(([x, y]) => [tx(x), ty(y)]) };
  const cx = s.p.reduce((a, q) => a + q[0], 0) / s.p.length, cy = s.p.reduce((a, q) => a + q[1], 0) / s.p.length;
  return { p: s.p.map(([x, y]) => [+(x - cx + tx(cx)).toFixed(2), +(y - cy + ty(cy)).toFixed(2)]) };
};
WHITE.splice(0, WHITE.length, ...WHITE.map(fit));
CUT.splice(0, CUT.length, ...CUT.map(fit));
const inShape = (x, y, s) => s.p ? inPoly(x, y, s.p) : rrect(x, y, s.r[0], s.r[1], s.r[2], s.r[3], s.r[4]);
const glyphAt = (x, y) => {
  if (!WHITE.some(s => inShape(x, y, s))) return null;
  return CUT.some(s => inShape(x, y, s)) ? 'cut' : 'w';
};

function render(mode, K = 1) {
  const c = COL[mode], top = hex(c.top), bot = hex(c.bot), glyph = hex(c.glyph);
  const W = S * K, buf = Buffer.alloc(W * W * 4);
  for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / K, y = (py + (sy + 0.5) / SS) / K;
      let col = null, al = 0;
      if (!rrect(x, y, TILE[0], TILE[1], TILE[2], TILE[3], R)) {
        let best = 0;
        for (let k = 1; k <= 8; k++) if (rrect(x, y - 3, TILE[0] - k, TILE[1] - k, TILE[2] + k, TILE[3] + k, R + k)) { best = (9 - k) / 9; break; }
        if (best) { col = c.glow; al = best * c.glowA; }
      } else {
        const t = ((x - TILE[0]) * 0.35 + (y - TILE[1]) * 0.65) / 120;
        col = mix(top, bot, Math.min(1, Math.max(0, t))); al = 1;
        const d1 = Math.hypot(x - 120, y - 52);
        for (const [rad, k] of [[70, 0.6], [46, 0.9]]) if (d1 < rad) col = mix(col, [255, 255, 255], c.ring * k);
        if (y > 128) col = mix(col, [255, 255, 255], 0.10 + 0.04 * (y - 128) / 22);
        if (glyphAt(x, y) === 'w') col = glyph;
      }
      if (col) { r += col[0] * al; g += col[1] * al; b += col[2] * al; a += al; }
    }
    const n = SS * SS, i = (py * W + px) * 4;
    if (a > 0) { buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a); }
    buf[i + 3] = Math.round(255 * a / n);
  }
  return png(W, W, buf);
}

const pts = p => p.map(([x, y]) => `${x},${y}`).join(' ');
const svgShape = (s, fill) => s.p ? `<polygon points="${pts(s.p)}"${fill ? ` fill="${fill}"` : ''}/>`
  : `<rect x="${s.r[0]}" y="${s.r[1]}" width="${+(s.r[2] - s.r[0]).toFixed(2)}" height="${+(s.r[3] - s.r[1]).toFixed(2)}"${s.r[4] ? ` rx="${s.r[4]}"` : ''}${fill ? ` fill="${fill}"` : ''}/>`;
function svg(mode) {
  const c = COL[mode];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 30 120 120">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="30" y1="30" x2="72" y2="150">
      <stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bot}"/>
    </linearGradient>
    <clipPath id="t"><rect x="30" y="30" width="120" height="120" rx="4"/></clipPath>
    <mask id="m"><rect x="30" y="30" width="120" height="120" fill="#fff"/>${CUT.map(s => svgShape(s, '#000')).join('')}</mask>
  </defs>
  <g clip-path="url(#t)">
    <rect x="30" y="30" width="120" height="120" fill="url(#g)"/>
    <circle cx="120" cy="52" r="70" fill="#fff" fill-opacity="${(c.ring * 0.6).toFixed(3)}"/>
    <circle cx="120" cy="52" r="46" fill="#fff" fill-opacity="${(c.ring * 0.9).toFixed(3)}"/>
    <rect x="30" y="128" width="120" height="22" fill="#fff" fill-opacity="0.12"/>
    <g fill="${c.glyph}" mask="url(#m)">${WHITE.map(s => svgShape(s)).join('')}</g>
  </g>
</svg>
`;
}

const pub = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(pub, 'favicon.svg'), svg('day'));
console.log('wrote ' + path.join(pub, 'favicon.svg'));
if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, 'tile_day.png'), render('day'));
  fs.writeFileSync(path.join(previewDir, 'tile_night.png'), render('night'));
  fs.writeFileSync(path.join(previewDir, 'preview_x3.png'), render('day', 3));
  fs.writeFileSync(path.join(previewDir, 'favicon_night.svg'), svg('night'));
  console.log('previews in ' + path.resolve(previewDir));
}
