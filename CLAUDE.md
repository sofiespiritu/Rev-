# REV · instrucciones para Claude

REV es el editor visual (web estática, sin dependencias) donde la usuaria abre, edita y descarga los videos animados
de Espirit Beauty desde su iPhone. **Todo proyecto de video que crees para ella debe entregarse como ZIP `rev-project`.**

## Al crear un proyecto

1. Lee `docs/FORMATO_PROYECTO.md` (es la especificación; no inventes campos).
2. Estructura: `manifest.json` en la raíz + `assets/` con cada personaje, fondo, producto, audio y fuente **por separado**
   (PNG transparentes para personajes y productos). Nunca entregues un video plano o una imagen con todo fusionado.
3. Conserva sin modificar los audios y productos originales que ella envíe (cópialos a `assets/`).
4. Lienzo 1080×1920. Textos, personajes y productos dentro del área segura (90 px por lado, 450 px abajo, ~120 px arriba).
   Fondos sobredimensionados si hace falta permitir zoom.
5. IDs únicos y cortos; nombres de capa en español comprensibles («Personaje 1», «Título»), porque ella los ve en la pestaña Capas.
6. Valores numéricos en px y segundos. Todo lo que ella pueda querer cambiar (texto, color, duración, posición) debe ser un
   campo del manifest, no algo incrustado en una imagen.
7. Genera el ZIP con `zipfile.ZIP_STORED` (sin compresión) y valida: `python3 tools/validate_project.py proyecto.zip`.
   No entregues con errores; revisa los avisos.
8. Prueba el ZIP: `node test/e2e.mjs` solo prueba el proyecto de ejemplo; para uno nuevo, ábrelo en el editor
   (servidor estático + Playwright, como en `test/e2e.mjs`) y revisa una captura de cada escena.

## Al desarrollar REV

- Sin dependencias ni compilación: JS/CSS/HTML planos. Debe funcionar en Safari de iPhone (iOS 16.4+) y en escritorio.
- No simules funciones: si algo no se pudo verificar (sobre todo en Safari/iPhone), dilo.
- Antes de entregar cambios: `node test/e2e.mjs` (Playwright + Chrome) debe pasar entera.
- No cambies el formato sin subir `version`, mantener lectura de la anterior y actualizar `docs/FORMATO_PROYECTO.md`.
- La usuaria no programa: interfaz en español, botones grandes, pocas opciones técnicas.

## Estado

Etapa 1 hecha: abrir ZIP, vista previa, edición de escenas/capas/propiedades/tiempo/audio, guardar y descargar ZIP.
Pendiente: exportar MP4 1080×1920 (investigar y verificar en Safari), transiciones, más efectos.
Los personajes del ejemplo son provisionales.
