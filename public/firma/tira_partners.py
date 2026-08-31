# -*- coding: utf-8 -*-
"""La tira de partners del pie de firma: una sola imagen con los doce logos.

Cada logo suelto es un pedido que Gmail ademas proxea la primera vez: doce
hacian que la firma se dibujara de a pedazos.

Los logos no van en columnas fijas. Miden entre 26 y 59 px de ancho, asi que una
grilla regular deja a Cisco pegado al borde y un agujero al lado de APC. Se
reparten con el mismo aire entre uno y otro, que es lo que el ojo lee como
alineado, y cada fila se centra sobre el ancho util.

   python3 -c "import tira_partners; tira_partners.escribir()"
"""
import pathlib
from PIL import Image

LOGOS = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')

ESCALA = 1.4       # los originales son de 250px de ancho: aguantan crecer sin empastarse
ANCHO = 560        # el ancho util del bloque blanco de la firma (600 menos 20 de padding por lado)
POR_FILA = 6
AIRE_FILAS = 18    # aire entre las dos filas

# archivo, alt, ancho y alto a los que se ve cada logo (antes de ESCALA)
PARTNERS = [
    ('cisco-logo-blue-2016.png', 'Cisco', 25, 13),
    ('microsoft-logo-2012.png', 'Microsoft', 58, 13),
    ('palo-alto-networks-logo.png', 'Palo Alto Networks', 38, 13),
    ('hpe-aruba-networking-logo.png', 'HPE Aruba Networking', 57, 13),
    ('nutanix-logo-charcoal-gray-digital.png', 'Nutanix', 58, 7),
    ('check-point-logo-horizontal.png', 'Check Point', 59, 13),
    ('apc-by-schneider-electric.png', 'APC by Schneider Electric', 26, 13),
    ('dahua-technology-logo.png', 'Dahua Technology', 42, 13),
    ('hikvision-logo.png', 'Hikvision', 58, 8),
    ('commscope-logo.png', 'CommScope', 58, 8),
    ('pure-storage-vector-logo.png', 'Pure Storage', 58, 10),
    ('wacom-logo-svg.png', 'Wacom', 58, 10),
]


def _filas():
    """Los logos ya escalados, agrupados de a POR_FILA."""
    items = [(a, max(1, round(w * ESCALA)), max(1, round(h * ESCALA))) for a, _, w, h in PARTNERS]
    return [items[i:i + POR_FILA] for i in range(0, len(items), POR_FILA)]


def escribir():
    filas = _filas()
    alto_fila = max(h for fila in filas for _, _, h in fila)
    alto = len(filas) * alto_fila + (len(filas) - 1) * AIRE_FILAS
    lienzo = Image.new('RGBA', (ANCHO * 2, alto * 2), (0, 0, 0, 0))

    for i, fila in enumerate(filas):
        usado = sum(w for _, w, _ in fila)
        aire = (ANCHO - usado) / (len(fila) - 1) if len(fila) > 1 else 0
        x = 0.0
        y_fila = i * (alto_fila + AIRE_FILAS)
        for archivo, w, h in fila:
            origen = Image.open(LOGOS / archivo).convert('RGBA').resize((w * 2, h * 2), Image.LANCZOS)
            y = y_fila + (alto_fila - h) // 2
            lienzo.alpha_composite(origen, (round(x * 2), y * 2))
            x += w + aire

    salida = LOGOS / ('accedra-firma-partners-%d.png' % len(PARTNERS))
    # PNG8 con alfa: son logos planos, no fotos. Baja el peso a un tercio sin diferencia visible.
    lienzo.quantize(colors=200, method=Image.FASTOCTREE).save(salida, optimize=True)
    print('%s  %dx%d' % (salida.name, ANCHO, alto))
    return ANCHO, alto


if __name__ == '__main__':
    escribir()
