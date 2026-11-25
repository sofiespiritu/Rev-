// Valida un proyecto REV antes de entregarlo.  Uso: node tools/validate.mjs proyecto.zip
// Sale con código 1 si hay errores (los avisos no bloquean pero conviene corregirlos).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSZip = require(join(root, 'vendor/jszip.min.js'));
const S = require(join(root, 'js/schema.js'));

const file = process.argv[2];
if (!file) { console.error('Uso: node tools/validate.mjs proyecto.zip'); process.exit(2); }
const zip = await JSZip.loadAsync(readFileSync(file));
const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith('__MACOSX/'));
const mf = names.filter((n) => /(^|\/)manifest\.json$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
if (!mf) { console.error('ERROR: el ZIP no contiene manifest.json'); process.exit(1); }
const prefix = mf.slice(0, -'manifest.json'.length);
const have = new Set(names.map((n) => n.slice(prefix.length)));
const manifest = JSON.parse(await zip.file(mf).async('string'));
const { errors, warnings } = S.normalize(manifest, (p) => have.has(p));

// comprobaciones extra para quien genera proyectos
const extra = [];
const used = S.referencedAssets(manifest);
Object.entries(manifest.assets || {}).forEach(([id, a]) => {
  if (!used.has(id)) extra.push('Recurso "' + id + '" no se usa en ninguna escena ni audio.');
  (a.palette || []).forEach((p) => { if (!/^#[0-9a-fA-F]{6}$/.test(p.color || '')) extra.push('Paleta "' + id + '.' + p.id + '": el color debe ser hex de 6 dígitos (#rrggbb).'); });
});
manifest.scenes.forEach((sc) => sc.elements.forEach((el) => {
  if (el.start >= sc.duration) extra.push('Elemento "' + el.name + '" empieza después de que termine la escena "' + sc.name + '".');
  if (el.type === 'text' && el.w <= 0) extra.push('Texto "' + el.name + '" sin ancho (w).');
}));

console.log(prefix ? 'Aviso: el manifest está dentro de la carpeta "' + prefix + '" (REV lo acepta, pero lo ideal es que esté en la raíz).' : 'manifest.json en la raíz ✓');
console.log('Escenas:', manifest.scenes.length, '· duración total:', S.totalDuration(manifest).toFixed(1) + 's · recursos:', Object.keys(manifest.assets).length, '· pistas de audio:', manifest.audio.length);
errors.forEach((e) => console.log('ERROR  ', e));
warnings.concat(extra).forEach((w) => console.log('AVISO  ', w));
console.log(errors.length ? '✗ No válido' : '✓ Válido' + (warnings.length + extra.length ? ' (con avisos)' : ''));
process.exit(errors.length ? 1 : 0);
