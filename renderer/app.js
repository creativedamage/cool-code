/* global QRCodeStyling, jsQR */
'use strict';

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
const DEFAULTS = {
  data: 'https://example.com',
  shape: 'square',
  bgRound: 0,
  margin: 20,
  ecl: 'H',
  dots:          { type: 'rounded',       mode: 'solid', color: '#111827', color2: '#7c5cff', gradType: 'linear', rotation: 45 },
  cornersSquare: { type: 'extra-rounded', mode: 'solid', color: '#111827', color2: '#7c5cff', gradType: 'linear', rotation: 45 },
  cornersDot:    { type: 'dot',           mode: 'solid', color: '#111827', color2: '#7c5cff', gradType: 'linear', rotation: 45 },
  background:    { mode: 'solid', color: '#ffffff', color2: '#e9e4ff', gradType: 'radial', rotation: 0, transparent: false },
  logo: null,
  logoSize: 0.35,
  logoMargin: 6,
  hideDots: true,
  logoBacking: 'none',   // none | circle | rounded | square
  backingColor: '#ffffff',
  trackOn: false,        // "Track scans" switch
  track: null,           // { id, slug, short_url, target_url, name } once a tracking link exists
};

const clone = (o) => JSON.parse(JSON.stringify(o));
let state = loadLast() || clone(DEFAULTS);

const DOT_TYPES = [
  ['square', 'Square'], ['dots', 'Dots'], ['rounded', 'Rounded'],
  ['extra-rounded', 'Extra round'], ['classy', 'Classy'], ['classy-rounded', 'Classy round'],
];
const CORNER_SQUARE_TYPES = [
  ['square', 'Square'], ['extra-rounded', 'Round'], ['dot', 'Circle'], ['rounded', 'Soft'],
  ['dots', 'Dots'], ['classy', 'Classy'], ['classy-rounded', 'Leaf'],
];
const CORNER_DOT_TYPES = [
  ['square', 'Square'], ['dot', 'Circle'], ['rounded', 'Soft'], ['extra-rounded', 'Round'],
  ['dots', 'Dots'], ['classy', 'Classy'], ['classy-rounded', 'Leaf'],
];

const PRESETS = [
  { name: 'Classic', s: { dots: { type: 'square', color: '#000000' }, cornersSquare: { type: 'square', color: '#000000' }, cornersDot: { type: 'square', color: '#000000' }, background: { color: '#ffffff' } } },
  { name: 'Soft', s: { dots: { type: 'rounded', color: '#1f2937' }, cornersSquare: { type: 'extra-rounded', color: '#1f2937' }, cornersDot: { type: 'dot', color: '#1f2937' }, background: { color: '#ffffff' } } },
  { name: 'Ocean', s: { dots: { type: 'dots', mode: 'gradient', color: '#0b3d91', color2: '#00a6c8', gradType: 'linear', rotation: 135 }, cornersSquare: { type: 'extra-rounded', color: '#0b3d91' }, cornersDot: { type: 'dot', color: '#00a6c8' }, background: { color: '#f0fbff' } } },
  { name: 'Sunset', s: { dots: { type: 'classy-rounded', mode: 'gradient', color: '#c2185b', color2: '#ff8f00', gradType: 'linear', rotation: 45 }, cornersSquare: { type: 'classy-rounded', color: '#c2185b' }, cornersDot: { type: 'classy-rounded', color: '#ff6f00' }, background: { color: '#fff8f0' } } },
  { name: 'Forest', s: { dots: { type: 'extra-rounded', color: '#14532d' }, cornersSquare: { type: 'dot', color: '#166534' }, cornersDot: { type: 'dot', color: '#65a30d' }, background: { color: '#f3fbe9' } } },
  { name: 'Royal', s: { dots: { type: 'classy', mode: 'gradient', color: '#3b0764', color2: '#7c3aed', gradType: 'radial' }, cornersSquare: { type: 'square', color: '#3b0764' }, cornersDot: { type: 'square', color: '#b45309' }, background: { color: '#fdfaf3' } } },
  { name: 'Candy', s: { dots: { type: 'dots', mode: 'gradient', color: '#db2777', color2: '#7c3aed', gradType: 'linear', rotation: 90 }, cornersSquare: { type: 'extra-rounded', color: '#db2777' }, cornersDot: { type: 'dot', color: '#7c3aed' }, background: { color: '#fff0f7' } } },
  { name: 'Mono dot', s: { shape: 'circle', dots: { type: 'dots', color: '#111111' }, cornersSquare: { type: 'dot', color: '#111111' }, cornersDot: { type: 'dot', color: '#111111' }, background: { color: '#ffffff' } } },
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function deepMerge(base, patch) {
  const out = clone(base);
  for (const k of Object.keys(patch || {})) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && out[k] && typeof out[k] === 'object') {
      out[k] = { ...out[k], ...patch[k] };
    } else out[k] = patch[k];
  }
  return out;
}

function saveLast() {
  try { localStorage.setItem('coolcode:last', JSON.stringify(state)); }
  catch { try { localStorage.setItem('coolcode:last', JSON.stringify({ ...state, logo: null })); } catch { /* ignore */ } }
}
function loadLast() {
  try {
    const raw = localStorage.getItem('coolcode:last');
    return raw ? deepMerge(DEFAULTS, JSON.parse(raw)) : null;
  } catch { return null; }
}

function toast(msg, action) {
  const t = $('toast');
  t.innerHTML = '';
  t.append(document.createTextNode(msg));
  if (action) {
    const a = document.createElement('a');
    a.textContent = action.label;
    a.onclick = action.fn;
    t.append(a);
  }
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

function luminance(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return 1;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ------------------------------------------------------------------
// Options builder (state -> qr-code-styling options)
// ------------------------------------------------------------------
function paint(c) {
  if (c.mode === 'gradient') {
    return {
      gradient: {
        type: c.gradType,
        rotation: ((c.rotation || 0) * Math.PI) / 180,
        colorStops: [{ offset: 0, color: c.color }, { offset: 1, color: c.color2 }],
      },
    };
  }
  return { color: c.color, gradient: undefined };
}

function buildOptions(s, size, { type = 'canvas', forceOpaque = false, forceTransparent = false } = {}) {
  const scale = size / 600; // keep margin/padding proportional to preview
  const bg = s.background;
  const transparent = forceTransparent || (bg.transparent && !forceOpaque);
  return {
    type,
    shape: s.shape,
    width: size,
    height: size,
    margin: Math.round(s.margin * scale),
    data: qrData(s) || ' ',
    image: logoFor(s),
    qrOptions: { errorCorrectionLevel: s.ecl },
    imageOptions: {
      hideBackgroundDots: s.hideDots,
      imageSize: s.logoSize,
      margin: Math.round(s.logoMargin * scale),
      crossOrigin: 'anonymous',
      saveAsBlob: true,
    },
    dotsOptions: { type: s.dots.type, ...paint(s.dots) },
    cornersSquareOptions: { type: s.cornersSquare.type, ...paint(s.cornersSquare) },
    cornersDotOptions: { type: s.cornersDot.type, ...paint(s.cornersDot) },
    backgroundOptions: transparent
      ? { color: 'rgba(0,0,0,0)', round: s.bgRound }
      : { round: s.bgRound, ...paint(bg) },
  };
}

// What the QR actually encodes: the tracking link when tracking is on, otherwise the typed link
function qrData(s) {
  return s.trackOn && s.track ? s.track.short_url : (s.data || '').trim();
}

// ------------------------------------------------------------------
// Logo backing (composited onto a canvas, cached)
// ------------------------------------------------------------------
let logoCache = { key: null, url: null };
const logoKey = (s) => s.logo ? `${s.logo.length}:${s.logo.slice(-48)}:${s.logoBacking}:${s.backingColor}` : null;

function logoFor(s) {
  if (!s.logo) return undefined;
  if (s.logoBacking === 'none') return s.logo;
  return logoCache.key === logoKey(s) ? logoCache.url : s.logo;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

async function ensureLogo(s) {
  if (!s.logo || s.logoBacking === 'none') return;
  const key = logoKey(s);
  if (logoCache.key === key) return;
  const img = await loadImage(s.logo);
  const N = 800;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = s.backingColor;
  ctx.beginPath();
  if (s.logoBacking === 'circle') ctx.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
  else if (s.logoBacking === 'rounded') ctx.roundRect(0, 0, N, N, N * 0.22);
  else ctx.rect(0, 0, N, N);
  ctx.fill();
  // Fit the logo inside the backing with breathing room (circles need more)
  const box = N * (s.logoBacking === 'circle' ? 0.62 : 0.74);
  const w = img.naturalWidth || img.width || box, h = img.naturalHeight || img.height || box;
  const k = Math.min(box / w, box / h);
  ctx.drawImage(img, (N - w * k) / 2, (N - h * k) / 2, w * k, h * k);
  logoCache = { key, url: c.toDataURL('image/png') };
}

// ------------------------------------------------------------------
// Preview
// ------------------------------------------------------------------
const PREVIEW_SIZE = 600;
let qr = null;

// Rebuild the preview instance on each change: qr-code-styling's update()
// can break when the overall shape changes, and a fresh draw is fast.
const redraw = debounce(async () => {
  try { await ensureLogo(state); } catch (e) { toast(e.message); }
  const next = new QRCodeStyling(buildOptions(state, PREVIEW_SIZE));
  const host = $('preview');
  const holder = document.createElement('div');
  holder.style.display = 'contents';
  next.append(holder);
  host.replaceChildren(holder);
  qr = next;
  checkScan();
  saveLast();
}, 40);

function render() { redraw(); }

// ------------------------------------------------------------------
// Scannability check with jsQR
// ------------------------------------------------------------------
// The checker uses ZXing (the same decoder family phone cameras use) and
// tests the design several ways: full size, small, and small + blurry —
// roughly what a phone camera sees from a distance. jsQR is a fallback.
let zxingReady = false;
(async function initZXing() {
  try {
    if (!window.ZXingWASM) return;
    const overrides = {};
    if (window.qrApi?.zxingWasm) overrides.wasmBinary = await window.qrApi.zxingWasm();
    else overrides.locateFile = (f) => '../node_modules/zxing-wasm/dist/reader/' + f;
    await ZXingWASM.prepareZXingModule({ overrides, fireImmediately: true });
    zxingReady = true;
    checkScan();
  } catch (e) { console.warn('ZXing unavailable, using jsQR only', e); }
})();

async function zxingDecode(img, invert = false) {
  if (!zxingReady) return null;
  try {
    const res = await ZXingWASM.readBarcodes(img, { formats: ['QRCode'], tryHarder: true, tryInvert: invert, maxNumberOfSymbols: 1 });
    return res.find((r) => r.isValid)?.text ?? null;
  } catch { return null; }
}

function jsqrDecode(img, inversionAttempts = 'dontInvert') {
  try { return jsQR(img.data, img.width, img.height, { inversionAttempts })?.data ?? null; }
  catch { return null; }   // jsQR can throw on unusual layouts
}

function sampleAt(bmp, size, blur = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

// Returns { passes: 0..3, inverted: bool }
async function testDesign(s) {
  const expected = qrData(s);
  await ensureLogo(s);
  // Circle codes add decorative edge dots; the data modules match the square form, so test that.
  const q = new QRCodeStyling(buildOptions({ ...s, shape: 'square' }, PREVIEW_SIZE));
  const bmp = await createImageBitmap(await q.getRawData('png'));
  let passes = 0;
  for (const [size, blur] of [[600, 0], [300, 0], [220, 0.8]]) {
    const img = sampleAt(bmp, size, blur);
    const text = (await zxingDecode(img)) ?? jsqrDecode(img);
    if (text === expected) passes++;
  }
  let inverted = false;
  if (!passes) {
    const img = sampleAt(bmp, 600);
    inverted = (await zxingDecode(img, true)) === expected || jsqrDecode(img, 'onlyInvert') === expected;
  }
  return { passes, inverted };
}

let scanSeq = 0;
const checkScan = debounce(async () => {
  const seq = ++scanSeq;
  setScan('pending', 'Checking…');
  const expected = qrData(state);
  if (!expected) { setScan('bad', 'Enter a link to generate a code'); return; }
  try {
    const { passes, inverted } = await testDesign(state);
    if (seq !== scanSeq) return; // a newer change is being checked
    const tracked = state.trackOn && state.track ? ' · tracking scans' : '';
    if (passes >= 2) setScan('ok', 'Scannable' + tracked);
    else if (passes === 1) setScan('ok', 'Scannable — give it a quick test with your phone before printing' + tracked);
    else if (inverted) setScan('warn', 'Light-on-dark: newer phones read it, some older ones won’t', true);
    else setScan('bad', diagnose(), true);
  } catch (e) {
    if (seq === scanSeq) setScan('warn', 'Couldn’t check this design — test it with your phone');
  }
}, 250);

function setScan(kind, text, offerFix = false) {
  $('scan').className = 'scan ' + kind;
  $('scanText').textContent = text;
  $('btnFix').hidden = !offerFix;
}

function diagnose() {
  const dotL = luminance(state.dots.color);
  const bgL = state.background.transparent ? 1 : luminance(state.background.color);
  const contrast = (Math.max(dotL, bgL) + 0.05) / (Math.min(dotL, bgL) + 0.05);
  if (contrast < 3) return 'Hard to scan — the colors are too close together';
  if (state.logo && state.logoSize > 0.38) return 'Hard to scan — the logo covers too much of the code';
  return 'Hard to scan with this combination of styles';
}

// Same hue, much darker — keeps the design's color identity
function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0; i < 12 && luminance('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')) > 0.12; i++) {
    r = Math.round(r * 0.8); g = Math.round(g * 0.8); b = Math.round(b * 0.8);
  }
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// "Fix it": tries the smallest changes first and keeps your look wherever possible
async function autoFix() {
  const btn = $('btnFix');
  btn.disabled = true; btn.textContent = 'Fixing…';
  const steps = [
    ['error correction set to High', (s) => { s.ecl = 'H'; }],
    ['dots behind the logo cleared', (s) => { if (s.logo) s.hideDots = true; }],
    ['quiet zone widened', (s) => { s.margin = Math.max(s.margin, 24); }],
    ['logo made a little smaller', (s) => { if (s.logo) s.logoSize = Math.min(s.logoSize, 0.3); }],
    ['logo made smaller', (s) => { if (s.logo) s.logoSize = Math.min(s.logoSize, 0.24); }],
    ['corner patterns made bolder', (s) => { s.cornersSquare.type = 'extra-rounded'; s.cornersDot.type = 'dot'; }],
    ['dot style simplified', (s) => { if (['classy', 'classy-rounded', 'dots'].includes(s.dots.type)) s.dots.type = 'rounded'; }],
    ['colors darkened for contrast', (s) => {
      for (const k of ['dots', 'cornersSquare', 'cornersDot']) {
        if (luminance(s[k].color) > 0.18) s[k].color = darken(s[k].color);
        if (s[k].mode === 'gradient' && luminance(s[k].color2) > 0.18) s[k].color2 = darken(s[k].color2);
      }
      if (!s.background.transparent && luminance(s.background.color) < 0.6) { s.background.color = '#ffffff'; s.background.mode = 'solid'; }
    }],
  ];
  // Fix the diagnosed cause first: low contrast -> colors before touching the logo
  const dotL = luminance(state.dots.color);
  const bgL = state.background.transparent ? 1 : luminance(state.background.color);
  if ((Math.max(dotL, bgL) + 0.05) / (Math.min(dotL, bgL) + 0.05) < 3) steps.unshift(steps.pop());
  let trial = clone(state);
  const applied = [];
  let best = null;
  for (const [label, fn] of steps) {
    const before = JSON.stringify(trial);
    fn(trial);
    if (JSON.stringify(trial) === before) continue;
    applied.push(label);
    const r = await testDesign(trial);
    if (r.passes >= 2) { best = trial; break; }
    if (r.passes >= 1 && !best) best = clone(trial);
  }
  btn.disabled = false; btn.textContent = 'Fix it';
  if (!best) { toast('Couldn’t find a fix that keeps this look — try a simpler style or a shorter link'); return; }
  state = best;
  sync(); render();
  toast('Fixed: ' + applied.join(', '));
}

// ------------------------------------------------------------------
// UI builders
// ------------------------------------------------------------------
function colorBlock(container, key) {
  const c = () => state[key];
  container.innerHTML = '';

  const seg = document.createElement('div');
  seg.className = 'seg mini';
  ['solid', 'gradient'].forEach((m) => {
    const b = document.createElement('button');
    b.textContent = m === 'solid' ? 'Solid' : 'Gradient';
    b.dataset.val = m;
    b.onclick = () => { c().mode = m; sync(); render(); };
    seg.append(b);
  });

  const colors = document.createElement('div');
  colors.className = 'colors';
  const mkSwatch = (prop) => {
    const wrap = document.createElement('label'); wrap.className = 'swatch';
    const inp = document.createElement('input'); inp.type = 'color';
    wrap.append(inp);
    const hex = document.createElement('input'); hex.type = 'text'; hex.className = 'hex'; hex.spellcheck = false;
    inp.oninput = () => { c()[prop] = inp.value; hex.value = inp.value; wrap.style.background = inp.value; render(); };
    hex.onchange = () => {
      let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v;
      if (/^#[\da-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((x) => x + x).join('');
      if (/^#[\da-f]{6}$/i.test(v)) { c()[prop] = v.toLowerCase(); sync(); render(); } else hex.value = c()[prop];
    };
    return { wrap, inp, hex };
  };
  const a = mkSwatch('color');
  const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
  const b = mkSwatch('color2');
  colors.append(a.wrap, a.hex, arrow, b.wrap, b.hex);

  const grad = document.createElement('div'); grad.className = 'grad-opts';
  const gtype = document.createElement('select');
  gtype.innerHTML = '<option value="linear">Linear</option><option value="radial">Radial</option>';
  gtype.onchange = () => { c().gradType = gtype.value; sync(); render(); };
  const rot = document.createElement('input'); rot.type = 'range'; rot.min = 0; rot.max = 360; rot.step = 5;
  const deg = document.createElement('span'); deg.className = 'deg';
  rot.oninput = () => { c().rotation = +rot.value; deg.textContent = rot.value + '°'; render(); };
  grad.append(gtype, rot, deg);

  container.append(seg, colors, grad);

  container._sync = () => {
    const v = c();
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.val === v.mode));
    a.inp.value = v.color; a.hex.value = v.color; a.wrap.style.background = v.color;
    b.inp.value = v.color2; b.hex.value = v.color2; b.wrap.style.background = v.color2;
    const g = v.mode === 'gradient';
    arrow.hidden = !g; b.wrap.hidden = !g; b.hex.hidden = !g; grad.hidden = !g;
    gtype.value = v.gradType; rot.value = v.rotation; deg.textContent = v.rotation + '°';
    rot.disabled = v.gradType === 'radial'; deg.style.opacity = rot.disabled ? 0.4 : 1;
    if (key === 'background') container.style.display = v.transparent ? 'none' : '';
  };
}

async function thumb(opts, crop) {
  const q = new QRCodeStyling(opts);
  const blob = await q.getRawData('png');
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  if (crop) {
    c.width = c.height = crop.size;
    c.getContext('2d').drawImage(bmp, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
  } else {
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
  }
  return c;
}

const THUMB_BASE = {
  width: 120, height: 120, margin: 4, data: 'COOL Code', type: 'canvas',
  qrOptions: { errorCorrectionLevel: 'L' },
  backgroundOptions: { color: '#ffffff' },
  dotsOptions: { type: 'square', color: '#1f2937' },
  cornersSquareOptions: { type: 'square', color: '#1f2937' },
  cornersDotOptions: { type: 'square', color: '#1f2937' },
};

async function buildChips(containerId, types, group) {
  const root = $(containerId);
  root.innerHTML = '';
  for (const [val, label] of types) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.val = val;
    chip.title = label;
    const opts = clone(THUMB_BASE);
    let crop = null;
    if (group === 'dots') {
      opts.dotsOptions.type = val;
    } else {
      // Show only a top-left finder pattern for corner styles
      opts.width = opts.height = 200;
      opts.dotsOptions.color = '#d1d5db';
      if (group === 'cornersSquare') { opts.cornersSquareOptions.type = val; opts.cornersDotOptions.color = '#9ca3af'; }
      else { opts.cornersDotOptions.type = val; opts.cornersSquareOptions.color = '#d1d5db'; opts.cornersDotOptions.color = '#1f2937'; }
      crop = { x: 0, y: 0, size: 72 };
    }
    chip.append(await thumb(opts, crop));
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label;
    chip.append(l);
    chip.onclick = () => { state[group].type = val; sync(); render(); };
    root.append(chip);
  }
  sync();
}

async function buildPresets() {
  const root = $('presets');
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset';
    const s = deepMerge(DEFAULTS, p.s);
    const opts = buildOptions({ ...s, data: 'COOL Code', ecl: 'L', margin: 6 }, 110);
    btn.append(await thumb(opts));
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = p.name;
    btn.append(l);
    btn.onclick = () => applyPreset(p);
    root.append(btn);
  }
}

function applyPreset(p) {
  const keep = { data: state.data, logo: state.logo, logoSize: state.logoSize, logoMargin: state.logoMargin, hideDots: state.hideDots, ecl: state.ecl, margin: state.margin, trackOn: state.trackOn, track: state.track, logoBacking: state.logoBacking, backingColor: state.backingColor };
  state = deepMerge(deepMerge(DEFAULTS, p.s), keep);
  sync(); render();
}

// ------------------------------------------------------------------
// Sync state -> controls
// ------------------------------------------------------------------
function sync() {
  $('data').value !== state.data && ($('data').value = state.data);
  document.querySelectorAll('[data-bind="shape"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === state.shape));
  $('bgRound').value = state.bgRound;
  $('bgTransparent').checked = state.background.transparent;
  $('ecl').value = state.ecl;
  $('margin').value = state.margin; $('marginVal').textContent = state.margin + 'px';
  $('logoSize').value = state.logoSize; $('logoSizeVal').textContent = Math.round(state.logoSize * 100) + '%';
  $('logoMargin').value = state.logoMargin; $('logoMarginVal').textContent = state.logoMargin + 'px';
  $('hideDots').checked = state.hideDots;
  for (const [id, group] of [['dotStyles', 'dots'], ['cornerSquareStyles', 'cornersSquare'], ['cornerDotStyles', 'cornersDot']]) {
    $(id).querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.val === state[group].type));
  }
  document.querySelectorAll('.colorblock').forEach((cb) => cb._sync && cb._sync());
  // logo
  const has = !!state.logo;
  $('logoThumb').hidden = !has; if (has) $('logoThumb').src = state.logo;
  $('dropText').innerHTML = has ? 'Replace logo<br /><small>drop or click</small>' : 'Drop an image here or <u>choose a file</u><br /><small>PNG, JPG, SVG, WebP</small>';
  $('logoRemove').hidden = !has;
  document.querySelectorAll('[data-bind="logoBacking"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === state.logoBacking));
  $('backingColorRow').hidden = state.logoBacking === 'none';
  $('backingColor').value = state.backingColor;
  $('backingColorRow').querySelector('.swatch').style.background = state.backingColor;
  renderLibrarySelection();
  syncTracking();
}

// ------------------------------------------------------------------
// Scan tracking (design side)
// ------------------------------------------------------------------
function normalizeUrl(v) {
  v = (v || '').trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

function syncTracking() {
  const on = state.trackOn, t = state.track;
  $('trackToggle').checked = on;
  $('trackBox').hidden = !on;
  $('trackNew').hidden = !!t;
  $('trackActive').hidden = !t;
  $('linkHint').textContent = on
    ? 'This is where people land after scanning.'
    : 'Any URL or text works. Shorter links make simpler, easier‑to‑scan codes.';
  $('data').placeholder = on ? 'Destination — https://your-link.com' : 'https://your-link.com';
  if (t) {
    $('trackLabel').textContent = (t.name ? t.name + ' · ' : '') + t.short_url.replace(/^https?:\/\//, '').replace(/^([^.]+)\.supabase\.co\/functions\/v1/, '…');
    $('trackLabel').title = t.short_url;
    const dest = normalizeUrl(state.data);
    const changed = !!dest && dest !== t.target_url;
    $('btnUpdateDest').hidden = !changed;
    $('trackHint').textContent = changed
      ? 'Destination changed — save it so your printed code sends people to the new link.'
      : 'The code stays the same even if you change where it goes later.';
  }
}

function trackError(msg) {
  $('trackError').hidden = !msg;
  $('trackError').textContent = msg || '';
}

async function createTracking() {
  trackError('');
  const dest = normalizeUrl(state.data);
  if (!dest) { trackError('Enter a full web link (https://…) to track scans.'); return; }
  if (!window.qrApi?.api) { trackError('Scan tracking works in the installed COOL Code app.'); return; }
  const btn = $('btnCreateTrack');
  btn.disabled = true; btn.textContent = 'Creating…';
  const res = await window.qrApi.api({ action: 'create', target_url: dest, name: $('trackName').value.trim() || null });
  btn.disabled = false; btn.textContent = 'Create tracking link';
  if (res.error) { trackError(res.error); return; }
  state.data = dest;
  state.track = pickTrack(res.link);
  $('trackName').value = '';
  sync(); render();
  toast('Tracking link created — every scan will be counted');
  if (typeof refreshLinks === 'function') refreshLinks();
}

function pickTrack(l) {
  return { id: l.id, slug: l.slug, short_url: l.short_url, target_url: l.target_url, name: l.name || '' };
}

async function updateDestination() {
  trackError('');
  const dest = normalizeUrl(state.data);
  if (!dest) { trackError('Enter a full web link (https://…).'); return; }
  const res = await window.qrApi.api({ action: 'update', id: state.track.id, target_url: dest });
  if (res.error) { trackError(res.error); return; }
  state.track = pickTrack(res.link);
  state.data = res.link.target_url;
  sync(); saveLast();
  toast('Destination updated — your existing codes now go there');
  if (typeof refreshLinks === 'function') refreshLinks();
}

// Called from the Scans view to load a tracked link into the designer
function useTrackedLink(link) {
  state.track = pickTrack(link);
  state.trackOn = true;
  state.data = link.target_url;
  sync(); render();
}

// ------------------------------------------------------------------
// Logo library
// ------------------------------------------------------------------
let logoLibrary = [];

async function loadLibrary() {
  if (!window.qrApi?.logos) return;
  logoLibrary = await window.qrApi.logos.list();
  renderLibrary();
}

function renderLibrary() {
  const root = $('logoLibrary');
  root.innerHTML = '';
  if (!logoLibrary.length) {
    root.innerHTML = '<span class="empty-lib">Logos you add will appear here.</span>';
    return;
  }
  for (const l of logoLibrary) {
    const b = document.createElement('div');
    b.className = 'lib-item';
    b.title = l.name;
    b.dataset.id = l.id;
    const img = document.createElement('img'); img.src = l.dataUrl; img.alt = l.name;
    const x = document.createElement('button'); x.className = 'lib-x'; x.textContent = '×'; x.title = 'Remove from My logos';
    x.onclick = async (e) => {
      e.stopPropagation();
      logoLibrary = await window.qrApi.logos.remove(l.id);
      renderLibrary();
    };
    b.onclick = () => applyLogo(l.dataUrl, false);
    b.append(img, x);
    root.append(b);
  }
  renderLibrarySelection();
}

function renderLibrarySelection() {
  document.querySelectorAll('.lib-item').forEach((el) => {
    const l = logoLibrary.find((x) => x.id === el.dataset.id);
    el.classList.toggle('on', !!l && l.dataUrl === state.logo);
  });
}

// ------------------------------------------------------------------
// Logo handling
// ------------------------------------------------------------------
function readLogo(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Please choose an image file'); return; }
  const r = new FileReader();
  r.onload = async () => {
    let url = r.result;
    // Keep big photos manageable: scale raster logos down to 1024px (SVGs stay vector)
    if (!file.type.includes('svg')) {
      try {
        const img = await loadImage(url);
        const max = 1024, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        if (k < 1 || file.size > 600 * 1024) {
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          url = c.toDataURL('image/png');
        }
      } catch (e) { toast(e.message); return; }
    }
    applyLogo(url, true, file.name.replace(/\.[^.]+$/, ''));
  };
  r.readAsDataURL(file);
}

async function applyLogo(url, saveToLibrary, name) {
  state.logo = url;
  if (state.ecl !== 'H') { state.ecl = 'H'; toast('Error correction set to High so your logo stays scannable'); }
  sync(); render();
  if (saveToLibrary && window.qrApi?.logos) {
    logoLibrary = await window.qrApi.logos.add(url, name);
    renderLibrary();
  }
}

// ------------------------------------------------------------------
// Export
// ------------------------------------------------------------------
function baseName() {
  try { return new URL(state.data).hostname.replace(/^www\./, '') + '-qr'; }
  catch { return (state.data.replace(/[^\w-]+/g, '-').slice(0, 30) || 'qr') + '-qr'; }
}

const PRINT_DPI = 300;

// Reads the Format dropdown: "png-clear" => { ext: 'png', clear: true }
function exportChoice() {
  const [ext, mod] = $('exportFormat').value.split('-');
  return { ext, clear: mod === 'clear' };
}

function exportSize() {
  if ($('exportSize').value !== 'custom') return +$('exportSize').value;
  const v = Math.round(+$('customSize').value || 0);
  return Math.min(10000, Math.max(256, v));
}

function updateExportUi() {
  const { ext, clear } = exportChoice();
  const size = exportSize();
  $('customSizeLabel').hidden = $('exportSize').value !== 'custom';
  $('sizeLabel').style.opacity = ext === 'svg' ? 0.5 : 1;
  const inches = (size / PRINT_DPI).toFixed(1);
  let hint;
  if (ext === 'svg') hint = 'SVG is vector — it stays razor-sharp at any size, ideal for print shops and design apps.';
  else if (ext === 'jpeg') hint = `${size}×${size} px · ${inches}″ at ${PRINT_DPI} DPI · JPEG can’t be transparent, so it always has a background.`;
  else hint = `${size}×${size} px · prints ${inches}″ wide at ${PRINT_DPI} DPI`;
  if (clear) hint += ' · Background removed — only the code (and your logo) are kept.';
  $('exportHint').textContent = hint;
}

async function renderBlob(ext, size, clear = false) {
  await ensureLogo(state);
  const opts = buildOptions(state, size, {
    type: ext === 'svg' ? 'svg' : 'canvas',
    forceOpaque: ext === 'jpeg',
    forceTransparent: clear && ext !== 'jpeg',
  });
  const q = new QRCodeStyling(opts);
  let blob = await q.getRawData(ext);
  if (ext === 'png') blob = await setPngDpi(blob, PRINT_DPI);
  return blob;
}

// ---- PNG DPI metadata (pHYs chunk) so print apps size the image correctly ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function setPngDpi(blob, dpi) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Insert right after IHDR (8-byte signature + 25-byte IHDR chunk), dropping any existing pHYs
  const out = [src.subarray(0, 33), chunk];
  let p = 33;
  while (p < src.length) {
    const len = new DataView(src.buffer, src.byteOffset + p).getUint32(0);
    const type = String.fromCharCode(...src.subarray(p + 4, p + 8));
    const end = p + 12 + len;
    if (type !== 'pHYs') out.push(src.subarray(p, end));
    p = end;
  }
  return new Blob(out, { type: 'image/png' });
}

async function doExport() {
  const { ext, clear } = exportChoice();
  const size = exportSize();
  const btn = $('btnExport');
  btn.disabled = true; btn.textContent = 'Rendering…';
  try {
    const blob = await renderBlob(ext, size, clear);
    const buf = await blob.arrayBuffer();
    const suffix = ext === 'svg' ? '' : `-${size}px`;
    const name = `${baseName()}${suffix}${clear ? '-transparent' : ''}.${ext === 'jpeg' ? 'jpg' : ext}`;
    if (window.qrApi) {
      const res = await window.qrApi.save(buf, name, ext);
      if (res.ok) toast('Saved ' + res.filePath.split(/[\\/]/).pop(), { label: 'Show', fn: () => window.qrApi.reveal(res.filePath) });
    } else {
      browserDownload(blob, name);
    }
  } catch (e) { toast('Export failed: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Export'; }
}

async function doCopy() {
  try {
    const blob = await renderBlob('png', Math.min(exportSize(), 4096), exportChoice().clear);
    if (window.qrApi) await window.qrApi.copy(await blob.arrayBuffer());
    else await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied to clipboard');
  } catch (e) { toast('Copy failed: ' + e.message); }
}

function saveExportPrefs() {
  try {
    localStorage.setItem('coolcode:export', JSON.stringify({
      format: $('exportFormat').value, size: $('exportSize').value, custom: $('customSize').value,
    }));
  } catch { /* ignore */ }
}
function loadExportPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('coolcode:export') || 'null');
    if (!p) return;
    if ([...$('exportFormat').options].some((o) => o.value === p.format)) $('exportFormat').value = p.format;
    if ([...$('exportSize').options].some((o) => o.value === p.size)) $('exportSize').value = p.size;
    if (p.custom) $('customSize').value = p.custom;
  } catch { /* ignore */ }
}

function browserDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function saveDesign() {
  const json = JSON.stringify({ app: 'cool-code', version: 1, design: state }, null, 2);
  const buf = new TextEncoder().encode(json).buffer;
  const name = baseName() + '-design.json';
  if (window.qrApi) {
    const res = await window.qrApi.save(buf, name, 'json');
    if (res.ok) toast('Design saved');
  } else browserDownload(new Blob([json], { type: 'application/json' }), name);
}

async function loadDesign() {
  if (!window.qrApi) return;
  const txt = await window.qrApi.openDesign();
  if (!txt) return;
  try {
    const parsed = JSON.parse(txt);
    state = deepMerge(DEFAULTS, parsed.design || parsed);
    sync(); render(); toast('Design loaded');
  } catch { toast('That file isn’t a COOL Code design'); }
}

function surprise() {
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 30 + Math.floor(Math.random() * 90)) % 360;
  const hsl = (hh, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)][0];
  const dark = hsl(h, 70, 25), dark2 = hsl(h2, 75, 38);
  const grad = Math.random() > 0.4;
  state = deepMerge(state, {
    dots: { type: pick(DOT_TYPES), mode: grad ? 'gradient' : 'solid', color: dark, color2: dark2, gradType: Math.random() > 0.5 ? 'linear' : 'radial', rotation: Math.floor(Math.random() * 8) * 45 },
    cornersSquare: { type: pick(CORNER_SQUARE_TYPES), mode: 'solid', color: dark },
    cornersDot: { type: pick(CORNER_DOT_TYPES), mode: 'solid', color: grad ? dark2 : dark },
    background: { mode: 'solid', color: hsl(h, 60, 97), transparent: false },
  });
  sync(); render();
}

// ------------------------------------------------------------------
// Wire up
// ------------------------------------------------------------------
function wire() {
  $('data').addEventListener('input', (e) => { state.data = e.target.value; syncTracking(); render(); });
  document.querySelectorAll('[data-bind="shape"] button').forEach((b) => b.onclick = () => { state.shape = b.dataset.val; sync(); render(); });
  $('bgRound').oninput = (e) => { state.bgRound = +e.target.value; render(); };
  $('bgTransparent').onchange = (e) => { state.background.transparent = e.target.checked; sync(); render(); };
  $('ecl').onchange = (e) => { state.ecl = e.target.value; render(); };
  $('margin').oninput = (e) => { state.margin = +e.target.value; $('marginVal').textContent = state.margin + 'px'; render(); };
  $('logoSize').oninput = (e) => { state.logoSize = +e.target.value; $('logoSizeVal').textContent = Math.round(state.logoSize * 100) + '%'; render(); };
  $('logoMargin').oninput = (e) => { state.logoMargin = +e.target.value; $('logoMarginVal').textContent = state.logoMargin + 'px'; render(); };
  $('hideDots').onchange = (e) => { state.hideDots = e.target.checked; render(); };

  const drop = $('drop');
  drop.onclick = () => $('logoFile').click();
  $('logoFile').onchange = (e) => { readLogo(e.target.files[0]); e.target.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); readLogo(e.dataTransfer.files[0]); };
  // Prevent the window navigating if an image is dropped elsewhere
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  $('logoRemove').onclick = () => { state.logo = null; sync(); render(); };
  document.querySelectorAll('[data-bind="logoBacking"] button').forEach((b) => b.onclick = () => {
    state.logoBacking = b.dataset.val; sync(); render();
  });
  $('backingColor').oninput = (e) => { state.backingColor = e.target.value; sync(); render(); };

  // Tracking
  $('trackToggle').onchange = (e) => { state.trackOn = e.target.checked; trackError(''); sync(); render(); };
  $('btnCreateTrack').onclick = createTracking;
  $('trackName').addEventListener('keydown', (e) => { if (e.key === 'Enter') createTracking(); });
  $('btnUpdateDest').onclick = updateDestination;
  $('btnCopyShort').onclick = async () => {
    try { await navigator.clipboard.writeText(state.track.short_url); toast('Tracking link copied'); }
    catch { toast(state.track.short_url); }
  };
  $('btnDetach').onclick = () => { state.track = null; trackError(''); sync(); render(); };
  $('btnViewScans').onclick = () => { if (typeof showView === 'function') showView('scans', state.track?.id); };

  $('btnExport').onclick = doExport;
  $('btnFix').onclick = autoFix;
  for (const id of ['exportFormat', 'exportSize', 'customSize']) {
    $(id).addEventListener('input', () => { updateExportUi(); saveExportPrefs(); });
  }
  loadExportPrefs();
  updateExportUi();
  $('btnCopy').onclick = doCopy;
  $('btnSaveDesign').onclick = saveDesign;
  $('btnLoadDesign').onclick = loadDesign;
  $('btnLoadDesign').hidden = !window.qrApi;
  $('btnRandom').onclick = surprise;
  $('btnReset').onclick = () => { state = { ...clone(DEFAULTS), data: state.data, trackOn: state.trackOn, track: state.track }; sync(); render(); };
  loadLibrary();

  // Paste an image from the clipboard as the logo
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { readLogo(item.getAsFile()); e.preventDefault(); }
  });

  // Cmd/Ctrl+S exports
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doExport(); }
  });
}

(async function init() {
  document.querySelectorAll('.colorblock').forEach((cb) => colorBlock(cb, cb.dataset.target));
  wire();
  sync();
  render();
  await Promise.all([
    buildChips('dotStyles', DOT_TYPES, 'dots'),
    buildChips('cornerSquareStyles', CORNER_SQUARE_TYPES, 'cornersSquare'),
    buildChips('cornerDotStyles', CORNER_DOT_TYPES, 'cornersDot'),
    buildPresets(),
  ]);
})();
