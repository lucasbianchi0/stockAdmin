# -*- coding: utf-8 -*-
"""Las versiones CON PLACA del logotipo, el lockup y el isotipo.

El apilado ya tenía las suyas —son las de foto de perfil— y el resto del kit no,
así que sobre una foto o un fondo de color había que resolverlo a mano cada vez.

No redibuja nada: toma el cuerpo de los SVG que ya están en el kit, lo recolorea
en blanco y lo apoya sobre un rectángulo del color de la placa. Si mañana se
corrige un path del logotipo, alcanza con volver a correr esto.

POR QUÉ LA PLACA DEL APILADO ES CUADRADA Y ESTAS NO

La del apilado existe para ser foto de perfil, y una foto de perfil es cuadrada.
Estas son para apoyar la marca sobre una foto o un fondo saturado, así que
siguen la forma de lo que envuelven: el logotipo y el lockup son horizontales, y
solo el isotipo sale cuadrado —que es además el que sirve de favicon y de sello—.

EL AIRE SE MIDE CONTRA LA TINTA, NO CONTRA EL VIEWBOX

Los SVG del kit traen aire propio adentro de su viewBox y no el mismo en todos.
Midiendo contra el viewBox, la placa del logotipo saldría más apretada que la
del lockup sin que nadie lo haya decidido. Se mide contra la caja de tinta real,
que está anotada abajo, y así las tres respiran igual.

   python3 generar-placas-svg.py
"""
from __future__ import annotations

import pathlib
import re

AQUI = pathlib.Path(__file__).parent

BLANCO = "#ffffff"
ACENTO = "#2b56d4"  # el que traen los SVG del logo; ver la nota en `brand-kit.ts`
NAVY_FONDO = "#0A1424"
AZUL_MARCA = "#2B6FD4"

# El aire de la placa, en proporción del alto de la tinta. Sale del mismo criterio
# que `MARGEN_PLACA` del apilado: suficiente para que la marca no toque el borde,
# poco para que la placa no se coma la pieza donde se apoya.
AIRE = 0.55

# archivo base -> (viewBox ancho, alto, caja de tinta: x0, y0, x1, y1)
#
# LAS CAJAS ESTÁN MEDIDAS, NO ESTIMADAS. Se sacaron rasterizando cada SVG con
# fondo transparente y pidiendo el bounding box del canal alfa.
#
# Importa: el lockup ocupa hasta y=238 dentro de un viewBox de 263.47, o sea que
# arrastra 25 de aire abajo que no es dibujo. La primera versión de este script
# lo dio por 263.47 y la placa salía con el bloque pegado arriba — se ve al toque
# cuando se la mira, y es la razón por la que estos cuatro números no se estiman.
FUENTES = {
    "logo": ("accedra-logo-navy.svg", 1073.0, 160.0, 5.0, 8.5, 1068.0, 145.0),
    "lockup": ("accedra-lockup-navy.svg", 1073.0, 263.47, 3.5, 8.5, 1068.0, 238.0),
    "isotipo": ("accedra-isotipo-navy.svg", 185.52, 185.52, 34.5, 26.0, 151.0, 159.5),
}

# salida -> (base, color de la figura, color del acento, color de la placa)
VARIANTES = {
    "accedra-logo-placa-navy.svg": ("logo", BLANCO, ACENTO, NAVY_FONDO),
    "accedra-logo-placa-azul.svg": ("logo", BLANCO, BLANCO, AZUL_MARCA),
    "accedra-lockup-placa-navy.svg": ("lockup", BLANCO, ACENTO, NAVY_FONDO),
    "accedra-lockup-placa-azul.svg": ("lockup", BLANCO, BLANCO, AZUL_MARCA),
    "accedra-isotipo-placa-navy.svg": ("isotipo", BLANCO, ACENTO, NAVY_FONDO),
    "accedra-isotipo-placa-azul.svg": ("isotipo", BLANCO, BLANCO, AZUL_MARCA),
}


def cuerpo(svg: str) -> str:
    adentro = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    return re.sub(r"</svg>\s*$", "", adentro).strip()


def recolorear(cuerpo_svg: str, principal: str, acento: str) -> str:
    """Cada SVG del kit trae sus paths con la figura primero y el acento después."""
    colores = [principal, acento]
    i = [0]

    def siguiente(_):
        c = colores[min(i[0], len(colores) - 1)]
        i[0] += 1
        return 'fill="%s"' % c

    return re.sub(r'fill="[^"]*"', siguiente, cuerpo_svg)


def armar(base: str, principal: str, acento: str, placa: str) -> tuple[str, float, float]:
    archivo, vb_ancho, vb_alto, x0, y0, x1, y1 = FUENTES[base]
    figura = recolorear(cuerpo((AQUI / archivo).read_text()), principal, acento)

    tinta_ancho, tinta_alto = x1 - x0, y1 - y0
    aire = tinta_alto * AIRE

    if base == "isotipo":
        # Cuadrada: es el favicon y el sello, y los dos se recortan a cuadrado.
        lado = max(tinta_ancho, tinta_alto) + aire * 2
        ancho = alto = lado
    else:
        ancho = tinta_ancho + aire * 2
        alto = tinta_alto + aire * 2

    # La figura se corre para que su TINTA quede centrada en la placa.
    dx = (ancho - tinta_ancho) / 2 - x0
    dy = (alto - tinta_alto) / 2 - y0

    contenido = (
        '<rect width="%.2f" height="%.2f" fill="%s"/>\n'
        '<g transform="translate(%.3f %.3f)">%s</g>' % (ancho, alto, placa, dx, dy, figura)
    )
    return contenido, ancho, alto


def main() -> None:
    for salida, (base, principal, acento, placa) in VARIANTES.items():
        contenido, ancho, alto = armar(base, principal, acento, placa)
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.2f %.2f" width="%d" height="%d">\n'
            % (ancho, alto, round(ancho), round(alto))
            + contenido
            + "\n</svg>\n"
        )
        (AQUI / salida).write_text(svg)
        print("%-36s %.0f×%.0f  ratio %.6f" % (salida, ancho, alto, ancho / alto))


if __name__ == "__main__":
    main()
