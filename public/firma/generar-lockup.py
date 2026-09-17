# -*- coding: utf-8 -*-
"""Hornea el lockup de la firma —wordmark + IT SOLUTIONS— en un solo PNG por tono.

Por que existe este script y no alcanzaba `generar-wordmark.py`:

"IT SOLUTIONS" era la unica linea de texto que quedaba en la columna de marca, y
el texto de un mail lo dibuja el cliente, no nosotros. Gmail en Android, Outlook
en Windows y Apple Mail resuelven la pila 'Segoe UI'/Roboto/Helvetica/Arial cada
uno con una fuente distinta, y el `letter-spacing` de una linea en versalitas es
justo donde esa diferencia se nota: la bajada terminaba mas ancha o mas angosta
que el wordmark que tiene arriba, que es lo unico que no puede pasar en un
lockup. Horneada, se ve igual en todos lados y ademas sale en Inter, la
tipografia de la marca, que ningun cliente de correo tiene.

Los tres iconos de enlace NO entran aca a proposito: van a tres destinos
distintos y adentro de un PNG perderian el link.

Sale a 2x del maximo que usa la firma (280px de ancho), asi sirve nitido tambien
para la variante completa, que lo dibuja a 200.
   python3 generar-lockup.py
"""
import base64, pathlib, re, subprocess, tempfile
from PIL import Image

AQUI = pathlib.Path(__file__).parent
LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
# La copia del admin es la que muestra la previa del brand kit: la misma imagen,
# servida por la propia app, para que lo que se ve no dependa de un deploy.
COPIA = AQUI.parent / 'logos'
SVG = LOGOS / 'accedra-wordmark.svg'
FUENTE = AQUI.parents[1] / 'public' / 'fuentes' / 'Inter-SemiBold.ttf'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# --- geometria, la misma que calcula `marca()` en src/lib/firma-correo.ts -----
ANCHO = 280                      # el maximo al que la firma dibuja el lockup
ALTO_WORDMARK = round(ANCHO * 0.15)   # el SVG es 1068x160
FUENTE_PX = ANCHO // 20          # 14: la bajada se mide desde el ancho del logo
INTERLINEA = FUENTE_PX + 3
ESPACIADO = FUENTE_PX / 4
AIRE = round(FUENTE_PX * 0.7)
ALTO = ALTO_WORDMARK + AIRE + INTERLINEA
ESCALA = 2

NAVY = '#0D1F3A'

# --- el halo -----------------------------------------------------------------
# Un logo navy sobre transparente desaparece cuando el cliente oscurece el fondo:
# las imagenes no se invierten, asi que el fondo se va a negro y el trazo se
# queda navy. Es el problema que documenta Email on Acid ("si es negro, tiene
# elementos negros, o contiene otro color oscuro —como navy, por ejemplo— va a
# ser ilegible"), y la solucion que recomiendan es un contorno claro: invisible
# sobre fondo claro, y lo unico que lo salva sobre fondo oscuro. Una caja solida
# detras no sirve: queda un rectangulo blanco feo sobre el fondo oscuro.
#
# Tiene que ser el MISMO off-white que `BLANCO` en src/lib/firma-correo.ts.
HALO = '#FDFDFD'
# En unidades del viewBox, que mide 1068 de ancho y se dibuja a 560: la mitad del
# trazo queda tapada por el relleno, asi que 6 deja ~1.6px de halo visible.
#
# El numero se eligio comparando 0, 4, 6, 10 y 16 sobre fondo oscuro. Sin halo el
# wordmark desaparece; de 10 para arriba deja de leerse como la marca y pasa a
# leerse como una version contorneada, porque el trazo del logo es fino y el halo
# pesa proporcionalmente muchisimo. 6 es lo minimo que rescata la legibilidad sin
# cambiarle el caracter al logo.
HALO_ANCHO = 6

TONOS = {
    # nombre                          tinta del wordmark   color de la bajada
    'accedra-firma-lockup.png':        (NAVY,               '#2B56D4'),
    # El de fondo oscuro ya viene claro: no necesita halo y no lleva.
    'accedra-firma-lockup-blanco.png': (None,               '#60A5FA'),
}

PAGINA = '''<!doctype html><meta charset="utf-8">
<style>
 @font-face {{ font-family:'Inter'; src:url(data:font/ttf;base64,{fuente}) format('truetype');
              font-weight:600; font-style:normal; }}
 html,body {{ margin:0; padding:0; background:transparent; }}
 .caja {{ width:{ancho}px; height:{alto}px; }}
 .marca svg {{ display:block; width:{ancho}px; height:{alto_wm}px; }}
 .bajada {{ margin-top:{aire}px; font-family:'Inter'; font-weight:600;
            font-size:{fuente_px}px; line-height:{interlinea}px;
            letter-spacing:{espaciado}px; text-transform:uppercase;
            color:{color}; white-space:nowrap; }}
</style>
<div class="caja"><div class="marca">{svg}</div><div class="bajada">IT Solutions</div></div>
'''

# El 2x se hace dibujando todo al doble, no con --force-device-scale-factor: esa
# bandera no es confiable en headless y `generar-wordmark.py` ya habia elegido
# este camino. Multiplicar CSS es ademas mas nitido para el texto que reescalar.
def x2(v):
    return v * ESCALA

base = SVG.read_text()
fuente_b64 = base64.b64encode(FUENTE.read_bytes()).decode()

for nombre, (tinta, color) in TONOS.items():
    svg = base.replace('fill="#ffffff"', 'fill="%s"' % tinta) if tinta else base
    # que el SVG se deje escalar por CSS: sin width/height propios manda el viewBox
    svg = re.sub(r'\s(width|height)="[\d.]+"', '', svg, count=2)
    if tinta:
        # Los atributos de trazo se heredan, asi que puestos en la raiz alcanzan a
        # los dos paths. `paint-order="stroke"` los dibuja DETRAS del relleno: sin
        # eso el contorno se come las letras desde el borde hacia adentro.
        svg = svg.replace(
            '<svg ',
            '<svg stroke="%s" stroke-width="%d" paint-order="stroke" stroke-linejoin="round" '
            % (HALO, HALO_ANCHO),
            1)

    html = PAGINA.format(fuente=fuente_b64, svg=svg, ancho=x2(ANCHO), alto=x2(ALTO),
                         alto_wm=x2(ALTO_WORDMARK), aire=x2(AIRE), fuente_px=x2(FUENTE_PX),
                         interlinea=x2(INTERLINEA), espaciado=x2(ESPACIADO), color=color)

    salida = LOGOS / nombre
    with tempfile.TemporaryDirectory() as tmp:
        pagina = pathlib.Path(tmp) / 'lockup.html'
        pagina.write_text(html, encoding='utf-8')
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                        '--default-background-color=00000000',
                        '--window-size=%d,%d' % (x2(ANCHO), x2(ALTO)),
                        '--screenshot=%s' % salida, pagina.as_uri()],
                       check=True, capture_output=True)
    COPIA.mkdir(exist_ok=True)
    (COPIA / nombre).write_bytes(salida.read_bytes())
    im = Image.open(salida)
    print(nombre, im.size, im.mode, '%.1f KB' % (salida.stat().st_size / 1024))

print('geometria 1x: %dx%d  (wordmark %d + aire %d + bajada %d)'
      % (ANCHO, ALTO, ALTO_WORDMARK, AIRE, INTERLINEA))
print('ratio alto/ancho para firma-correo.ts: %.6f' % (ALTO / ANCHO))
