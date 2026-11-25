/* REV · motor de vista previa: dibuja la escena en el instante t, reproduce y sincroniza audio/video. */
(function (g) {
  'use strict';
  const REV = (g.REV = g.REV || {});
  const S = REV.schema;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const E = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const FONTS = {
    system: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Arial Rounded MT Bold", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    script: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive',
    mono: 'ui-monospace, Menlo, Consolas, monospace',
  };
  REV.FONT_PRESETS = { system: 'Sistema', rounded: 'Redondeada', serif: 'Serif', script: 'Manuscrita', mono: 'Monoespaciada' };
  const DIST = 260;

  /** Estado visual (traslación/escala/rotación/opacidad) de un elemento en el instante local `local`. */
  function animState(el, local, end) {
    const s = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, op: 1 };
    const a = el.anim;
    if (!a || a.enabled === false) return s;
    const apply = (type, r, isIn, p) => {
      // r: 1 = estado "fuera", 0 = estado normal
      switch (type) {
        case 'fade': s.op *= 1 - r; break;
        case 'from-bottom': s.ty += DIST * r; s.op *= 1 - r; break;
        case 'from-top': s.ty -= DIST * r; s.op *= 1 - r; break;
        case 'from-left': s.tx -= DIST * r; s.op *= 1 - r; break;
        case 'from-right': s.tx += DIST * r; s.op *= 1 - r; break;
        case 'zoom-in': { const k = 1 - 0.45 * r; s.sx *= k; s.sy *= k; s.op *= 1 - r; break; }
        case 'zoom-out': { const k = 1 + 0.6 * r; s.sx *= k; s.sy *= k; s.op *= 1 - r; break; }
        case 'pop': { const k = isIn ? E.back(p) : 1 - E.in(p); s.sx *= Math.max(0, k); s.sy *= Math.max(0, k); break; }
        case 'spin': { const k = 1 - 0.5 * r; s.sx *= k; s.sy *= k; s.rot += (isIn ? -1 : 1) * 180 * r; s.op *= 1 - r; break; }
        default: break;
      }
    };
    const tin = local - el.start;
    const ai = a.in;
    if (ai && ai.type !== 'none' && ai.duration > 0 && tin < ai.duration) {
      const p = clamp(tin / ai.duration, 0, 1);
      apply(ai.type, 1 - E.out(p), true, p);
    }
    const ao = a.out;
    const remain = end - local;
    if (ao && ao.type !== 'none' && ao.duration > 0 && remain < ao.duration) {
      const p = clamp(1 - remain / ao.duration, 0, 1);
      apply(ao.type, E.in(p), false, p);
    }
    const lp = a.loop;
    if (lp && lp.type !== 'none') {
      const ph = tin * lp.speed * Math.PI * 2, k = lp.amount;
      switch (lp.type) {
        case 'float': s.ty += -Math.sin(ph) * 24 * k; break;
        case 'pulse': { const v = 1 + 0.06 * k * Math.sin(ph); s.sx *= v; s.sy *= v; break; }
        case 'sway': s.rot += Math.sin(ph) * 6 * k; break;
        case 'spin': s.rot += tin * lp.speed * 360; break;
        case 'blink': s.op *= 0.65 + 0.35 * Math.cos(ph) * k + 0.35 * (1 - k); break;
        default: break;
      }
    }
    return s;
  }
  REV.animState = animState;

  class Engine {
    constructor(stage, app) {
      this.stage = stage; this.app = app;
      this.t = 0; this.playing = false; this.sig = ''; this.nodes = new Map();
      this.audio = new Map(); this.ctx = null; this.bgNode = null; this.sceneNode = null;
      this._loop = this._loop.bind(this);
      this.onTick = null; this.onEnd = null;
    }
    get m() { return this.app.state ? this.app.state.manifest : null; }

    locate(t) {
      const m = this.m, starts = S.sceneStarts(m);
      let i = starts.length - 1;
      for (let k = 0; k < starts.length; k++) if (t < starts[k] + m.scenes[k].duration) { i = k; break; }
      const sc = m.scenes[i];
      return { scene: sc, index: i, start: starts[i], local: clamp(t - starts[i], 0, sc.duration) };
    }

    seek(t) { this.t = clamp(t, 0, S.totalDuration(this.m)); this.render(); }

    /* ---------- construcción del DOM de la escena actual ---------- */
    _build(scene) {
      this.stage.textContent = '';
      this.nodes.clear();
      const sceneNode = document.createElement('div'); sceneNode.className = 'scene';
      const bg = document.createElement('div'); bg.className = 'bg'; sceneNode.appendChild(bg);
      this.bgNode = bg; this.bgKey = null;
      scene.elements.forEach((el) => {
        if (!S.ELEMENT_TYPES.includes(el.type)) return;
        const outer = document.createElement('div'); outer.className = 'el'; outer.dataset.id = el.id;
        const inner = document.createElement('div'); inner.className = 'in';
        let content;
        if (el.type === 'image') { content = document.createElement('img'); content.draggable = false; content.alt = ''; }
        else if (el.type === 'video') { content = document.createElement('video'); content.muted = true; content.playsInline = true; content.setAttribute('playsinline', ''); content.preload = 'auto'; }
        else if (el.type === 'text') { content = document.createElement('div'); content.className = 'txt'; }
        else { content = document.createElement('div'); content.className = 'shp'; }
        inner.appendChild(content); outer.appendChild(inner);
        sceneNode.appendChild(outer);
        this.nodes.set(el.id, { outer, inner, content, el });
      });
      this.stage.appendChild(sceneNode);
      this.sceneNode = sceneNode;
    }

    /* ---------- dibujo ---------- */
    render() {
      const m = this.m;
      if (!m) return;
      const loc = this.locate(this.t);
      const sc = loc.scene;
      const sig = sc.id + '|' + sc.elements.map((e) => e.id + e.type).join(',');
      if (sig !== this.sig) { this.sig = sig; this._build(sc); }
      this.curScene = sc;
      const sel = this.app.sel;
      const selId = sel && sel.kind === 'el' ? sel.id : null;

      // transición de entrada de la escena
      let sceneOp = 1;
      const tr = sc.transition;
      if (tr && tr.type === 'fade' && tr.duration > 0 && loc.index > 0) sceneOp = clamp(loc.local / tr.duration, 0, 1);
      this.sceneNode.style.opacity = sceneOp;

      this._renderBg(sc, loc.local);
      const old = this.stage.querySelector('.handle'); if (old) old.remove();

      sc.elements.forEach((el) => {
        const n = this.nodes.get(el.id);
        if (!n) return;
        const end = S.elEnd(el, sc);
        const visible = el.enabled && loc.local >= el.start - 1e-6 && loc.local <= end + 1e-6;
        n.outer.style.display = visible ? '' : 'none';
        n.el = el;
        this._renderContent(n, el, loc.local, visible);
        if (!visible) { if (el.type === 'video' && !n.content.paused) n.content.pause(); return; }
        const st = animState(el, loc.local, end);
        const o = n.outer.style;
        o.left = el.x + 'px'; o.top = el.y + 'px'; o.width = el.w + 'px';
        o.height = el.h > 0 ? el.h + 'px' : 'auto';
        o.transform = 'rotate(' + el.rotation + 'deg)';
        const i = n.inner.style;
        i.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) rotate(' + st.rot + 'deg) scale(' + (st.sx * (el.flipX ? -1 : 1)) + ',' + st.sy + ')';
        i.opacity = String(clamp(el.opacity * st.op, 0, 1));
        const f = [];
        if (el.blur > 0) f.push('blur(' + el.blur + 'px)');
        if (el.shadow) f.push('drop-shadow(0 ' + (el.shadow.y == null ? 8 : el.shadow.y) + 'px ' + (el.shadow.blur == null ? 16 : el.shadow.blur) + 'px ' + (el.shadow.color || 'rgba(0,0,0,.45)') + ')');
        i.filter = f.join(' ');
        o.outline = el.id === selId ? 'calc(3px * var(--inv, 1)) solid #ff6fa8' : '';
        if (el.id === selId) this._addHandle(n.outer);
      });
      this._syncAudio(false);
    }

    _renderBg(sc, local) {
      const bg = sc.background, node = this.bgNode;
      node.style.background = bg.color || '#000';
      const a = bg.assetId && this.m.assets[bg.assetId];
      const key = a ? a.path : '';
      if (key !== this.bgKey) {
        this.bgKey = key; node.textContent = '';
        if (a) {
          const url = this.app.urlFor(a.path);
          if (a.type === 'video') {
            const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.src = url; v.className = 'bgmedia';
            node.appendChild(v); this.bgVideo = v;
          } else {
            const im = document.createElement('img'); im.draggable = false; im.className = 'bgmedia'; im.alt = '';
            this.app.resolveImage(a, null).then((u) => { if (this.bgKey === key) im.src = u; });
            node.appendChild(im); this.bgVideo = null;
          }
        } else this.bgVideo = null;
      }
      if (this.bgVideo) this._syncVideo(this.bgVideo, local, true);
    }

    _renderContent(n, el, local, visible) {
      const c = n.content;
      if (el.type === 'image') {
        const a = this.m.assets[el.assetId];
        c.style.objectFit = el.fit;
        if (!a) { c.removeAttribute('src'); return; }
        const key = a.path + '|' + JSON.stringify(el.paletteOverrides || {});
        if (c.dataset.key !== key) {
          c.dataset.key = key;
          this.app.resolveImage(a, el.paletteOverrides).then((u) => { if (c.dataset.key === key) c.src = u; });
        }
      } else if (el.type === 'video') {
        const a = this.m.assets[el.assetId];
        c.style.objectFit = el.fit; c.style.borderRadius = (el.radius || 0) + 'px';
        if (!a) return;
        if (c.dataset.key !== a.path) { c.dataset.key = a.path; c.src = this.app.urlFor(a.path); c.load(); }
        c.loop = el.loop; c.muted = el.muted !== false;
        if (visible) this._syncVideo(c, local - el.start + (el.trimStart || 0), el.loop);
      } else if (el.type === 'text') {
        if (c.textContent !== el.text) c.textContent = el.text;
        const s = c.style;
        s.fontSize = el.fontSize + 'px'; s.color = el.color; s.fontWeight = el.fontWeight; s.textAlign = el.align; s.lineHeight = el.lineHeight;
        s.fontFamily = this.app.fontCss(el.fontFamily);
        s.height = el.h > 0 ? '100%' : 'auto';
        s.webkitTextStroke = el.strokeWidth ? el.strokeWidth + 'px ' + (el.strokeColor || '#000') : '';
      } else {
        c.style.background = el.fill; c.style.borderRadius = el.shape === 'ellipse' ? '50%' : (el.radius || 0) + 'px';
        c.style.width = '100%'; c.style.height = '100%';
      }
    }

    _syncVideo(v, time, loop) {
      if (!isFinite(v.duration) || !v.duration) { if (!this.playing) v._want = time; return; }
      let tt = time;
      if (loop) tt = ((tt % v.duration) + v.duration) % v.duration; else tt = Math.min(tt, v.duration - 0.01);
      if (this.playing) {
        if (v.paused) { v.currentTime = tt; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else if (Math.abs(v.currentTime - tt) > 0.4) v.currentTime = tt;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - tt) > 0.03) v.currentTime = tt;
      }
    }

    _addHandle(outer) {
      const h = document.createElement('div'); h.className = 'handle'; h.dataset.handle = '1';
      outer.appendChild(h);
    }

    /* ---------- audio ---------- */
    _ensureCtx() {
      if (this.ctx || !(g.AudioContext || g.webkitAudioContext)) return;
      try { this.ctx = new (g.AudioContext || g.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    _audioNode(tr) {
      const a = this.m.assets[tr.assetId];
      if (!a) return null;
      let n = this.audio.get(tr.id);
      if (n && n.path !== a.path) { n.el.pause(); this.audio.delete(tr.id); n = null; }
      if (!n) {
        const el = new Audio(); el.preload = 'auto'; el.src = this.app.urlFor(a.path);
        n = { el, path: a.path, gain: null, active: false };
        if (this.ctx) { try { const src = this.ctx.createMediaElementSource(el); n.gain = this.ctx.createGain(); src.connect(n.gain); n.gain.connect(this.ctx.destination); } catch (e) { n.gain = null; } }
        this.audio.set(tr.id, n);
      }
      return n;
    }
    trackWindow(tr) {
      const starts = S.sceneStarts(this.m);
      let base = 0;
      if (tr.sceneId) { const i = this.m.scenes.findIndex((s) => s.id === tr.sceneId); base = i >= 0 ? starts[i] : 0; }
      const gs = base + tr.start, total = S.totalDuration(this.m);
      const n = this.audio.get(tr.id);
      const adur = n && isFinite(n.el.duration) ? n.el.duration - tr.trimStart : null;
      let len = tr.duration != null ? tr.duration : tr.loop ? Math.max(0, total - gs) : adur;
      if (len == null) len = this.app.audioDuration(tr.assetId) || 0;
      return { gs, ge: gs + len };
    }
    _syncAudio(fromGesture) {
      const tracks = this.m.audio || [];
      const live = new Set(tracks.map((t) => t.id));
      this.audio.forEach((n, id) => { if (!live.has(id)) { n.el.pause(); this.audio.delete(id); } });
      tracks.forEach((tr) => {
        const n = this._audioNode(tr);
        if (!n) return;
        const { gs, ge } = this.trackWindow(tr);
        const want = this.playing && this.t >= gs && this.t < ge;
        const vol = clamp(tr.volume, 0, 1);
        if (n.gain) n.gain.gain.value = vol; else n.el.volume = vol;
        n.el.loop = !!tr.loop;
        n.active = want;
        if (want) {
          let tt = this.t - gs + tr.trimStart;
          if (tr.loop && isFinite(n.el.duration) && n.el.duration > 0) tt = tt % n.el.duration;
          if (n.el.paused) { try { n.el.currentTime = tt; } catch (e) { /* aún sin metadatos */ } const p = n.el.play(); if (p && p.catch) p.catch(() => {}); }
          else if (Math.abs(n.el.currentTime - tt) > 0.4 && !tr.loop) n.el.currentTime = tt;
        } else if (!n.el.paused) n.el.pause();
      });
    }
    _prime() {
      // iOS exige un play() dentro del gesto del usuario para cada elemento de audio.
      this.audio.forEach((n) => {
        if (n.active || !n.el.paused) return;
        const el = n.el; el.muted = true;
        const p = el.play();
        const done = () => { if (!n.active) { el.pause(); try { el.currentTime = 0; } catch (e) { /* */ } } el.muted = false; };
        if (p && p.then) p.then(done, () => { el.muted = false; }); else el.muted = false;
      });
    }

    /* ---------- reproducción ---------- */
    play() {
      if (this.playing) return;
      const total = S.totalDuration(this.m);
      if (this.t >= total - 0.02) this.t = 0;
      this._ensureCtx();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.playing = true; this.last = performance.now();
      this.m.audio.forEach((tr) => this._audioNode(tr));
      this._syncAudio(true);
      this._prime();
      this.render();
      requestAnimationFrame(this._loop);
    }
    pause() {
      this.playing = false;
      if (!this.m) return;
      this.audio.forEach((n) => { n.active = false; if (!n.el.paused) n.el.pause(); });
      this.nodes.forEach((n) => { if (n.el.type === 'video') n.content.pause(); });
      if (this.bgVideo) this.bgVideo.pause();
      this.render();
    }
    _loop(now) {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
      const total = S.totalDuration(this.m);
      this.t += dt;
      if (this.t >= total) { this.t = total; this.pause(); if (this.onEnd) this.onEnd(); if (this.onTick) this.onTick(this.t); return; }
      this.render();
      if (this.onTick) this.onTick(this.t);
      requestAnimationFrame(this._loop);
    }
  }
  REV.Engine = Engine;
  REV.FONTS = FONTS;
})(window);
