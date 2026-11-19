// Scrapbook print maker
// Turns any number of photos into print sheets with 4 photos each (2x2 grid).

const APP_VERSION = '1.2.0';

const DPI = 300;
const COLS = 2;
const ROWS = 2;
const PER_SHEET = COLS * ROWS;
const PREVIEW_W = 600;          // preview canvas width in pixels
const JPEG_QUALITY = 0.92;
const HOLD_MS = 350;            // press-and-hold time before a drag starts
const MOVE_SLOP = 8;            // pixels a finger can wobble and still count as a tap

// Print sizes sold by the big photo counters. Inches, portrait.
const PRINT_SIZES = {
  '4x6': { w: 4, h: 6 },
  '5x7': { w: 5, h: 7 },
  '8x10': { w: 8, h: 10 },
};

const LOOK_FILTERS = { bw: 'grayscale(1)', sepia: 'sepia(1)' };

// ---------- Settings (remembered between visits) ----------

const SETTINGS_KEY = 'scrapbook-prep-settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mode: state.mode, cutLines: state.cutLines, size: state.size,
    }));
  } catch { /* private mode or storage blocked: just don't remember */ }
}

const saved = loadSettings();
const state = {
  items: [],          // { id, file, dx, dy, look, shape } in the order picked
  mode: saved.mode === 'fit' ? 'fit' : 'fill',
  cutLines: saved.cutLines !== false,
  size: PRINT_SIZES[saved.size] ? saved.size : '4x6',
  selectedId: null,
};
let nextId = 1;

const $ = (id) => document.getElementById(id);
const picker = $('picker');
const sheetsEl = $('sheets');
const statusEl = $('status');

const itemById = (id) => state.items.find((it) => it.id === id);
const fmtIn = (n) => String(n).replace('.5', '½');

function photoSizeText(size = state.size) {
  const s = PRINT_SIZES[size];
  return `${fmtIn(s.w / COLS)}×${fmtIn(s.h / ROWS)}`;
}
function printSizeText(size = state.size) {
  const s = PRINT_SIZES[size];
  return `${s.w}×${s.h}`;
}

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

function sheetPx(scale) {
  const s = PRINT_SIZES[state.size];
  return { W: Math.round(s.w * DPI * scale), H: Math.round(s.h * DPI * scale) };
}
const previewScale = () => PREVIEW_W / (PRINT_SIZES[state.size].w * DPI);

function spotRect(i, W, H) {
  const w = W / COLS, h = H / ROWS;
  return { x: (i % COLS) * w, y: Math.floor(i / COLS) * h, w, h };
}

// How a photo sits in a w×h spot. If the photo's shape doesn't match the spot
// (wide photo, tall spot), it's turned sideways so it uses the space well.
// slackX/slackY is how far it can slide each way before showing white.
function photoLayout(img, w, h, mode) {
  const rotate = (img.width > img.height) !== (w > h) && img.width !== img.height;
  const boxW = rotate ? h : w;
  const boxH = rotate ? w : h;
  const scale = mode === 'fit'
    ? Math.min(boxW / img.width, boxH / img.height)
    : Math.max(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const visW = rotate ? dh : dw;
  const visH = rotate ? dw : dh;
  return {
    rotate, dw, dh, visW, visH,
    slackX: Math.max(0, (visW - w) / 2),
    slackY: Math.max(0, (visH - h) / 2),
  };
}

function shapePath(ctx, x, y, w, h, shape) {
  ctx.beginPath();
  if (shape === 'circle') {
    // A little smaller than the spot so the cutter blade doesn't nick it.
    ctx.arc(x + w / 2, y + h / 2, (Math.min(w, h) / 2) * 0.96, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    const r = Math.min(w, h) * 0.12;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

// Browsers without canvas filters get black & white / sepia done by hand.
const hasCanvasFilter = 'filter' in (document.createElement('canvas').getContext('2d') || {});
const lookCache = new WeakMap(); // image -> { bw, sepia }

function lookImage(img, look) {
  if (look === 'color' || hasCanvasFilter) return img;
  let entry = lookCache.get(img);
  if (!entry) { entry = {}; lookCache.set(img, entry); }
  if (entry[look]) return entry[look];
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    if (look === 'bw') {
      p[i] = p[i + 1] = p[i + 2] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    } else {
      p[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
      p[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
      p[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
    }
  }
  cx.putImageData(data, 0, 0);
  entry[look] = c;
  return c;
}

function drawPhoto(ctx, img, rect, item) {
  const { x, y, w, h } = rect;
  const L = photoLayout(img, w, h, state.mode);
  const fill = state.mode === 'fill';
  const ox = fill ? item.dx * L.slackX : 0;
  const oy = fill ? item.dy * L.slackY : 0;

  // The shape follows the visible part of the photo (the whole spot in Fill).
  const vw = Math.min(w, L.visW), vh = Math.min(h, L.visH);
  ctx.save();
  shapePath(ctx, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh, item.shape);
  ctx.clip();
  ctx.translate(x + w / 2 + ox, y + h / 2 + oy);
  if (L.rotate) ctx.rotate(Math.PI / 2);
  if (item.look !== 'color' && hasCanvasFilter) ctx.filter = LOOK_FILTERS[item.look];
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lookImage(img, item.look), -L.dw / 2, -L.dh / 2, L.dw, L.dh);
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

// Render one sheet. `entries` is up to 4 of { item, img } (img may be null).
function renderSheet(canvas, entries, scale) {
  const { W, H } = sheetPx(scale);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  entries.forEach(({ item, img }, i) => {
    if (img) drawPhoto(ctx, img, spotRect(i, W, H), item);
  });
  if (state.cutLines) drawCutLines(ctx, W, H);
}

// ---------- Previews ----------

const previewCache = new Map(); // item id -> Promise<ImageBitmap | { error }>
const previewReady = new Map(); // item id -> ImageBitmap (or null if it failed)
let views = [];                 // one per print: { canvas, items }
let renderToken = 0;

function previewImage(item) {
  if (!previewCache.has(item.id)) {
    previewCache.set(item.id, decode(item.file, 900).catch((e) => ({ error: e })));
  }
  return previewCache.get(item.id);
}

function sheetGroups() {
  const groups = [];
  for (let i = 0; i < state.items.length; i += PER_SHEET) {
    groups.push(state.items.slice(i, i + PER_SHEET));
  }
  return groups;
}

function drawView(view) {
  const entries = view.items.map((item) => ({ item, img: previewReady.get(item.id) || null }));
  renderSheet(view.canvas, entries, previewScale());
}

function viewFor(id) {
  return views.find((v) => v.items.some((it) => it.id === id));
}

const pendingDraw = new Set();
function scheduleDraw(view) {
  if (!view) return;
  if (!pendingDraw.size) {
    requestAnimationFrame(() => {
      pendingDraw.forEach(drawView);
      pendingDraw.clear();
    });
  }
  pendingDraw.add(view);
}

// Something about the prints changed: anything already built for sharing is stale.
function changed() {
  resetShareButton();
}

async function renderPreviews() {
  changed();
  const token = ++renderToken;
  const groups = sheetGroups();
  sheetsEl.innerHTML = '';
  document.body.classList.toggle('mode-fill', state.mode === 'fill');
  const { W, H } = sheetPx(previewScale());

  views = groups.map((items, g) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet';
    const paper = document.createElement('div');
    paper.className = 'paper';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    paper.append(canvas);
    items.forEach((item, i) => {
      const spot = document.createElement('div');
      spot.className = 'spot';
      spot.dataset.id = item.id;
      spot.tabIndex = 0;
      spot.setAttribute('role', 'button');
      spot.setAttribute('aria-label', `Photo ${g * PER_SHEET + i + 1}`);
      spot.style.left = `${(i % COLS) * (100 / COLS)}%`;
      spot.style.top = `${Math.floor(i / COLS) * (100 / ROWS)}%`;
      spot.style.width = `${100 / COLS}%`;
      spot.style.height = `${100 / ROWS}%`;
      paper.append(spot);
    });
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `Print ${g + 1} of ${groups.length}`;
    wrap.append(paper, label);
    sheetsEl.append(wrap);
    return { canvas, items };
  });
  updateSelection();

  const failed = [];
  for (const view of views) {
    drawView(view);
    for (const item of view.items) {
      const img = await previewImage(item);
      if (token !== renderToken) return; // a newer render started
      if (img && img.error) { previewReady.set(item.id, null); failed.push(item.file.name); }
      else previewReady.set(item.id, img);
    }
    drawView(view);
  }

  updateSummary(groups, failed);
}

function updateSummary(groups, failed) {
  const n = state.items.length;
  const has = n > 0;
  $('options').hidden = !has;
  $('actions').hidden = !has;
  $('drawer').hidden = !has;
  document.body.classList.toggle('has-drawer', has);
  document.body.classList.toggle('empty', !has);
  $('pick-label').textContent = has ? 'Add more photos' : 'Choose photos';
  $('subtitle').textContent = `4 photos on each ${printSizeText()} print`;

  if (!has) {
    $('count').textContent = 'Pick any number of photos. Every 4 photos make one print.';
  } else {
    const empty = groups.length * PER_SHEET - n;
    let msg = `${n} photo${n === 1 ? '' : 's'} → ${groups.length} print${groups.length === 1 ? '' : 's'}.`;
    if (empty > 0) msg += ` The last print has ${empty} empty spot${empty === 1 ? '' : 's'}.`;
    msg += ` Order them as ${printSizeText()} prints; each photo is ${photoSizeText()} in. after cutting.`;
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

// ---------- Selecting and moving photos ----------

let gesture = null;

function select(id) {
  state.selectedId = id;
  updateSelection();
}

function updateSelection() {
  sheetsEl.querySelectorAll('.spot').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.id) === state.selectedId);
  });
  updateDrawer();
}

function startDrag(g) {
  g.dragging = true;
  const item = itemById(g.id);
  g.startDx = item.dx;
  g.startDy = item.dy;
  try { g.spot.setPointerCapture(g.pointerId); } catch { /* pointer already gone */ }
}

function moveCrop(g, ddx, ddy) {
  const item = itemById(g.id);
  const img = previewReady.get(g.id);
  const view = viewFor(g.id);
  if (!item || !img || !view) return;
  const canvas = view.canvas;
  const k = canvas.width / canvas.clientWidth; // canvas pixels per screen pixel
  const L = photoLayout(img, canvas.width / COLS, canvas.height / ROWS, 'fill');
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  item.dx = L.slackX ? clamp(g.startDx + (ddx * k) / L.slackX) : 0;
  item.dy = L.slackY ? clamp(g.startDy + (ddy * k) / L.slackY) : 0;
  scheduleDraw(view);
}

sheetsEl.addEventListener('pointerdown', (e) => {
  const spot = e.target.closest('.spot');
  if (!spot || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const id = Number(spot.dataset.id);
  const wasSelected = id === state.selectedId;
  gesture = {
    id, spot, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
    wasSelected, moved: false, held: false, dragging: false, timer: null,
  };
  if (state.mode !== 'fill') return;
  if (wasSelected) {
    startDrag(gesture);
  } else {
    // Press and hold an unselected photo to select it and start dragging.
    const g = gesture;
    g.timer = setTimeout(() => {
      if (gesture !== g || g.moved) return;
      g.held = true;
      select(id);
      startDrag(g);
      if (navigator.vibrate) navigator.vibrate(15);
    }, HOLD_MS);
  }
});

sheetsEl.addEventListener('pointermove', (e) => {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  const ddx = e.clientX - g.startX;
  const ddy = e.clientY - g.startY;
  if (!g.moved && Math.hypot(ddx, ddy) > MOVE_SLOP) {
    g.moved = true;
    clearTimeout(g.timer);
  }
  if (g.dragging) moveCrop(g, ddx, ddy);
});

function endGesture(e, cancelled) {
  const g = gesture;
  if (!g || e.pointerId !== g.pointerId) return;
  clearTimeout(g.timer);
  gesture = null;
  if (cancelled || g.moved || g.held) {
    if (g.dragging) changed();
    return;
  }
  // A plain tap: select it, or tap again to unselect.
  select(g.wasSelected ? null : g.id);
}
sheetsEl.addEventListener('pointerup', (e) => endGesture(e, false));
sheetsEl.addEventListener('pointercancel', (e) => endGesture(e, true));

// While dragging a photo, don't let the page scroll.
sheetsEl.addEventListener('touchmove', (e) => {
  if (gesture && gesture.dragging && e.cancelable) e.preventDefault();
}, { passive: false });

// No long-press menu on photos (press-and-hold is for dragging).
sheetsEl.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.spot')) e.preventDefault();
});

sheetsEl.addEventListener('keydown', (e) => {
  const spot = e.target.closest('.spot');
  if (spot && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    const id = Number(spot.dataset.id);
    select(id === state.selectedId ? null : id);
  }
});

// ---------- Photo options drawer ----------

const drawer = $('drawer');
const drawerHandle = $('drawer-handle');
let drawerOpen = false;

function setDrawerOpen(open) {
  drawerOpen = open;
  drawer.style.transition = '';
  drawer.style.transform = '';
  drawer.classList.toggle('open', open);
  drawerHandle.setAttribute('aria-expanded', String(open));
}

function updateDrawer() {
  const item = itemById(state.selectedId);
  $('drawer-empty').hidden = !!item;
  $('drawer-photo').hidden = !item;
  if (!item) {
    $('drawer-title').textContent = 'Photo options';
    $('drawer-sub').textContent = 'Tap a photo on a print to edit it';
    return;
  }
  const n = state.items.indexOf(item) + 1;
  $('drawer-title').textContent = `Photo ${n} selected`;
  $('drawer-sub').textContent = state.mode === 'fill'
    ? 'Drag the photo to move it. Pull up for more.'
    : 'Pull up for color, shape, or remove';
  drawer.querySelectorAll('.chips').forEach((group) => {
    const value = item[group.dataset.setting];
    group.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
}

// Drag the handle up/down, or tap it to open/close.
let handleDrag = null;
const closedOffset = () => drawer.offsetHeight - drawerHandle.offsetHeight;

drawerHandle.addEventListener('pointerdown', (e) => {
  handleDrag = {
    pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp,
    velocity: 0, base: drawerOpen ? 0 : closedOffset(), moved: false,
  };
  try { drawerHandle.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
});

drawerHandle.addEventListener('pointermove', (e) => {
  const d = handleDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  const dy = e.clientY - d.startY;
  if (!d.moved && Math.abs(dy) < MOVE_SLOP) return;
  d.moved = true;
  const dt = Math.max(1, e.timeStamp - d.lastT);
  d.velocity = (e.clientY - d.lastY) / dt;
  d.lastY = e.clientY; d.lastT = e.timeStamp;
  const y = Math.max(0, Math.min(closedOffset(), d.base + dy));
  drawer.style.transition = 'none';
  drawer.style.transform = `translateY(${y}px)`;
});

function endHandleDrag(e) {
  const d = handleDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  handleDrag = null;
  if (!d.moved) return setDrawerOpen(!drawerOpen);
  const y = d.base + (e.clientY - d.startY);
  if (Math.abs(d.velocity) > 0.5) setDrawerOpen(d.velocity < 0);
  else setDrawerOpen(y < closedOffset() / 2);
}
drawerHandle.addEventListener('pointerup', endHandleDrag);
drawerHandle.addEventListener('pointercancel', endHandleDrag);
drawerHandle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawerOpen(!drawerOpen); }
});

drawer.querySelectorAll('.chips').forEach((group) => {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const item = itemById(state.selectedId);
    if (!b || !item) return;
    item[group.dataset.setting] = b.dataset.value;
    updateDrawer();
    scheduleDraw(viewFor(item.id));
    changed();
  });
});

$('apply-all').addEventListener('click', () => {
  const item = itemById(state.selectedId);
  if (!item) return;
  state.items.forEach((it) => { it.look = item.look; it.shape = item.shape; });
  views.forEach(scheduleDraw);
  changed();
  setStatus('Color and shape copied to every photo.');
});

$('remove-photo').addEventListener('click', () => {
  const id = state.selectedId;
  const i = state.items.findIndex((it) => it.id === id);
  if (i < 0) return;
  state.items.splice(i, 1);
  const img = previewReady.get(id);
  if (img && img.close) img.close();
  previewReady.delete(id);
  previewCache.delete(id);
  state.selectedId = null;
  setDrawerOpen(false);
  renderPreviews();
});

$('deselect').addEventListener('click', () => {
  select(null);
  setDrawerOpen(false);
});

// ---------- Full-size export ----------

async function buildFullSheets() {
  const groups = sheetGroups();
  const d = new Date(); // local date, so evening exports aren't stamped tomorrow
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const out = [];
  const canvas = document.createElement('canvas');

  for (let g = 0; g < groups.length; g++) {
    setStatus(`Making print ${g + 1} of ${groups.length}…`);
    const entries = [];
    for (const item of groups[g]) {
      let img = null;
      try { img = await decode(item.file, 3000); } catch { /* leave blank */ }
      entries.push({ item, img });
    }
    renderSheet(canvas, entries, 1);
    entries.forEach(({ img }) => img && img.close());
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    const name = `scrapbook-${state.size}-${stamp}-${String(g + 1).padStart(2, '0')}.jpg`;
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

// Why sharing won't work here, or '' if it should.
function shareProblem(files) {
  if (!window.isSecureContext) {
    return "Sharing only works when the app is opened from its https:// link (not http://).";
  }
  if (!navigator.share || !navigator.canShare) {
    return "This browser can't share photos. Open the app in Chrome instead.";
  }
  if (files && !navigator.canShare({ files })) {
    return "This browser won't share these photos. Open the app in Chrome instead.";
  }
  return '';
}

// Built prints waiting for a second tap (Android only lets a share open
// within a few seconds of a tap, and building the prints can take longer).
let readyToShare = null;
const SHARE_LABEL = 'Share to print app';

function resetShareButton() {
  readyToShare = null;
  $('share-btn').textContent = SHARE_LABEL;
}

async function openShare(files) {
  resetShareButton();
  setStatus(`Pick your print app and order ${printSizeText()} prints.`);
  await navigator.share({ files, title: 'Scrapbook prints' });
  setStatus('Done!');
}

async function shareSheets() {
  await withBusy(async () => {
    if (readyToShare) return openShare(readyToShare);

    const early = shareProblem(null);
    const files = await buildFullSheets();
    const problem = early || shareProblem(files);
    if (problem) {
      downloadAll(files);
      setStatus(`${problem} The prints were saved to your phone instead.`, true);
      return;
    }

    const stillActive = !navigator.userActivation || navigator.userActivation.isActive;
    if (stillActive) {
      try { return await openShare(files); }
      catch (e) { if (e.name !== 'NotAllowedError') throw e; }
    }
    // Took too long since the tap; ask for one more tap.
    readyToShare = files;
    $('share-btn').textContent = 'Prints ready — tap to share';
    setStatus('Your prints are ready. Tap the button again to pick your print app.');
  });
}

async function saveSheets() {
  await withBusy(async () => {
    const files = await buildFullSheets();
    downloadAll(files);
    setStatus(`Saved ${files.length} print${files.length === 1 ? '' : 's'} to your Downloads. Order them as ${printSizeText()} prints.`);
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
  picked.forEach((file) => state.items.push({
    id: nextId++, file, dx: 0, dy: 0, look: 'color', shape: 'square',
  }));
  renderPreviews();
});

function updateSegs() {
  document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
    const value = state[seg.dataset.setting];
    seg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
}

document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[seg.dataset.setting] = b.dataset.value;
    saveSettings();
    updateSegs();
    renderPreviews();
  });
});

$('cutlines').checked = state.cutLines;
$('cutlines').addEventListener('change', (e) => {
  state.cutLines = e.target.checked;
  saveSettings();
  views.forEach(scheduleDraw);
  changed();
});

$('share-btn').addEventListener('click', shareSheets);
$('save-btn').addEventListener('click', saveSheets);
$('clear-btn').addEventListener('click', () => {
  state.items = [];
  state.selectedId = null;
  previewReady.forEach((img) => img && img.close && img.close());
  previewReady.clear();
  previewCache.clear();
  setDrawerOpen(false);
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

updateSegs();
renderPreviews();
