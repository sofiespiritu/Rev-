/* REV · lectura y escritura de proyectos ZIP (usa JSZip). */
(function (g) {
  'use strict';
  const REV = (g.REV = g.REV || {});
  REV.VERSION = '0.1.0';

  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json',
  };
  const ext = (p) => (p.split('.').pop() || '').toLowerCase();
  const mimeOf = (p) => MIME[ext(p)] || 'application/octet-stream';
  const isMedia = (p) => /^(png|jpe?g|webp|gif|mp4|m4v|mov|webm|mp3|m4a|aac|ogg|woff2?)$/.test(ext(p));

  const zipio = (REV.zipio = { mimeOf, ext });

  /** Lee un ZIP (File/Blob/ArrayBuffer) y devuelve {manifest, files:Map<path,Blob>, root}. */
  zipio.load = async function (input) {
    const zip = await JSZip.loadAsync(input);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith('__MACOSX/') && !/(^|\/)(\.DS_Store|Thumbs\.db)$/.test(n));
    const mf = names.filter((n) => /(^|\/)manifest\.json$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!mf) throw new Error('Este ZIP no contiene manifest.json. No es un proyecto REV.');
    const root = mf.slice(0, mf.length - 'manifest.json'.length);
    let text = await zip.file(mf).async('string');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    let manifest;
    try { manifest = JSON.parse(text); } catch (e) { throw new Error('manifest.json no es JSON válido: ' + e.message); }
    const files = new Map();
    for (const n of names) {
      if (n === mf || !n.startsWith(root)) continue;
      const path = n.slice(root.length);
      const raw = await zip.file(n).async('blob');
      files.set(path, raw.slice(0, raw.size, mimeOf(path)));
    }
    return { manifest, files, root };
  };

  /** Genera el ZIP del proyecto. `added` = Set de IDs de recursos añadidos en la sesión (se podan si ya no se usan). */
  zipio.save = async function (manifest, files, added) {
    const m = JSON.parse(JSON.stringify(manifest));
    m.meta = m.meta || {};
    m.meta.modified = new Date().toISOString();
    m.meta.editor = { name: 'REV', version: REV.VERSION };
    const used = REV.schema.referencedAssets(m);
    const dropPaths = new Set();
    if (added) {
      added.forEach((id) => {
        if (!used.has(id) && m.assets[id]) { dropPaths.add(m.assets[id].path); delete m.assets[id]; }
      });
    }
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(m, null, 2));
    files.forEach((blob, path) => {
      if (dropPaths.has(path)) return;
      zip.file(path, blob, { compression: isMedia(path) ? 'STORE' : 'DEFLATE' });
    });
    return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = zipio;
})(typeof window !== 'undefined' ? window : globalThis);
