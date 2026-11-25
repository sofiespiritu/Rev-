// Prueba de extremo a extremo con un navegador real (Chrome + Playwright).
// Uso: node tests/e2e.mjs   → imprime PASS/FAIL y guarda capturas en tests/out/
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const JSZip = require(join(root, 'vendor/jszip.min.js'));
const out = join(root, 'tests/out'); mkdirSync(out, { recursive: true });
const PORT = 8765, URL_ = 'http://127.0.0.1:' + PORT + '/';

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let failed = 0;
const ok = (cond, msg, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) failed++; };

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const row = (label) => page.locator('.row', { has: page.locator('.lbl', { hasText: label }) }).first();
const setNum = async (label, v) => { const i = row(label).locator('input.num'); await i.fill(String(v)); await i.dispatchEvent('change'); };
const tab = (name) => page.locator('.tabs button', { hasText: name }).click();
const app = (fn, arg) => page.evaluate(fn, arg);

try {
  /* 1. abrir ZIP de ejemplo mediante el selector de archivos */
  await page.goto(URL_);
  await page.setInputFiles('#fileOpen', join(root, 'samples/espirit-demo.zip'));
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForSelector('.bar.scene');
  await page.waitForTimeout(600);
  ok((await page.locator('.bar.scene').count()) === 2, 'El ZIP se abre y muestra 2 escenas en la línea de tiempo');
  ok((await app(() => REV_APP.state.manifest.audio.length)) === 4, 'Se leyeron 4 pistas de audio');
  await page.screenshot({ path: join(out, '01-abierto-movil.png') });

  /* 2. la vista previa dibuja elementos */
  const nEl = await page.locator('#stage .el').count();
  ok(nEl >= 3, 'La vista previa dibuja los elementos de la escena 1', nEl);
  const imgOk = await app(async () => { await new Promise((r) => setTimeout(r, 400)); return [...document.querySelectorAll('#stage .el img')].every((i) => i.complete && i.naturalWidth > 0); });
  ok(imgOk, 'Las imágenes SVG de la escena cargan');

  /* 3. editar texto desde la línea de tiempo */
  await page.locator('.bar.el-text', { hasText: 'Hola' }).first().click();
  await page.waitForSelector('.tabs');
  const ta = page.locator('.row textarea');
  await ta.fill('¡Bienvenida!\nSoy Sofi');
  ok((await page.locator('#stage .el .txt', { hasText: 'Bienvenida' }).count()) === 1, 'Editar el texto actualiza la vista previa');
  await tab('Posición'); await setNum('Posición vertical', 1400); await setNum('Rotación', 5);
  ok((await app(() => REV_APP.findEl('el_hola').el.y)) === 1400, 'Cambiar la posición vertical modifica el manifest');
  await tab('Tiempo'); await setNum('Empieza en', 1.2);
  await page.selectOption('.row:has(.lbl:text("Animación de entrada")) select', 'pop');
  ok((await app(() => REV_APP.findEl('el_hola').el.anim.in.type)) === 'pop', 'Cambiar la animación de entrada');
  await tab('Texto'); await page.locator('.row:has(.lbl:text("Color")) .sw').nth(3).click();
  ok((await app(() => REV_APP.findEl('el_hola').el.color)) === '#ffd1e3', 'Cambiar el color del texto');

  const [fcf] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button', { hasText: 'Subir tipografía' }).click()]);
  await fcf.setFiles(join(root, 'tests/fixtures/fuente-prueba.otf'));
  await page.waitForTimeout(800);
  const fnt = await app(() => { const el = REV_APP.findEl('el_hola').el; const id = el.fontFamily.slice(6); return { ff: el.fontFamily, type: REV_APP.state.manifest.assets[id] && REV_APP.state.manifest.assets[id].type, loaded: document.fonts.check('20px "rev-font-' + id + '"'), css: getComputedStyle(document.querySelector('#stage .el[data-id=el_hola] .txt')).fontFamily }; });
  ok(/^asset:/.test(fnt.ff) && fnt.type === 'font' && fnt.loaded && /rev-font-/.test(fnt.css), 'Subir una tipografía y aplicarla al texto', fnt);

  /* 4. recolorear personaje (paleta SVG) */
  await page.locator('.bar.el-image', { hasText: 'Sofi' }).first().click();
  const dress = row('Vestido').locator('input[type=color]');
  await dress.evaluate((el) => { el.value = '#22aa88'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(400);
  ok((await app(() => REV_APP.findEl('el_sofi').el.paletteOverrides.dress)) === '#22aa88', 'Recolorear el vestido del personaje guarda el override');
  const svgTxt = await app(async () => { const src = document.querySelector('#stage .el[data-id=el_sofi] img').src; return (await fetch(src)).text(); });
  ok(/#22aa88/i.test(svgTxt) && !/#ff6fa8/i.test(svgTxt), 'El SVG mostrado realmente cambió de color (vestido #22aa88)');

  /* 5. reemplazar imagen con un archivo nuevo */
  await app(() => { REV_APP.engine.seek(REV.schema.sceneStarts(REV_APP.state.manifest)[1] + 1); REV_APP.onTime(); });
  await page.locator('.bar.el-image', { hasText: 'Sérum' }).first().click();
  await tab('Imagen');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button', { hasText: 'Reemplazar imagen' }).click()]);
  await fc.setFiles(join(root, 'tests/fixtures/nuevo-producto.png'));
  await page.waitForTimeout(500);
  const asset = await app(() => { const a = REV_APP.state.manifest.assets[REV_APP.findEl('el_serum').el.assetId]; return { path: a.path, has: REV_APP.state.files.has(a.path) }; });
  ok(asset.has && /nuevo-producto/.test(asset.path), 'Reemplazar imagen añade el archivo al proyecto', asset.path);

  /* 6. escenas: duración, duplicar, mover, eliminar */
  await page.locator('.bar.scene').nth(0).click();
  await setNum(/^Duración \(s\)/, 6);
  ok((await app(() => REV_APP.state.manifest.scenes[0].duration)) === 6, 'Cambiar duración de la escena 1 a 6 s');
  await page.locator('button', { hasText: 'Duplicar' }).click();
  ok((await page.locator('.bar.scene').count()) === 3, 'Duplicar escena → 3 escenas');
  const dupIds = await app(() => REV_APP.state.manifest.scenes.flatMap((s) => [s.id, ...s.elements.map((e) => e.id)]));
  ok(new Set(dupIds).size === dupIds.length, 'IDs únicos tras duplicar');
  await page.locator('button', { hasText: 'Después' }).click();
  ok((await app(() => REV_APP.state.manifest.scenes[2].name)) === 'Intro (copia)', 'Mover escena hacia adelante');
  const del = page.locator('.props .btn.danger'); await del.click(); await del.click();
  ok((await page.locator('.bar.scene').count()) === 2, 'Eliminar escena (con doble toque) → 2 escenas');
  await page.locator('#btnUndo').click();
  ok((await page.locator('.bar.scene').count()) === 3, 'Deshacer devuelve la escena eliminada');
  await page.locator('#btnUndo').click(); await page.locator('#btnUndo').click();

  /* 7. audio: volumen e inicio */
  await page.locator('.bar[class*=audio-narration]').first().click();
  await setNum('Volumen', 0.5); await setNum('Empieza en', 1.5);
  const au = await app(() => { const a = REV_APP.audioTrack('au_nar1'); return [a.volume, a.start]; });
  ok(au[0] === 0.5 && au[1] === 1.5, 'Cambiar volumen y momento de inicio del audio', au);

  /* 8. reproducción: avanza el tiempo, cambia de escena, suena audio */
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(1800);
  const p1 = await app(() => ({ t: REV_APP.engine.t, playing: REV_APP.engine.playing, audio: [...REV_APP.engine.audio.values()].filter((n) => !n.el.paused).length }));
  ok(p1.playing && p1.t > 1.2, 'La reproducción avanza el tiempo', p1.t.toFixed(2));
  ok(p1.audio >= 1, 'Hay audio sonando durante la reproducción', p1.audio);
  await page.screenshot({ path: join(out, '02-reproduciendo-escena1.png') });
  await page.locator('#btnPlay').click();
  await app(() => { REV_APP.engine.seek(REV.schema.sceneStarts(REV_APP.state.manifest)[1] + 3); REV_APP.onTime(); });
  await page.waitForTimeout(900);
  const vid = await app(() => { const v = document.querySelector('#stage video'); return v ? { w: v.videoWidth, rs: v.readyState, t: v.currentTime } : null; });
  ok(vid && vid.w > 0, 'El video de la escena 2 se decodifica', vid);
  await page.screenshot({ path: join(out, '03-escena2.png') });

  /* 9. arrastrar en el escenario */
  await page.locator('.bar.el-image', { hasText: 'Sérum' }).first().click();
  const box = await page.locator('#stage .el').filter({ has: page.locator('img') }).first().boundingBox();
  const x0 = await app(() => REV_APP.findEl('el_serum').el.x);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 5 }); await page.mouse.up();
  const x1 = await app(() => REV_APP.findEl('el_serum').el.x);
  ok(x1 > x0 + 40, 'Arrastrar un elemento en la vista previa cambia su posición', [x0, x1]);

  /* 10. título y descarga */
  await page.locator('#btnProject').click();
  const tin = page.locator('.row:has(.lbl:text("Título del proyecto")) input'); await tin.fill('Demo editada');
  await page.screenshot({ path: join(out, '04-editado.png') });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownload').click()]);
  const dlPath = join(out, 'descargado.zip'); await dl.saveAs(dlPath);
  ok(/demo-editada\.zip$/.test(dl.suggestedFilename()), 'Se descarga el ZIP actualizado', dl.suggestedFilename());

  /* 11. el ZIP descargado conserva todo y es válido */
  const z = await JSZip.loadAsync(readFileSync(dlPath));
  const m2 = JSON.parse(await z.file('manifest.json').async('string'));
  ok(m2.meta.title === 'Demo editada' && m2.meta.editor && m2.meta.editor.name === 'REV', 'manifest descargado: título nuevo y marca del editor');
  ok(m2.x_custom && m2.x_custom.n === 42, 'Campos desconocidos (x_custom) se conservan');
  const el2 = m2.scenes[0].elements.find((e) => e.id === 'el_hola');
  ok(el2.text.startsWith('¡Bienvenida!') && el2.y === 1400 && el2.rotation === 5 && el2.anim.in.type === 'pop' && el2.start === 1.2 && el2.color === '#ffd1e3', 'Todos los cambios del texto están en el ZIP');
  ok(m2.scenes[0].duration === 6, 'Duración de escena guardada');
  ok(m2.scenes[0].elements.find((e) => e.id === 'el_sofi').paletteOverrides.dress === '#22aa88', 'Paleta recoloreada guardada');
  const missing = Object.values(m2.assets).filter((a) => !z.file(a.path));
  ok(missing.length === 0, 'Todos los recursos referenciados existen en el ZIP', missing.map((a) => a.path));
  ok(Object.values(m2.assets).some((a) => a.type === 'font' && z.file(a.path)) && /^asset:/.test(el2.fontFamily), 'La tipografía subida viaja dentro del ZIP');
  ok(!!z.file('assets/characters/sofi.svg') && !!z.file('assets/audio/musica.mp3') && !!z.file('assets/videos/clip-demo.mp4'), 'Se conservan los recursos originales (SVG, audio, video)');
  try { execFileSync('node', [join(root, 'tools/validate.mjs'), dlPath], { stdio: 'pipe' }); ok(true, 'tools/validate.mjs acepta el ZIP descargado'); } catch (e) { ok(false, 'validate.mjs', String(e.stdout)); }

  /* 12. reabrir el ZIP descargado en una sesión nueva */
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => errors.push('pageerror2: ' + e.message));
  await page2.goto(URL_);
  await page2.setInputFiles('#fileOpen', dlPath);
  await page2.waitForSelector('#app:not([hidden])'); await page2.waitForSelector('.bar.scene'); await page2.waitForTimeout(600);
  const re = await page2.evaluate(() => { const m = REV_APP.state.manifest; return { title: m.meta.title, scenes: m.scenes.length, y: REV_APP.findEl('el_hola').el.y, txt: REV_APP.findEl('el_hola').el.text, dress: REV_APP.findEl('el_sofi').el.paletteOverrides.dress, warn: REV_APP.state.warnings }; });
  ok(re.title === 'Demo editada' && re.y === 1400 && re.txt.startsWith('¡Bienvenida') && re.dress === '#22aa88', 'Reabrir el ZIP descargado conserva los cambios', re);
  ok(re.warn.length === 0, 'Sin avisos al reabrir', re.warn);
  await page2.screenshot({ path: join(out, '05-reabierto.png') });

  /* 13. guardar en navegador y continuar */
  await page2.locator('#btnSave').click(); await page2.waitForTimeout(600);
  await page2.reload(); await page2.waitForTimeout(500);
  ok(await page2.locator('#btnResume').isVisible(), 'Después de “Guardar”, el inicio ofrece continuar el proyecto');
  await page2.locator('#btnResume').click(); await page2.waitForSelector('#app:not([hidden])');
  ok((await page2.evaluate(() => REV_APP.state.manifest.meta.title)) === 'Demo editada', 'Continuar restaura el proyecto guardado');

  /* 12b. cerrar el proyecto y abrir otro (error reportado en iPhone) */
  await page2.locator('#btnProject').click();
  const cl = page2.locator('.props .btn', { hasText: /Cerrar proyecto|Seguro/ }); await cl.click(); await cl.click();
  await page2.waitForSelector('#home:not([hidden])');
  await page2.setInputFiles('#fileOpen', join(root, 'samples/espirit-demo.zip'));
  await page2.waitForSelector('#app:not([hidden])'); await page2.waitForSelector('.bar.scene');
  ok((await page2.evaluate(() => REV_APP.state.manifest.meta.title)) === 'Espirit Beauty · Demo', 'Cerrar un proyecto y abrir otro funciona');

  /* 14. escritorio */
  const pd = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await pd.goto(URL_); await pd.setInputFiles('#fileOpen', dlPath); await pd.waitForSelector('.bar.scene'); await pd.waitForTimeout(500);
  await pd.screenshot({ path: join(out, '06-escritorio.png') });
} catch (e) {
  console.log('FAIL excepción: ' + e.stack); failed++;
  await page.screenshot({ path: join(out, 'error.png') }).catch(() => {});
}
const real = errors.filter((e) => !/favicon/.test(e));
ok(real.length === 0, 'Sin errores de consola/JS', real);
await browser.close(); server.kill();
console.log(failed ? '\n' + failed + ' comprobación(es) fallaron' : '\nTodo correcto');
process.exit(failed ? 1 : 0);
