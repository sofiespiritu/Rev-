# Arquitectura de REV

REV es una **página web estática**: HTML + CSS + JavaScript (módulos ES), **sin dependencias y sin paso de compilación**.
Se abre en Safari del iPhone o en una computadora, y se puede alojar gratis (GitHub Pages).
Todo se procesa en el navegador: tus proyectos no se suben a ningún servidor.

```
index.html            estructura de la pantalla (vista previa, transporte, pestañas)
css/app.css           diseño móvil primero
js/zip.js             lector/escritor ZIP propio (STORE + DEFLATE por DecompressionStream)
js/model.js           formato del proyecto: normalización, valores por defecto, utilidades
js/render.js          dibujo determinista de una escena (Canvas 2D) y animaciones
js/app.js             estado, interfaz, reproducción, audio, guardado
docs/                 formato del ZIP y esta arquitectura
tools/                make_sample.py (proyecto de prueba), validate_project.py (validador)
examples/             proyecto de prueba (carpeta y ZIP)
test/e2e.mjs          prueba automática del ciclo abrir → editar → descargar → reabrir
CLAUDE.md             instrucciones para que Claude genere ZIP compatibles
```

## Flujo

1. Claude genera un ZIP `rev-project` y lo valida con `tools/validate_project.py`.
2. En REV: **Abrir** → se lee el ZIP en memoria (`Map ruta → bytes`) y se normaliza el `manifest.json`.
3. La vista previa dibuja la escena actual en un canvas a media resolución; cada elemento es un objeto del manifest,
   así que seleccionar/mover/cambiar propiedades solo modifica datos y vuelve a dibujar.
4. **Guardar** deja una copia en el navegador (IndexedDB, botón «Continuar el último proyecto»). **Descargar** escribe un
   ZIP nuevo con el `manifest.json` actualizado y **todos los archivos originales sin tocar** (los reemplazos se añaden
   como archivos nuevos; los reemplazados se conservan).
5. El ZIP descargado se vuelve a abrir igual (probado en `test/e2e.mjs`).

## Decisiones

- **Sin librerías y sin red**: nada que instalar, nada que se rompa por una actualización; funciona sin internet una vez cargada.
- **Datos, no píxeles**: la escena es el manifest; el canvas es solo una vista. Por eso nada queda aplanado.
- **Render determinista**: el estado visual depende solo de `(proyecto, escena, tiempo)`. Lo mismo servirá para exportar.
- **ZIP sin compresión**: el contenido (PNG, M4A, MP4) ya está comprimido; STORE es más rápido y funciona en cualquier Safari.

## Límites conocidos y plan

| Función | Estado |
|---|---|
| Abrir/editar/guardar/descargar/reabrir | Implementado y probado en Chrome (automático) |
| Safari en iPhone | **No probado en un iPhone real** desde este entorno; usa APIs estándar de Safari 16.4+ |
| Audio sincronizado en la vista previa | Implementado; iOS exige un toque del usuario para iniciar audio, se desbloquea al pulsar ▶ (sin verificar en iPhone) |
| Exportar MP4 1080×1920 | **Pendiente (etapa 2).** Opciones: `MediaRecorder` (Safari 14.1+ graba MP4 en tiempo real, hay que dejar la pantalla encendida) o WebCodecs (Safari 16.4+/mejor control). Ninguna está verificada todavía |
| Transiciones entre escenas, keyframes libres | Pendiente |
| Personajes por partes (rigging, labios) | Fuera de alcance de esta etapa |
