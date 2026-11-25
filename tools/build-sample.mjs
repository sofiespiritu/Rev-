// Genera samples/espirit-demo.zip: proyecto de prueba en formato rev-project v1.
// Uso: node tools/build-sample.mjs   (requiere ffmpeg para audio y clip de video)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSZip = require(join(root, 'vendor/jszip.min.js'));
const tmp = mkdtempSync(join(tmpdir(), 'rev-sample-'));
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);

/* ---------- SVGs ---------- */
const bg = (c1, c2, c3) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="1080" height="1920" fill="url(#g)"/>
<circle cx="900" cy="260" r="260" fill="${c3}" opacity=".35"/><circle cx="120" cy="1500" r="340" fill="${c3}" opacity=".28"/>
<circle cx="760" cy="1750" r="150" fill="#ffffff" opacity=".18"/><circle cx="200" cy="420" r="90" fill="#ffffff" opacity=".2"/></svg>`;

const sofi = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
<path d="M170 300 Q150 520 190 620 L410 620 Q450 520 430 300Z" fill="#5b3a29"/>
<rect x="250" y="560" width="40" height="250" rx="18" fill="#f6c9a8"/><rect x="310" y="560" width="40" height="250" rx="18" fill="#f6c9a8"/>
<ellipse cx="268" cy="820" rx="40" ry="20" fill="#7c5cff"/><ellipse cx="332" cy="820" rx="40" ry="20" fill="#7c5cff"/>
<g><animateTransform attributeName="transform" type="rotate" values="0 150 470;-18 150 470;0 150 470" dur="1.4s" repeatCount="indefinite"/>
<rect x="110" y="440" width="46" height="200" rx="22" fill="#f6c9a8" transform="rotate(14 133 450)"/></g>
<rect x="444" y="440" width="46" height="200" rx="22" fill="#f6c9a8" transform="rotate(-14 467 450)"/>
<path d="M190 430 Q300 400 410 430 L470 700 Q300 740 130 700Z" fill="#ff6fa8"/>
<rect x="266" y="380" width="68" height="70" rx="26" fill="#f6c9a8"/>
<circle cx="300" cy="300" r="132" fill="#f6c9a8"/>
<path d="M165 300 Q170 150 300 150 Q430 150 435 300 Q400 230 300 230 Q200 230 165 300Z" fill="#5b3a29"/>
<circle cx="255" cy="305" r="13" fill="#2a1a14"/><circle cx="345" cy="305" r="13" fill="#2a1a14"/>
<circle cx="250" cy="300" r="4" fill="#ffffff"/><circle cx="340" cy="300" r="4" fill="#ffffff"/>
<ellipse cx="225" cy="350" rx="22" ry="12" fill="#ff9db8" opacity=".7"/><ellipse cx="375" cy="350" rx="22" ry="12" fill="#ff9db8" opacity=".7"/>
<path d="M265 355 Q300 392 335 355" fill="none" stroke="#c0392b" stroke-width="9" stroke-linecap="round"/>
</svg>`;

const serum = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800">
<rect x="150" y="20" width="100" height="90" rx="14" fill="#c9a227"/>
<rect x="180" y="100" width="40" height="70" fill="#e9e1d4"/>
<rect x="60" y="165" width="280" height="610" rx="70" fill="#fdf4ec"/>
<rect x="60" y="165" width="280" height="610" rx="70" fill="none" stroke="#e5d4c3" stroke-width="6"/>
<rect x="60" y="360" width="280" height="260" fill="#ff6fa8"/>
<text x="200" y="460" text-anchor="middle" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#ffffff">ESPIRIT</text>
<text x="200" y="510" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#ffffff">BEAUTY</text>
<text x="200" y="575" text-anchor="middle" font-family="Georgia,serif" font-size="26" fill="#ffffff">SÉRUM · 30 ml</text>
<ellipse cx="120" cy="300" rx="14" ry="90" fill="#ffffff" opacity=".6"/></svg>`;

/* ---------- audio y video (marcadores de posición generados con ffmpeg) ---------- */
const mk = (name, ...args) => { const p = join(tmp, name); ff(...args, p); return readFileSync(p); };
const music = mk('music.mp3', '-f', 'lavfi', '-i', 'sine=frequency=261.6:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=329.6:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=392:duration=8',
  '-filter_complex', '[0][1][2]amix=inputs=3,tremolo=f=0.5:d=0.5,volume=1.6,afade=t=out:st=7.5:d=0.5', '-ac', '2', '-b:a', '96k');
const nar1 = mk('nar1.mp3', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2.8', '-af', 'tremolo=f=5:d=0.9,volume=0.6,afade=t=in:d=0.1,afade=t=out:st=2.6:d=0.2', '-ac', '1', '-b:a', '64k');
const nar2 = mk('nar2.mp3', '-f', 'lavfi', '-i', 'sine=frequency=392:duration=3.4', '-af', 'tremolo=f=4:d=0.9,volume=0.6,afade=t=in:d=0.1,afade=t=out:st=3.2:d=0.2', '-ac', '1', '-b:a', '64k');
const pop = mk('pop.mp3', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.25', '-af', 'afade=t=out:st=0.1:d=0.15,volume=0.7', '-ac', '1', '-b:a', '64k');
let clip;
try { clip = mk('clip.mp4', '-f', 'lavfi', '-i', 'gradients=s=360x640:d=3:speed=0.08:c0=ff6fa8:c1=7c5cff:c2=f5c542:nb_colors=3,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', '-an'); }
catch { clip = mk('clip.mp4', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', '-an'); }

/* ---------- manifest ---------- */
const palette = (dress, hair) => [
  { id: 'dress', label: 'Vestido', color: '#ff6fa8' },
  { id: 'hair', label: 'Cabello', color: '#5b3a29' },
  { id: 'shoes', label: 'Zapatos', color: '#7c5cff' },
];
const manifest = {
  format: 'rev-project', version: 1,
  meta: { title: 'Espirit Beauty · Demo', brand: 'Espirit Beauty', created: new Date().toISOString(), generator: 'Claude', notes: 'Proyecto de prueba. Audio y clip son marcadores de posición.' },
  canvas: { width: 1080, height: 1920, fps: 30 },
  assets: {
    bg_rosa: { type: 'image', path: 'assets/images/fondo-rosa.svg', name: 'Fondo rosa' },
    bg_lila: { type: 'image', path: 'assets/images/fondo-lila.svg', name: 'Fondo lila' },
    char_sofi: { type: 'image', path: 'assets/characters/sofi.svg', name: 'Sofi (personaje)', palette: palette() },
    prod_serum: { type: 'image', path: 'assets/products/serum.svg', name: 'Sérum Espirit Beauty', palette: [{ id: 'label', label: 'Etiqueta', color: '#ff6fa8' }, { id: 'cap', label: 'Tapa', color: '#c9a227' }] },
    clip_demo: { type: 'video', path: 'assets/videos/clip-demo.mp4', name: 'Clip de demostración' },
    aud_music: { type: 'audio', path: 'assets/audio/musica.mp3', name: 'Música suave (marcador)' },
    aud_nar1: { type: 'audio', path: 'assets/audio/narracion-1.mp3', name: 'Narración escena 1 (marcador)' },
    aud_nar2: { type: 'audio', path: 'assets/audio/narracion-2.mp3', name: 'Narración escena 2 (marcador)' },
    aud_pop: { type: 'audio', path: 'assets/audio/pop.mp3', name: 'Efecto pop' },
  },
  scenes: [
    {
      id: 'sc_intro', name: 'Intro', duration: 4.5,
      background: { color: '#ffd1e3', assetId: 'bg_rosa' }, transition: { type: 'none', duration: 0.4 },
      elements: [
        { id: 'el_glow', type: 'shape', name: 'Halo', shape: 'ellipse', fill: '#ffffff', x: 140, y: 560, w: 800, h: 800, opacity: 0.35, start: 0, duration: null,
          anim: { in: { type: 'zoom-in', duration: 0.8 }, out: { type: 'fade', duration: 0.4 }, loop: { type: 'pulse', speed: 0.5, amount: 1 } } },
        { id: 'el_brand', type: 'text', name: 'Marca', text: 'ESPIRIT BEAUTY', x: 40, y: 170, w: 1000, h: 0, fontSize: 78, color: '#ffffff', fontWeight: 900, align: 'center', fontFamily: 'serif', start: 0, duration: null,
          shadow: { color: 'rgba(120,30,70,0.45)', blur: 14, y: 6 }, anim: { in: { type: 'fade', duration: 0.8 }, out: { type: 'fade', duration: 0.4 } } },
        { id: 'el_sofi', type: 'image', name: 'Sofi', assetId: 'char_sofi', x: 240, y: 560, w: 600, h: 900, start: 0.2, duration: null, paletteOverrides: {},
          anim: { in: { type: 'pop', duration: 0.7 }, out: { type: 'from-right', duration: 0.5 }, loop: { type: 'sway', speed: 0.6, amount: 1 } } },
        { id: 'el_hola', type: 'text', name: 'Saludo', text: '¡Hola!\nSoy Sofi', x: 60, y: 1500, w: 960, h: 0, fontSize: 120, color: '#ffffff', fontWeight: 900, align: 'center', fontFamily: 'rounded', start: 0.9, duration: null,
          shadow: { color: 'rgba(120,30,70,0.5)', blur: 12, y: 6 }, anim: { in: { type: 'from-bottom', duration: 0.6 }, out: { type: 'fade', duration: 0.4 } } },
      ],
    },
    {
      id: 'sc_producto', name: 'Producto', duration: 5,
      background: { color: '#d9ccff', assetId: 'bg_lila' }, transition: { type: 'fade', duration: 0.5 },
      elements: [
        { id: 'el_titulo', type: 'text', name: 'Título', text: 'Sérum de brillo', x: 60, y: 150, w: 960, h: 0, fontSize: 110, color: '#3b1d6e', fontWeight: 900, align: 'center', fontFamily: 'rounded', start: 0, duration: null,
          anim: { in: { type: 'from-top', duration: 0.6 }, out: { type: 'fade', duration: 0.4 } } },
        { id: 'el_serum', type: 'image', name: 'Sérum', assetId: 'prod_serum', x: 340, y: 430, w: 400, h: 800, start: 0.3, duration: null, paletteOverrides: {},
          shadow: { color: 'rgba(60,20,110,0.4)', blur: 30, y: 24 }, anim: { in: { type: 'zoom-in', duration: 0.7 }, out: { type: 'zoom-in', duration: 0.5 }, loop: { type: 'float', speed: 0.6, amount: 1 } } },
        { id: 'el_sofi2', type: 'image', name: 'Sofi (pequeña)', assetId: 'char_sofi', x: 20, y: 1050, w: 340, h: 510, start: 0.8, duration: null, paletteOverrides: { dress: '#7c5cff' },
          anim: { in: { type: 'from-left', duration: 0.6 }, out: { type: 'from-left', duration: 0.5 }, loop: { type: 'sway', speed: 0.8, amount: 1 } } },
        { id: 'el_clip', type: 'video', name: 'Clip', assetId: 'clip_demo', x: 640, y: 1100, w: 400, h: 600, radius: 40, fit: 'cover', loop: true, muted: true, start: 1.2, duration: null,
          shadow: { color: 'rgba(0,0,0,0.3)', blur: 24, y: 12 }, anim: { in: { type: 'pop', duration: 0.6 }, out: { type: 'fade', duration: 0.4 } } },
        { id: 'el_pill', type: 'shape', name: 'Cinta', shape: 'rect', fill: '#ffffff', radius: 60, x: 90, y: 1720, w: 900, h: 130, opacity: 0.9, start: 1.8, duration: null,
          anim: { in: { type: 'from-bottom', duration: 0.5 }, out: { type: 'fade', duration: 0.4 } } },
        { id: 'el_cta', type: 'text', name: 'Llamada a la acción', text: 'Pídelo hoy ✨', x: 90, y: 1745, w: 900, h: 0, fontSize: 72, color: '#ff4f93', fontWeight: 900, align: 'center', fontFamily: 'rounded', start: 2.0, duration: null,
          anim: { in: { type: 'pop', duration: 0.5 }, out: { type: 'fade', duration: 0.4 } } },
      ],
    },
  ],
  audio: [
    { id: 'au_music', name: 'Música de fondo', assetId: 'aud_music', role: 'music', sceneId: null, start: 0, volume: 0.35, loop: true, duration: null },
    { id: 'au_nar1', name: 'Narración 1', assetId: 'aud_nar1', role: 'narration', sceneId: 'sc_intro', start: 0.9, volume: 0.9, loop: false, duration: null },
    { id: 'au_nar2', name: 'Narración 2', assetId: 'aud_nar2', role: 'narration', sceneId: 'sc_producto', start: 0.5, volume: 0.9, loop: false, duration: null },
    { id: 'au_pop', name: 'Pop de entrada', assetId: 'aud_pop', role: 'sfx', sceneId: 'sc_intro', start: 0.2, volume: 0.8, loop: false, duration: null },
  ],
  // Campo desconocido a propósito: REV debe conservarlo tal cual al guardar.
  x_custom: { note: 'REV debe conservar este campo', n: 42 },
};

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
zip.file('assets/images/fondo-rosa.svg', bg('#ffe3ef', '#ffb3d1', '#ff6fa8'));
zip.file('assets/images/fondo-lila.svg', bg('#ece4ff', '#b8a4ff', '#7c5cff'));
zip.file('assets/characters/sofi.svg', sofi);
zip.file('assets/products/serum.svg', serum);
zip.file('assets/videos/clip-demo.mp4', clip, { compression: 'STORE' });
zip.file('assets/audio/musica.mp3', music, { compression: 'STORE' });
zip.file('assets/audio/narracion-1.mp3', nar1, { compression: 'STORE' });
zip.file('assets/audio/narracion-2.mp3', nar2, { compression: 'STORE' });
zip.file('assets/audio/pop.mp3', pop, { compression: 'STORE' });
zip.file('README.txt', 'Proyecto de prueba para REV (formato rev-project v1). Ver docs/FORMATO.md en el repositorio.\n');
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
mkdirSync(join(root, 'samples'), { recursive: true });
writeFileSync(join(root, 'samples/espirit-demo.zip'), out);
console.log('samples/espirit-demo.zip', (out.length / 1024).toFixed(0), 'KB');
