# REV

Editor visual y sencillo para los videos animados de Espirit Beauty. Pensado para iPhone (Safari), funciona también en computadora.

1. Claude crea un proyecto y te entrega un ZIP.
2. Abres REV, tocas **Abrir** y eliges el ZIP.
3. Editas escenas, capas, textos, colores, animaciones, tiempos y audio; ves la vista previa en 9:16.
4. **Descargar** te da el ZIP actualizado, que puedes volver a abrir cuando quieras.

Sin instalación ni compilación: es una página estática (`index.html`). Para probarla en local:

```bash
python3 -m http.server 8000   # y abre http://localhost:8000
```

Para usarla desde el iPhone, aloja la carpeta gratis con GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root).

- Formato de los ZIP: [`docs/FORMATO_PROYECTO.md`](docs/FORMATO_PROYECTO.md)
- Arquitectura y límites: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Proyecto de prueba: [`examples/proyecto_prueba.zip`](examples/proyecto_prueba.zip) (personajes provisionales)
- Prueba automática: `node test/e2e.mjs` (Playwright + Chrome)

**Pendiente:** exportar MP4 1080×1920 (botón MP4 desactivado hasta que se implemente y verifique).
