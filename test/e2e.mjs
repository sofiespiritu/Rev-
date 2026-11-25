// Prueba de extremo a extremo: abrir ZIP -> editar -> previsualizar -> descargar -> reabrir.
// Uso:  node test/e2e.mjs   (necesita Playwright y Chrome; sirve el repo en un servidor estático local)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = process.env.REV_TEST_OUT || '/tmp/rev-test';
fs.mkdirSync(OUTDIR, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.zip': 'application/zip' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const URL_ = `http://localhost:${server.address().port}/`;

let failures = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + msg); if (!c) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());

// ---- 1. abrir el ZIP de prueba
await page.goto(URL_);
await page.screenshot({ path: `${OUTDIR}/01_vacio.png` });
await page.setInputFiles('#zipInput', path.join(ROOT, 'examples/proyecto_prueba.zip'));
await page.waitForFunction(() => window.__REV.project, null, { timeout: 15000 });
await page.waitForTimeout(600);
ok(await page.evaluate(() => window.__REV.project.scenes.length) === 2, 'abre el ZIP y reconoce 2 escenas');
ok((await page.textContent('#projName')) === 'Proyecto de prueba REV', 'muestra el nombre del proyecto');
await page.screenshot({ path: `${OUTDIR}/02_abierto.png` });
const seekTo = async (t) => { await page.evaluate((t) => { const s = document.querySelector('#scrub'); s.value = t; s.dispatchEvent(new Event('input')); }, t); await page.waitForTimeout(300); };
await seekTo(2.5); await page.screenshot({ path: `${OUTDIR}/03_escena1_2s.png` });
await seekTo(8); await page.screenshot({ path: `${OUTDIR}/04_escena2_3s.png` });
const nonBlank = await page.evaluate(() => { const c = document.querySelector('#cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return set.size; });
ok(nonBlank > 30, `la vista previa tiene contenido (${nonBlank} colores distintos)`);

// ---- 2. editar
await seekTo(0.1);
// 2a duración de la escena 1 (pestaña Escenas)
await page.click('#tabs [data-tab=escenas]');
await page.fill('#panel input[type=number]', '6'); await page.dispatchEvent('#panel input[type=number]', 'change');
await page.waitForTimeout(150);
ok(await page.evaluate(() => window.__REV.project.scenes[0].duration) === 6, 'cambia la duración de la escena 1 a 6 s');
// 2b texto, color y tamaño del título
await page.click('#tabs [data-tab=capas]');
await page.click('.layer .nm:has-text("Pregunta")');
await page.waitForTimeout(150);
await page.fill('#panel textarea', 'Texto editado en la prueba');
await page.fill('#panel input[type=color]', '#c24770');
const sel = await page.evaluate(() => window.__REV.selEl);
ok(sel === 's1_texto', 'selecciona la capa de texto desde Capas');
// tamaño de fuente (primer range tras el textarea)
await page.evaluate(() => { const r = [...document.querySelectorAll('#panel .row')].find((r) => r.textContent.startsWith('Tamaño')).querySelector('input[type=range]'); r.value = 100; r.dispatchEvent(new Event('input')); });
// 2c arrastrar el elemento en el lienzo (el título entra en 0.8 s, hay que estar después)
await seekTo(2);
const before = await page.evaluate(() => { const e = window.__REV.project.scenes[0].elements.find((e) => e.id === 's1_texto'); return [e.x, e.y]; });
const box = await page.locator('#cv').boundingBox();
const bx = await page.evaluate(() => { const b = window.__REV.boxes['s1_texto']; return [b.x, b.y]; });
const px = (x, y) => [box.x + x / 1080 * box.width, box.y + y / 1920 * box.height];
const [sx, sy] = px(bx[0], bx[1]); const [ex, ey] = px(bx[0] + 100, bx[1] + 120);
await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(ex, ey, { steps: 6 }); await page.mouse.up();
const after = await page.evaluate(() => { const e = window.__REV.project.scenes[0].elements.find((e) => e.id === 's1_texto'); return [e.x, e.y]; });
ok(Math.abs(after[0] - before[0] - 100) < 8 && Math.abs(after[1] - before[1] - 120) < 8, `arrastra el texto en el lienzo (${before} -> ${after})`);
// 2d reemplazar imagen del personaje por el producto
await page.click('#tabs [data-tab=capas]');
await page.click('.layer .nm:has-text("Juanita")');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#panel button:has-text("Reemplazar")')]);
await chooser.setFiles(path.join(ROOT, 'examples/proyecto_prueba/assets/characters/maria.png'));
await page.waitForTimeout(400);
const rep = await page.evaluate(() => { const P = window.__REV.project; const e = P.scenes[0].elements.find((e) => e.id === 's1_juanita'); return { asset: e.asset, path: P.assets[e.asset].path, has: window.__REV.files.has(P.assets[e.asset].path) }; });
ok(rep.asset !== 'juanita' && rep.has, `reemplaza la imagen (nuevo recurso ${rep.path})`);
// 2e animación: cambiar entrada de Juanita a zoom
await page.evaluate(() => { const row = [...document.querySelectorAll('#panel .row')].find((r) => r.querySelector('label')?.textContent === 'Entrada'); const s = row.querySelector('select'); s.value = 'zoom'; s.dispatchEvent(new Event('change')); });
ok(await page.evaluate(() => window.__REV.project.scenes[0].elements.find((e) => e.id === 's1_juanita').in.type) === 'zoom', 'cambia la animación de entrada');
// 2f desactivar capa (ojo) y reactivar
await page.click('#tabs [data-tab=capas]');
await page.click('.layer:has-text("Destellos") .btn[title="Mostrar/ocultar"]');
ok(await page.evaluate(() => window.__REV.project.scenes[0].elements.find((e) => e.id === 's1_chispas').visible) === false, 'oculta una capa (efecto)');
// 2g reordenar escenas y duplicar
await page.click('#tabs [data-tab=escenas]');
await page.click('button:has-text("Bajar escena")');
ok(await page.evaluate(() => window.__REV.project.scenes.map((s) => s.id).join()) === 'scene_2,scene_1', 'reordena las escenas');
await page.click('button:has-text("Duplicar")');
ok(await page.evaluate(() => window.__REV.project.scenes.length) === 3, 'duplica una escena');
// 2h arrastrar barra en la línea de tiempo
await page.click('#tabs [data-tab=tiempo]');
const bar = page.locator('.tl .bar').first(); const bb = await bar.boundingBox();
await page.mouse.move(bb.x + 20, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + 70, bb.y + bb.height / 2, { steps: 4 }); await page.mouse.up();
const st = await page.evaluate(() => { const sc = window.__REV.project.scenes[window.__REV.sceneIdx]; return sc.elements[0].start; });
ok(st > 0, `mueve el inicio de un elemento en la línea de tiempo (start=${st})`);
await seekTo(1); await page.screenshot({ path: `${OUTDIR}/05_editado.png` });

// ---- 3. reproducir
await page.click('#btnPlay'); await page.waitForTimeout(1500);
const t1 = await page.evaluate(() => window.__REV.t); await page.click('#btnPlay');
ok(t1 > 0.8, `reproduce y avanza el tiempo (t=${t1.toFixed(2)} s)`);

// ---- 4. descargar
const snapshot = await page.evaluate(() => JSON.parse(JSON.stringify(window.__REV.project, (k, v) => (k.startsWith('_') ? undefined : v))));
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
const zipOut = `${OUTDIR}/descargado.zip`; await dl.saveAs(zipOut);
ok(fs.statSync(zipOut).size > 1_000_000, `descarga el ZIP (${fs.statSync(zipOut).size} bytes)`);
fs.writeFileSync(`${OUTDIR}/esperado.json`, JSON.stringify(snapshot));

// ---- 5. reabrir en una página nueva y comparar
const page2 = await ctx.newPage();
page2.on('pageerror', (e) => errors.push(e.message));
await page2.goto(URL_);
await page2.setInputFiles('#zipInput', zipOut);
await page2.waitForFunction(() => window.__REV.project, null, { timeout: 15000 });
const reopened = await page2.evaluate(() => JSON.parse(JSON.stringify(window.__REV.project, (k, v) => (k.startsWith('_') ? undefined : v))));
ok(JSON.stringify(reopened) === JSON.stringify(snapshot), 'el ZIP descargado se reabre idéntico (manifest completo)');
ok(reopened.scenes.length === 3 && reopened.scenes[1].elements.find((e) => e.id === 's1_texto')?.text === 'Texto editado en la prueba', 'conserva los cambios de texto y orden');
await page2.waitForTimeout(500);
await page2.screenshot({ path: `${OUTDIR}/06_reabierto.png` });
const warn = await page2.evaluate(() => document.querySelector('#banner').hidden);
ok(warn, 'sin avisos de recursos faltantes al reabrir');
ok(errors.length === 0, 'sin errores de consola/página' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

await browser.close(); server.close();
console.log(failures ? `\n${failures} comprobación(es) fallaron` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
