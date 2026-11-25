# REV — instrucciones para Claude

REV es un editor visual de videos verticales (1080×1920) para Espirit Beauty. Es una **web estática sin build** (HTML + JS plano + `vendor/jszip.min.js`), pensada primero para Safari en iPhone. Claude crea los proyectos; la dueña los abre en REV desde un ZIP, hace cambios sencillos y los descarga.

## Cuando generes un proyecto de video
1. Lee `docs/FORMATO.md` y respeta el formato `rev-project` v1 al pie de la letra.
2. Todo debe quedar como elementos editables (personajes, fondos, productos, textos, clips, audio). No aplanes escenas en un solo video.
3. Personajes/productos en SVG con paleta declarada (ver "paleta SVG" en el formato).
4. Valida antes de entregar: `node tools/validate.mjs proyecto.zip` (sin errores; revisa los avisos).
5. Entrega un único `.zip` con `manifest.json` en la raíz.

## Código
- Sin dependencias de pago ni servicios externos; sin bundler. Mantén todo compatible con Safari iOS (sin sintaxis ni APIs que Safari 16 no tenga).
- `js/schema.js` (formato y validación), `js/zip-io.js` (ZIP), `js/engine.js` (vista previa y reproducción), `js/app.js` (interfaz).
- Cualquier cambio al formato: sube `version` si rompe compatibilidad, actualiza `docs/FORMATO.md`, `tools/build-sample.mjs` y regenera `samples/espirit-demo.zip` (`node tools/build-sample.mjs`).
- Prueba: `node tests/e2e.mjs` (Chrome + Playwright; arranca su propio servidor). No des por funcionando algo que no haya pasado esa prueba.
- No simular funciones: lo que no esté implementado debe verse como no disponible (p. ej. el botón de MP4).
