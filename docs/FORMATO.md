# Formato de proyecto REV (`rev-project` v1)

Este es el contrato entre Claude (que genera los videos) y REV (el editor). Un proyecto es un **ZIP** con un `manifest.json` en la raíz y una carpeta `assets/`. REV nunca "aplana" nada: cada personaje, fondo, texto, clip y audio es un elemento editable referenciado desde el manifest.

## Estructura del ZIP

```
mi-video.zip
├─ manifest.json            ← obligatorio, en la raíz
└─ assets/
   ├─ images/   fondos y otras imágenes (.svg .png .jpg .webp)
   ├─ characters/  personajes (.svg recomendado)
   ├─ products/    productos
   ├─ videos/   clips (.mp4 H.264 + AAC, compatible con Safari)
   ├─ audio/    narración, música, efectos (.mp3 .m4a .wav)
   └─ fonts/    opcional (.ttf .otf .woff2)
```
Las subcarpetas son convención; lo que manda es el `path` de cada recurso. Los nombres de archivo sin espacios ni acentos. REV también acepta que todo esté dentro de una carpeta única (`proyecto/manifest.json`), pero al guardar lo deja en la raíz.

## manifest.json

```jsonc
{
  "format": "rev-project",          // obligatorio, literal
  "version": 1,                     // obligatorio
  "meta":   { "title": "…", "brand": "Espirit Beauty", "generator": "Claude", "notes": "" },
  "canvas": { "width": 1080, "height": 1920, "fps": 30 },   // siempre vertical 9:16
  "assets": { "<assetId>": { "type": "image|video|audio|font", "path": "assets/…", "name": "Nombre legible",
                              "palette": [ { "id": "dress", "label": "Vestido", "color": "#ff6fa8" } ] } },
  "scenes": [ /* ver abajo */ ],
  "audio":  [ /* ver abajo */ ]
}
```
Reglas generales: IDs únicos en todo el manifest (letras, números, `_`). Tiempos en **segundos**. Posiciones y tamaños en **píxeles del lienzo 1080×1920**, `x,y` = esquina superior izquierda. Colores `#rrggbb`. REV **conserva los campos desconocidos** (puedes añadir `x_…` propios) pero no los edita.

### Escena
```jsonc
{ "id": "sc_intro", "name": "Intro", "duration": 4.5,
  "background": { "color": "#ffd1e3", "assetId": "bg_rosa" },   // assetId opcional (imagen o video)
  "transition": { "type": "none|fade", "duration": 0.4 },       // transición de ENTRADA
  "elements": [ /* el primero queda al fondo, el último al frente */ ] }
```
Las escenas se reproducen en el orden de la lista, una tras otra. El inicio de cada escena = suma de las duraciones anteriores.

### Elementos (comunes a todos)
| campo | descripción | defecto |
|---|---|---|
| `id`, `type` | `image` · `video` · `text` · `shape` | — |
| `name` | nombre en la línea de tiempo | tipo |
| `enabled` | visible | `true` |
| `start` | segundo **dentro de la escena** en que aparece | `0` |
| `duration` | cuánto dura; `null` = hasta el final de la escena | `null` |
| `x, y, w, h` | posición y tamaño (en texto, `h: 0` = alto automático) | 0,0,300,300 |
| `rotation` | grados | `0` |
| `opacity` | 0–1 | `1` |
| `flipX` | volteo horizontal | `false` |
| `blur` | desenfoque en px | `0` |
| `shadow` | `{ "color": "rgba(0,0,0,.4)", "blur": 16, "y": 8 }` o `null` | `null` |
| `anim` | animaciones (abajo) | ninguna |

**`anim`**
```jsonc
"anim": {
  "enabled": true,
  "in":   { "type": "pop",  "duration": 0.6 },   // entrada
  "out":  { "type": "fade", "duration": 0.4 },   // salida (ocupa el final de la vida del elemento)
  "loop": { "type": "float", "speed": 0.6, "amount": 1 }   // movimiento continuo; speed = ciclos por segundo
}
```
- `in`/`out` `type`: `none`, `fade`, `from-bottom`, `from-top`, `from-left`, `from-right`, `zoom-in`, `zoom-out`, `pop`, `spin`.
- `loop` `type`: `none`, `float`, `pulse`, `sway`, `spin`, `blink`.

### Por tipo
- **image**: `assetId`, `fit` (`contain`|`cover`), `paletteOverrides` (`{ "dress": "#22aa88" }`).
- **video**: `assetId`, `fit` (`cover`), `loop` (`true`), `muted` (`true`), `trimStart` (s), `radius` (px).
- **text**: `text` (admite `\n`), `fontSize` (px), `color`, `fontWeight` (400–900), `align` (`left|center|right`), `fontFamily` (`system|rounded|serif|script|mono` o `asset:<fontAssetId>`), `lineHeight`.
- **shape**: `shape` (`rect|ellipse`), `fill`, `radius` (px).

### Audio (nivel proyecto)
```jsonc
{ "id": "au_nar1", "name": "Narración 1", "assetId": "aud_nar1", "role": "narration|music|sfx",
  "sceneId": "sc_intro",   // null = tiempo absoluto del video; con escena, `start` es relativo a ella
  "start": 0.9, "volume": 0.9, "loop": false, "duration": null, "trimStart": 0 }
```
Ata la narración a su `sceneId`: así sigue a la escena si el usuario la mueve de lugar. La música de fondo lleva `sceneId: null`, `loop: true`.

## Personajes y productos editables en color (paleta SVG)
Para que el usuario recolore un personaje o producto sin tocar código: dibújalo en **SVG**, usa para cada parte recoloreable un hex de 6 dígitos **único en ese SVG** (no lo repitas en otras partes) y decláralo en `assets.<id>.palette`. REV sustituye ese color por el elegido (`paletteOverrides`). Animaciones SMIL/CSS dentro del SVG funcionan en la vista previa pero no se pueden pausar ni buscar por tiempo; para animaciones controlables usa `anim` del elemento.

## Qué hace REV al guardar
Reescribe `manifest.json` (añade `meta.modified` y `meta.editor`), conserva todos los recursos originales y los campos desconocidos, y solo omite recursos que el propio usuario subió y luego dejó de usar. Un recurso reemplazado se añade con un nombre nuevo (`assets/images/<nombre>-<id>.<ext>`); el original sigue en el ZIP.

## Cómo comprobar un ZIP antes de entregarlo
```
node tools/validate.mjs proyecto.zip
```
Devuelve error (código 1) si el proyecto no se podría abrir y avisos si falta algún archivo, hay recursos sin usar o colores de paleta mal escritos.

## Límites conocidos (v1)
- No hay animación por fotogramas clave libres: solo entrada, salida y un movimiento continuo por elemento.
- Los videos de clip se reproducen en la vista previa; su audio interno está silenciado por defecto.
- El volumen se aplica con Web Audio para que funcione en iPhone.
