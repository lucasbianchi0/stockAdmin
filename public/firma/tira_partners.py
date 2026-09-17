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

Sale en los dos tonos que usa el pie de firma. El claro son los logos como
vienen, a color, sobre transparente. El oscuro los pasa a blanco por el canal
alfa —los doce son tinta sobre transparente, sin ningun calado en blanco, asi
que la silueta es exactamente el logo— y los apoya en el navy del bloque: sobre
un fondo oscuro, doce logos a color son doce colores peleando, y ademas la mitad
son azules o negros y desaparecen. El navy va pintado en la imagen y no queda
transparente, por lo mismo que las fichas de enlace: el alfa sobre un fondo de
tabla es lo que Outlook dibuja con halo.

   python3 tira_partners.py
"""
import math
import pathlib
from PIL import Image

LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
# La copia del admin es la que muestra la previa del brand kit: la misma imagen,
# servida por la propia app, para que lo que se ve no dependa de un deploy.
COPIA = pathlib.Path(__file__).resolve().parents[1] / 'logos'

ANCHO = 560        # el ancho util del bloque de marca de la firma (600 menos 20 de padding por lado)
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

NAVY = (16, 24, 39)   # el fondo del bloque oscuro
# Los logos en blanco puro sobre navy pesan mas que los de color sobre blanco y
# la tira se adelanta al wordmark. Bajarles un punto los deja donde estaban: al
# fondo, que es el lugar de una tira de partners.
OPACIDAD = 0.86

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


def _medida(im, ajuste, area=None, alto_max=None, ancho_max=None):
    """El tamano al que va ese logo: misma area que el resto, con los dos topes.

    Los tres topes se pueden pisar porque la banda del modelo homonimo usa otra
    grilla: con 4 columnas de 140 en vez de 6 de 93, los logos entran mucho mas
    grandes sin tocarse.
    """
    area = (AREA if area is None else area) * ajuste
    alto_max = ALTO_MAXIMO if alto_max is None else alto_max
    ancho_max = ANCHO_MAXIMO if ancho_max is None else ancho_max
    aspecto = im.width / im.height
    alto = math.sqrt(area / aspecto)
    ancho = area / alto
    if ancho > ancho_max:
        alto *= ancho_max / ancho
        ancho = ancho_max
    if alto > alto_max:
        ancho *= alto_max / alto
        alto = alto_max
    return max(1, round(ancho)), max(1, round(alto))


def nombre_archivo(cantidad=None, tono='claro', variante=''):
    """El nombre que pide la firma. Lo lee tambien src/lib/firma-correo.ts."""
    return 'accedra-firma-partners-%d%s%s-v%d.png' % (
        cantidad or len(PARTNERS), '-' + variante if variante else '',
        '' if tono == 'claro' else '-' + tono, REVISION)


def _entintado(im):
    """El logo en blanco: se le conserva la silueta y se le tira el color."""
    blanco = Image.new('RGBA', im.size, (255, 255, 255, 0))
    alfa = im.getchannel('A').point(lambda v: round(v * OPACIDAD))
    blanco.putalpha(alfa)
    return blanco


def escribir(items=None, ancho=ANCHO, tono='claro', por_fila=POR_FILA, aire=AIRE_FILAS,
             pad=0, variante='', area=None, alto_max=None, ancho_max=None):
    """Dibuja la tira y la deja en los dos repos. Devuelve nombre, ancho y alto.

    `pad` es el aire adentro del navy. En la tira de siempre va en cero porque el
    borde de la imagen es el borde del bloque blanco y el aire lo pone la tabla;
    en la banda el navy ES el contenedor, y sin pad los logos de las puntas
    quedan al ras del borde y se lee apretada.
    """
    items = items or PARTNERS
    piezas = []
    for archivo, _, ajuste in items:
        im = _recortado(archivo)
        piezas.append((im,) + _medida(im, ajuste, area, alto_max, ancho_max))
    filas = [piezas[i:i + por_fila] for i in range(0, len(piezas), por_fila)]
    alto_fila = max(h for fila in filas for _, _, h in fila)
    alto = len(filas) * alto_fila + (len(filas) - 1) * aire + pad * 2

    fondo = NAVY + (255,) if tono == 'oscuro' else (0, 0, 0, 0)
    lienzo = Image.new('RGBA', (ancho * 2, alto * 2), fondo)
    columna = (ancho - pad * 2) / por_fila
    for i, fila in enumerate(filas):
        for j, (im, w, h) in enumerate(fila):
            escalado = im.resize((w * 2, h * 2), Image.LANCZOS)
            if tono == 'oscuro':
                escalado = _entintado(escalado)
            x = pad + j * columna
            y = pad + i * (alto_fila + aire) + (alto_fila - h) // 2
            lienzo.alpha_composite(escalado, (round(x * 2), y * 2))

    nombre = nombre_archivo(len(items), tono, variante)
    # PNG8 con alfa: son logos planos, no fotos. Baja el peso a un tercio sin diferencia visible.
    lienzo.quantize(colors=200, method=Image.FASTOCTREE).save(LOGOS / nombre, optimize=True)
    COPIA.mkdir(exist_ok=True)
    (COPIA / nombre).write_bytes((LOGOS / nombre).read_bytes())
    print('%s  %dx%d' % (nombre, ancho, alto))
    return nombre, ancho, alto


if __name__ == '__main__':
    escribir()
    escribir(tono='oscuro')
    # La banda del modelo homonimo. Va a 4 por fila y no a 6 porque con columnas
    # de 93 los logos anchos —Nutanix, Check Point, CommScope— se tocan antes de
    # llegar a agrandarse: la columna es el techo, no el area. Con 4 columnas de
    # 140 entran a 30px de alto contra los 19 de la tira normal.
    #
    # Y va a 600 de ancho, no a 560, porque la banda es de borde a borde de la
    # firma: el navy es el contenedor, no algo apoyado adentro del bloque blanco.
    escribir(tono='oscuro', variante='banda', ancho=600, por_fila=4,
             area=1800, alto_max=30, ancho_max=120, aire=14, pad=20)
