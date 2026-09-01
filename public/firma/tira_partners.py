# -*- coding: utf-8 -*-
"""La tira de partners del pie de firma: una sola imagen con los doce logos.

Cada logo suelto es un pedido que Gmail ademas proxea la primera vez: doce
hacian que la firma se dibujara de a pedazos.

Dos decisiones sostienen la tira:

1. Los logos se igualan por AREA DE TINTA, no por alto ni por ancho. Cisco es
   casi cuadrado y Nutanix es una tira de 8:1; a igual altura, Nutanix ocupa el
   doble de superficie y Cisco parece un error. Dandoles la misma area, cada uno
   pesa lo mismo aunque midan distinto, que es lo que el ojo lee como parejo.

2. Antes de medirlos se les recorta el margen transparente. Varios vienen con
   aire de fabrica —APC trae 16%— y ese aire, sin recortar, entra en la cuenta:
   el logo termina mas chico que los demas y ademas corrido dentro de su columna.

Van en seis columnas iguales, cada uno al ras del borde izquierdo de la suya,
que es donde arrancan el wordmark y todas las lineas de datos de la firma.

   python3 tira_partners.py
"""
import math
import pathlib
from PIL import Image

LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
# La copia del admin es la que muestra la previa del brand kit: la misma imagen,
# servida por la propia app, para que lo que se ve no dependa de un deploy.
COPIA = pathlib.Path(__file__).resolve().parents[1] / 'logos'

ANCHO = 560        # el ancho util del bloque blanco de la firma (600 menos 20 de padding por lado)
POR_FILA = 6
AIRE_FILAS = 18    # aire entre las dos filas

AREA = 780         # px² de tinta por logo: el que fija el tamano de todos
ALTO_MAXIMO = 20   # ningun logo mas alto que esto, o la tira crece de mas
ANCHO_MAXIMO = 76  # ni mas ancho: la columna mide 93 y el resto es el aire con el siguiente

# El numero de version va en el nombre del archivo. Una imagen de firma se cachea
# en tres lados a la vez —el navegador, el CDN y el proxy de Gmail, que se queda
# con la copia por meses— y de esos tres solo se controla uno. Cambiar el nombre
# es la unica manera de que todos vean el dibujo nuevo el mismo dia; el anterior
# se deja publicado, porque las firmas ya pegadas lo siguen pidiendo.
REVISION = 3

# archivo, alt, y el ajuste optico: cuanto se aparta ese logo del area comun.
# Un trazo muy fino pesa menos que uno macizo aunque cubra la misma superficie,
# y al reves. Es el unico numero que se toca a ojo.
PARTNERS = [
    ('cisco-logo-blue-2016.png', 'Cisco', 0.92),
    ('microsoft-logo-2012.png', 'Microsoft', 1.0),
    ('palo-alto-networks-logo.png', 'Palo Alto Networks', 1.0),
    ('hpe-aruba-networking-logo.png', 'HPE Aruba Networking', 1.0),
    ('nutanix-logo-charcoal-gray-digital.png', 'Nutanix', 1.05),
    ('check-point-logo-horizontal.png', 'Check Point', 1.0),
    ('apc-by-schneider-electric.png', 'APC by Schneider Electric', 0.92),
    ('dahua-technology-logo.png', 'Dahua Technology', 1.0),
    ('hikvision-logo.png', 'Hikvision', 1.05),
    ('commscope-logo.png', 'CommScope', 1.05),
    ('pure-storage-vector-logo.png', 'Pure Storage', 1.0),
    ('wacom-logo-svg.png', 'Wacom', 1.0),
]


def _recortado(archivo):
    """El logo sin el margen transparente que trae de fabrica."""
    im = Image.open(LOGOS / archivo).convert('RGBA')
    caja = im.getchannel('A').getbbox()
    return im.crop(caja) if caja else im


def _medida(im, ajuste):
    """El tamano al que va ese logo: misma area que el resto, con los dos topes."""
    aspecto = im.width / im.height
    area = AREA * ajuste
    alto = math.sqrt(area / aspecto)
    ancho = area / alto
    if ancho > ANCHO_MAXIMO:
        alto *= ANCHO_MAXIMO / ancho
        ancho = ANCHO_MAXIMO
    if alto > ALTO_MAXIMO:
        ancho *= ALTO_MAXIMO / alto
        alto = ALTO_MAXIMO
    return max(1, round(ancho)), max(1, round(alto))


def nombre_archivo(cantidad=None):
    """El nombre que pide la firma. Lo lee tambien src/lib/firma-correo.ts."""
    return 'accedra-firma-partners-%d-v%d.png' % (cantidad or len(PARTNERS), REVISION)


def escribir(items=None, ancho=ANCHO):
    items = items or PARTNERS
    piezas = [(_recortado(a),) + (lambda im: _medida(im, j))(_recortado(a)) for a, _, j in items]
    filas = [piezas[i:i + POR_FILA] for i in range(0, len(piezas), POR_FILA)]
    alto_fila = max(h for fila in filas for _, _, h in fila)
    alto = len(filas) * alto_fila + (len(filas) - 1) * AIRE_FILAS

    lienzo = Image.new('RGBA', (ancho * 2, alto * 2), (0, 0, 0, 0))
    columna = ancho / POR_FILA
    for i, fila in enumerate(filas):
        for j, (im, w, h) in enumerate(fila):
            escalado = im.resize((w * 2, h * 2), Image.LANCZOS)
            x = j * columna
            y = i * (alto_fila + AIRE_FILAS) + (alto_fila - h) // 2
            lienzo.alpha_composite(escalado, (round(x * 2), y * 2))

    nombre = nombre_archivo(len(items))
    # PNG8 con alfa: son logos planos, no fotos. Baja el peso a un tercio sin diferencia visible.
    lienzo.quantize(colors=200, method=Image.FASTOCTREE).save(LOGOS / nombre, optimize=True)
    COPIA.mkdir(exist_ok=True)
    (COPIA / nombre).write_bytes((LOGOS / nombre).read_bytes())
    print('%s  %dx%d' % (nombre, ancho, alto))
    return nombre, ancho, alto


if __name__ == '__main__':
    escribir()
