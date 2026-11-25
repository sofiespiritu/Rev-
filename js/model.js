// Modelo del proyecto REV (formato "rev-project" v1). Ver docs/FORMATO_PROYECTO.md
export const FORMAT = 'rev-project';
export const VERSION = 1;

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 8);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ANIM_IN = [['none', 'Sin animación'], ['fade', 'Aparecer'], ['slide-up', 'Subir'], ['slide-down', 'Bajar'], ['slide-left', 'Entrar por la derecha'], ['slide-right', 'Entrar por la izquierda'], ['zoom', 'Zoom'], ['pop', 'Rebote']];
export const ANIM_LOOP = [['none', 'Ninguna'], ['float', 'Flotar'], ['pulse', 'Latir'], ['sway', 'Balancear'], ['spin', 'Girar']];
export const EASINGS = [['easeOut', 'Suave al final'], ['easeInOut', 'Suave'], ['easeIn', 'Suave al inicio'], ['linear', 'Lineal'], ['back', 'Rebote']];

/** Rellena valores por defecto sin borrar claves desconocidas. Devuelve advertencias. */
export function normalize(m, filePaths) {
  const warnings = [];
  if (!m || m.format !== FORMAT) throw new Error('manifest.json no es un proyecto REV (falta "format": "rev-project").');
  if (typeof m.version !== 'number' || m.version > VERSION) throw new Error('Versión de proyecto no soportada: ' + m.version);
  m.meta = Object.assign({ name: 'Proyecto', width: 1080, height: 1920, fps: 30, background: '#ffffff', safeArea: { left: 90, right: 90, top: 120, bottom: 450 } }, m.meta || {});
  m.assets = m.assets || {};
  m.scenes = m.scenes || [];
  m.audio = m.audio || [];
  for (const [id, a] of Object.entries(m.assets)) {
    if (!a.path || !filePaths.has(a.path)) warnings.push(`Recurso "${id}" apunta a un archivo que no existe: ${a.path}`);
  }
  const seen = new Set();
  const checkId = (id, where) => { if (!id || seen.has(id)) warnings.push(`ID repetido o vacío en ${where}: ${id}`); seen.add(id); };
  m.scenes.forEach((s, si) => {
    s.id = s.id || uid('scene'); checkId(s.id, 'escena ' + si);
    s.name = s.name || 'Escena ' + (si + 1);
    s.duration = Number(s.duration) > 0 ? Number(s.duration) : 3;
    s.background = Object.assign({ color: m.meta.background, asset: null, fit: 'cover' }, s.background || {});
    s.elements = s.elements || [];
    s.audio = s.audio || [];
    s.elements.forEach((e) => {
      e.id = e.id || uid('el'); checkId(e.id, 'elemento');
      e.type = e.type || 'shape';
      e.name = e.name || e.type;
      Object.assign(e, Object.fromEntries(Object.entries({ x: 540, y: 960, width: 300, height: 300, rotation: 0, opacity: 1, start: 0, duration: 0, visible: true, locked: false }).filter(([k]) => e[k] === undefined)));
      e.in = Object.assign({ type: 'none', duration: 0.5, easing: 'easeOut' }, e.in || {});
      e.out = Object.assign({ type: 'none', duration: 0.4, easing: 'easeIn' }, e.out || {});
      e.loop = Object.assign({ type: 'none', amount: 1, speed: 1 }, e.loop || {});
      if (e.asset && !m.assets[e.asset]) warnings.push(`Elemento "${e.name}" usa un recurso inexistente: ${e.asset}`);
    });
    s.audio.forEach((a) => { a.id = a.id || uid('aud'); a.start = a.start || 0; a.volume = a.volume ?? 1; a.trimStart = a.trimStart || 0; });
  });
  m.audio.forEach((a) => { a.id = a.id || uid('aud'); a.start = a.start || 0; a.volume = a.volume ?? 1; a.trimStart = a.trimStart || 0; });
  return warnings;
}

export function sceneStarts(m) {
  let t = 0;
  return m.scenes.map((s) => { const st = t; t += s.duration; return st; });
}
export const totalDuration = (m) => m.scenes.reduce((a, s) => a + s.duration, 0);

export function sceneAt(m, t) {
  let acc = 0;
  for (let i = 0; i < m.scenes.length; i++) {
    const d = m.scenes[i].duration;
    if (t < acc + d || i === m.scenes.length - 1) return { index: i, local: clamp(t - acc, 0, d), start: acc };
    acc += d;
  }
  return { index: 0, local: 0, start: 0 };
}

export function newElement(type, scene, extra = {}) {
  const base = { id: uid('el'), type, name: type, x: 540, y: 900, width: 400, height: 400, rotation: 0, opacity: 1, start: 0, duration: 0, visible: true, locked: false, in: { type: 'fade', duration: 0.5, easing: 'easeOut' }, out: { type: 'none', duration: 0.4, easing: 'easeIn' }, loop: { type: 'none', amount: 1, speed: 1 } };
  const defs = {
    text: { name: 'Texto', text: 'Nuevo texto', font: 'system-ui', fontSize: 80, fontWeight: 700, color: '#5a1f33', align: 'center', lineHeight: 1.15, width: 800, height: 120, stroke: { color: '#ffffff', width: 0 }, shadow: false },
    shape: { name: 'Forma', shape: 'rounded', fill: '#e8a0b8', radius: 40, stroke: { color: '#ffffff', width: 0 }, width: 500, height: 300 },
    effect: { name: 'Destellos', effect: 'sparkles', color: '#ffd1e0', count: 14, size: 36, speed: 1, seed: 7, width: 800, height: 800 },
    image: { name: 'Imagen', fit: 'contain', flipX: false, asset: null },
    video: { name: 'Video', fit: 'cover', asset: null, trimStart: 0, volume: 0, muted: true, loop: true, width: 1080, height: 1920 },
  };
  return Object.assign(base, defs[type] || {}, extra);
}
