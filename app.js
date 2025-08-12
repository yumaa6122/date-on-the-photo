// PWA v3.4: Separate X/Y margins, robust orientation defaults, JPEG 100%, first-space multiplier
const assetNames = [...Array(10).keys()].map(n => `${n}.png`).concat(['apostrophe.png']);
const IMAGES = {};
let assetsLoaded = false;

const FIRST_SPACE_MULT = 2.0; // widen only the first gap (YY -> M)

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
const marginXEl = document.getElementById('marginX');
const marginYEl = document.getElementById('marginY');
const spaceEl = document.getElementById('space');
const dlPngBtn = document.getElementById('downloadPng');
const dlJpgBtn = document.getElementById('downloadJpeg');
const boundsChk = document.getElementById('showBounds');

const scaleVal = document.getElementById('scaleVal');
const marginXVal = document.getElementById('marginXVal');
const marginYVal = document.getElementById('marginYVal');
const spaceVal = document.getElementById('spaceVal');

function updateSliderLabels() {
  const fmt = (v, digits=3) => {
    const n = Number(v);
    return (Math.round(n * 10**digits) / 10**digits).toString();
  };
  scaleVal.textContent = fmt(scaleEl.value, 3);
  marginXVal.textContent = (parseFloat(marginXEl.value) * 100).toFixed(1) + '%';
  marginYVal.textContent = (parseFloat(marginYEl.value) * 100).toFixed(1) + '%';
  //marginXVal.textContent = fmt(marginXEl.value, 0);
  //marginYVal.textContent = fmt(marginYEl.value, 0);
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

  // Orientation-based defaults with tolerance + EXIF
  const ratio = canvas.width / canvas.height;
  const TOL = 1.03;
  let orientation = (ratio >= TOL) ? 'landscape' : (ratio <= 1/TOL ? 'portrait' : 'unknown');
  if (orientation === 'unknown') {
    const exif = await readExifOrientation(file);
    if (exif === 6 || exif === 8) orientation = 'portrait';
    else if (exif === 1 || exif === 2 || exif === 3 || exif === 4) orientation = 'landscape';
  }
  if (orientation === 'landscape') {
    scaleEl.value = 0.05;   // 高さ比
    marginXEl.value = 0.065;  // 幅の20%
    marginYEl.value = 0.055;  // 高さの10%
    spaceEl.value = 0.5;
    //scaleEl.value = 0.05; 
    //marginXEl.value = 395; 
    //marginYEl.value = 265; 
    //spaceEl.value = 0.5;
  } else if (orientation === 'portrait') {
    scaleEl.value = 0.03;
    marginXEl.value = 0.107;
    marginYEl.value = 0.055;
    spaceEl.value = 0.5;
    //scaleEl.value = 0.03; 
    //marginXEl.value = 395; 
    //marginYEl.value = 265; 
    //spaceEl.value = 0.5;
  }
  updateSliderLabels();
  render();
});

[yyEl, mmEl, ddEl, scaleEl, marginXEl, marginYEl, spaceEl, boundsChk].forEach(el => {
  el.addEventListener('input', () => { updateSliderLabels(); render(); });
});

function buildGlyphSequence() {
  const yy = Math.max(0, Math.min(99, parseInt(yyEl.value || '0', 10)));
  const mm = Math.max(1, Math.min(12, parseInt(mmEl.value || '1', 10)));
  const dd = Math.max(1, Math.min(31, parseInt(ddEl.value || '1', 10)));
  const seq = ['apostrophe', String(Math.floor(yy/10)), String(yy%10), 'spaceL','spaceL'];
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
  const marginX = parseFloat(marginXEl.value);
  const marginY = parseFloat(marginYEl.value);
  const scale = parseFloat(scaleEl.value);
  const spaceRatio = parseFloat(spaceEl.value);

  const glyphH = canvas.height * scale;
  const widths = seq.map(key => {
    if (key === 'space' || key === 'spaceL') {
      const ref = IMAGES['8'];
      const base = glyphH * (ref.naturalWidth / ref.naturalHeight) * spaceRatio;
      return key === 'spaceL' ? base * FIRST_SPACE_MULT : base;
    } else {
      const img = key === 'apostrophe' ? IMAGES['apostrophe'] : IMAGES[key];
      return glyphH * (img.naturalWidth / img.naturalHeight);
    }
  });

  const totalW = widths.reduce((a,b)=>a+b,0);
  // marginX, marginY を割合(0〜1)として計算
  const xStart = canvas.width - (canvas.width * marginX) - totalW;
  const yTop = canvas.height - (canvas.height * marginY) - glyphH;
  //const xStart = canvas.width - marginX - totalW;
  //const yTop = canvas.height - marginY - glyphH;

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
    if (key === 'space' || key === 'spaceL') { x += w; continue; }
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
