#!/usr/bin/env python3
"""Genera el proyecto de prueba REV (examples/proyecto_prueba) y su ZIP.

Uso:  python3 tools/make_sample.py --photo "Foto .JPG" --voice voz_limpia.wav --logo "Logo normal .PNG"
Los personajes son PROVISIONALES (dibujados aquí) hasta que lleguen los de Juanita y María.
El ZIP se escribe SIN compresión (STORE): es lo más compatible con Safari/iPhone.
"""
import argparse, json, os, shutil, subprocess, zipfile
from PIL import Image, ImageDraw, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('--photo', required=True)
ap.add_argument('--voice', required=True)
ap.add_argument('--logo', required=True)
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'examples', 'proyecto_prueba'))
ap.add_argument('--fonts', default='/usr/share/fonts/truetype/google-fonts')
a = ap.parse_args()
OUT = os.path.abspath(a.out)
shutil.rmtree(OUT, ignore_errors=True)
for d in ('images', 'characters', 'products', 'audio', 'fonts'):
    os.makedirs(f'{OUT}/assets/{d}')

S = 2  # supersampling


def blobs(w, h, base, spots, path):
    im = Image.new('RGB', (w, h), base)
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, cy, r, col in spots:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(90))
    im.paste(layer, (0, 0), layer)
    im.save(path)


blobs(1080, 1920, (255, 240, 244), [(150, 300, 380, (247, 190, 212, 190)), (950, 1500, 470, (232, 160, 184, 150)), (700, 700, 300, (255, 255, 255, 170))], f'{OUT}/assets/images/fondo_rosa.png')
blobs(1080, 1920, (255, 246, 241), [(900, 250, 400, (250, 214, 190, 170)), (120, 1450, 460, (247, 190, 212, 150)), (500, 900, 320, (255, 255, 255, 190))], f'{OUT}/assets/images/fondo_crema.png')


def character(path, hair, dress, skin=(244, 204, 176), long_hair=True, accent=(194, 71, 110)):
    W, H = 800 * S, 1200 * S
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = W // 2
    if long_hair:
        d.rounded_rectangle([cx - 250 * S, 150 * S, cx + 250 * S, 760 * S], radius=230 * S, fill=hair)
    d.polygon([(cx - 170 * S, 640 * S), (cx + 170 * S, 640 * S), (cx + 290 * S, 1190 * S), (cx - 290 * S, 1190 * S)], fill=dress)
    d.rounded_rectangle([cx - 190 * S, 600 * S, cx + 190 * S, 900 * S], radius=110 * S, fill=dress)
    d.rounded_rectangle([cx - 60 * S, 500 * S, cx + 60 * S, 660 * S], radius=40 * S, fill=skin)
    d.rounded_rectangle([cx - 290 * S, 650 * S, cx - 175 * S, 1010 * S], radius=58 * S, fill=skin)
    d.rounded_rectangle([cx + 175 * S, 650 * S, cx + 290 * S, 1010 * S], radius=58 * S, fill=skin)
    d.ellipse([cx - 190 * S, 190 * S, cx + 190 * S, 640 * S], fill=skin)
    d.pieslice([cx - 215 * S, 150 * S, cx + 215 * S, 520 * S], 180, 360, fill=hair)
    d.polygon([(cx - 215 * S, 335 * S), (cx - 20 * S, 215 * S), (cx + 215 * S, 335 * S), (cx + 190 * S, 235 * S), (cx - 190 * S, 235 * S)], fill=hair)
    for sx in (-1, 1):
        ex = cx + sx * 85 * S
        d.ellipse([ex - 26 * S, 395 * S, ex + 26 * S, 465 * S], fill=(60, 30, 40))
        d.ellipse([ex - 9 * S, 405 * S, ex + 3 * S, 421 * S], fill=(255, 255, 255))
        d.arc([ex - 40 * S, 350 * S, ex + 40 * S, 400 * S], 200, 340, fill=hair, width=9 * S)
        d.ellipse([ex - 50 * S, 480 * S, ex + 50 * S, 535 * S], fill=(244, 160, 170, 140))
    d.arc([cx - 70 * S, 470 * S, cx + 70 * S, 580 * S], 20, 160, fill=accent, width=14 * S)
    d.ellipse([cx - 9 * S, 470 * S, cx + 9 * S, 488 * S], fill=(225, 170, 145))
    im = im.resize((800, 1200), Image.LANCZOS)
    im.save(path)


character(f'{OUT}/assets/characters/personaje_1.png', (74, 38, 42), (232, 160, 184))
character(f'{OUT}/assets/characters/personaje_2.png', (122, 74, 46), (194, 71, 110), skin=(236, 190, 160))

ph = Image.open(a.photo).convert('RGB').crop((1750, 190, 2075, 1135))
mask = Image.new('L', ph.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, ph.size[0] - 1, ph.size[1] - 1], radius=26, fill=255)
ph = ph.convert('RGBA'); ph.putalpha(mask)
ph.save(f'{OUT}/assets/products/primer_elf.png')
shutil.copy(a.logo, f'{OUT}/assets/images/logo_espirit_beauty.png')
for f, n in (('Poppins-Bold.ttf', 'Poppins-Bold.ttf'), ('ofl/cardo/Cardo-Bold.ttf', 'Cardo-Bold.ttf')):
    shutil.copy(f'{a.fonts}/{f}', f'{OUT}/assets/fonts/{n}')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '2.2', '-t', '9.6', '-i', a.voice, '-ac', '1', '-c:a', 'aac', '-b:a', '96k', f'{OUT}/assets/audio/narracion_prueba.m4a'], check=True)


def el(id, type, name, x, y, w, h, **kw):
    d = dict(id=id, type=type, name=name, x=x, y=y, width=w, height=h, rotation=0, opacity=1, start=0, duration=0, visible=True, locked=False)
    d.update(kw)
    return d


def anim(t, dur=0.6, ease='easeOut'):
    return dict(type=t, duration=dur, easing=ease)


manifest = {
    'format': 'rev-project', 'version': 1,
    'meta': {'name': 'Proyecto de prueba REV', 'width': 1080, 'height': 1920, 'fps': 30, 'background': '#fff6f1',
             'safeArea': {'left': 90, 'right': 90, 'top': 120, 'bottom': 450}, 'createdBy': 'Claude'},
    'assets': {
        'bg_rosa': {'type': 'image', 'path': 'assets/images/fondo_rosa.png', 'name': 'Fondo rosa'},
        'bg_crema': {'type': 'image', 'path': 'assets/images/fondo_crema.png', 'name': 'Fondo crema'},
        'logo': {'type': 'image', 'path': 'assets/images/logo_espirit_beauty.png', 'name': 'Logo Espirit Beauty'},
        'personaje_1': {'type': 'image', 'path': 'assets/characters/personaje_1.png', 'name': 'Personaje 1 (provisional)'},
        'personaje_2': {'type': 'image', 'path': 'assets/characters/personaje_2.png', 'name': 'Personaje 2 (provisional)'},
        'primer': {'type': 'image', 'path': 'assets/products/primer_elf.png', 'name': 'Primer e.l.f.'},
        'voz': {'type': 'audio', 'path': 'assets/audio/narracion_prueba.m4a', 'name': 'Narración de prueba'},
        'poppins': {'type': 'font', 'path': 'assets/fonts/Poppins-Bold.ttf', 'family': 'Poppins', 'name': 'Poppins Bold'},
        'cardo': {'type': 'font', 'path': 'assets/fonts/Cardo-Bold.ttf', 'family': 'Cardo', 'name': 'Cardo Bold'},
    },
    'scenes': [
        {'id': 'scene_1', 'name': 'Pregunta', 'duration': 5,
         'background': {'color': '#fff0f4', 'asset': 'bg_rosa', 'fit': 'cover'},
         'elements': [
             el('s1_logo', 'image', 'Logo', 540, 215, 190, 190, asset='logo', fit='contain', **{'in': anim('fade')}),
             el('s1_chispas', 'effect', 'Destellos', 540, 900, 820, 900, effect='sparkles', color='#ffffff', count=16, size=34, speed=1, seed=7, start=0.6),
             el('s1_personaje', 'image', 'Personaje 1', 540, 1010, 560, 840, asset='personaje_1', fit='contain', start=0.3, **{'in': anim('slide-up', 0.7), 'loop': {'type': 'float', 'amount': 1, 'speed': 1}}),
             el('s1_texto', 'text', 'Pregunta', 540, 470, 800, 240, text='¿Por qué sus envíos tardan tanto?', font='Cardo', fontSize=84, fontWeight=700, color='#5a1f33', align='center', lineHeight=1.1, stroke={'color': '#ffffff', 'width': 0}, shadow=False, start=0.8, **{'in': anim('pop', 0.6, 'back')}),
         ],
         'audio': [{'id': 'a1', 'asset': 'voz', 'start': 0.3, 'volume': 1, 'trimStart': 0, 'label': 'Narración de prueba'}]},
        {'id': 'scene_2', 'name': 'Respuesta', 'duration': 5,
         'background': {'color': '#fff6f1', 'asset': 'bg_crema', 'fit': 'cover'},
         'elements': [
             el('s2_personaje', 'image', 'Personaje 2', 400, 1000, 540, 810, asset='personaje_2', fit='contain', **{'in': anim('slide-right', 0.7), 'loop': {'type': 'sway', 'amount': 0.6, 'speed': 1}}),
             el('s2_producto', 'image', 'Producto', 770, 980, 250, 650, asset='primer', fit='contain', start=0.5, **{'in': anim('zoom', 0.6), 'loop': {'type': 'pulse', 'amount': 1, 'speed': 1}}),
             el('s2_chispas', 'effect', 'Destellos', 770, 980, 420, 700, effect='sparkles', color='#e8a0b8', count=12, size=40, speed=1.3, seed=21, start=0.9),
             el('s2_pildora', 'shape', 'Pastilla', 540, 380, 760, 150, shape='rounded', fill='#c24770', radius=75, stroke={'color': '#ffffff', 'width': 0}, start=0.2, **{'in': anim('slide-down', 0.6)}),
             el('s2_titulo', 'text', 'Título', 540, 380, 700, 120, text='Producto original', font='Poppins', fontSize=64, fontWeight=700, color='#ffffff', align='center', lineHeight=1.1, stroke={'color': '#ffffff', 'width': 0}, shadow=False, start=0.4, **{'in': anim('fade', 0.5)}),
             el('s2_nota', 'text', 'Nota', 540, 560, 800, 130, text='Importado de Estados Unidos · aprox. 2 semanas', font='Poppins', fontSize=44, fontWeight=700, color='#5a1f33', align='center', lineHeight=1.2, stroke={'color': '#ffffff', 'width': 0}, shadow=False, start=1.1, **{'in': anim('fade', 0.5)}),
         ],
         'audio': []},
    ],
    'audio': [],
}
with open(f'{OUT}/manifest.json', 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

zp = os.path.abspath(f'{OUT}/../proyecto_prueba.zip')
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_STORED) as z:
    z.write(f'{OUT}/manifest.json', 'manifest.json')
    for root, _, fs in os.walk(f'{OUT}/assets'):
        for fn in sorted(fs):
            full = os.path.join(root, fn)
            z.write(full, os.path.relpath(full, OUT))
print('ok', zp, os.path.getsize(zp))
