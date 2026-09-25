# -*- coding: utf-8 -*-
"""Arma el logo apilado —isotipo arriba, logotipo abajo— como SVG, para el brand kit.

Es la versión para formatos cuadrados o verticales, donde el logotipo horizontal
queda chico: avatar de redes, portada de propuesta, stand, merchandising.

No redibuja nada: toma el cuerpo de los SVG que ya están en el kit (isotipo y
logotipo) y los acomoda con un transform. Así, si mañana se corrige un path del
logotipo, alcanza con volver a correr este script.

La "A" del isotipo es el mismo glifo que la "A" del logotipo (116.7 de ancho y
~134 de alto en los dos), así que la proporción entre ambos se fija contra la
altura de mayúscula del logotipo y el isotipo sale con el mismo dibujo, más grande.

Variantes: las cuatro de siempre (navy, blanco, mono navy, mono blanco) con fondo
transparente, y dos con placa cuadrada de color, que son las que se suben como
foto de perfil.

   python3 generar-apilado-svg.py
"""
from __future__ import annotations

import pathlib
import re

AQUI = pathlib.Path(__file__).parent

NAVY = "#0d1f3a"
BLANCO = "#ffffff"
ACENTO = "#2b56d4"  # el que traen los SVG del logo; ver la nota en `brand-kit.ts`
NAVY_FONDO = "#0A1424"
AZUL_MARCA = "#2B6FD4"

# --- geometria ---------------------------------------------------------------
LOGO_ANCHO, LOGO_ALTO = 1073.0, 160.0
CAP_LOGO = 141.949 - 8.425  # la "A" del logotipo, de la punta al pie

# Caja real de la figura dentro del viewBox del isotipo (185.52 de lado).
ISO_X0, ISO_X1 = 34.431, 151.094
ISO_Y0, ISO_Y1 = 26.000, 159.524

ISO_ALTO = CAP_LOGO * 1.75  # el isotipo pesa lo justo para mandar sin tapar el nombre
AIRE = CAP_LOGO * 0.75      # entre el pie del isotipo y la punta de las mayúsculas
MARGEN_PLACA = 0.15         # aire de la placa, en proporción de su lado


def cuerpo(svg: str) -> str:
    adentro = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    return re.sub(r"</svg>\s*$", "", adentro).strip()


def recolorear(cuerpo_svg: str, principal: str, acento: str) -> str:
    """Cada SVG del kit trae dos paths: la figura y el acento, en ese orden."""
    colores = iter([principal, acento])
    return re.sub(r'fill="[^"]*"', lambda _: 'fill="%s"' % next(colores), cuerpo_svg)


def armar(principal: str, acento: str, placa: str | None) -> tuple[str, float, float]:
    iso = cuerpo((AQUI / "accedra-isotipo-navy.svg").read_text())
    logo = cuerpo((AQUI / "accedra-logo-navy.svg").read_text())

    escala_iso = ISO_ALTO / (ISO_Y1 - ISO_Y0)
    iso_ancho = (ISO_X1 - ISO_X0) * escala_iso
    # El logotipo empieza en y = 8.425 dentro de su viewBox: ese aire se descuenta
    # para que el espacio entre las dos piezas sea el que dice AIRE.
    logo_y = ISO_ALTO + AIRE - 8.425
    ancho = LOGO_ANCHO
    alto = logo_y + LOGO_ALTO

    partes = [
        '<g transform="translate(%.3f 0) scale(%.5f) translate(%.3f %.3f)">%s</g>'
        % ((ancho - iso_ancho) / 2, escala_iso, -ISO_X0, -ISO_Y0, recolorear(iso, principal, acento)),
        '<g transform="translate(0 %.3f)">%s</g>' % (logo_y, recolorear(logo, principal, acento)),
    ]
    contenido = "\n".join(partes)

    if placa is None:
        return contenido, ancho, alto

    # Placa cuadrada: el bloque centrado, con el mismo aire a los cuatro lados
    # del lado largo. La mayúscula del logotipo arranca en 8.425 y termina en
    # 141.949, así que el centro óptico se toma sobre la tinta, no sobre el viewBox.
    alto_tinta = logo_y + 141.949
    lado = ancho / (1 - 2 * MARGEN_PLACA)
    dx = (lado - ancho) / 2
    dy = (lado - alto_tinta) / 2
    contenido = (
        '<rect width="%.2f" height="%.2f" fill="%s"/>\n'
        '<g transform="translate(%.3f %.3f)">%s</g>' % (lado, lado, placa, dx, dy, contenido)
    )
    return contenido, lado, lado


# archivo: (principal, acento, placa)
VARIANTES = {
    "accedra-apilado-navy.svg": (NAVY, ACENTO, None),
    "accedra-apilado-blanco.svg": (BLANCO, ACENTO, None),
    "accedra-apilado-mono-navy.svg": (NAVY, NAVY, None),
    "accedra-apilado-mono-blanco.svg": (BLANCO, BLANCO, None),
    "accedra-apilado-placa-navy.svg": (BLANCO, ACENTO, NAVY_FONDO),
    "accedra-apilado-placa-azul.svg": (BLANCO, BLANCO, AZUL_MARCA),
}


def main() -> None:
    for salida, (principal, acento, placa) in VARIANTES.items():
        contenido, ancho, alto = armar(principal, acento, placa)
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
