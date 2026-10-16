// Draws the Grocefy logo and renders the app icons from it. Run: node scripts/generate-icons.cjs
// The mark is a white shopping bag with a check (the list, done) and a fresh leaf (groceries), on Grocefy green.
// Writes assets/logo.svg (the source of truth) and the PNGs app.json points at.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const GREEN = '#22784B';
const GREEN_LIGHT = '#2E9A60';
const GREEN_DARK = '#185C39';
const LEAF = '#A6E07E';

// The mark on a 1024 grid, centred on (512, 512). `scale` shrinks it around the centre.
const mark = (scale) => `
  <g transform="translate(512 512) scale(${scale}) translate(-530 -556)">
    <path d="M404 456 V400 A108 108 0 0 1 620 400 V456" fill="none" stroke="#FFFFFF" stroke-width="46" stroke-linecap="round"/>
    <g transform="translate(612 452) rotate(-48) scale(1.18)">
      <path d="M0 0 C34 -82 160 -96 226 -18 C160 50 46 62 0 0 Z" fill="${LEAF}"/>
      <path d="M16 -3 Q112 -38 206 -20" fill="none" stroke="${GREEN_LIGHT}" stroke-width="8" stroke-linecap="round"/>
    </g>
    <path d="M318 448 H706 Q728 448 726 470 L702 776 Q698 820 654 820 H370 Q326 820 322 776 L298 470 Q296 448 318 448 Z" fill="#FFFFFF"/>
    <polyline points="418,628 490,700 614,566" fill="none" stroke="${GREEN}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${GREEN_LIGHT}"/><stop offset="1" stop-color="${GREEN_DARK}"/></linearGradient></defs>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${gradient}${body}</svg>`;

const files = {
  // Full-bleed square: iOS and Android round the corners themselves.
  'icon.png': svg(`<rect width="1024" height="1024" fill="url(#bg)"/>${mark(1.02)}`),
  // Android adaptive icon: transparent foreground inside the 66% safe zone; the green background comes from app.json.
  'adaptive-icon.png': svg(mark(0.8)),
  // Splash and in-app logo: a rounded tile, transparent around it.
  'splash-icon.png': svg(`<rect x="32" y="32" width="960" height="960" rx="240" fill="url(#bg)"/>${mark(0.98)}`)
};

const assets = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(assets, 'logo.svg'), `${files['splash-icon.png'].trim()}\n`);
for (const [name, source] of Object.entries(files)) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
  fs.writeFileSync(path.join(assets, name), png);
  console.log(`wrote assets/${name} (${png.length} bytes)`);
}
