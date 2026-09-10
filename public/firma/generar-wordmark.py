# -*- coding: utf-8 -*-
"""Rasteriza el wordmark desde el SVG con Chrome headless (no hay cairo/rsvg en esta maquina).

Salen los dos tonos que usa el pie de firma: el navy del bloque claro y el blanco
del bloque oscuro. El blanco es el SVG tal cual viene —trazo blanco y el acento
azul intacto—, que es como se ve en el header y el footer del sitio; el navy es
ese mismo archivo con el trazo pintado, para que sobre blanco no desaparezca.

Sale a 560x84 = 2x del maximo que usamos (280px), asi sirve nitido para cualquier
tamano menor.
   python3 generar-wordmark.py
"""
import pathlib, re, subprocess, tempfile
from PIL import Image

LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
# La copia del admin es la que muestra la previa del brand kit: la misma imagen,
# servida por la propia app, para que lo que se ve no dependa de un deploy.
COPIA = pathlib.Path(__file__).resolve().parents[1] / 'logos'
SVG = LOGOS / 'accedra-wordmark.svg'
NAVY = '#0D1F3A'
ANCHO, ALTO = 560, 84
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

TONOS = {
    'accedra-firma-email.png': NAVY,      # sobre el bloque blanco
    'accedra-firma-email-blanco.png': None,  # sobre el bloque navy: el SVG como viene
}

base = SVG.read_text()
for nombre, tinta in TONOS.items():
    svg = base.replace('fill="#ffffff"', 'fill="%s"' % tinta) if tinta else base
    svg = re.sub(r'width="\d+" height="\d+"', 'width="%d" height="%d"' % (ANCHO, ALTO), svg, count=1)
    salida = LOGOS / nombre
    with tempfile.TemporaryDirectory() as tmp:
        html = pathlib.Path(tmp) / 'w.html'
        html.write_text('<style>html,body{margin:0;padding:0;background:transparent}</style>' + svg)
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                        '--default-background-color=00000000',
                        '--window-size=%d,%d' % (ANCHO, ALTO),
                        '--screenshot=%s' % salida, html.as_uri()],
                       check=True, capture_output=True)
    COPIA.mkdir(exist_ok=True)
    (COPIA / nombre).write_bytes(salida.read_bytes())
    im = Image.open(salida)
    print(nombre, im.size, im.mode, '%.1f KB' % (salida.stat().st_size / 1024))
