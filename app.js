// Scrapbook Prep — v1
// Turns any number of photos into 4x6 print sheets with 4 photos each (2x3 in. each).

const APP_VERSION = '1.0.0';

// A 4x6 print at 300 dpi, portrait. Print services auto-rotate, so portrait is fine.
const SHEET_W = 1200;
const SHEET_H = 1800;
const COLS = 2;
const ROWS = 2;
const PER_SHEET = COLS * ROWS;
const PREVIEW_SCALE = 0.3;      // previews are drawn at 360x540
const JPEG_QUALITY = 0.92;

const state = {
  files: [],          // File objects in the order picked
  mode: 'fill',       // 'fill' (crop to fill) or 'fit' (whole photo)
  cutLines: true,
};

const $ = (id) => document.getElementById(id);
const picker = $('picker');
const sheetsEl = $('sheets');
const statusEl = $('status');

// ---------- Drawing ----------

// Decode a photo (respects the phone's rotation info automatically).
async function decode(file, maxSide) {
  const full = await createImageBitmap(file);
  if (!maxSide || Math.max(full.width, full.height) <= maxSide) return full;
  const s = maxSide / Math.max(full.width, full.height);
  const small = await createImageBitmap(full, {
    resizeWidth: Math.round(full.width * s),
    resizeHeight: Math.round(full.height * s),
    resizeQuality: 'high',
  });
  full.close();
  return small;
}

// Draw one photo into one spot. If the photo's shape doesn't match the spot
// (wide photo, tall spot), it's turned sideways so it uses the space well.
function drawPhoto(ctx, img, x, y, w, h, mode) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);

  const photoWide = img.width > img.height;
  const spotWide = w > h;
  let boxW = w, boxH = h;
  if (photoWide !== spotWide && img.width !== img.height) {
    ctx.rotate(Math.PI / 2);
    boxW = h; boxH = w;
  }

  const scale = mode === 'fit'
    ? Math.min(boxW / img.width, boxH / img.height)
    : Math.max(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawCutLines(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = Math.max(1, Math.round(W / 600));
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const x = Math.round((W * c) / COLS) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = Math.round((H * r) / ROWS) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Render one sheet onto a canvas. `images` has up to 4 decoded photos.
function renderSheet(canvas, images, scale) {
  const W = Math.round(SHEET_W * scale);
  const H = Math.round(SHEET_H * scale);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const cw = W / COLS, ch = H / ROWS;
  images.forEach((img, i) => {
    if (!img) return;
    const col = i % COLS, row = Math.floor(i / COLS);
    drawPhoto(ctx, img, col * cw, row * ch, cw, ch, state.mode);
  });
  if (state.cutLines) drawCutLines(ctx, W, H);
}

// ---------- Previews ----------

const previewCache = new Map(); // File -> small ImageBitmap
let renderToken = 0;

async function previewImage(file) {
  if (!previewCache.has(file)) {
    previewCache.set(file, decode(file, 700).catch((e) => ({ error: e })));
  }
  return previewCache.get(file);
}

function sheetGroups() {
  const groups = [];
  for (let i = 0; i < state.files.length; i += PER_SHEET) {
    groups.push(state.files.slice(i, i + PER_SHEET));
  }
  return groups;
}

async function renderPreviews() {
  const token = ++renderToken;
  const groups = sheetGroups();
  sheetsEl.innerHTML = '';
  const failed = [];

  for (let g = 0; g < groups.length; g++) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet';
    const canvas = document.createElement('canvas');
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `Print ${g + 1} of ${groups.length}`;
    wrap.append(canvas, label);
    sheetsEl.append(wrap);

    const imgs = [];
    for (const f of groups[g]) {
      const img = await previewImage(f);
      if (token !== renderToken) return; // a newer render started
      if (img && img.error) { failed.push(f.name); imgs.push(null); }
      else imgs.push(img);
    }
    renderSheet(canvas, imgs, PREVIEW_SCALE);
  }

  updateSummary(groups, failed);
}

function updateSummary(groups, failed) {
  const n = state.files.length;
  const has = n > 0;
  $('options').hidden = !has;
  $('actions').hidden = !has;
  $('pick-label').textContent = has ? 'Add more photos' : 'Choose photos';

  if (!has) {
    $('count').textContent = 'Pick any number of photos. Every 4 photos make one 4×6 print.';
  } else {
    const empty = groups.length * PER_SHEET - n;
    let msg = `${n} photo${n === 1 ? '' : 's'} → ${groups.length} print${groups.length === 1 ? '' : 's'}.`;
    if (empty > 0) msg += ` The last print has ${empty} empty spot${empty === 1 ? '' : 's'}.`;
    $('count').textContent = msg;
  }

  if (failed.length) {
    setStatus(`Couldn't open ${failed.length} photo${failed.length === 1 ? '' : 's'} (${failed.join(', ')}). They'll be left blank.`, true);
  } else {
    setStatus('');
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

// ---------- Full-size export ----------

async function buildFullSheets() {
  const groups = sheetGroups();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const out = [];
  const canvas = document.createElement('canvas');

  for (let g = 0; g < groups.length; g++) {
    setStatus(`Making print ${g + 1} of ${groups.length}…`);
    const imgs = [];
    for (const f of groups[g]) {
      try { imgs.push(await decode(f, 2400)); }
      catch { imgs.push(null); }
    }
    renderSheet(canvas, imgs, 1);
    imgs.forEach((i) => i && i.close());
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    const name = `scrapbook-${stamp}-${String(g + 1).padStart(2, '0')}.jpg`;
    out.push(new File([blob], name, { type: 'image/jpeg' }));
  }
  return out;
}

async function withBusy(fn) {
  const btns = [$('share-btn'), $('save-btn')];
  btns.forEach((b) => (b.disabled = true));
  try { await fn(); }
  catch (e) {
    if (e && e.name === 'AbortError') setStatus('');
    else { console.error(e); setStatus('Something went wrong. Please try again.', true); }
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

async function shareSheets() {
  await withBusy(async () => {
    const files = await buildFullSheets();
    if (navigator.canShare && navigator.canShare({ files })) {
      setStatus('Pick your print app (Walmart, CVS, Walgreens…)');
      await navigator.share({ files, title: 'Scrapbook prints' });
      setStatus('Done!');
    } else {
      setStatus("Sharing isn't available here, so the prints were saved instead.");
      downloadAll(files);
    }
  });
}

async function saveSheets() {
  await withBusy(async () => {
    const files = await buildFullSheets();
    downloadAll(files);
    setStatus(`Saved ${files.length} print${files.length === 1 ? '' : 's'} to your Downloads.`);
  });
}

function downloadAll(files) {
  files.forEach((file, i) => {
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, i * 400);
  });
}

// ---------- Wiring ----------

picker.addEventListener('change', () => {
  const picked = Array.from(picker.files || []);
  picker.value = '';
  if (!picked.length) return;
  state.files.push(...picked);
  renderPreviews();
});

document.querySelectorAll('.seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.seg button').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    renderPreviews();
  });
});

$('cutlines').addEventListener('change', (e) => {
  state.cutLines = e.target.checked;
  renderPreviews();
});

$('share-btn').addEventListener('click', shareSheets);
$('save-btn').addEventListener('click', saveSheets);
$('clear-btn').addEventListener('click', () => {
  state.files = [];
  previewCache.forEach((p) => p.then((img) => img && img.close && img.close()));
  previewCache.clear();
  renderPreviews();
});

// ---------- Updates (service worker) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const showBanner = (worker) => {
        $('update-banner').hidden = false;
        $('update-btn').onclick = () => worker.postMessage('skipWaiting');
      };
      if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showBanner(nw);
        });
      });
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker not registered', e);
    }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

renderPreviews();
