#!/usr/bin/env python3
"""Valida un proyecto REV (ZIP o carpeta) ANTES de entregarlo.  Uso: python3 tools/validate_project.py proyecto.zip
Sale con código 1 si hay errores. Las advertencias no bloquean."""
import json, sys, os, zipfile

TYPES = {'image', 'video', 'audio', 'font'}
ELS = {'image', 'video', 'text', 'shape', 'effect'}
ANIMS = {'none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom', 'pop'}
LOOPS = {'none', 'float', 'pulse', 'sway', 'spin'}
EASE = {'linear', 'easeIn', 'easeOut', 'easeInOut', 'back'}
errs, warns = [], []
E = errs.append
W = warns.append

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    sys.exit(__doc__)
if os.path.isdir(src):
    files = {os.path.relpath(os.path.join(r, f), src).replace(os.sep, '/') for r, _, fs in os.walk(src) for f in fs}
    read = lambda p: open(os.path.join(src, p), 'rb').read()
else:
    z = zipfile.ZipFile(src)
    if z.testzip():
        E('ZIP dañado: ' + z.testzip())
    methods = {i.compress_type for i in z.infolist() if not i.filename.endswith('/')}
    if methods - {0}:
        W('El ZIP usa compresión (DEFLATE). REV lo abre en iOS 16.4+, pero STORE (sin compresión) es lo más compatible: usa zipfile.ZIP_STORED o `zip -0`.')
    names = [i.filename for i in z.infolist() if not i.filename.endswith('/')]
    if 'manifest.json' not in names:
        E('manifest.json debe estar en la raíz del ZIP (no dentro de una carpeta).')
    files = set(names)
    read = z.read

m = json.loads(read('manifest.json').decode('utf-8')) if 'manifest.json' in files else None
if m is None:
    print('\n'.join('ERROR: ' + e for e in errs)); sys.exit(1)
if m.get('format') != 'rev-project': E('"format" debe ser "rev-project".')
if m.get('version') != 1: E('"version" debe ser 1.')
meta = m.get('meta', {})
if (meta.get('width'), meta.get('height')) != (1080, 1920): W('Se recomienda 1080x1920 (vertical 9:16).')
sa = meta.get('safeArea') or {}
ids = set()
def uniq(i, where):
    if not i: E(f'Falta "id" en {where}')
    elif i in ids: E(f'ID repetido: {i}')
    ids.add(i)
assets = m.get('assets', {})
for k, a in assets.items():
    if a.get('type') not in TYPES: E(f'Recurso {k}: type inválido {a.get("type")}')
    if a.get('path') not in files: E(f'Recurso {k}: no existe el archivo {a.get("path")}')
    if a.get('type') == 'font' and not a.get('family'): E(f'Recurso {k}: las fuentes necesitan "family".')
used = set()
for si, s in enumerate(m.get('scenes', [])):
    uniq(s.get('id'), f'escena {si}')
    d = s.get('duration', 0)
    if not d or d <= 0: E(f'Escena {s.get("id")}: duration debe ser > 0')
    bg = s.get('background', {}).get('asset')
    if bg:
        used.add(bg)
        if bg not in assets: E(f'Escena {s.get("id")}: fondo con recurso inexistente {bg}')
    for e in s.get('elements', []):
        uniq(e.get('id'), f'elemento de {s.get("id")}')
        t = e.get('type')
        if t not in ELS: E(f'Elemento {e.get("id")}: type inválido {t}'); continue
        if t in ('image', 'video'):
            if e.get('asset') not in assets: E(f'Elemento {e.get("id")}: recurso inexistente {e.get("asset")}')
            else: used.add(e['asset'])
        if t == 'text' and e.get('font') and not any(a.get('family') == e['font'] for a in assets.values()) and e['font'] not in ('system-ui', 'Georgia', 'Helvetica Neue', 'Arial', 'Trebuchet MS', 'Verdana', 'Times New Roman', 'Courier New'):
            W(f'Elemento {e.get("id")}: la fuente "{e["font"]}" no está en assets ni es de sistema; se verá con otra.')
        for k in ('in', 'out'):
            a = e.get(k) or {}
            if a.get('type', 'none') not in ANIMS: E(f'Elemento {e.get("id")}: animación {k} inválida {a.get("type")}')
            if a.get('easing', 'easeOut') not in EASE: E(f'Elemento {e.get("id")}: easing inválido {a.get("easing")}')
        if (e.get('loop') or {}).get('type', 'none') not in LOOPS: E(f'Elemento {e.get("id")}: loop inválido')
        st, du = e.get('start', 0), e.get('duration', 0)
        if st < 0 or st >= d: E(f'Elemento {e.get("id")}: start fuera de la escena')
        elif du and st + du > d + 1e-6: W(f'Elemento {e.get("id")}: termina después de la escena ({st}+{du} > {d})')
        if sa and t in ('text', 'image', 'video', 'shape') and 'x' in e:
            w, h = e.get('width', 0), e.get('height', 0)
            if t != 'video' or w < 1080:
                if e['x'] - w / 2 < sa.get('left', 0) - 1 or e['x'] + w / 2 > 1080 - sa.get('right', 0) + 1 or e['y'] + h / 2 > 1920 - sa.get('bottom', 0) + 1:
                    W(f'Elemento {e.get("id")} ({e.get("name")}) sale del área segura (márgenes laterales o parte inferior). Ok solo si es fondo/decoración.')
    for a in s.get('audio', []):
        uniq(a.get('id'), 'audio de ' + s.get('id'))
        if a.get('asset') not in assets: E(f'Audio {a.get("id")}: recurso inexistente {a.get("asset")}')
        else: used.add(a['asset'])
for a in m.get('audio', []):
    uniq(a.get('id'), 'audio global')
    if a.get('asset') not in assets: E(f'Audio {a.get("id")}: recurso inexistente {a.get("asset")}')
    else: used.add(a['asset'])
for k in assets:
    if k not in used and assets[k].get('type') != 'font': W(f'Recurso sin usar (se conserva): {k}')
for e in errs: print('ERROR:', e)
for w in warns: print('AVISO:', w)
print(f'\n{len(errs)} error(es), {len(warns)} aviso(s). Escenas: {len(m.get("scenes", []))}, recursos: {len(assets)}')
sys.exit(1 if errs else 0)
