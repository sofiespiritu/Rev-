// REV · editor visual de videos. Sin dependencias ni paso de compilación.
import { readZip, writeZip } from './zip.js';
import { normalize, uid, clone, clamp, newElement, sceneStarts, totalDuration, sceneAt, ANIM_IN, ANIM_LOOP, EASINGS } from './model.js';
import { drawScene, elementRange, SAFE_FONTS } from './render.js';

const $ = (s, r = document) => r.querySelector(s);
const te = new TextEncoder();
const PREVIEW_SCALE = 0.5;

const S = {
  project: null, files: null, fileName: 'proyecto.zip',
  sceneIdx: 0, selEl: null, t: 0, playing: false, tab: 'escenas', dirty: false,
  showSafe: true, lockAspect: true, boxes: {}, syncs: [],
};
window.__REV = S; // para pruebas automáticas

/* ---------------------------------------------------------------- utilidades */
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }
function banner(msg, err = false) { const b = $('#banner'); if (!msg) { b.hidden = true; return; } b.textContent = msg; b.className = 'banner' + (err ? ' err' : ''); b.hidden = false; }
const fmtTime = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const extOf = (p) => (p.split('.').pop() || '').toLowerCase();

function markDirty() { S.dirty = true; $('#dirtyDot').hidden = false; scheduleAutosave(); }

/* ---------------------------------------------------------------- recursos */
const cache = { img: new Map(), vid: new Map(), aud: new Map(), url: new Map() };
function assetUrl(id) {
  const a = S.project.assets[id]; if (!a) return null;
  const data = S.files.get(a.path); if (!data) return null;
  const key = a.path + ':' + data.length;
  let u = cache.url.get(key);
  if (!u) { u = URL.createObjectURL(new Blob([data], { type: MIME[extOf(a.path)] || 'application/octet-stream' })); cache.url.set(key, u); }
  return u;
}
const env = {
  image(id) {
    if (!id || !S.project.assets[id]) return null;
    const a = S.project.assets[id]; const url = assetUrl(id); if (!url) return null;
    let c = cache.img.get(id);
    if (!c || c.url !== url) { const img = new Image(); img.onload = () => render(); img.src = url; c = { url, img }; cache.img.set(id, c); }
    return c.img;
  },
  video(elId) {
    const found = findElement(elId); if (!found) return null;
    const url = assetUrl(found.el.asset); if (!url) return null;
    let c = cache.vid.get(elId);
    if (!c || c.url !== url) {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = false;
      v.addEventListener('loadeddata', () => render()); v.addEventListener('seeked', () => render()); v.src = url;
      c = { url, v }; cache.vid.set(elId, c);
    }
    return c.v;
  },
};
function findElement(id) { for (const s of S.project.scenes) { const el = s.elements.find((e) => e.id === id); if (el) return { scene: s, el }; } return null; }
const curScene = () => S.project.scenes[S.sceneIdx];
const curEl = () => (S.selEl ? curScene().elements.find((e) => e.id === S.selEl) : null);

async function loadFonts() {
  for (const [id, a] of Object.entries(S.project.assets)) {
    if (a.type !== 'font' || !a.family) continue;
    const data = S.files.get(a.path); if (!data) continue;
    try { const ff = new FontFace(a.family, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), { weight: a.weight || '100 900' }); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('fuente', id, e); }
  }
}
const fontOptions = () => [...new Set([...Object.values(S.project.assets).filter((a) => a.type === 'font' && a.family).map((a) => a.family), ...SAFE_FONTS])];

function uniquePath(dir, name) {
  name = name.replace(/[^\w.\-]+/g, '_');
  let p = `assets/${dir}/${name}`, n = 1;
  while (S.files.has(p)) { const dot = name.lastIndexOf('.'); p = `assets/${dir}/${dot > 0 ? name.slice(0, dot) + '_' + n + name.slice(dot) : name + '_' + n}`; n++; }
  return p;
}
function kindOfFile(f) {
  const e = extOf(f.name);
  if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) return 'image';
  if (f.type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm'].includes(e)) return 'video';
  if (f.type.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'wav', 'ogg'].includes(e)) return 'audio';
  return null;
}
async function addAssetFromFile(file, expect) {
  const kind = kindOfFile(file);
  if (!kind || (expect && kind !== expect)) { toast(`Ese archivo no es ${expect === 'image' ? 'una imagen' : expect === 'video' ? 'un video' : expect === 'audio' ? 'un audio' : 'compatible'}.`); return null; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = uniquePath(kind === 'image' ? 'images' : kind === 'video' ? 'video' : 'audio', file.name);
  S.files.set(path, bytes);
  const id = uid('asset');
  S.project.assets[id] = { type: kind, path, name: file.name };
  return id;
}
function pickFile(accept) {
  return new Promise((res) => {
    const inp = $('#pickFile'); inp.value = ''; inp.accept = accept;
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}
function imageSize(id) {
  return new Promise((res) => { const u = assetUrl(id); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = u; });
}

/* ---------------------------------------------------------------- abrir / guardar */
async function openZip(file) {
  try {
    banner('');
    const files = await readZip(await file.arrayBuffer());
    let prefix = '';
    if (!files.has('manifest.json')) {
      const cand = [...files.keys()].filter((k) => k.endsWith('/manifest.json') && k.split('/').length === 2);
      if (cand.length !== 1) throw new Error('El ZIP no contiene manifest.json. ¿Es un proyecto REV?');
      prefix = cand[0].slice(0, -'manifest.json'.length);
    }
    if (prefix) for (const k of [...files.keys()]) { if (k.startsWith(prefix)) { files.set(k.slice(prefix.length), files.get(k)); files.delete(k); } }
    const project = JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
    const warns = normalize(project, files);
    files.delete('manifest.json');
    stop();
    cache.img.clear(); cache.vid.clear(); cache.aud.forEach((c) => c.a.pause()); cache.aud.clear();
    Object.assign(S, { project, files, fileName: file.name, sceneIdx: 0, selEl: null, t: 0, dirty: false, tab: 'escenas' });
    $('#dirtyDot').hidden = true;
    await loadFonts();
    afterLoad();
    if (warns.length) banner('Avisos: ' + warns.slice(0, 3).join(' · ') + (warns.length > 3 ? ` (+${warns.length - 3})` : ''));
    toast('Proyecto abierto: ' + project.meta.name);
  } catch (e) { console.error(e); banner('No se pudo abrir el ZIP: ' + e.message, true); }
}
function afterLoad() {
  const p = S.project;
  $('#projName').textContent = p.meta.name;
  $('#empty').hidden = true;
  for (const id of ['btnSave', 'btnDownload', 'btnPlay', 'scrub']) $('#' + id).disabled = false;
  const cv = $('#cv'), ov = $('#ov');
  cv.width = ov.width = Math.round(p.meta.width * PREVIEW_SCALE); cv.height = ov.height = Math.round(p.meta.height * PREVIEW_SCALE);
  $('#phone').style.aspectRatio = `${p.meta.width}/${p.meta.height}`;
  $('#scrub').max = totalDuration(p);
  setTab(S.tab); renderSceneBar(); updateScrub(); render();
}
function projectBlob() {
  const out = new Map();
  const manifest = JSON.stringify(S.project, (k, v) => (k.startsWith('_') ? undefined : v), 2);
  out.set('manifest.json', te.encode(manifest));
  for (const k of [...S.files.keys()].sort()) out.set(k, S.files.get(k));
  return writeZip(out);
}
function downloadZip() {
  const blob = projectBlob();
  const name = (S.project.meta.name || 'proyecto').replace(/[^\w\-]+/g, '_') + '.zip';
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  S.dirty = false; $('#dirtyDot').hidden = true;
  toast('ZIP descargado: ' + name);
}
async function shareZip() {
  const blob = projectBlob(); const name = (S.project.meta.name || 'proyecto').replace(/[^\w\-]+/g, '_') + '.zip';
  const f = new File([blob], name, { type: 'application/zip' });
  try { await navigator.share({ files: [f], title: name }); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message); }
}

/* IndexedDB: guardado local en el navegador (además de descargar el ZIP) */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('rev', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
let saveTimer;
function scheduleAutosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveLocal(false), 1500); }
async function saveLocal(announce = true) {
  if (!S.project) return;
  try { const buf = await projectBlob().arrayBuffer(); await idbPut('last', { name: S.fileName, buf }); if (announce) toast('Guardado en este navegador'); } catch (e) { if (announce) toast('No se pudo guardar localmente: ' + e.message); }
}

/* ---------------------------------------------------------------- reproducción */
let raf = 0, lastTs = 0;
function allAudio() {
  const p = S.project, starts = sceneStarts(p), out = [];
  p.audio.forEach((a) => out.push({ a, abs: a.start }));
  p.scenes.forEach((s, i) => s.audio.forEach((a) => out.push({ a, abs: starts[i] + a.start })));
  return out;
}
function audioEl(a) {
  const url = assetUrl(a.asset); if (!url) return null;
  let c = cache.aud.get(a.id);
  if (!c || c.url !== url) { if (c) c.a.pause(); const el = new Audio(url); el.preload = 'auto'; c = { url, a: el }; cache.aud.set(a.id, c); }
  return c.a;
}
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  for (const { a } of allAudio()) { const el = audioEl(a); if (el) { el.muted = true; el.play().then(() => { el.pause(); el.muted = false; }).catch(() => { el.muted = false; }); } }
}
function syncAudio(force = false) {
  for (const { a, abs } of allAudio()) {
    const el = audioEl(a); if (!el) continue;
    const dur = isFinite(el.duration) ? el.duration - (a.trimStart || 0) : Infinity;
    const within = S.t >= abs && S.t < abs + dur;
    el.volume = clamp(a.volume ?? 1, 0, 1);
    if (S.playing && within) {
      const want = S.t - abs + (a.trimStart || 0);
      if (el.paused || force) { try { el.currentTime = want; } catch (e) { /* sin metadatos aún */ } el.play().catch(() => {}); }
      else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
    } else if (!el.paused) el.pause();
  }
}
function syncVideos(sc, local) {
  for (const el of sc.elements) {
    if (el.type !== 'video') continue;
    const v = env.video(el.id); if (!v || !v.readyState) continue;
    const [a, b] = elementRange(el, sc);
    const want = (el.trimStart || 0) + (local - a);
    const dur = isFinite(v.duration) ? v.duration : Infinity;
    const w = el.loop && dur > 0 && isFinite(dur) ? want % dur : want;
    v.muted = !(el.volume > 0 && S.playing); v.volume = clamp(el.volume || 0, 0, 1);
    if (S.playing && local >= a && local < b) { if (v.paused) { v.currentTime = w; v.play().catch(() => {}); } else if (Math.abs(v.currentTime - w) > 0.35) v.currentTime = w; }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - w) > 0.04) v.currentTime = w; }
  }
}
function play() {
  if (!S.project) return;
  if (S.t >= totalDuration(S.project) - 0.05) S.t = 0;
  unlockAudio();
  S.playing = true; $('#btnPlay').textContent = '⏸'; lastTs = performance.now();
  syncAudio(true); raf = requestAnimationFrame(tick);
}
function stop() {
  S.playing = false; cancelAnimationFrame(raf); $('#btnPlay').textContent = '▶';
  cache.aud.forEach((c) => c.a.pause()); cache.vid.forEach((c) => c.v.pause());
}
function tick(ts) {
  if (!S.playing) return;
  S.t += (ts - lastTs) / 1000; lastTs = ts;
  const total = totalDuration(S.project);
  if (S.t >= total) { S.t = total; stop(); }
  updateScrub(); render(); syncAudio();
  if (S.playing) raf = requestAnimationFrame(tick);
}
function seek(t) {
  S.t = clamp(t, 0, totalDuration(S.project));
  const { index } = sceneAt(S.project, S.t);
  if (index !== S.sceneIdx) { S.sceneIdx = index; if (!curScene().elements.find((e) => e.id === S.selEl)) S.selEl = null; renderSceneBar(); if (S.tab !== 'ajustes' && S.tab !== 'tiempo') setTab(S.tab); else setTab(S.tab); }
  updateScrub(); render(); if (S.playing) syncAudio(true);
}
function updateScrub() { $('#scrub').value = S.t; $('#timeLbl').textContent = `${fmtTime(S.t)} / ${fmtTime(totalDuration(S.project))}`; const ph = $('#ph'); if (ph) positionPlayhead(); }

/* ---------------------------------------------------------------- dibujo */
function render() {
  if (!S.project) return;
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const { index, local } = sceneAt(S.project, S.t);
  const sc = S.project.scenes[index];
  if (!sc) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
  syncVideos(sc, local);
  S.boxes = drawScene(ctx, S.project, sc, local, env, PREVIEW_SCALE);
  drawOverlay();
}
function drawOverlay() {
  const ov = $('#ov'), c = ov.getContext('2d'), k = PREVIEW_SCALE, W = S.project.meta.width, H = S.project.meta.height;
  c.clearRect(0, 0, ov.width, ov.height);
  const sa = S.project.meta.safeArea;
  if (S.showSafe && sa) {
    c.save(); c.scale(k, k);
    c.fillStyle = 'rgba(194,71,110,0.10)';
    c.fillRect(0, 0, sa.left, H); c.fillRect(W - sa.right, 0, sa.right, H); c.fillRect(sa.left, H - sa.bottom, W - sa.left - sa.right, sa.bottom);
    c.strokeStyle = 'rgba(194,71,110,0.9)'; c.lineWidth = 3 / k * 0.5; c.setLineDash([14, 10]);
    c.strokeRect(sa.left, sa.top || 0, W - sa.left - sa.right, H - sa.bottom - (sa.top || 0));
    c.restore();
  }
  const b = S.selEl && S.boxes[S.selEl];
  if (b) {
    c.save(); c.scale(k, k); c.translate(b.x, b.y); c.rotate(b.rot);
    c.strokeStyle = '#c24770'; c.lineWidth = 4 / k * 0.5; c.setLineDash([]);
    c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    c.fillStyle = '#c24770'; c.beginPath(); c.arc(b.w / 2, b.h / 2, 22, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(b.w / 2, b.h / 2, 9, 0, 7); c.fill();
    c.restore();
  }
}

/* selección y arrastre en el lienzo */
function canvasPoint(ev) { const r = $('#cv').getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * S.project.meta.width, (ev.clientY - r.top) / r.height * S.project.meta.height]; }
function toLocal(b, x, y) { const dx = x - b.x, dy = y - b.y, c = Math.cos(-b.rot), s = Math.sin(-b.rot); return [dx * c - dy * s, dx * s + dy * c]; }
let drag = null;
function onDown(ev) {
  if (!S.project) return;
  const [x, y] = canvasPoint(ev);
  const sel = curEl(), sb = sel && S.boxes[sel.id];
  if (sel && sb && !sel.locked) {
    const [lx, ly] = toLocal(sb, x, y);
    if (Math.hypot(lx - sb.w / 2, ly - sb.h / 2) < 50) { drag = { mode: 'resize', id: sel.id, ratio: sel.height / sel.width }; $('#cv').setPointerCapture(ev.pointerId); return; }
  }
  const sc = curScene();
  for (let i = sc.elements.length - 1; i >= 0; i--) {
    const el = sc.elements[i], b = S.boxes[el.id];
    if (!b || el.locked) continue;
    const [lx, ly] = toLocal(b, x, y);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) {
      S.selEl = el.id; drag = { mode: 'move', id: el.id, ox: el.x - x, oy: el.y - y };
      $('#cv').setPointerCapture(ev.pointerId); if (S.tab === 'ajustes' || S.tab === 'capas' || S.tab === 'tiempo') setTab(S.tab); render(); return;
    }
  }
  S.selEl = null; if (S.tab === 'ajustes') setTab('ajustes'); render();
}
function onMove(ev) {
  if (!drag) return;
  const el = curScene().elements.find((e) => e.id === drag.id); if (!el) return;
  const [x, y] = canvasPoint(ev), W = S.project.meta.width, H = S.project.meta.height;
  if (drag.mode === 'move') { el.x = Math.round(clamp(x + drag.ox, -400, W + 400)); el.y = Math.round(clamp(y + drag.oy, -400, H + 400)); }
  else {
    const b = S.boxes[el.id]; if (!b) return; const [lx, ly] = toLocal(b, x, y);
    const nw = Math.max(20, Math.round(Math.abs(lx) * 2 / (b.w / el.width))), nh = Math.max(20, Math.round(Math.abs(ly) * 2 / (b.w / el.width)));
    el.width = nw; if (el.type !== 'text') el.height = S.lockAspect && el.type !== 'shape' && el.type !== 'effect' ? Math.round(nw * drag.ratio) : nh;
  }
  markDirty(); syncFields(); render();
}
function onUp() { drag = null; }

/* ---------------------------------------------------------------- UI: escenas */
function renderSceneBar() {
  const bar = $('#sceneBar'); bar.replaceChildren();
  if (!S.project) return;
  S.project.scenes.forEach((s, i) => {
    const b = h('button', { class: i === S.sceneIdx ? 'on' : '', style: `flex:${s.duration}`, title: s.name, onclick: () => { stop(); seek(sceneStarts(S.project)[i]); } }, `${i + 1} · ${s.name}`);
    bar.append(b);
  });
}
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  const p = $('#panel'); p.replaceChildren(); S.syncs = [];
  if (!S.project) { p.append(h('p', { class: 'hint' }, 'Abre un proyecto ZIP para empezar.')); return; }
  ({ escenas: tabScenes, capas: tabLayers, ajustes: tabProps, tiempo: tabTime, audio: tabAudio })[t](p);
}
function syncFields() { S.syncs.forEach((f) => f()); }

/* controles genéricos */
function field(label, obj, path, spec = {}) {
  const kind = spec.type || 'number';
  const get = () => getPath(obj, path);
  const apply = (v) => { const old = get(); setPath(obj, path, v); if (spec.onChange) spec.onChange(v, old); markDirty(); render(); if (spec.rebuild) { setTab(S.tab); } else syncFields(); if (spec.after) spec.after(); };
  let ctl;
  if (kind === 'range') {
    const r = h('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step ?? 1 });
    const n = h('input', { type: 'number', min: spec.min, max: spec.max, step: spec.step ?? 1, inputmode: 'decimal' });
    r.addEventListener('input', () => apply(+r.value));
    n.addEventListener('change', () => apply(+n.value));
    S.syncs.push(() => { const v = get(); r.value = v; if (document.activeElement !== n) n.value = Math.round(v * 100) / 100; });
    ctl = [r, n];
  } else if (kind === 'color') {
    const c = h('input', { type: 'color' }); c.addEventListener('input', () => apply(c.value));
    S.syncs.push(() => { c.value = /^#[0-9a-f]{6}$/i.test(get()) ? get() : '#ffffff'; }); ctl = [c];
  } else if (kind === 'select') {
    const s = h('select', {}, spec.options.map(([v, l]) => h('option', { value: v }, l)));
    s.addEventListener('change', () => apply(spec.num ? +s.value : s.value));
    S.syncs.push(() => { s.value = get(); }); ctl = [s];
  } else if (kind === 'check') {
    const c = h('input', { type: 'checkbox' }); c.addEventListener('change', () => apply(c.checked));
    S.syncs.push(() => { c.checked = !!get(); }); ctl = [c];
  } else if (kind === 'textarea') {
    const t = h('textarea', {}); t.addEventListener('input', () => apply(t.value));
    S.syncs.push(() => { if (document.activeElement !== t) t.value = get() ?? ''; }); ctl = [t];
  } else if (kind === 'text') {
    const t = h('input', { type: 'text' }); t.addEventListener('input', () => apply(t.value));
    S.syncs.push(() => { if (document.activeElement !== t) t.value = get() ?? ''; }); ctl = [t];
  } else {
    const n = h('input', { type: 'number', min: spec.min, max: spec.max, step: spec.step ?? 1, inputmode: 'decimal' }); n.addEventListener('change', () => apply(+n.value));
    S.syncs.push(() => { if (document.activeElement !== n) n.value = get(); }); ctl = [n];
  }
  const row = h('div', { class: 'row' }, h('label', {}, label), h('div', { class: 'ctl' }, ctl));
  syncFields(); return row;
}

function tabScenes(p) {
  const P = S.project, sc = curScene();
  p.append(h('div', { class: 'chips' }, P.scenes.map((s, i) => h('button', { class: 'chip' + (i === S.sceneIdx ? ' on' : ''), onclick: () => { stop(); seek(sceneStarts(P)[i]); } }, `${i + 1}. ${s.name}`))));
  const move = (d) => { const i = S.sceneIdx, j = i + d; if (j < 0 || j >= P.scenes.length) return; [P.scenes[i], P.scenes[j]] = [P.scenes[j], P.scenes[i]]; S.sceneIdx = j; markDirty(); renderSceneBar(); seek(sceneStarts(P)[j]); };
  p.append(h('div', { class: 'btns' },
    h('button', { class: 'btn sm', onclick: () => move(-1) }, '◀ Subir escena'),
    h('button', { class: 'btn sm', onclick: () => move(1) }, 'Bajar escena ▶'),
    h('button', { class: 'btn sm', onclick: duplicateScene }, 'Duplicar'),
    h('button', { class: 'btn sm', onclick: addScene }, '+ Nueva'),
    h('button', { class: 'btn sm danger', onclick: deleteScene }, 'Eliminar')));
  p.append(field('Nombre', sc, 'name', { type: 'text', after: renderSceneBar }));
  p.append(field('Duración (s)', sc, 'duration', { type: 'range', min: 0.5, max: 30, step: 0.1, after: () => { $('#scrub').max = totalDuration(P); renderSceneBar(); updateScrub(); } }));
  p.append(h('div', { class: 'h' }, 'Fondo'));
  p.append(field('Color de fondo', sc.background, 'color', { type: 'color' }));
  const bgName = sc.background.asset ? P.assets[sc.background.asset]?.name : 'Sin imagen';
  p.append(h('div', { class: 'row' }, h('label', {}, 'Imagen de fondo'), h('div', { class: 'ctl' },
    h('span', { class: 'hint' }, bgName || ''),
    h('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; const id = await addAssetFromFile(f, 'image'); if (id) { sc.background.asset = id; markDirty(); setTab('escenas'); render(); } } }, 'Cambiar'),
    h('button', { class: 'btn sm', onclick: () => { sc.background.asset = null; markDirty(); setTab('escenas'); render(); } }, 'Quitar'))));
  p.append(field('Ajuste', sc.background, 'fit', { type: 'select', options: [['cover', 'Llenar'], ['contain', 'Completa']] }));
}
function duplicateScene() {
  const P = S.project, src = curScene(), c = clone(src);
  c.id = uid('scene'); c.name = src.name + ' (copia)';
  c.elements.forEach((e) => (e.id = uid('el'))); c.audio.forEach((a) => (a.id = uid('aud')));
  P.scenes.splice(S.sceneIdx + 1, 0, c); S.sceneIdx++; markDirty(); $('#scrub').max = totalDuration(P); renderSceneBar(); seek(sceneStarts(P)[S.sceneIdx]); toast('Escena duplicada');
}
function addScene() {
  const P = S.project; P.scenes.splice(S.sceneIdx + 1, 0, { id: uid('scene'), name: 'Escena nueva', duration: 3, background: { color: P.meta.background, asset: null, fit: 'cover' }, elements: [], audio: [] });
  S.sceneIdx++; markDirty(); $('#scrub').max = totalDuration(P); renderSceneBar(); seek(sceneStarts(P)[S.sceneIdx]);
}
function deleteScene() {
  const P = S.project; if (P.scenes.length < 2) { toast('Debe quedar al menos una escena.'); return; }
  if (!confirm(`¿Eliminar la escena "${curScene().name}"? Los recursos (archivos) se conservan en el ZIP.`)) return;
  P.scenes.splice(S.sceneIdx, 1); S.sceneIdx = Math.min(S.sceneIdx, P.scenes.length - 1); S.selEl = null; markDirty();
  $('#scrub').max = totalDuration(P); renderSceneBar(); seek(sceneStarts(P)[S.sceneIdx]);
}

/* ---------------------------------------------------------------- UI: capas */
const TYPE_LABEL = { text: 'Texto', image: 'Imagen', shape: 'Forma', effect: 'Efecto', video: 'Video' };
function tabLayers(p) {
  const sc = curScene();
  p.append(h('div', { class: 'btns' },
    h('button', { class: 'btn sm', onclick: () => addEl('text') }, '+ Texto'),
    h('button', { class: 'btn sm', onclick: () => addEl('image') }, '+ Imagen'),
    h('button', { class: 'btn sm', onclick: () => addEl('video') }, '+ Video'),
    h('button', { class: 'btn sm', onclick: () => addEl('shape') }, '+ Forma'),
    h('button', { class: 'btn sm', onclick: () => addEl('effect') }, '+ Destellos')));
  p.append(h('p', { class: 'hint' }, 'La capa de arriba queda al frente. Toca el nombre para editarla.'));
  [...sc.elements].reverse().forEach((el) => {
    const i = sc.elements.indexOf(el);
    const swap = (d) => { const j = i + d; if (j < 0 || j >= sc.elements.length) return; [sc.elements[i], sc.elements[j]] = [sc.elements[j], sc.elements[i]]; markDirty(); setTab('capas'); render(); };
    p.append(h('div', { class: 'layer' + (el.id === S.selEl ? ' on' : '') },
      h('button', { class: 'btn sm', title: 'Mostrar/ocultar', onclick: () => { el.visible = !el.visible; markDirty(); setTab('capas'); render(); } }, el.visible ? '👁' : '—'),
      h('button', { class: 'nm', onclick: () => { S.selEl = el.id; setTab('ajustes'); render(); } }, el.name, h('div', { class: 'ty' }, TYPE_LABEL[el.type] || el.type)),
      h('button', { class: 'btn sm', title: 'Bloquear', onclick: () => { el.locked = !el.locked; markDirty(); setTab('capas'); } }, el.locked ? '🔒' : '🔓'),
      h('button', { class: 'btn sm', title: 'Al frente', onclick: () => swap(1) }, '↑'),
      h('button', { class: 'btn sm', title: 'Atrás', onclick: () => swap(-1) }, '↓'),
      h('button', { class: 'btn sm', title: 'Duplicar', onclick: () => { const c = clone(el); c.id = uid('el'); c.name += ' (copia)'; c.x += 40; c.y += 40; sc.elements.splice(i + 1, 0, c); S.selEl = c.id; markDirty(); setTab('capas'); render(); } }, '⧉'),
      h('button', { class: 'btn sm danger', title: 'Eliminar', onclick: () => { sc.elements.splice(i, 1); if (S.selEl === el.id) S.selEl = null; markDirty(); setTab('capas'); render(); } }, '✕')));
  });
}
async function addEl(type) {
  const sc = curScene(); const extra = {};
  if (type === 'image' || type === 'video') {
    const f = await pickFile(type === 'image' ? 'image/*' : 'video/*'); if (!f) return;
    const id = await addAssetFromFile(f, type); if (!id) return;
    extra.asset = id; extra.name = f.name.replace(/\.[^.]+$/, '');
    if (type === 'image') { const [w, hh] = await imageSize(id); if (w) { extra.width = Math.min(600, w); extra.height = Math.round(extra.width * hh / w); } }
  }
  const el = newElement(type, sc, extra); sc.elements.push(el); S.selEl = el.id; markDirty(); setTab('ajustes'); render();
}

/* ---------------------------------------------------------------- UI: ajustes del elemento */
function tabProps(p) {
  const sc = curScene(), el = curEl();
  if (!el) { p.append(h('p', { class: 'hint' }, 'Toca un elemento en la vista previa o en la pestaña Capas. Arrástralo para moverlo; el círculo de la esquina cambia su tamaño.')); return; }
  const R = (l, path, o) => p.append(field(l, el, path, o));
  p.append(h('div', { class: 'h' }, `${TYPE_LABEL[el.type] || el.type}: ${el.name}`));
  R('Nombre', 'name', { type: 'text' });
  if (el.type === 'image' || el.type === 'video') {
    const a = S.project.assets[el.asset];
    p.append(h('div', { class: 'row' }, h('label', {}, 'Archivo'), h('div', { class: 'ctl' }, h('span', { class: 'hint' }, a?.name || '(sin archivo)'),
      h('button', { class: 'btn sm primary', onclick: async () => { const f = await pickFile(el.type === 'image' ? 'image/*' : 'video/*'); if (!f) return; const id = await addAssetFromFile(f, el.type); if (!id) return; el.asset = id; cache.vid.delete(el.id); markDirty(); setTab('ajustes'); render(); } }, 'Reemplazar'))));
  }
  if (el.type === 'text') {
    R('Texto', 'text', { type: 'textarea' });
    R('Fuente', 'font', { type: 'select', options: fontOptions().map((f) => [f, f]) });
    R('Tamaño', 'fontSize', { type: 'range', min: 16, max: 300, step: 1 });
    R('Grosor', 'fontWeight', { type: 'select', num: true, options: [[400, 'Normal'], [500, 'Medio'], [700, 'Negrita'], [900, 'Extra']] });
    R('Color', 'color', { type: 'color' });
    R('Alineación', 'align', { type: 'select', options: [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']] });
    R('Interlineado', 'lineHeight', { type: 'range', min: 0.8, max: 2, step: 0.05 });
    R('Contorno (color)', 'stroke.color', { type: 'color' });
    R('Contorno (grosor)', 'stroke.width', { type: 'range', min: 0, max: 30, step: 1 });
    R('Sombra', 'shadow', { type: 'check' });
  }
  if (el.type === 'shape') {
    R('Forma', 'shape', { type: 'select', options: [['rounded', 'Redondeada'], ['rect', 'Rectángulo'], ['circle', 'Círculo']] });
    R('Color', 'fill', { type: 'color' });
    R('Redondeo', 'radius', { type: 'range', min: 0, max: 300, step: 1 });
    R('Borde (color)', 'stroke.color', { type: 'color' });
    R('Borde (grosor)', 'stroke.width', { type: 'range', min: 0, max: 40, step: 1 });
  }
  if (el.type === 'effect') {
    R('Color', 'color', { type: 'color' });
    R('Cantidad', 'count', { type: 'range', min: 1, max: 60, step: 1 });
    R('Tamaño', 'size', { type: 'range', min: 8, max: 120, step: 1 });
    R('Velocidad', 'speed', { type: 'range', min: 0.2, max: 4, step: 0.1 });
    R('Variación', 'seed', { type: 'range', min: 1, max: 99, step: 1 });
  }
  if (el.type === 'image' || el.type === 'video') {
    R('Ajuste', 'fit', { type: 'select', options: [['contain', 'Completa'], ['cover', 'Llenar'], ['fill', 'Estirar']] });
    if (el.type === 'image') R('Voltear', 'flipX', { type: 'check' });
    if (el.type === 'video') { R('Inicio del clip (s)', 'trimStart', { type: 'range', min: 0, max: 60, step: 0.1 }); R('Volumen', 'volume', { type: 'range', min: 0, max: 1, step: 0.05 }); R('Repetir', 'loop', { type: 'check' }); }
  }
  p.append(h('div', { class: 'h' }, 'Posición y tamaño'));
  R('Posición X', 'x', { type: 'range', min: -400, max: S.project.meta.width + 400, step: 1 });
  R('Posición Y', 'y', { type: 'range', min: -400, max: S.project.meta.height + 400, step: 1 });
  const ratio = () => el.height / el.width;
  const lockable = el.type === 'image' || el.type === 'video';
  p.append(field('Ancho', el, 'width', { type: 'range', min: 20, max: 2400, step: 1, onChange: (v, old) => { if (lockable && S.lockAspect && old > 0) el.height = Math.round(v * (el.height / old)); } }));
  if (el.type !== 'text') p.append(field('Alto', el, 'height', { type: 'range', min: 20, max: 2400, step: 1, onChange: (v, old) => { if (lockable && S.lockAspect && old > 0) el.width = Math.round(v * (el.width / old)); } }));
  if (lockable) p.append(h('div', { class: 'row' }, h('label', {}, 'Mantener proporción'), h('div', { class: 'ctl' }, h('input', { type: 'checkbox', checked: S.lockAspect, onchange: (e) => (S.lockAspect = e.target.checked) }))));
  R('Rotación (°)', 'rotation', { type: 'range', min: -180, max: 180, step: 1 });
  R('Opacidad', 'opacity', { type: 'range', min: 0, max: 1, step: 0.05 });
  p.append(h('div', { class: 'h' }, 'Tiempo'));
  R('Entra en (s)', 'start', { type: 'range', min: 0, max: sc.duration, step: 0.1 });
  R('Dura (s, 0 = hasta el final)', 'duration', { type: 'range', min: 0, max: sc.duration, step: 0.1 });
  p.append(h('div', { class: 'h' }, 'Animaciones'));
  R('Entrada', 'in.type', { type: 'select', options: ANIM_IN });
  R('Entrada: duración', 'in.duration', { type: 'range', min: 0.1, max: 3, step: 0.1 });
  R('Entrada: curva', 'in.easing', { type: 'select', options: EASINGS });
  R('Salida', 'out.type', { type: 'select', options: ANIM_IN });
  R('Salida: duración', 'out.duration', { type: 'range', min: 0.1, max: 3, step: 0.1 });
  R('Movimiento continuo', 'loop.type', { type: 'select', options: ANIM_LOOP });
  R('Intensidad', 'loop.amount', { type: 'range', min: 0, max: 4, step: 0.1 });
  R('Velocidad', 'loop.speed', { type: 'range', min: 0.2, max: 4, step: 0.1 });
}

/* ---------------------------------------------------------------- UI: tiempo */
function tabTime(p) {
  const sc = curScene(), box = h('div', { class: 'tl', id: 'tl' });
  const ruler = h('div', { class: 'ruler', id: 'ruler' });
  box.append(ruler);
  const ticks = Math.floor(sc.duration);
  for (let i = 0; i <= ticks; i++) ruler.append(h('span', { style: `position:absolute;left:${i / sc.duration * 100}%;top:6px;font:600 11px system-ui;color:#6b4a58;padding-left:3px` }, i + 's'));
  sc.elements.forEach((el) => {
    const [a, b] = elementRange(el, sc), track = h('div', { class: 'track' });
    const bar = h('div', { class: 'bar' + (el.id === S.selEl ? ' on' : ''), style: `left:${a / sc.duration * 100}%;width:${(b - a) / sc.duration * 100}%` }, el.name);
    const rh = h('div', { class: 'rh' }); bar.append(rh);
    attachBarDrag(bar, rh, el, sc, track);
    track.append(bar); box.append(track);
  });
  box.append(h('div', { class: 'ph', id: 'ph' }));
  p.append(box, h('p', { class: 'hint' }, 'Arrastra una barra para cambiar cuándo entra; arrastra el borde derecho para cambiar cuánto dura. Toca la regla para mover el tiempo.'));
  ruler.addEventListener('pointerdown', (e) => { const r = ruler.getBoundingClientRect(); const mv = (ev) => { stop(); seek(sceneStarts(S.project)[S.sceneIdx] + clamp((ev.clientX - r.left) / r.width, 0, 1) * sc.duration); }; mv(e); ruler.setPointerCapture(e.pointerId); ruler.onpointermove = mv; ruler.onpointerup = () => { ruler.onpointermove = null; }; });
  positionPlayhead();
}
function positionPlayhead() {
  const ph = $('#ph'), tl = $('#tl'); if (!ph || !tl) return;
  const sc = curScene(), local = clamp(S.t - sceneStarts(S.project)[S.sceneIdx], 0, sc.duration);
  ph.style.left = local / sc.duration * tl.clientWidth + 'px';
}
function attachBarDrag(bar, rh, el, sc, track) {
  let mode = null, x0 = 0, s0 = 0, d0 = 0;
  const onDown = (e, m) => { mode = m; x0 = e.clientX; s0 = el.start || 0; d0 = el.duration > 0 ? el.duration : sc.duration - s0; S.selEl = el.id; bar.setPointerCapture(e.pointerId); e.stopPropagation(); document.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on')); bar.classList.add('on'); render(); };
  bar.addEventListener('pointerdown', (e) => onDown(e, e.target === rh ? 'dur' : 'move'));
  bar.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const dt = (e.clientX - x0) / track.clientWidth * sc.duration;
    if (mode === 'move') el.start = Math.round(clamp(s0 + dt, 0, sc.duration - 0.1) * 10) / 10;
    else el.duration = Math.round(clamp(d0 + dt, 0.1, sc.duration - s0) * 10) / 10;
    const [a, b] = elementRange(el, sc);
    bar.style.left = a / sc.duration * 100 + '%'; bar.style.width = (b - a) / sc.duration * 100 + '%';
    markDirty(); render();
  });
  const end = () => { mode = null; };
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- UI: audio */
function tabAudio(p) {
  const P = S.project, sc = curScene();
  p.append(h('div', { class: 'btns' },
    h('button', { class: 'btn sm primary', onclick: () => addAudio(sc.audio, 'de la escena') }, '+ Audio en esta escena'),
    h('button', { class: 'btn sm', onclick: () => addAudio(P.audio, 'global') }, '+ Audio de todo el video')));
  const list = (arr, title, max) => {
    p.append(h('div', { class: 'h' }, title));
    if (!arr.length) p.append(h('p', { class: 'hint' }, 'Sin audios.'));
    arr.forEach((a) => {
      const as = P.assets[a.asset];
      const card = h('div', { class: 'card' }, h('strong', {}, a.label || as?.name || 'Audio'),
        h('div', { class: 'btns' },
          h('button', { class: 'btn sm primary', onclick: async () => { const f = await pickFile('audio/*'); if (!f) return; const id = await addAssetFromFile(f, 'audio'); if (!id) return; a.asset = id; cache.aud.delete(a.id); markDirty(); setTab('audio'); } }, 'Reemplazar'),
          h('button', { class: 'btn sm danger', onclick: () => { arr.splice(arr.indexOf(a), 1); cache.aud.get(a.id)?.a.pause(); markDirty(); setTab('audio'); } }, 'Quitar')));
      card.append(field('Volumen', a, 'volume', { type: 'range', min: 0, max: 1, step: 0.05 }));
      card.append(field('Empieza en (s)', a, 'start', { type: 'range', min: 0, max: max, step: 0.1 }));
      card.append(field('Saltar los primeros (s)', a, 'trimStart', { type: 'range', min: 0, max: 60, step: 0.1 }));
      p.append(card);
    });
  };
  list(sc.audio, `Audios de «${sc.name}» (el tiempo cuenta desde el inicio de la escena)`, sc.duration);
  list(P.audio, 'Audios de todo el video (el tiempo cuenta desde el segundo 0)', totalDuration(P));
}
async function addAudio(arr, label) {
  const f = await pickFile('audio/*'); if (!f) return; const id = await addAssetFromFile(f, 'audio'); if (!id) return;
  arr.push({ id: uid('aud'), asset: id, start: 0, volume: 1, trimStart: 0, label: f.name }); markDirty(); setTab('audio'); toast('Audio añadido ' + label);
}

/* ---------------------------------------------------------------- arranque */
$('#zipInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openZip(f); e.target.value = ''; });
$('#btnDownload').addEventListener('click', downloadZip);
$('#btnSave').addEventListener('click', () => saveLocal(true));
$('#btnPlay').addEventListener('click', () => (S.playing ? stop() : play()));
$('#scrub').addEventListener('input', (e) => { seek(+e.target.value); });
$('#chkSafe').addEventListener('change', (e) => { S.showSafe = e.target.checked; render(); });
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && S.project) setTab(b.dataset.tab); else if (b) setTab(b.dataset.tab); });
const cvs = $('#cv'); cvs.addEventListener('pointerdown', onDown); cvs.addEventListener('pointermove', onMove); cvs.addEventListener('pointerup', onUp); cvs.addEventListener('pointercancel', onUp);
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && S.project) { e.preventDefault(); S.playing ? stop() : play(); } });
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.zip', { type: 'application/zip' })] })) { $('#btnShare').hidden = false; $('#btnShare').addEventListener('click', shareZip); }
idbGet('last').then((v) => {
  if (!v) return; const b = $('#btnResume'); b.hidden = false; b.textContent = `Continuar: ${v.name}`;
  b.addEventListener('click', () => openZip(new File([v.buf], v.name)));
}).catch(() => {});
setTab('escenas');
