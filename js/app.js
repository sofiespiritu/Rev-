/* REV · aplicación: estado, interfaz móvil, línea de tiempo, panel de propiedades, guardar/descargar. */
(function () {
  'use strict';
  const REV = window.REV, S = REV.schema, Z = REV.zipio;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }

  const IN_LABEL = { none: 'Ninguna', fade: 'Aparecer', 'from-bottom': 'Desde abajo', 'from-top': 'Desde arriba', 'from-left': 'Desde la izquierda', 'from-right': 'Desde la derecha', 'zoom-in': 'Zoom (crece)', 'zoom-out': 'Zoom (reduce)', pop: 'Rebote', spin: 'Girar' };
  const OUT_LABEL = { none: 'Ninguna', fade: 'Desaparecer', 'from-bottom': 'Hacia abajo', 'from-top': 'Hacia arriba', 'from-left': 'Hacia la izquierda', 'from-right': 'Hacia la derecha', 'zoom-in': 'Encoger (zoom)', 'zoom-out': 'Agrandar (zoom)', pop: 'Encoger', spin: 'Girar' };
  const LOOP_LABEL = { none: 'Ninguno', float: 'Flotar', pulse: 'Latido', sway: 'Balanceo', spin: 'Girar', blink: 'Parpadeo' };
  const TYPE_LABEL = { image: 'Imagen', video: 'Video', text: 'Texto', shape: 'Forma' };

  /* ---------------------------------------------------------------- IndexedDB (último guardado) */
  const DB = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('rev-editor', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('projects');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async put(key, val) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
    async get(key) { const db = await this.open(); return new Promise((res, rej) => { const rq = db.transaction('projects').objectStore('projects').get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); },
  };

  /* ---------------------------------------------------------------- app */
  const app = (window.REV_APP = {
    state: null, sel: null, undo: [], redo: [], tab: 'main', pps: 40, scale: 1,
    urls: new Map(), imgCache: new Map(), audioDurs: new Map(), fontsLoaded: new Set(),
    _lastKey: null, _lastT: 0, sceneIdx: -1,

    urlFor(path) {
      if (!this.state || !this.state.files.has(path)) return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      let u = this.urls.get(path);
      if (!u) { u = URL.createObjectURL(this.state.files.get(path)); this.urls.set(path, u); }
      return u;
    },
    async resolveImage(a, ov) {
      const base = this.urlFor(a.path);
      if (!a.palette || !ov || !Object.keys(ov).length || Z.ext(a.path) !== 'svg' || !this.state.files.has(a.path)) return base;
      const key = a.path + '|' + JSON.stringify(ov);
      if (this.imgCache.has(key)) return this.imgCache.get(key);
      let txt = await this.state.files.get(a.path).text();
      a.palette.forEach((p) => { const c = ov[p.id]; if (c && p.color) txt = txt.replace(new RegExp(p.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), c); });
      const u = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
      this.imgCache.set(key, u);
      return u;
    },
    fontCss(ff) {
      if (REV.FONTS[ff]) return REV.FONTS[ff];
      if (typeof ff === 'string' && ff.startsWith('asset:')) return '"rev-font-' + ff.slice(6) + '", ' + REV.FONTS.system;
      return ff || REV.FONTS.system;
    },
    audioDuration(assetId) {
      if (this.audioDurs.has(assetId)) return this.audioDurs.get(assetId);
      const a = this.state.manifest.assets[assetId];
      if (!a) return 0;
      this.audioDurs.set(assetId, 0);
      const el = new Audio(); el.preload = 'metadata'; el.src = this.urlFor(a.path);
      el.addEventListener('loadedmetadata', () => { if (isFinite(el.duration)) { this.audioDurs.set(assetId, el.duration); this.renderTimeline(); } });
      return 0;
    },
    async loadFonts() {
      const m = this.state.manifest;
      for (const [id, a] of Object.entries(m.assets)) {
        if (a.type !== 'font' || this.fontsLoaded.has(a.path) || !this.state.files.has(a.path)) continue;
        this.fontsLoaded.add(a.path);
        try { const ff = new FontFace('rev-font-' + id, 'url(' + this.urlFor(a.path) + ')'); await ff.load(); document.fonts.add(ff); } catch (e) { toast('No pude cargar la fuente ' + a.name); }
      }
      this.engine && this.engine.render();
    },

    /* ----- búsquedas ----- */
    scene(id) { return this.state.manifest.scenes.find((s) => s.id === id); },
    findEl(id) {
      for (const sc of this.state.manifest.scenes) { const el = sc.elements.find((e) => e.id === id); if (el) return { scene: sc, el }; }
      return null;
    },
    audioTrack(id) { return this.state.manifest.audio.find((a) => a.id === id); },
    curScene() { return this.engine.locate(this.engine.t).scene; },

    /* ----- edición con deshacer ----- */
    edit(fn, o) {
      o = o || {};
      const m = this.state.manifest, now = Date.now();
      if (!(o.key && o.key === this._lastKey && now - this._lastT < 900)) {
        this.undo.push(JSON.stringify(m)); if (this.undo.length > 120) this.undo.shift();
        this.redo.length = 0;
      }
      this._lastKey = o.key || null; this._lastT = now;
      fn(this.state.manifest);
      this.state.dirty = true;
      this.refresh(o);
    },
    endGesture() { this._lastKey = null; },
    undoStep() {
      if (!this.undo.length) return;
      this.redo.push(JSON.stringify(this.state.manifest));
      this.state.manifest = JSON.parse(this.undo.pop());
      this.state.dirty = true; this._afterHistory();
    },
    redoStep() {
      if (!this.redo.length) return;
      this.undo.push(JSON.stringify(this.state.manifest));
      this.state.manifest = JSON.parse(this.redo.pop());
      this.state.dirty = true; this._afterHistory();
    },
    _afterHistory() {
      const s = this.sel, m = this.state.manifest;
      const ok = !s || (s.kind === 'scene' && this.scene(s.id)) || (s.kind === 'el' && this.findEl(s.id)) || (s.kind === 'audio' && this.audioTrack(s.id)) || s.kind === 'project';
      if (!ok) this.sel = { kind: 'scene', id: this.curScene().id };
      this.engine.t = clamp(this.engine.t, 0, S.totalDuration(m));
      this.engine.sig = '';
      this.refresh({ props: true });
    },
    refresh(o) {
      o = o || {};
      this.engine.render();
      if (o.timeline !== false) this.renderTimeline();
      if (o.props) this.renderProps();
      this.updateChrome();
    },
    updateChrome() {
      const st = this.state;
      $('projTitle').textContent = st.manifest.meta.title || 'Proyecto';
      $('dirtyDot').classList.toggle('on', !!st.dirty);
      $('btnUndo').disabled = !this.undo.length; $('btnRedo').disabled = !this.redo.length;
      const total = S.totalDuration(st.manifest);
      $('timeLbl').textContent = this.engine.t.toFixed(1) + ' / ' + total.toFixed(1) + ' s';
      $('scrub').value = total ? Math.round((this.engine.t / total) * 1000) : 0;
      this.updatePlayhead();
    },

    /* ----- selección ----- */
    select(sel, o) {
      o = o || {};
      this.sel = sel;
      if (sel && sel.kind === 'el' && o.seek !== false) {
        const f = this.findEl(sel.id);
        if (f) {
          const m = this.state.manifest, starts = S.sceneStarts(m), si = m.scenes.indexOf(f.scene);
          const loc = this.engine.locate(this.engine.t);
          const end = S.elEnd(f.el, f.scene);
          if (loc.scene !== f.scene || loc.local < f.el.start || loc.local > end) this.engine.t = starts[si] + clamp(f.el.start + 0.05, 0, f.scene.duration - 0.01);
        }
      } else if (sel && sel.kind === 'scene' && o.seek) {
        const m = this.state.manifest, i = m.scenes.findIndex((s) => s.id === sel.id);
        this.engine.t = S.sceneStarts(m)[i] + this.posterTime(m.scenes[i]);
      }
      if (this.engine.playing && o.keepPlaying !== true) this.pausePlayback();
      if (sel && o.open !== false) $('sheet').classList.add('open');
      this.sceneIdx = this.engine.locate(this.engine.t).index;
      this.refresh({ props: true });
    },
    /** Instante de la escena en que ya aparecieron todos los elementos (para ver un cuadro "completo"). */
    posterTime(sc) {
      let t = 0;
      sc.elements.forEach((el) => { if (el.enabled) t = Math.max(t, el.start + (el.anim && el.anim.enabled !== false && el.anim.in.type !== 'none' ? el.anim.in.duration : 0)); });
      return clamp(t + 0.05, 0.05, sc.duration * 0.9);
    },
    onTime() {
      const idx = this.engine.locate(this.engine.t).index;
      if (idx !== this.sceneIdx) {
        this.sceneIdx = idx;
        const sc = this.state.manifest.scenes[idx], s = this.sel;
        if (!s || s.kind === 'scene' || s.kind === 'el') { this.sel = { kind: 'scene', id: sc.id }; this.renderProps(); }
        this.renderTimeline();
      }
      this.updateChrome();
    },
    pausePlayback() { this.engine.pause(); $('btnPlay').textContent = '▶'; },

    /* ----- timeline ----- */
    updatePlayhead() {
      const ph = document.querySelector('.playhead');
      if (!ph) return;
      const x = this.engine.t * this.pps;
      ph.style.left = x + 'px';
      if (this.engine.playing) {
        const tl = $('timeline');
        if (x < tl.scrollLeft + 20 || x > tl.scrollLeft + tl.clientWidth - 40) tl.scrollLeft = Math.max(0, x - tl.clientWidth * 0.3);
      }
    },
    renderTimeline() {
      if (!this.state) return;
      const m = this.state.manifest, tl = $('timeline'), pps = this.pps;
      const sl = tl.scrollLeft, st = tl.scrollTop;
      const total = S.totalDuration(m), starts = S.sceneStarts(m);
      const cur = this.engine.locate(this.engine.t);
      const inner = h('div', { class: 'tl-inner', style: 'width:' + (total * pps + 80) + 'px' });

      const ruler = h('div', { class: 'tl-ruler' });
      const stepS = pps >= 40 ? 1 : pps >= 20 ? 2 : 5;
      for (let t = 0; t <= total; t += stepS) ruler.append(h('i', { style: 'left:' + t * pps + 'px' }, t + 's'));
      const seekFromEvent = (ev) => {
        const rect = inner.getBoundingClientRect();
        if (this.engine.playing) this.pausePlayback();
        this.engine.seek((ev.clientX - rect.left) / pps); this.onTime();
      };
      let seeking = false;
      ruler.addEventListener('pointerdown', (ev) => { seeking = true; ruler.setPointerCapture(ev.pointerId); seekFromEvent(ev); });
      ruler.addEventListener('pointermove', (ev) => { if (seeking) seekFromEvent(ev); });
      ruler.addEventListener('pointerup', () => { seeking = false; });
      inner.append(ruler);

      const dtFrom = (ev, x0) => r1((ev.clientX - x0) / pps);
      const bar = (o) => {
        const b = h('div', { class: 'bar ' + o.cls + (o.sel ? ' sel' : '') + (o.off ? ' off' : ''), style: 'left:' + o.left * pps + 'px;width:' + Math.max(18, o.width * pps) + 'px' }, o.label);
        let drag = null;
        const begin = (ev, mode) => {
          ev.stopPropagation();
          drag = { mode, x0: ev.clientX, moved: false, base: o.base() };
          b.setPointerCapture(ev.pointerId);
        };
        if (o.onResize) {
          const rz = h('div', { class: 'rz' });
          rz.addEventListener('pointerdown', (ev) => { if (!o.sel && !o.alwaysResize) { o.onSelect(); return; } begin(ev, 'resize'); });
          b.append(rz);
        }
        b.addEventListener('pointerdown', (ev) => { if (ev.target.classList.contains('rz')) return; if (o.sel && o.onMove) begin(ev, 'move'); });
        b.addEventListener('pointermove', (ev) => {
          if (!drag) return;
          const dt = dtFrom(ev, drag.x0);
          if (!drag.moved && Math.abs(ev.clientX - drag.x0) < 4) return;
          drag.moved = true;
          const res = drag.mode === 'move' ? o.onMove(drag.base, dt) : o.onResize(drag.base, dt);
          if (res) { b.style.left = res.left * pps + 'px'; b.style.width = Math.max(18, res.width * pps) + 'px'; }
        });
        const end = () => { if (drag && drag.moved) { this.endGesture(); this.renderTimeline(); this.renderProps(); } drag = null; };
        b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
        b.addEventListener('click', (ev) => { if (ev.target.classList.contains('rz') && o.sel) return; o.onSelect(); });
        return b;
      };

      // escenas
      inner.append(h('div', { class: 'tl-label' }, 'ESCENAS'));
      const rowS = h('div', { class: 'tl-row', style: 'height:38px' });
      m.scenes.forEach((sc, i) => {
        const sel = this.sel && this.sel.kind === 'scene' && this.sel.id === sc.id;
        rowS.append(bar({
          cls: 'scene', sel, left: starts[i], width: sc.duration, label: (i + 1) + '. ' + sc.name + ' · ' + sc.duration + 's',
          alwaysResize: true, base: () => sc.duration,
          onSelect: () => this.select({ kind: 'scene', id: sc.id }, { seek: true }),
          onResize: (base, dt) => { const d = Math.max(0.5, r1(base + dt)); this.edit((mm) => { this.scene(sc.id).duration = d; }, { key: 'scdur' + sc.id, timeline: false }); return { left: starts[i], width: d }; },
        }));
      });
      inner.append(rowS);

      // elementos de la escena actual
      const sc = cur.scene, base0 = cur.start;
      inner.append(h('div', { class: 'tl-label' }, 'ELEMENTOS · ' + sc.name.toUpperCase()));
      sc.elements.forEach((el) => {
        const sel = this.sel && this.sel.kind === 'el' && this.sel.id === el.id;
        const row = h('div', { class: 'tl-row' });
        row.append(bar({
          cls: 'el-' + el.type, sel, off: !el.enabled, left: base0 + el.start, width: S.elDuration(el, sc),
          label: (el.type === 'text' ? '“' + el.text.slice(0, 24) + '”' : el.name), alwaysResize: false,
          base: () => ({ s: el.start, d: S.elDuration(el, sc) }),
          onSelect: () => this.select({ kind: 'el', id: el.id }),
          onMove: (b, dt) => { const ns = clamp(r1(b.s + dt), 0, Math.max(0, sc.duration - 0.1)); this.edit(() => { const e = this.findEl(el.id).el; e.start = ns; }, { key: 'elt' + el.id, timeline: false }); return { left: base0 + ns, width: S.elDuration(el, sc) }; },
          onResize: (b, dt) => { const nd = clamp(r1(b.d + dt), 0.1, sc.duration - el.start); this.edit(() => { this.findEl(el.id).el.duration = nd; }, { key: 'eld' + el.id, timeline: false }); return { left: base0 + el.start, width: nd }; },
        }));
        inner.append(row);
      });

      // audio
      if (m.audio.length) inner.append(h('div', { class: 'tl-label' }, 'AUDIO'));
      m.audio.forEach((tr) => {
        const sel = this.sel && this.sel.kind === 'audio' && this.sel.id === tr.id;
        if (tr.assetId) this.audioDuration(tr.assetId);
        const w = this.engine.trackWindow(tr);
        const row = h('div', { class: 'tl-row' });
        row.append(bar({
          cls: 'audio-' + tr.role, sel, left: w.gs, width: Math.max(0.3, w.ge - w.gs), label: '♪ ' + tr.name, alwaysResize: false,
          base: () => ({ s: tr.start, d: Math.max(0.3, w.ge - w.gs) }),
          onSelect: () => this.select({ kind: 'audio', id: tr.id }, { seek: false }),
          onMove: (b, dt) => { const ns = Math.max(0, r1(b.s + dt)); this.edit(() => { this.audioTrack(tr.id).start = ns; }, { key: 'aut' + tr.id, timeline: false }); const w2 = this.engine.trackWindow(this.audioTrack(tr.id)); return { left: w2.gs, width: Math.max(0.3, w2.ge - w2.gs) }; },
          onResize: (b, dt) => { const nd = Math.max(0.2, r1(b.d + dt)); this.edit(() => { this.audioTrack(tr.id).duration = nd; }, { key: 'aud' + tr.id, timeline: false }); return { left: w.gs, width: nd }; },
        }));
        inner.append(row);
      });

      inner.append(h('div', { class: 'playhead' }));
      tl.textContent = ''; tl.append(inner);
      tl.scrollLeft = sl; tl.scrollTop = st;
      this.updatePlayhead();
    },

    /* ----- panel de propiedades ----- */
    renderProps() {
      const box = $('props'); box.textContent = '';
      const s = this.sel, title = $('sheetTitle');
      if (!s) { title.textContent = 'Propiedades'; box.append(h('p', { class: 'note' }, 'Toca una escena, un elemento o un audio para editarlo.')); return; }
      if (s.kind === 'scene') this._propsScene(box, title);
      else if (s.kind === 'el') this._propsEl(box, title);
      else if (s.kind === 'audio') this._propsAudio(box, title);
      else this._propsProject(box, title);
    },
  });

  /* ---------------------------------------------------------------- controles reutilizables */
  function numRow(label, o) {
    const dec = o.dec == null ? 0 : o.dec, step = o.step || 1;
    const rng = h('input', { type: 'range', min: o.min, max: o.max, step });
    const num = h('input', { class: 'num', type: 'number', inputmode: 'decimal', min: o.min, max: o.max, step });
    const show = (v) => { rng.value = v; num.value = Number(v).toFixed(dec); };
    const commit = (v) => {
      v = parseFloat(v); if (isNaN(v)) { show(o.get()); return; }
      v = Number(clamp(v, o.min, o.max).toFixed(dec)); o.set(v); show(o.get());
    };
    rng.addEventListener('input', () => commit(rng.value));
    num.addEventListener('change', () => commit(num.value));
    const minus = h('button', { class: 'step', type: 'button', 'aria-label': 'Menos', onclick: () => commit(o.get() - step) }, '−');
    const plus = h('button', { class: 'step', type: 'button', 'aria-label': 'Más', onclick: () => commit(o.get() + step) }, '+');
    show(o.get());
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, label + (o.unit ? ' (' + o.unit + ')' : '')), h('div', { class: 'ctl' }, minus, rng, plus, num));
  }
  function selectRow(label, opts, get, set, labels) {
    const sel = h('select', {}, opts.map((v) => h('option', { value: v }, labels ? labels[v] || v : v)));
    sel.value = get();
    sel.addEventListener('change', () => set(sel.value));
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), sel);
  }
  function colorRow(label, get, set, swatches) {
    const inp = h('input', { type: 'color' });
    inp.value = toHex(get());
    inp.addEventListener('input', () => set(inp.value));
    const sw = (swatches || ['#ffffff', '#000000', '#ff6fa8', '#ffd1e3', '#f5c542', '#7c5cff', '#38bdf8', '#4ade80']).map((c) => h('button', { class: 'sw', type: 'button', style: 'background:' + c, 'aria-label': c, onclick: () => { inp.value = c; set(c); } }));
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctl' }, inp, h('div', { class: 'swatches' }, sw)));
  }
  function toHex(c) {
    if (typeof c !== 'string') return '#000000';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('').toLowerCase();
    const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = '#000'; cv.fillStyle = c;
    return /^#[0-9a-f]{6}$/i.test(cv.fillStyle) ? cv.fillStyle : '#000000';
  }
  function toggleRow(label, get, set) {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!get();
    cb.addEventListener('change', () => set(cb.checked));
    return h('div', { class: 'row' }, h('label', { class: 'toggle' }, h('span', {}, label), cb));
  }
  function textRow(label, get, set, multiline) {
    const inp = multiline ? h('textarea', {}) : h('input', { type: 'text' });
    inp.value = get();
    inp.addEventListener('input', () => set(inp.value));
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), inp);
  }
  function tabs(list, cur, onPick) {
    return h('div', { class: 'tabs' }, list.map(([k, l]) => h('button', { type: 'button', class: k === cur ? 'on' : '', onclick: () => onPick(k) }, l)));
  }
  function confirmBtn(label, cls, action) {
    const b = h('button', { class: 'btn ' + cls, type: 'button' }, label);
    let armed = false, timer;
    b.addEventListener('click', () => {
      if (!armed) { armed = true; b.textContent = '¿Seguro? Toca otra vez'; timer = setTimeout(() => { armed = false; b.textContent = label; }, 2500); return; }
      clearTimeout(timer); action();
    });
    return b;
  }

  /* ---------------------------------------------------------------- selección de archivos y reemplazo */
  let pickResolve = null;
  function pickFile(accept) {
    return new Promise((res) => {
      const inp = $('filePick'); pickResolve = res;
      inp.accept = accept; inp.value = '';
      inp.onchange = () => { const f = inp.files && inp.files[0]; pickResolve = null; res(f || null); };
      inp.click();
    });
  }
  async function downscale(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const sc = Math.min(1, 2160 / Math.max(bmp.width, bmp.height));
      if (sc === 1) return file;
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((r) => cv.toBlob(r, type, 0.9));
      return blob || file;
    } catch (e) { return file; }
  }
  /** Añade un archivo nuevo al proyecto y llama a apply(manifest, assetId). */
  async function replaceAsset(kind, file, apply) {
    let blob = file;
    if (kind === 'image') blob = await downscale(file);
    let ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ext || ext === file.name.toLowerCase()) ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav' }[file.type] || 'bin';
    if (blob !== file && blob.type === 'image/jpeg') ext = 'jpg';
    const id = S.uid('a');
    const slug = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'archivo';
    const folder = { image: 'images', video: 'videos', audio: 'audio' }[kind];
    const path = 'assets/' + folder + '/' + slug + '-' + id.slice(2) + '.' + ext;
    app.state.files.set(path, blob.slice(0, blob.size, Z.mimeOf(path)));
    app.state.added.add(id);
    app.edit((m) => { m.assets[id] = { type: kind, path, name: file.name }; apply(m, id); }, { props: true });
    toast('Archivo reemplazado');
  }
  function replaceButton(label, kind, accept, apply) {
    return h('button', { class: 'btn', type: 'button', onclick: async () => { const f = await pickFile(accept); if (f) replaceAsset(kind, f, apply); } }, label);
  }

  /* ---------------------------------------------------------------- panel: escena */
  app._propsScene = function (box, title) {
    const sc = this.scene(this.sel.id);
    if (!sc) return;
    const m = this.state.manifest, i = m.scenes.indexOf(sc), id = sc.id;
    title.textContent = 'Escena ' + (i + 1) + ' · ' + sc.name;
    const tab = ['main', 'bg'].includes(this.tab) ? this.tab : 'main';
    box.append(tabs([['main', 'Escena'], ['bg', 'Fondo']], tab, (k) => { this.tab = k; this.renderProps(); }));
    const S_ = () => this.scene(id);
    if (tab === 'main') {
      box.append(textRow('Nombre', () => S_().name, (v) => { this.edit(() => { S_().name = v; }, { key: 'scn' + id, props: false }); title.textContent = 'Escena ' + (i + 1) + ' · ' + v; }));
      box.append(numRow('Duración', { min: 0.5, max: 60, step: 0.1, dec: 1, unit: 's', get: () => S_().duration, set: (v) => this.edit(() => { S_().duration = v; }, { key: 'scdur' + id }) }));
      box.append(selectRow('Transición de entrada', S.TRANSITIONS, () => S_().transition.type, (v) => this.edit(() => { S_().transition.type = v; }, { props: true }), { none: 'Corte directo', fade: 'Fundido' }));
      if (sc.transition.type !== 'none') box.append(numRow('Duración de la transición', { min: 0.1, max: 2, step: 0.1, dec: 1, unit: 's', get: () => S_().transition.duration, set: (v) => this.edit(() => { S_().transition.duration = v; }, { key: 'sctr' + id }) }));
      box.append(h('div', { class: 'btnrow' },
        h('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => moveScene(id, -1) }, '◀ Antes'),
        h('button', { class: 'btn', type: 'button', disabled: i === m.scenes.length - 1, onclick: () => moveScene(id, 1) }, 'Después ▶'),
        h('button', { class: 'btn', type: 'button', onclick: () => duplicateScene(id) }, '⧉ Duplicar'),
        m.scenes.length > 1 ? confirmBtn('🗑 Eliminar', 'danger', () => deleteScene(id)) : null));
    } else {
      box.append(colorRow('Color de fondo', () => S_().background.color, (v) => this.edit(() => { S_().background.color = v; }, { key: 'scbg' + id })));
      const a = sc.background.assetId && m.assets[sc.background.assetId];
      box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Imagen o video de fondo'), h('div', { class: 'file-name' }, a ? a.name : 'Sin imagen (solo color)')));
      box.append(h('div', { class: 'btnrow' },
        replaceButton('🖼 Cambiar fondo', 'image', 'image/*,video/*', (mm, aid) => { S_().background.assetId = aid; mm.assets[aid].type = 'image'; }),
        a ? h('button', { class: 'btn', type: 'button', onclick: () => this.edit(() => { S_().background.assetId = null; }, { props: true }) }, 'Quitar imagen') : null));
      box.append(h('p', { class: 'note' }, 'Si eliges un video del carrete como fondo, REV lo trata como video automáticamente.'));
    }
  };

  /* ---------------------------------------------------------------- panel: elemento */
  app._propsEl = function (box, title) {
    const f = this.findEl(this.sel.id);
    if (!f) return;
    const { el, scene: sc } = f, id = el.id;
    const E_ = () => this.findEl(id).el;
    title.textContent = TYPE_LABEL[el.type] + ' · ' + (el.type === 'text' ? el.text.slice(0, 20) : el.name);
    const mainLabel = { text: 'Texto', image: 'Imagen', video: 'Video', shape: 'Forma' }[el.type] || 'Contenido';
    const list = [['main', mainLabel], ['pos', 'Posición'], ['time', 'Tiempo'], ['fx', 'Efectos']];
    const tab = list.some((x) => x[0] === this.tab) ? this.tab : 'main';
    box.append(tabs(list, tab, (k) => { this.tab = k; this.renderProps(); }));
    const set = (fn, key, props) => this.edit(() => fn(E_()), { key: key ? key + id : null, props: !!props });

    if (tab === 'main') {
      if (el.type === 'text') {
        box.append(textRow('Contenido', () => E_().text, (v) => set((e) => { e.text = v; }, 'txt'), true));
        const fonts = Object.keys(REV.FONT_PRESETS).concat(Object.entries(this.state.manifest.assets).filter(([, a]) => a.type === 'font').map(([k]) => 'asset:' + k));
        const flabels = Object.assign({}, REV.FONT_PRESETS); fonts.forEach((fk) => { if (fk.startsWith('asset:')) flabels[fk] = this.state.manifest.assets[fk.slice(6)].name; });
        if (!fonts.includes(el.fontFamily)) { fonts.push(el.fontFamily); flabels[el.fontFamily] = el.fontFamily; }
        box.append(selectRow('Tipo de letra', fonts, () => E_().fontFamily, (v) => set((e) => { e.fontFamily = v; }), flabels));
        box.append(numRow('Tamaño', { min: 16, max: 320, step: 2, unit: 'px', get: () => E_().fontSize, set: (v) => set((e) => { e.fontSize = v; }, 'fs') }));
        box.append(colorRow('Color', () => E_().color, (v) => set((e) => { e.color = v; }, 'col')));
        box.append(selectRow('Grosor', ['400', '600', '700', '900'], () => String(E_().fontWeight), (v) => set((e) => { e.fontWeight = +v; }), { 400: 'Normal', 600: 'Seminegrita', 700: 'Negrita', 900: 'Extra negrita' }));
        box.append(selectRow('Alineación', ['left', 'center', 'right'], () => E_().align, (v) => set((e) => { e.align = v; }), { left: 'Izquierda', center: 'Centro', right: 'Derecha' }));
      } else if (el.type === 'shape') {
        box.append(colorRow('Color de relleno', () => E_().fill, (v) => set((e) => { e.fill = v; }, 'fill')));
        box.append(selectRow('Forma', ['rect', 'ellipse'], () => E_().shape, (v) => set((e) => { e.shape = v; }, null, true), { rect: 'Rectángulo', ellipse: 'Elipse' }));
        if (el.shape === 'rect') box.append(numRow('Esquinas redondeadas', { min: 0, max: 400, step: 4, unit: 'px', get: () => E_().radius, set: (v) => set((e) => { e.radius = v; }, 'rad') }));
      } else {
        const a = this.state.manifest.assets[el.assetId];
        box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, el.type === 'image' ? 'Archivo de imagen' : 'Archivo de video'), h('div', { class: 'file-name' }, a ? a.name : '(falta el archivo)')));
        box.append(h('div', { class: 'btnrow' }, el.type === 'image'
          ? replaceButton('🖼 Reemplazar imagen', 'image', 'image/*', (mm, aid) => { const e = this.findEl(id).el; e.assetId = aid; e.paletteOverrides = {}; })
          : replaceButton('🎞 Reemplazar video', 'video', 'video/*', (mm, aid) => { this.findEl(id).el.assetId = aid; })));
        box.append(selectRow('Ajuste', ['contain', 'cover'], () => E_().fit, (v) => set((e) => { e.fit = v; }), { contain: 'Completo (sin recortar)', cover: 'Llenar (recorta)' }));
        if (el.type === 'image' && a && Array.isArray(a.palette) && a.palette.length) {
          box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Colores de este dibujo')));
          a.palette.forEach((p) => {
            box.append(colorRow(p.label || p.id, () => (E_().paletteOverrides || {})[p.id] || p.color, (v) => set((e) => { e.paletteOverrides = e.paletteOverrides || {}; e.paletteOverrides[p.id] = v; }, 'pal' + p.id)));
          });
          box.append(h('button', { class: 'btn small', type: 'button', onclick: () => set((e) => { e.paletteOverrides = {}; }, null, true) }, '↺ Colores originales'));
        }
        if (el.type === 'video') {
          box.append(toggleRow('Repetir en bucle', () => E_().loop, (v) => set((e) => { e.loop = v; })));
          box.append(toggleRow('Sin sonido', () => E_().muted, (v) => set((e) => { e.muted = v; })));
          box.append(numRow('Empezar el clip en', { min: 0, max: 120, step: 0.1, dec: 1, unit: 's', get: () => E_().trimStart, set: (v) => set((e) => { e.trimStart = v; }, 'trim') }));
          box.append(numRow('Esquinas redondeadas', { min: 0, max: 400, step: 4, unit: 'px', get: () => E_().radius, set: (v) => set((e) => { e.radius = v; }, 'rad') }));
        }
      }
      box.append(textRow('Nombre en la línea de tiempo', () => E_().name, (v) => set((e) => { e.name = v; }, 'nm')));
      box.append(toggleRow('Visible', () => E_().enabled, (v) => set((e) => { e.enabled = v; })));
      box.append(h('div', { class: 'btnrow' },
        h('button', { class: 'btn', type: 'button', onclick: () => duplicateEl(id) }, '⧉ Duplicar'),
        confirmBtn('🗑 Eliminar', 'danger', () => deleteEl(id))));
    } else if (tab === 'pos') {
      box.append(numRow('Posición horizontal', { min: -540, max: 1620, step: 5, unit: 'px', get: () => E_().x, set: (v) => set((e) => { e.x = v; }, 'x') }));
      box.append(numRow('Posición vertical', { min: -960, max: 2880, step: 5, unit: 'px', get: () => E_().y, set: (v) => set((e) => { e.y = v; }, 'y') }));
      box.append(numRow('Ancho', { min: 20, max: 2160, step: 5, unit: 'px', get: () => E_().w, set: (v) => set((e) => { e.w = v; }, 'w') }));
      if (el.type !== 'text') box.append(numRow('Alto', { min: 20, max: 3840, step: 5, unit: 'px', get: () => E_().h, set: (v) => set((e) => { e.h = v; }, 'h') }));
      box.append(numRow('Rotación', { min: -180, max: 180, step: 1, unit: '°', get: () => E_().rotation, set: (v) => set((e) => { e.rotation = v; }, 'rot') }));
      box.append(numRow('Opacidad', { min: 0, max: 1, step: 0.05, dec: 2, get: () => E_().opacity, set: (v) => set((e) => { e.opacity = v; }, 'op') }));
      box.append(toggleRow('Voltear horizontalmente', () => E_().flipX, (v) => set((e) => { e.flipX = v; })));
      box.append(h('div', { class: 'btnrow' },
        h('button', { class: 'btn', type: 'button', onclick: () => moveLayer(id, 1) }, '⬆ Traer al frente'),
        h('button', { class: 'btn', type: 'button', onclick: () => moveLayer(id, -1) }, '⬇ Enviar atrás')));
    } else if (tab === 'time') {
      const maxS = sc.duration;
      box.append(numRow('Empieza en', { min: 0, max: Math.max(0, maxS - 0.1), step: 0.1, dec: 1, unit: 's', get: () => E_().start, set: (v) => set((e) => { e.start = v; }, 'st') }));
      box.append(numRow('Dura', { min: 0.1, max: maxS, step: 0.1, dec: 1, unit: 's', get: () => S.elDuration(E_(), this.findEl(id).scene), set: (v) => set((e) => { e.duration = v; }, 'du') }));
      box.append(toggleRow('Hasta el final de la escena', () => E_().duration == null, (v) => set((e) => { e.duration = v ? null : S.elDuration(e, this.findEl(id).scene); }, null, true)));
      box.append(toggleRow('Animaciones activadas', () => E_().anim.enabled !== false, (v) => set((e) => { e.anim.enabled = v; })));
      box.append(selectRow('Animación de entrada', S.ENTER_EXIT, () => E_().anim.in.type, (v) => set((e) => { e.anim.in.type = v; if (v !== 'none' && !e.anim.in.duration) e.anim.in.duration = 0.5; }, null, true), IN_LABEL));
      if (el.anim.in.type !== 'none') box.append(numRow('Duración de la entrada', { min: 0.1, max: 3, step: 0.1, dec: 1, unit: 's', get: () => E_().anim.in.duration, set: (v) => set((e) => { e.anim.in.duration = v; }, 'ind') }));
      box.append(selectRow('Animación de salida', S.ENTER_EXIT, () => E_().anim.out.type, (v) => set((e) => { e.anim.out.type = v; if (v !== 'none' && !e.anim.out.duration) e.anim.out.duration = 0.4; }, null, true), OUT_LABEL));
      if (el.anim.out.type !== 'none') box.append(numRow('Duración de la salida', { min: 0.1, max: 3, step: 0.1, dec: 1, unit: 's', get: () => E_().anim.out.duration, set: (v) => set((e) => { e.anim.out.duration = v; }, 'outd') }));
      box.append(selectRow('Movimiento continuo', S.LOOPS, () => E_().anim.loop.type, (v) => set((e) => { e.anim.loop.type = v; }, null, true), LOOP_LABEL));
      if (el.anim.loop.type !== 'none') {
        box.append(numRow('Velocidad', { min: 0.1, max: 3, step: 0.1, dec: 1, unit: 'ciclos/s', get: () => E_().anim.loop.speed, set: (v) => set((e) => { e.anim.loop.speed = v; }, 'lsp') }));
        box.append(numRow('Intensidad', { min: 0.2, max: 3, step: 0.1, dec: 1, get: () => E_().anim.loop.amount, set: (v) => set((e) => { e.anim.loop.amount = v; }, 'lam') }));
      }
    } else {
      box.append(numRow('Desenfoque', { min: 0, max: 40, step: 1, unit: 'px', get: () => E_().blur, set: (v) => set((e) => { e.blur = v; }, 'blur') }));
      box.append(toggleRow('Sombra', () => !!E_().shadow, (v) => set((e) => { e.shadow = v ? { color: 'rgba(0,0,0,0.45)', blur: 16, y: 8 } : null; }, null, true)));
      if (el.shadow) {
        box.append(numRow('Difuminado de la sombra', { min: 0, max: 80, step: 1, unit: 'px', get: () => E_().shadow.blur, set: (v) => set((e) => { e.shadow.blur = v; }, 'shb') }));
        box.append(colorRow('Color de la sombra', () => E_().shadow.color, (v) => set((e) => { e.shadow.color = v; }, 'shc'), ['#000000', '#ff6fa8', '#ffffff', '#7c5cff']));
      }
    }
  };

  /* ---------------------------------------------------------------- panel: audio */
  app._propsAudio = function (box, title) {
    const tr = this.audioTrack(this.sel.id);
    if (!tr) return;
    const id = tr.id, A = () => this.audioTrack(id), m = this.state.manifest;
    title.textContent = '♪ ' + tr.name;
    const a = m.assets[tr.assetId];
    const set = (fn, key, props) => this.edit(() => fn(A()), { key: key ? key + id : null, props: !!props });
    box.append(textRow('Nombre', () => A().name, (v) => set((t) => { t.name = v; }, 'aun'), false));
    box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Archivo de audio'), h('div', { class: 'file-name' }, a ? a.name : '(falta el archivo)')));
    box.append(h('div', { class: 'btnrow' }, replaceButton('🎵 Reemplazar audio', 'audio', 'audio/*', (mm, aid) => { this.audioTrack(id).assetId = aid; })));
    box.append(selectRow('Tipo', S.AUDIO_ROLES, () => A().role, (v) => set((t) => { t.role = v; }, null, true), { narration: 'Narración', music: 'Música', sfx: 'Efecto de sonido' }));
    box.append(numRow('Volumen', { min: 0, max: 1, step: 0.05, dec: 2, get: () => A().volume, set: (v) => set((t) => { t.volume = v; }, 'vol') }));
    const sceneOpts = [''].concat(m.scenes.map((s) => s.id)), starts = S.sceneStarts(m);
    const sl = { '': 'Todo el video (tiempo absoluto)' }; m.scenes.forEach((s, i) => { sl[s.id] = 'Escena ' + (i + 1) + ' · ' + s.name; });
    box.append(selectRow('Empieza relativo a', sceneOpts, () => A().sceneId || '', (v) => set((t) => {
      const oldBase = t.sceneId ? starts[m.scenes.findIndex((s) => s.id === t.sceneId)] : 0;
      const abs = oldBase + t.start;
      t.sceneId = v || null;
      const nb = v ? starts[m.scenes.findIndex((s) => s.id === v)] : 0;
      t.start = Math.max(0, r1(abs - nb));
    }, null, true), sl));
    box.append(numRow('Empieza en', { min: 0, max: 600, step: 0.1, dec: 1, unit: 's', get: () => A().start, set: (v) => set((t) => { t.start = v; }, 'aus') }));
    box.append(toggleRow('Repetir en bucle', () => A().loop, (v) => set((t) => { t.loop = v; })));
    box.append(toggleRow('Cortar a una duración fija', () => A().duration != null, (v) => set((t) => { const w = this.engine.trackWindow(t); t.duration = v ? Math.max(0.2, r1(w.ge - w.gs)) : null; }, null, true)));
    if (tr.duration != null) box.append(numRow('Duración', { min: 0.2, max: 600, step: 0.1, dec: 1, unit: 's', get: () => A().duration, set: (v) => set((t) => { t.duration = v; }, 'aud') }));
    box.append(h('div', { class: 'btnrow' }, confirmBtn('🗑 Quitar este audio', 'danger', () => {
      this.edit((mm) => { mm.audio = mm.audio.filter((t) => t.id !== id); }, { props: true });
      this.sel = { kind: 'scene', id: this.curScene().id }; this.renderProps(); this.renderTimeline();
    })));
  };

  /* ---------------------------------------------------------------- panel: proyecto */
  app._propsProject = function (box, title) {
    const st = this.state, m = st.manifest;
    title.textContent = 'Proyecto';
    box.append(textRow('Título del proyecto', () => m.meta.title, (v) => this.edit((mm) => { mm.meta.title = v; }, { key: 'ptitle', timeline: false })));
    box.append(h('p', { class: 'note' }, m.scenes.length + ' escenas · ' + S.totalDuration(m).toFixed(1) + ' s · ' + m.canvas.width + '×' + m.canvas.height + ' · ' + m.canvas.fps + ' fps · formato rev-project v' + m.version));
    box.append(h('div', { class: 'btnrow' },
      h('button', { class: 'btn primary', type: 'button', onclick: downloadZip }, '⬇ Descargar ZIP'),
      h('button', { class: 'btn', type: 'button', onclick: saveLocal }, '💾 Guardar en este navegador')));
    box.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Exportar video final (MP4 1080×1920)'),
      h('button', { class: 'btn', type: 'button', disabled: true }, '🎬 MP4 — aún no disponible'),
      h('p', { class: 'note' }, 'Todavía no implementado. Está planificado para la siguiente etapa; hasta entonces el flujo es editar aquí y descargar el ZIP.')));
    if (st.warnings.length) {
      box.append(h('span', { class: 'lbl' }, 'Avisos al abrir el proyecto'));
      st.warnings.forEach((w) => box.append(h('p', { class: 'warn' }, '⚠ ' + w)));
    }
    box.append(h('div', { class: 'btnrow' }, confirmBtn('Cerrar proyecto', '', closeProject)));
  };

  /* ---------------------------------------------------------------- acciones sobre escenas/elementos */
  function moveScene(id, dir) {
    app.edit((m) => { const i = m.scenes.findIndex((s) => s.id === id), j = i + dir; if (j < 0 || j >= m.scenes.length) return; [m.scenes[i], m.scenes[j]] = [m.scenes[j], m.scenes[i]]; }, { props: true });
    app.select({ kind: 'scene', id }, { seek: true });
  }
  function reid(obj, map) { const old = obj.id; obj.id = S.uid(old.split('_')[0]); map[old] = obj.id; }
  function duplicateScene(id) {
    let newId;
    app.edit((m) => {
      const i = m.scenes.findIndex((s) => s.id === id), src = m.scenes[i];
      const cp = JSON.parse(JSON.stringify(src)), map = {};
      reid(cp, map); cp.name = src.name + ' (copia)'; cp.elements.forEach((e) => reid(e, map));
      m.scenes.splice(i + 1, 0, cp); newId = cp.id;
      m.audio.filter((t) => t.sceneId === id).forEach((t) => { const c = JSON.parse(JSON.stringify(t)); c.id = S.uid('au'); c.sceneId = cp.id; m.audio.push(c); });
    }, { props: true });
    app.select({ kind: 'scene', id: newId }, { seek: true });
    toast('Escena duplicada');
  }
  function deleteScene(id) {
    let next;
    app.edit((m) => {
      const i = m.scenes.findIndex((s) => s.id === id);
      const gone = m.audio.filter((t) => t.sceneId === id).length;
      m.scenes.splice(i, 1); m.audio = m.audio.filter((t) => t.sceneId !== id);
      next = m.scenes[Math.min(i, m.scenes.length - 1)].id;
      if (gone) toast('También se quitó el audio de esa escena (puedes deshacer)');
    }, { props: true });
    app.engine.t = clamp(app.engine.t, 0, S.totalDuration(app.state.manifest));
    app.select({ kind: 'scene', id: next }, { seek: true });
  }
  function duplicateEl(id) {
    let nid;
    app.edit(() => {
      const f = app.findEl(id), i = f.scene.elements.indexOf(f.el);
      const cp = JSON.parse(JSON.stringify(f.el)); cp.id = S.uid('el'); cp.name = f.el.name + ' copia'; cp.x += 40; cp.y += 40; nid = cp.id;
      f.scene.elements.splice(i + 1, 0, cp);
    }, { props: true });
    app.select({ kind: 'el', id: nid });
  }
  function deleteEl(id) {
    const sid = app.findEl(id).scene.id;
    app.edit(() => { const f = app.findEl(id); f.scene.elements.splice(f.scene.elements.indexOf(f.el), 1); }, { props: true });
    app.select({ kind: 'scene', id: sid }, { open: false });
  }
  function moveLayer(id, dir) {
    app.edit(() => { const f = app.findEl(id), a = f.scene.elements, i = a.indexOf(f.el), j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }, { props: true });
  }
  function addText() {
    const sc = app.curScene(), id = S.uid('el');
    app.edit((m) => {
      const s = app.scene(sc.id);
      s.elements.push({ id, type: 'text', name: 'Texto nuevo', start: 0, duration: null, x: 90, y: 820, w: 900, h: 0, text: 'Nuevo texto', fontSize: 90, color: '#ffffff', fontWeight: 800, align: 'center', anim: { in: { type: 'fade', duration: 0.5 } } });
      S.normalize(m);
    }, { props: true });
    app.select({ kind: 'el', id });
    app.tab = 'main';
    app.renderProps();
  }

  /* ---------------------------------------------------------------- guardar / descargar / abrir */
  function slug() { return (app.state.manifest.meta.title || 'proyecto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto'; }
  async function downloadZip() {
    try {
      toast('Preparando ZIP…');
      const blob = await Z.save(app.state.manifest, app.state.files, app.state.added);
      const a = h('a', { href: URL.createObjectURL(blob), download: slug() + '.zip' });
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 8000);
      app.state.dirty = false; app.updateChrome();
      toast('ZIP listo (' + (blob.size / 1048576).toFixed(1) + ' MB)');
    } catch (e) { toast('No pude crear el ZIP: ' + e.message); }
  }
  async function saveLocal() {
    try {
      const blob = await Z.save(app.state.manifest, app.state.files, app.state.added);
      await DB.put('last', { title: app.state.manifest.meta.title, blob, saved: Date.now() });
      app.state.dirty = false; app.updateChrome();
      toast('Guardado en este navegador. Descarga también el ZIP como respaldo.');
    } catch (e) { toast('No pude guardar aquí: ' + e.message + '. Usa “⬇ ZIP”.'); }
  }
  function closeProject() {
    if (app.engine) app.engine.pause();
    $('app').hidden = true; $('home').hidden = false; app.state = null; refreshResume();
  }
  async function openProject(input) {
    const { manifest, files } = await Z.load(input);
    const res = S.normalize(manifest, (p) => files.has(p));
    if (res.errors.length) throw new Error(res.errors.join('\n'));
    if (app.engine) app.engine.pause();
    app.urls.forEach((u) => URL.revokeObjectURL(u)); app.urls.clear();
    app.imgCache.forEach((u) => URL.revokeObjectURL(u)); app.imgCache.clear(); app.audioDurs.clear(); app.fontsLoaded.clear();
    app.state = { manifest, files, added: new Set(), warnings: res.warnings, dirty: false };
    app.undo = []; app.redo = []; app.tab = 'main';
    $('home').hidden = true; $('app').hidden = false;
    if (!app.engine) { app.engine = new REV.Engine($('stage'), app); app.engine.onTick = () => app.onTime(); app.engine.onEnd = () => { $('btnPlay').textContent = '▶'; }; }
    app.engine.sig = ''; app.engine.audio.forEach((n) => n.el.pause()); app.engine.audio.clear(); app.engine.t = app.posterTime(manifest.scenes[0]);
    layout();
    app.sel = { kind: 'scene', id: manifest.scenes[0].id };
    app.sceneIdx = 0;
    app.refresh({ props: true });
    app.loadFonts();
    $('sheet').classList.remove('open');
    if (res.warnings.length) toast(res.warnings.length + ' aviso(s): toca el título para verlos');
  }
  async function refreshResume() {
    try { const r = await DB.get('last'); $('btnResume').hidden = !r; if (r) $('btnResume').textContent = '↩ Continuar: ' + r.title; } catch (e) { $('btnResume').hidden = true; }
  }

  /* ---------------------------------------------------------------- escenario: tamaño y arrastre */
  function layout() {
    const wrap = $('stageWrap'), pad = 12;
    const w = wrap.clientWidth - pad, hgt = wrap.clientHeight - pad;
    if (w <= 0 || hgt <= 0) return;
    const sc = Math.min(w / 1080, hgt / 1920);
    app.scale = sc;
    $('stageBox').style.width = 1080 * sc + 'px'; $('stageBox').style.height = 1920 * sc + 'px';
    $('stage').style.transform = 'scale(' + sc + ')';
    $('stage').style.setProperty('--inv', String(1 / sc));
  }
  function setupStage() {
    const stage = $('stage');
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      if (!app.state) return;
      const handle = e.target.closest('.handle'), node = e.target.closest('.el');
      if (!node) { app.select({ kind: 'scene', id: app.curScene().id }, { open: false }); return; }
      const id = node.dataset.id, f = app.findEl(id);
      if (!f) return;
      if (!(app.sel && app.sel.kind === 'el' && app.sel.id === id)) app.select({ kind: 'el', id }, { seek: false });
      stage.setPointerCapture(e.pointerId);
      drag = { mode: handle ? 'resize' : 'move', id, x0: e.clientX, y0: e.clientY, ox: f.el.x, oy: f.el.y, ow: f.el.w, oh: f.el.h, moved: false };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x0) / app.scale, dy = (e.clientY - drag.y0) / app.scale;
      if (!drag.moved && Math.hypot(dx, dy) * app.scale < 4) return;
      drag.moved = true;
      app.edit(() => {
        const el = app.findEl(drag.id).el;
        if (drag.mode === 'move') { el.x = Math.round(drag.ox + dx); el.y = Math.round(drag.oy + dy); }
        else {
          const r = (-el.rotation * Math.PI) / 180, rx = dx * Math.cos(r) - dy * Math.sin(r), ry = dx * Math.sin(r) + dy * Math.cos(r);
          const nw = Math.max(30, Math.round(drag.ow + rx));
          el.w = nw;
          if (el.type === 'image' || el.type === 'video') el.h = Math.round(drag.oh * (nw / drag.ow));
          else if (el.type === 'shape') el.h = Math.max(30, Math.round(drag.oh + ry));
        }
      }, { key: 'drag' + drag.id, timeline: false });
    });
    const end = () => { if (drag && drag.moved) { app.endGesture(); app.renderProps(); } drag = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  }

  /* ---------------------------------------------------------------- utilidades de interfaz */
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  window.REV_toast = toast;

  async function guarded(fn) {
    $('homeMsg').textContent = '';
    try { await fn(); } catch (e) { console.error(e); $('homeMsg').textContent = 'No pude abrir el proyecto:\n' + e.message; toast('Error: ' + e.message); }
  }

  function init() {
    $('fileOpen').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) guarded(() => openProject(f)); });
    $('btnSample').addEventListener('click', () => guarded(async () => { const r = await fetch('samples/espirit-demo.zip'); if (!r.ok) throw new Error('No encontré samples/espirit-demo.zip (' + r.status + ')'); await openProject(await r.blob()); }));
    $('btnResume').addEventListener('click', () => guarded(async () => { const r = await DB.get('last'); if (r) await openProject(r.blob); }));
    $('btnUndo').addEventListener('click', () => app.undoStep());
    $('btnRedo').addEventListener('click', () => app.redoStep());
    $('btnSave').addEventListener('click', saveLocal);
    $('btnDownload').addEventListener('click', downloadZip);
    $('btnProject').addEventListener('click', () => app.select({ kind: 'project' }));
    $('btnAddText').addEventListener('click', addText);
    $('btnPlay').addEventListener('click', () => {
      if (app.engine.playing) app.pausePlayback();
      else { app.engine.play(); $('btnPlay').textContent = '⏸'; }
    });
    $('scrub').addEventListener('input', () => {
      if (app.engine.playing) app.pausePlayback();
      app.engine.seek(($('scrub').value / 1000) * S.totalDuration(app.state.manifest)); app.onTime();
    });
    $('btnZoomIn').addEventListener('click', () => { app.pps = Math.min(160, app.pps * 1.4); app.renderTimeline(); });
    $('btnZoomOut').addEventListener('click', () => { app.pps = Math.max(10, app.pps / 1.4); app.renderTimeline(); });
    $('sheetHead').addEventListener('click', () => $('sheet').classList.toggle('open'));
    new ResizeObserver(layout).observe($('stageWrap'));
    window.addEventListener('resize', layout);
    setupStage();
    window.addEventListener('beforeunload', (e) => { if (app.state && app.state.dirty) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('keydown', (e) => {
      if (!app.state || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); $('btnPlay').click(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? app.redoStep() : app.undoStep(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && app.sel && app.sel.kind === 'el') { e.preventDefault(); deleteEl(app.sel.id); }
    });
    refreshResume();
  }
  init();
})();
