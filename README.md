# REV

Editor visual de videos verticales (9:16, 1080×1920) para Espirit Beauty. Web estática: no necesita servidor, base de datos ni servicios de pago.

## Usar
Publica la carpeta en cualquier hosting estático gratuito (GitHub Pages, por ejemplo) y ábrela en Safari. En local: `python3 -m http.server` y entra a `http://localhost:8000`.

Flujo: Claude genera un ZIP → **Abrir proyecto** → editar (escenas, elementos, textos, colores, audio) → **⬇ ZIP** para descargar → volver a abrirlo cuando quieras. **Guardar** deja una copia en el navegador (Safari puede borrarla si no usas el sitio durante días; el ZIP es el respaldo real).

## Qué hay (etapa 1)
Abrir/guardar/descargar ZIP · vista previa 9:16 con reproducción y audio · línea de tiempo · escenas (duración, orden, duplicar, eliminar, fondo, transición) · elementos (imagen, video, texto, forma: posición, tamaño, rotación, opacidad, tiempos, animación de entrada/salida/continua, efectos, reemplazar archivo, colores de personajes SVG) · audio (reemplazar, volumen, inicio) · deshacer/rehacer.

**Pendiente:** exportar MP4 1080×1920 (el botón aparece desactivado). Ver "Limitaciones" más abajo.

## Formato de proyecto
`docs/FORMATO.md`. Validar un ZIP: `node tools/validate.mjs proyecto.zip`. Proyecto de ejemplo: `samples/espirit-demo.zip` (se regenera con `node tools/build-sample.mjs`). Prueba completa: `node tests/e2e.mjs`.

## Limitaciones
- **MP4:** Safari en iPhone no puede ejecutar FFmpeg pesado de forma fiable. La vía más realista es codificar en el propio navegador con WebCodecs (H.264, soportado por Safari reciente) dibujando cada fotograma del proyecto; es gratis pero lenta y su fiabilidad en iPhone debe probarse con un dispositivo real. Alternativa: exportar con un script de escritorio (Node + FFmpeg) usando el mismo ZIP.
- La vista previa del video interno de un clip y las animaciones propias de un SVG no se pueden buscar por tiempo exacto.
- Probado en Chrome (escritorio y vista móvil emulada). **No se ha probado todavía en un iPhone real**; lo más delicado allí es el audio, que iOS solo permite iniciar tras tocar Reproducir.
