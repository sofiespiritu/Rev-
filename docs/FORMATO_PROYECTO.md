# Formato de proyecto REV (`rev-project`, versión 1)

Un proyecto REV es un **ZIP** con un `manifest.json` en la raíz y una carpeta `assets/`.
REV lo abre, permite editarlo y lo vuelve a guardar en el mismo formato. Nada se aplana:
cada personaje, fondo, producto, texto, efecto y audio sigue siendo un elemento independiente.

```
proyecto.zip
├─ manifest.json            ← escenas, elementos, animaciones, referencias
└─ assets/
   ├─ images/   fondos, logos           (PNG, JPG, WEBP, GIF, SVG)
   ├─ characters/  personajes sueltos    (PNG con transparencia)
   ├─ products/    productos             (PNG con transparencia)
   ├─ video/       clips                 (MP4/MOV H.264)
   ├─ audio/       narración, música     (M4A, MP3, WAV)
   └─ fonts/       tipografías           (TTF, OTF, WOFF2)
```

Las subcarpetas son una convención; lo que manda es `assets.<id>.path`.

## Reglas del ZIP

- `manifest.json` va **en la raíz** (REV también acepta una única carpeta raíz, pero no la generes así).
- Codificación UTF-8, nombres de archivo sin rutas absolutas ni `..`.
- Crear el ZIP **sin compresión (STORE)**: `zipfile.ZIP_STORED` o `zip -0 -r`. REV lee DEFLATE solo en iOS/Safari 16.4+.
- Antes de entregar, ejecutar `python3 tools/validate_project.py proyecto.zip`.

## manifest.json

```jsonc
{
  "format": "rev-project",          // obligatorio, exacto
  "version": 1,                      // obligatorio
  "meta": {
    "name": "Nombre visible",
    "width": 1080, "height": 1920,   // vertical 9:16
    "fps": 30,
    "background": "#fff6f1",
    "safeArea": { "left": 90, "right": 90, "top": 120, "bottom": 450 },  // guía visible en REV
    "createdBy": "Claude"
  },
  "assets": {                        // id -> archivo
    "personaje_1": { "type": "image", "path": "assets/characters/personaje_1.png", "name": "Personaje 1" },
    "voz":     { "type": "audio", "path": "assets/audio/voz.m4a", "name": "Narración" },
    "cardo":   { "type": "font",  "path": "assets/fonts/Cardo-Bold.ttf", "family": "Cardo", "name": "Cardo Bold" }
  },
  "scenes": [ /* ver abajo; el video es la suma de las duraciones, en orden */ ],
  "audio":  [ /* audios globales (opcional) */ ]
}
```

Tipos de recurso: `image`, `video`, `audio`, `font` (las fuentes requieren `family`). Un mismo recurso
puede usarse en varios elementos. Las claves desconocidas se **conservan** al guardar.

### Escena

```jsonc
{
  "id": "scene_1", "name": "Pregunta", "duration": 5,          // segundos
  "background": { "color": "#fff0f4", "asset": "bg_rosa", "fit": "cover" },  // asset puede ser null; fit: cover|contain
  "elements": [ /* de atrás hacia adelante: el último queda al frente */ ],
  "audio": [ { "id": "a1", "asset": "voz", "start": 0.3, "volume": 1, "trimStart": 0, "label": "Narración" } ]
}
```

`audio.start` de una escena cuenta desde el inicio **de esa escena**; el de `audio` global, desde el segundo 0.
`trimStart` salta los primeros segundos del archivo. `volume` va de 0 a 1.

### Elemento (campos comunes)

| campo | significado |
|---|---|
| `id` | único en todo el proyecto |
| `type` | `image` · `video` · `text` · `shape` · `effect` |
| `name` | nombre que ve el usuario en Capas |
| `x`, `y` | **centro** del elemento, en px del lienzo (1080×1920) |
| `width`, `height` | tamaño en px (en `text`, `width` es el ancho de la caja; el alto se calcula) |
| `rotation` | grados |
| `opacity` | 0–1 |
| `start` | segundo (dentro de la escena) en que aparece |
| `duration` | segundos visibles; `0` = hasta el final de la escena |
| `visible`, `locked` | booleanos |
| `in`, `out` | animación de entrada / salida: `{ "type", "duration", "easing" }` |
| `loop` | movimiento continuo: `{ "type", "amount", "speed" }` |

Animaciones `in`/`out` (`type`): `none`, `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `zoom`, `pop`.
`easing`: `linear`, `easeIn`, `easeOut`, `easeInOut`, `back`. `loop.type`: `none`, `float`, `pulse`, `sway`, `spin`.

### Campos por tipo

- **image**: `asset`, `fit` (`contain`|`cover`|`fill`), `flipX`.
- **video**: `asset`, `fit`, `trimStart`, `volume` (0 = mudo), `loop`.
- **text**: `text`, `font` (familia de un recurso `font` o de sistema), `fontSize`, `fontWeight`, `color`, `align`, `lineHeight`, `stroke {color,width}`, `shadow`.
- **shape**: `shape` (`rounded`|`rect`|`circle`), `fill`, `radius`, `stroke {color,width}`.
- **effect**: `effect: "sparkles"`, `color`, `count`, `size`, `speed`, `seed` (el resultado es determinista).

## Encuadre seguro y recorte

Para TikTok/Reels deja fuera de textos, personajes y productos: **90 px por cada lado y 450 px abajo** (y ~120 px arriba).
REV las dibuja como guía (casilla «Guías»). Los fondos y decoraciones pueden llegar al borde. Si quieres poder hacer
zoom/recorte luego, haz los fondos más grandes que el lienzo (p. ej. `width` 1296, `height` 2304 centrados) y el contenido importante dentro de la zona segura.

## Lo que REV puede editar hoy

Duración, orden, duplicado y borrado de escenas; fondos; reemplazo de imágenes/videos/audios; posición, tamaño, rotación,
opacidad, color, texto y fuente; animaciones de entrada/salida/continuas y su duración; tiempo de entrada y duración de cada elemento (también en la línea de tiempo);
volumen y momento de inicio de los audios.

## Aún no soportado (no lo generes)

Transiciones entre escenas, keyframes libres, máscaras, efectos de color sobre video, exportación MP4 (etapa siguiente).
