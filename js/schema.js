/* REV · esquema del formato "rev-project" v1: normalización, validación y utilidades.
   Funciona en el navegador (window.REV.schema) y en Node (require). */
(function (g) {
  'use strict';
  const REV = (g.REV = g.REV || {});
  const S = (REV.schema = {});

  S.FORMAT = 'rev-project';
  S.VERSION = 1;
  S.ENTER_EXIT = ['none', 'fade', 'from-bottom', 'from-top', 'from-left', 'from-right', 'zoom-in', 'zoom-out', 'pop', 'spin'];
  S.LOOPS = ['none', 'float', 'pulse', 'sway', 'spin', 'blink'];
  S.TRANSITIONS = ['none', 'fade'];
  S.ELEMENT_TYPES = ['image', 'video', 'text', 'shape'];
  S.ASSET_TYPES = ['image', 'video', 'audio', 'font'];
  S.AUDIO_ROLES = ['narration', 'music', 'sfx'];

  let counter = 0;
  S.uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 7) + (counter++).toString(36);

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  S.sceneStarts = (m) => { let t = 0; return m.scenes.map((s) => { const st = t; t += s.duration; return st; }); };
  S.totalDuration = (m) => m.scenes.reduce((a, s) => a + s.duration, 0);
  /** Fin visible de un elemento dentro de su escena (segundos locales). */
  S.elEnd = (el, scene) => Math.min(scene.duration, el.start + (el.duration == null ? scene.duration - el.start : el.duration));
  S.elDuration = (el, scene) => Math.max(0, S.elEnd(el, scene) - el.start);

  S.referencedAssets = function (m) {
    const ids = new Set();
    (m.scenes || []).forEach((sc) => {
      if (sc.background && sc.background.assetId) ids.add(sc.background.assetId);
      (sc.elements || []).forEach((el) => el.assetId && ids.add(el.assetId));
    });
    (m.audio || []).forEach((a) => a.assetId && ids.add(a.assetId));
    Object.values(m.assets || {}).forEach((a) => { if (a && a.type === 'font') { /* las fuentes se referencian por fontFamily */ } });
    (m.scenes || []).forEach((sc) => (sc.elements || []).forEach((el) => {
      if (typeof el.fontFamily === 'string' && el.fontFamily.startsWith('asset:')) ids.add(el.fontFamily.slice(6));
    }));
    return ids;
  };

  function normAnim(a) {
    a = isObj(a) ? a : {};
    const io = (x, dur) => { x = isObj(x) ? x : {}; return Object.assign({}, x, { type: S.ENTER_EXIT.includes(x.type) ? x.type : 'none', duration: Math.max(0, num(x.duration, dur)) }); };
    const l = isObj(a.loop) ? a.loop : {};
    return Object.assign({}, a, {
      enabled: a.enabled !== false,
      in: io(a.in, 0.5),
      out: io(a.out, 0.4),
      loop: Object.assign({}, l, { type: S.LOOPS.includes(l.type) ? l.type : 'none', speed: num(l.speed, 0.5), amount: num(l.amount, 1) }),
    });
  }

  /**
   * Normaliza el manifest en el sitio (añade valores por defecto, nunca borra campos desconocidos).
   * @param {object} m manifest
   * @param {(path:string)=>boolean} [hasFile] para avisar de archivos ausentes
   * @returns {{errors:string[],warnings:string[]}}
   */
  S.normalize = function (m, hasFile) {
    const errors = [], warnings = [];
    if (!isObj(m)) return { errors: ['manifest.json no contiene un objeto JSON.'], warnings };
    if (m.format !== S.FORMAT) errors.push('"format" debe ser "' + S.FORMAT + '" (encontré ' + JSON.stringify(m.format) + ').');
    if (!isNum(m.version)) warnings.push('Falta "version"; asumo ' + S.VERSION + '.');
    else if (m.version > S.VERSION) warnings.push('El proyecto usa la versión ' + m.version + ' del formato y REV entiende hasta la ' + S.VERSION + '. Puede que algunas cosas no se vean.');
    m.version = isNum(m.version) ? m.version : S.VERSION;
    m.meta = Object.assign({ title: 'Proyecto sin título' }, isObj(m.meta) ? m.meta : {});
    m.canvas = Object.assign({ width: 1080, height: 1920, fps: 30 }, isObj(m.canvas) ? m.canvas : {});
    if (m.canvas.width !== 1080 || m.canvas.height !== 1920) warnings.push('El lienzo es ' + m.canvas.width + '×' + m.canvas.height + '; REV está pensado para 1080×1920.');

    m.assets = isObj(m.assets) ? m.assets : {};
    Object.keys(m.assets).forEach((id) => {
      const a = m.assets[id];
      if (!isObj(a) || typeof a.path !== 'string') { errors.push('Recurso "' + id + '" sin "path".'); return; }
      if (!S.ASSET_TYPES.includes(a.type)) warnings.push('Recurso "' + id + '" con tipo desconocido "' + a.type + '".');
      if (!a.name) a.name = a.path.split('/').pop();
      if (hasFile && !hasFile(a.path)) warnings.push('Falta el archivo "' + a.path + '" (recurso "' + id + '").');
    });

    if (!Array.isArray(m.scenes) || !m.scenes.length) {
      errors.push('"scenes" debe ser una lista con al menos una escena.');
      return { errors, warnings };
    }
    const seen = new Set();
    const uniq = (obj, prefix, what) => {
      if (typeof obj.id !== 'string' || !obj.id || seen.has(obj.id)) {
        if (obj.id) warnings.push('ID repetido "' + obj.id + '" en ' + what + '; lo renombré.');
        obj.id = S.uid(prefix);
      }
      seen.add(obj.id);
    };

    m.scenes.forEach((sc, si) => {
      if (!isObj(sc)) { errors.push('La escena ' + (si + 1) + ' no es un objeto.'); return; }
      uniq(sc, 'sc', 'escena ' + (si + 1));
      sc.name = typeof sc.name === 'string' ? sc.name : 'Escena ' + (si + 1);
      sc.duration = Math.max(0.5, num(sc.duration, 3));
      sc.background = Object.assign({ color: '#000000', assetId: null }, isObj(sc.background) ? sc.background : {});
      if (sc.background.assetId && !m.assets[sc.background.assetId]) { warnings.push('Fondo de "' + sc.name + '" usa un recurso inexistente.'); }
      sc.transition = Object.assign({ type: 'none', duration: 0.4 }, isObj(sc.transition) ? sc.transition : {});
      if (!S.TRANSITIONS.includes(sc.transition.type)) sc.transition.type = 'none';
      sc.elements = Array.isArray(sc.elements) ? sc.elements : [];
      sc.elements.forEach((el, ei) => {
        if (!isObj(el)) return;
        uniq(el, 'el', 'elemento ' + (ei + 1) + ' de "' + sc.name + '"');
        if (!S.ELEMENT_TYPES.includes(el.type)) { warnings.push('Elemento "' + el.id + '" con tipo desconocido "' + el.type + '" (se ignora al dibujar).'); }
        el.name = typeof el.name === 'string' ? el.name : el.type || 'elemento';
        el.enabled = el.enabled !== false;
        el.start = Math.max(0, num(el.start, 0));
        el.duration = el.duration == null ? null : Math.max(0.1, num(el.duration, sc.duration - el.start));
        el.x = num(el.x, 0); el.y = num(el.y, 0);
        el.w = num(el.w, 300); el.h = num(el.h, el.type === 'text' ? 0 : 300);
        el.rotation = num(el.rotation, 0);
        el.opacity = Math.min(1, Math.max(0, num(el.opacity, 1)));
        el.flipX = !!el.flipX;
        el.blur = Math.max(0, num(el.blur, 0));
        if (el.shadow != null && !isObj(el.shadow)) el.shadow = null;
        el.anim = normAnim(el.anim);
        if (el.type === 'image' || el.type === 'video') {
          if (!el.assetId || !m.assets[el.assetId]) warnings.push('Elemento "' + el.name + '" (' + sc.name + ') apunta a un recurso inexistente.');
          el.fit = el.fit === 'cover' ? 'cover' : el.type === 'video' ? 'cover' : 'contain';
          if (el.type === 'image') el.paletteOverrides = isObj(el.paletteOverrides) ? el.paletteOverrides : {};
          if (el.type === 'video') { el.loop = el.loop !== false; el.muted = el.muted !== false; el.trimStart = Math.max(0, num(el.trimStart, 0)); el.radius = Math.max(0, num(el.radius, 0)); }
        } else if (el.type === 'text') {
          el.text = typeof el.text === 'string' ? el.text : '';
          el.fontSize = Math.max(8, num(el.fontSize, 64));
          el.color = typeof el.color === 'string' ? el.color : '#ffffff';
          el.fontWeight = num(el.fontWeight, 700);
          el.align = ['left', 'center', 'right'].includes(el.align) ? el.align : 'center';
          el.fontFamily = typeof el.fontFamily === 'string' ? el.fontFamily : 'system';
          el.lineHeight = Math.max(0.8, num(el.lineHeight, 1.15));
        } else if (el.type === 'shape') {
          el.shape = el.shape === 'ellipse' ? 'ellipse' : 'rect';
          el.fill = typeof el.fill === 'string' ? el.fill : '#ffffff';
          el.radius = Math.max(0, num(el.radius, 0));
        }
      });
    });

    m.audio = Array.isArray(m.audio) ? m.audio : [];
    m.audio.forEach((a, i) => {
      if (!isObj(a)) return;
      uniq(a, 'au', 'audio ' + (i + 1));
      a.name = typeof a.name === 'string' ? a.name : 'Audio ' + (i + 1);
      a.role = S.AUDIO_ROLES.includes(a.role) ? a.role : 'sfx';
      a.sceneId = a.sceneId && m.scenes.some((s) => s.id === a.sceneId) ? a.sceneId : null;
      a.start = Math.max(0, num(a.start, 0));
      a.volume = Math.min(1, Math.max(0, num(a.volume, 1)));
      a.loop = !!a.loop;
      a.duration = a.duration == null ? null : Math.max(0.1, num(a.duration, 1));
      a.trimStart = Math.max(0, num(a.trimStart, 0));
      if (!a.assetId || !m.assets[a.assetId]) warnings.push('El audio "' + a.name + '" apunta a un recurso inexistente.');
    });
    return { errors, warnings };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
