// PWA v3.2: 3-line sliders + robust orientation defaults + JPEG 100%
const assetNames = [...Array(10).keys()].map(n => `${n}.png`).concat(['apostrophe.png']);
const IMAGES = {};
let assetsLoaded = false;

async function loadAssets() {
  for (const name of assetNames) {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = `./assets/${name}`;
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(`Missing asset: ${name}`));
    }).catch(console.warn);
    IMAGES[name.replace('.png','')] = img;
  }
  assetsLoaded = true;
}

// --- EXIF Orientation (0x0112) parser for JPEG (subset) ---
async function readExifOrientation(file) {
  try {
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    let offset = 0;
    if (view.getUint16(offset) !== 0xFFD8) return null; // SOI
    offset += 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset); offset += 2;
      if (marker === 0xFFE1) { // APP1
        const size = view.getUint16(offset);
        const exifStart = offset + 2;
        offset += size;
        if (exifStart + 6 > view.byteLength) break;
        const exifId = String.fromCharCode(
          view.getUint8(exifStart), view.getUint8(exifStart+1), view.getUint8(exifStart+2),
          view.getUint8(exifStart+3), view.getUint8(exifStart+4), view.getUint8(exifStart+5)
        );
        if (exifId !== 'Exif\0\0') continue;
        let tiff = exifStart + 6;
        const endian = view.getUint16(tiff);
        const little = endian === 0x4949;
        const get16 = (o) => little ? view.getUint16(o, true) : view.getUint16(o, false);
        const get32 = (o) => little ? view.getUint32(o, true) : view.getUint32(o, false);
        if (get16(tiff + 2) !== 0x002A) return null;
        const ifd0 = tiff + get32(tiff + 4);
        const count = get16(ifd0);
        let base = ifd0 + 2;
        for (let i = 0; i < count; i++) {
          const entry = base + i*12;
          const tag = get16(entry);
          if (tag === 0x0112) return get16(entry + 8); // Orientation
        }
        return null;
      } else if (marker === 0xFFDA) { break; }
      else { const size = view.getUint16(offset); offset += size; }
    }
    return null;
  } catch { return null; }
}

// UI
const fileInput = document.getElementById('file');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const yyEl = document.getElementById('yy');
const mmEl = document.getElementById('mm');
const ddEl = document.getElementById('dd');
const scaleEl = document.getElementById('scale');
const marginEl = document.getElementById('margin');
const spaceEl = document.getElementById('space');
const dlPngBtn = document.getElementById('downloadPng');
const dlJpgBtn = document.getElementById('downloadJpeg');
const boundsChk = document.getElementById('showBounds');

const scaleVal = document.getElementById('scaleVal');
const marginVal = document.getElementById('marginVal');
const spaceVal = document.getElementById('spaceVal');

function updateSliderLabels() {
  const fmt = (v, digits=3) => {
    const n = Number(v);
    return (Math.round(n * 10**digits) / 10**digits).toString();
  };
  scaleVal.textContent = fmt(scaleEl.value, 3);
  marginVal.textContent = fmt(marginEl.value, 0);
  spaceVal.textContent = fmt(spaceEl.value, 2);
}

let photo = null;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener('change', async (e) => {
  if (!e.target.files?.[0]) return;
  const file = e.target.files[0];
  photo = await readImage(file);
  canvas.width = photo.naturalWidth || photo.width;
  canvas.height = photo.naturalHeight || photo.height;

  const ratio = canvas.width / canvas.height;
  const TOL = 1.03;
  let orientation = (ratio >= TOL) ? 'landscape' : (ratio <= 1/TOL ? 'portrait' : 'unknown');
  if (orientation === 'unknown') {
    const exif = await readExifOrientation(file);
    if (exif === 6 || exif === 8) orientation = 'portrait';
    else if (exif === 1 || exif === 2 || exif === 3 || exif === 4) orientation = 'landscape';
  }
  if (orientation === 'landscape') { scaleEl.value = 0.05; marginEl.value = 200; spaceEl.value = 0.35; }
  else if (orientation === 'portrait') { scaleEl.value = 0.025; marginEl.value = 100; spaceEl.value = 0.35; }
  updateSliderLabels();
  render();
});

[yyEl, mmEl, ddEl, scaleEl, marginEl, spaceEl, boundsChk].forEach(el => {
  el.addEventListener('input', () => { updateSliderLabels(); render(); });
});

function buildGlyphSequence() {
  const yy = Math.max(0, Math.min(99, parseInt(yyEl.value || '0', 10)));
  const mm = Math.max(1, Math.min(12, parseInt(mmEl.value || '1', 10)));
  const dd = Math.max(1, Math.min(31, parseInt(ddEl.value || '1', 10)));
  const seq = ['apostrophe', String(Math.floor(yy/10)), String(yy%10), 'space','space'];
  String(mm).split('').forEach(ch => seq.push(ch));
  seq.push('space','space');
  String(dd).padStart(2,'0').split('').forEach(ch => seq.push(ch));
  return seq;
}

function render() {
  if (!photo || !assetsLoaded) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

  const seq = buildGlyphSequence();
  const margin = parseFloat(marginEl.value);
  const scale = parseFloat(scaleEl.value);
  const spaceRatio = parseFloat(spaceEl.value);

  const glyphH = canvas.height * scale;
  const widths = seq.map(key => {
    if (key === 'space') {
      const ref = IMAGES['8'];
      return glyphH * (ref.naturalWidth / ref.naturalHeight) * spaceRatio;
    } else {
      const img = key === 'apostrophe' ? IMAGES['apostrophe'] : IMAGES[key];
      return glyphH * (img.naturalWidth / img.naturalHeight);
    }
  });

  const totalW = widths.reduce((a,b)=>a+b,0);
  const xStart = canvas.width - margin - totalW;
  const yTop = canvas.height - margin - glyphH;

  if (boundsChk.checked) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xStart, yTop, totalW, glyphH);
    ctx.restore();
  }

  let x = xStart;
  for (let i = 0; i < seq.length; i++) {
    const key = seq[i];
    const w = widths[i];
    if (key === 'space') { x += w; continue; }
    const img = key === 'apostrophe' ? IMAGES['apostrophe'] : IMAGES[key];
    ctx.drawImage(img, x, yTop, w, glyphH);
    x += w;
  }
}

dlPngBtn.addEventListener('click', () => {
  if (!photo) return;
  const a = document.createElement('a');
  a.download = 'dated_image.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

dlJpgBtn.addEventListener('click', () => {
  if (!photo) return;
  const a = document.createElement('a');
  a.download = 'dated_image.jpg';
  a.href = canvas.toDataURL('image/jpeg', 1.0);
  a.click();
});

// Init
updateSliderLabels();
loadAssets().catch(console.warn);
