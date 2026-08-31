# -*- coding: utf-8 -*-
"""Rasteriza el wordmark desde el SVG con Chrome headless (no hay cairo/rsvg en esta maquina).
   Sale a 560x84 = 2x del maximo que usamos (280px), asi sirve nitido para cualquier tamano menor."""
import pathlib, re, subprocess, tempfile

LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
SVG = LOGOS / 'accedra-wordmark.svg'
SALIDA = LOGOS / 'accedra-firma-email.png'
NAVY = '#0D1F3A'
ANCHO, ALTO = 560, 84
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

svg = SVG.read_text()
svg = svg.replace('fill="#ffffff"', 'fill="%s"' % NAVY)           # el trazo va navy en el mail
svg = re.sub(r'width="\d+" height="\d+"', 'width="%d" height="%d"' % (ANCHO, ALTO), svg, count=1)

with tempfile.TemporaryDirectory() as tmp:
    html = pathlib.Path(tmp) / 'w.html'
    html.write_text('<style>html,body{margin:0;padding:0;background:transparent}</style>' + svg)
    subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                    '--default-background-color=00000000',
                    '--window-size=%d,%d' % (ANCHO, ALTO),
                    '--screenshot=%s' % SALIDA, html.as_uri()],
                   check=True, capture_output=True)

from PIL import Image
im = Image.open(SALIDA)
print(SALIDA.name, im.size, im.mode, '%.1f KB' % (SALIDA.stat().st_size / 1024))
